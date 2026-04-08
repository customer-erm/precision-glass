import { GoogleGenAI } from '@google/genai';
import { AudioCapture, AudioPlayer } from './audio';
import { SYSTEM_PROMPT } from './system-prompt';
import { TOOL_DECLARATIONS, handleToolCall } from './tools';
import { setState } from '../utils/state';

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
const MODEL = 'gemini-3.1-flash-live-preview';

export class GeminiLiveClient {
  private ai: GoogleGenAI;
  private session: any = null;
  private audioCapture: AudioCapture;
  private audioPlayer: AudioPlayer;
  private onTranscript: ((type: 'user' | 'agent', text: string) => void) | null = null;
  private onStateChange: ((state: 'connecting' | 'listening' | 'speaking' | 'idle' | 'error') => void) | null = null;
  private hasSpokenOnce = false;
  private listeningTimer: ReturnType<typeof setTimeout> | null = null;
  private toolCallInFlight = false;
  private isAgentSpeaking = false;
  private lastAudioOutAt = 0;

  private cancelListeningTimer(): void {
    if (this.listeningTimer) {
      clearTimeout(this.listeningTimer);
      this.listeningTimer = null;
    }
  }

  private scheduleListening(): void {
    this.cancelListeningTimer();
    // Delay so brief pauses between sentences / tool calls don't flip UI to "listening"
    this.listeningTimer = setTimeout(() => {
      if (this.toolCallInFlight) return;
      this.onStateChange?.('listening');
      setState({ agentState: 'listening' });
    }, 1200);
  }

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: API_KEY, apiVersion: 'v1alpha' });
    this.audioCapture = new AudioCapture();
    this.audioPlayer = new AudioPlayer();
  }

  setCallbacks(cbs: {
    onTranscript?: (type: 'user' | 'agent', text: string) => void;
    onStateChange?: (state: 'connecting' | 'listening' | 'speaking' | 'idle' | 'error') => void;
  }): void {
    this.onTranscript = cbs.onTranscript || null;
    this.onStateChange = cbs.onStateChange || null;
  }

  async connect(): Promise<void> {
    try {
      this.hasSpokenOnce = false;
      this.onStateChange?.('connecting');
      setState({ agentState: 'connecting' });

      this.audioPlayer.init();
      await this.audioPlayer.ensureResumed();

      console.log('[Gemini] Connecting to', MODEL);

      this.session = await this.ai.live.connect({
        model: MODEL,
        config: {
          responseModalities: ['AUDIO'],
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
          outputAudioTranscription: {},
          inputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            console.log('[Gemini] WebSocket open');
          },
          onmessage: (message: any) => {
            this.handleMessage(message);
          },
          onerror: (error: any) => {
            console.error('[Gemini] Error:', error);
            this.onStateChange?.('error');
            setState({ agentState: 'error' });
          },
          onclose: (event: any) => {
            console.log('[Gemini] Closed', event?.code, event?.reason || '');
            this.onStateChange?.('idle');
            setState({ agentState: 'idle' });
            this.audioCapture.stop();
          },
        },
      });

      console.log('[Gemini] Session established');

      // Send greeting IMMEDIATELY to keep connection alive
      console.log('[Gemini] Sending initial greeting prompt...');
      this.session.sendRealtimeInput({ text: '[STAGE CUE — NOT FROM THE USER]: The webpage has loaded. The customer has NOT spoken yet. You have NOT heard their voice. They have NOT chosen a service. They have NOT given a name. Your only task right now is: deliver your Step 1 greeting (one short turn — introduce yourself as Alex and ask their name), then STOP TALKING and wait in complete silence for the customer to reply with their actual voice. Do NOT call any tools. Do NOT mention showers or any service. Do NOT pretend the user said anything. Just greet and wait.]' });

      // Start mic in parallel (non-blocking)
      console.log('[Gemini] Starting mic...');
      this.startMic();
    } catch (err) {
      console.error('[Gemini] Connection failed:', err);
      this.onStateChange?.('error');
      setState({ agentState: 'error' });
      throw err;
    }
  }

  private async handleMessage(message: any): Promise<void> {
    if (message.setupComplete) {
      console.log('[Gemini] Setup complete');
      return;
    }

    // Handle tool calls
    if (message.toolCall) {
      console.log('[Gemini] Tool call:', message.toolCall);
      this.toolCallInFlight = true;
      this.cancelListeningTimer();
      // Stay in "speaking" state across tool execution so UI doesn't flash to listening
      this.onStateChange?.('speaking');
      setState({ agentState: 'speaking' });
      const functionCalls = message.toolCall.functionCalls;
      if (functionCalls && functionCalls.length > 0) {
        const responses = [];
        for (const fc of functionCalls) {
          console.log('[Gemini] Executing tool:', fc.name, fc.args);
          const result = await handleToolCall(fc.name, fc.args || {});

          responses.push({
            id: fc.id,
            name: fc.name,
            response: {
              result: result.message || 'Done.',
            },
          });
        }
        if (this.session) {
          this.session.sendToolResponse({ functionResponses: responses });
        }
      }
      this.toolCallInFlight = false;
      return;
    }

    const content = message.serverContent;
    if (!content) return;

    // Handle audio output
    if (content.modelTurn?.parts) {
      if (!this.hasSpokenOnce) {
        this.hasSpokenOnce = true;
      }
      this.cancelListeningTimer();
      this.isAgentSpeaking = true;
      this.onStateChange?.('speaking');
      setState({ agentState: 'speaking' });

      for (const part of content.modelTurn.parts) {
        if (part.inlineData?.data) {
          this.audioPlayer.enqueue(part.inlineData.data);
          this.lastAudioOutAt = Date.now();
        }
        if (part.text) {
          console.log('[Gemini] Text:', part.text.substring(0, 100));
        }
      }
    }

    // Handle turn completion
    if (content.turnComplete) {
      console.log('[Gemini] Turn complete');
      this.isAgentSpeaking = false;
      if (this.hasSpokenOnce && !this.toolCallInFlight) {
        this.scheduleListening();
      }
    }

    // Handle interruption — but ignore if it fires while we're still
    // streaming our own audio out (almost certainly speaker bleed/echo
    // bouncing back into the mic, not the user actually interrupting).
    if (content.interrupted) {
      const sinceAudio = Date.now() - this.lastAudioOutAt;
      if (this.isAgentSpeaking || sinceAudio < 1500) {
        console.log('[Gemini] Interrupted IGNORED (likely echo) sinceAudio=', sinceAudio);
        return;
      }
      console.log('[Gemini] Interrupted (real)');
      this.audioPlayer.clearQueue();
      if (this.hasSpokenOnce) {
        this.scheduleListening();
      }
    }

    // Handle transcription
    if (content.inputTranscription?.text) {
      console.log('[Gemini] User:', content.inputTranscription.text);
      this.onTranscript?.('user', content.inputTranscription.text);
    }
    if (content.outputTranscription?.text) {
      console.log('[Gemini] Agent:', content.outputTranscription.text);
      this.onTranscript?.('agent', content.outputTranscription.text);
    }
  }

  private async startMic(): Promise<void> {
    try {
      console.log('[Gemini] Requesting mic access...');
      await this.audioCapture.start((base64) => {
        if (!this.session) return;
        // Only gate while the agent is actively producing a turn or
        // executing a tool. As soon as turnComplete fires we let the
        // user's audio through immediately so quick replies like "sure"
        // or "ok" are not clipped. Browser echo-cancellation handles
        // residual speaker bleed.
        if (this.isAgentSpeaking || this.toolCallInFlight) return;
        this.session.sendRealtimeInput({
          audio: {
            data: base64,
            mimeType: 'audio/pcm;rate=16000',
          },
        });
      });
      console.log('[Gemini] Mic started');
    } catch (err) {
      console.error('[Gemini] Mic error:', err);
    }
  }

  muteMic(): void {
    console.log('[Gemini] Muting mic (soft end) — WebSocket remains open');
    this.audioCapture.stop();
  }

  disconnect(opts: { keepAudioQueue?: boolean } = {}): void {
    console.log('[Gemini] Disconnecting...', opts);
    this.cancelListeningTimer();
    this.audioCapture.stop();
    if (!opts.keepAudioQueue) {
      this.audioPlayer.clearQueue();
    }
    if (this.session) {
      try {
        this.session.close();
      } catch (_e) {
        // may already be closed
      }
      this.session = null;
    }
    this.hasSpokenOnce = false;
    this.onStateChange?.('idle');
    setState({ agentState: 'idle' });
  }

  get isConnected(): boolean {
    return this.session !== null;
  }
}
