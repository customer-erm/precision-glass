import { GoogleGenAI } from '@google/genai';
import { AudioCapture, AudioPlayer } from './audio';
import { buildSystemPrompt } from './system-prompt';
import { TOOL_DECLARATIONS, handleToolCall } from './tools';
import { setState } from '../utils/state';
import { loadUser } from '../utils/user-storage';

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

      // Build the system prompt fresh — it injects a "returning customer" block
      // if we have persisted user data in localStorage.
      const systemPrompt = buildSystemPrompt({ mode: 'voice' });

      this.session = await this.ai.live.connect({
        model: MODEL,
        config: {
          responseModalities: ['AUDIO'],
          systemInstruction: { parts: [{ text: systemPrompt }] },
          tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
          outputAudioTranscription: {},
          inputAudioTranscription: {},
          // Tuned for clean turn-taking: avoid barge-in and require a clearer
          // speech start so background noise does not steer the tour.
          realtimeInputConfig: {
            activityHandling: 'NO_INTERRUPTION',
            automaticActivityDetection: {
              startOfSpeechSensitivity: 'START_SENSITIVITY_LOW',
              endOfSpeechSensitivity: 'END_SENSITIVITY_LOW',
              prefixPaddingMs: 400,
              silenceDurationMs: 650,
            },
          },
        } as any,
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
      const user = loadUser();
      const isReturning = !!(user && user.visitCount > 0 && user.name);
      const seedText = isReturning
        ? `[STAGE CUE — NOT FROM THE USER]: The webpage has loaded. This is a RETURNING customer named ${user!.name}. You have the KNOWN RETURNING CUSTOMER context in your system prompt. Deliver your warm returning-customer greeting now (use their name from the first sentence, acknowledge this isn't their first visit${user!.lastQuote?.service ? `, reference that they were looking at ${user!.lastQuote.service} last time` : ''}), then STOP TALKING and wait in complete silence for the customer to reply. Do NOT call any tools yet. Do NOT pretend the user said anything.]`
        : '[STAGE CUE — NOT FROM THE USER]: The webpage has loaded. The customer has NOT spoken yet. You have NOT heard their voice. They have NOT chosen a service. They have NOT given a name. Your only task right now is: deliver your Step 1 greeting (one short turn — introduce yourself as Alex and ask their name), then STOP TALKING and wait in complete silence for the customer to reply with their actual voice. Do NOT call any tools. Do NOT mention showers or any service. Do NOT pretend the user said anything. Just greet and wait.]';
      this.session.sendRealtimeInput({ text: seedText });

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

      let audioBytes = 0;
      for (const part of content.modelTurn.parts) {
        if (part.inlineData?.data) {
          audioBytes += part.inlineData.data.length;
          this.audioPlayer.enqueue(part.inlineData.data);
          this.lastAudioOutAt = Date.now();
        }
        if (part.text) {
          console.log('[Gemini] Text part:', part.text.substring(0, 200));
        }
      }
      if (audioBytes === 0) {
        console.warn('[Gemini] modelTurn arrived with NO audio bytes. Parts:', content.modelTurn.parts);
      } else {
        console.log('[Gemini] Enqueued audio bytes:', audioBytes);
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

    // Barge-in is intentionally disabled for now. If the API still reports an
    // interruption, keep Alex's queued audio intact so incidental noise cannot
    // cut off the tour.
    if (content.interrupted) {
      console.log('[Gemini] Ignoring interruption — barge-in disabled');
    }

    // Handle transcription
    if (content.inputTranscription?.text) {
      const txt = content.inputTranscription.text.trim();
      console.log('[Gemini] User:', txt);
      this.onTranscript?.('user', txt);
      // Notify the rest of the app that we heard real human audio so the
      // anti-hallucination guard in tools.ts can clear its lock.
      if (txt.length > 0) {
        window.dispatchEvent(new CustomEvent('precision:user-spoke', { detail: { text: txt } }));
      }
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
        // Keep turns clean while interruption is disabled: do not stream mic
        // frames during tool calls or while Alex's response is still playing.
        if (this.toolCallInFlight || this.isAgentSpeaking || this.audioPlayer.isActive) return;
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
    // Flush any cached audio so the model doesn't sit on a partial turn
    try {
      this.session?.sendRealtimeInput({ audioStreamEnd: true });
    } catch (_e) { /* session may be closing */ }
  }

  /** Restart audio capture after muteMic() — used when the photo-upload card closes. */
  async resumeMic(): Promise<void> {
    if (!this.session) return;
    console.log('[Gemini] Resuming mic');
    await this.startMic();
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
