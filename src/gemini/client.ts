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
      this.session.sendRealtimeInput({ text: 'Hello, I just arrived at the Precision Glass website.' });

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
      this.onStateChange?.('speaking');
      setState({ agentState: 'speaking' });

      for (const part of content.modelTurn.parts) {
        if (part.inlineData?.data) {
          this.audioPlayer.enqueue(part.inlineData.data);
        }
        if (part.text) {
          console.log('[Gemini] Text:', part.text.substring(0, 100));
        }
      }
    }

    // Handle turn completion
    if (content.turnComplete) {
      console.log('[Gemini] Turn complete');
      if (this.hasSpokenOnce && !this.toolCallInFlight) {
        this.scheduleListening();
      }
    }

    // Handle interruption
    if (content.interrupted) {
      console.log('[Gemini] Interrupted');
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
        if (this.session) {
          this.session.sendRealtimeInput({
            audio: {
              data: base64,
              mimeType: 'audio/pcm;rate=16000',
            },
          });
        }
      });
      console.log('[Gemini] Mic started');
    } catch (err) {
      console.error('[Gemini] Mic error:', err);
    }
  }

  disconnect(): void {
    console.log('[Gemini] Disconnecting...');
    this.audioCapture.stop();
    this.audioPlayer.clearQueue();
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
