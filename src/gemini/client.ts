import { GoogleGenAI } from '@google/genai';
import { AudioCapture, AudioPlayer } from './audio';
import { SYSTEM_PROMPT } from './system-prompt';
import { TOOL_DECLARATIONS, handleToolCall } from './tools';
import { setState } from '../utils/state';
import { activateTourTriggers, feedTranscript, deactivateTourTriggers, setTriggerSlide } from './transcript-triggers';

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
const MODEL = 'gemini-3.1-flash-live-preview';

const TOUR_SLIDES = ['intro', 'gallery', 'enclosures', 'glass', 'hardware', 'accessories', 'process'];

export class GeminiLiveClient {
  private ai: GoogleGenAI;
  private session: any = null;
  private audioCapture: AudioCapture;
  private audioPlayer: AudioPlayer;
  private onTranscript: ((type: 'user' | 'agent', text: string) => void) | null = null;
  private onStateChange: ((state: 'connecting' | 'listening' | 'speaking' | 'idle' | 'error') => void) | null = null;
  private hasSpokenOnce = false;
  private tourActive = false;
  private tourSlideIndex = 0;

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
      this.tourActive = false;
      this.tourSlideIndex = 0;
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
      // (mic permission dialog can take seconds — server may timeout if idle)
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

    // Handle tool calls — embed guidance in responses to steer the tour
    if (message.toolCall) {
      console.log('[Gemini] Tool call:', message.toolCall);
      const functionCalls = message.toolCall.functionCalls;
      if (functionCalls && functionCalls.length > 0) {
        const responses = [];
        for (const fc of functionCalls) {
          console.log('[Gemini] Executing tool:', fc.name, fc.args);
          const result = await handleToolCall(fc.name, fc.args || {});

          // Track tour state
          if (fc.name === 'select_service') {
            this.tourActive = true;
            this.tourSlideIndex = 0;
            activateTourTriggers();
          }
          if (fc.name === 'show_slide' && fc.args?.slide_id) {
            const idx = TOUR_SLIDES.indexOf(fc.args.slide_id);
            if (idx >= 0) this.tourSlideIndex = idx;
            // Load slide-specific triggers so highlights sync with narration
            setTriggerSlide(fc.args.slide_id);
          }
          if (fc.name === 'offer_buyers_guide' || fc.name === 'start_quote_collection') {
            this.tourActive = false;
            deactivateTourTriggers();
          }

          // Build guidance for the model
          const guidance = this.tourActive ? this.getTourGuidance(fc.name, fc.args) : null;

          responses.push({
            id: fc.id,
            name: fc.name,
            response: {
              result: guidance || (result.message || 'Done.'),
            },
          });
        }
        if (this.session) {
          this.session.sendToolResponse({ functionResponses: responses });
        }
      }
      return;
    }

    const content = message.serverContent;
    if (!content) return;

    // Handle audio output
    if (content.modelTurn?.parts) {
      if (!this.hasSpokenOnce) {
        this.hasSpokenOnce = true;
      }
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
      if (this.hasSpokenOnce) {
        this.onStateChange?.('listening');
        setState({ agentState: 'listening' });
      }
    }

    // Handle interruption
    if (content.interrupted) {
      console.log('[Gemini] Interrupted');
      this.audioPlayer.clearQueue();
      if (this.hasSpokenOnce) {
        this.onStateChange?.('listening');
        setState({ agentState: 'listening' });
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
      // Feed transcript to trigger system for sync'd highlights
      if (this.tourActive) {
        feedTranscript(content.outputTranscription.text);
      }
    }
  }

  /**
   * Returns scripted guidance embedded in tool responses.
   * Each response tells the model exactly what to narrate and only the ONE next tool to call.
   */
  private getTourGuidance(toolName: string, args: any): string {
    if (toolName === 'select_service') {
      return `The page has transformed into a cinematic presentation. The intro slide is showing — a dramatic full-screen image of a frameless shower. IMMEDIATELY narrate: "Great choice — frameless showers are what we're known for. Every enclosure we build is completely custom. No metal frames — just precision-cut tempered glass and minimal hardware. The result is a clean, open feel that transforms any bathroom into something special. Let me show you some of our recent work." Then IMMEDIATELY call show_slide("gallery"). Do NOT pause or ask any questions.`;
    }

    if (toolName === 'show_slide') {
      return this.getSlideScript(args?.slide_id);
    }

    return 'Done.';
  }

  private getSlideScript(slideId: string): string {
    // Each script uses EXACT keywords that match transcript triggers.
    // When the agent says "single door" → enc-single highlights.
    // When the agent says "clear glass" → glass-clear highlights.
    // The narration and highlights are tightly coupled.
    const scripts: Record<string, string> = {

      gallery: `A row of 5 completed shower photos is now on screen. Narrate: "Here are some of our recent installations. Every one of these was custom-built for the homeowner — designed around their space, their style, their vision. You can see the range, from sleek minimalist setups to dramatic floor-to-ceiling enclosures. Now let me show you the options so you can start building yours." Then call show_slide("enclosures"). Do NOT pause.`,

      enclosures: `A horizontal row of 9 enclosure types is on screen. Each one will HIGHLIGHT AUTOMATICALLY when you say its name. You MUST say each name clearly. Narrate: "We offer nine enclosure styles. The single door is our most popular — minimal and elegant. The door and panel adds a fixed panel for wider openings. The neo-angle is perfect for corner spaces. Our slider works great when you don't have swing clearance. We also do curved glass, arched tops, splash panels, steam shower enclosures, and fully custom configurations." Then call show_slide("glass"). Do NOT pause.`,

      glass: `Three large glass option cards are on screen. Each HIGHLIGHTS when you say its name. Narrate: "Now for glass. Clear glass is our bestseller — shows off your tilework and opens up the space. Frosted glass is acid-etched for privacy while still letting light through. And rain glass has a beautiful textured pattern — it catches light and provides privacy with artistic flair. All options come in three-eighths or half-inch tempered safety glass." Then call show_slide("hardware"). Do NOT pause.`,

      hardware: `Six hardware finish swatches are on screen in a row. Each HIGHLIGHTS when named. Narrate: "Hardware personalizes the whole look. Matte black is our hottest trend — bold, modern contrast. Chrome is the timeless choice that works with everything. Brushed nickel has a warm, subtle tone and hides water spots. Polished brass for classic luxury. Satin brass for that soft golden elegance. Plus additional finishes for unique visions." Then call show_slide("accessories"). Do NOT pause.`,

      accessories: `Six key accessories are displayed. Each HIGHLIGHTS when named. Narrate: "The finishing touches matter. Our pull handles are the most requested — clean lines, premium feel. The towel bar mounts directly through the glass, no wall drilling. Plus matching hinges, U-handles, door knobs, and support bars. Everything is solid brass with a lifetime warranty, available in all six hardware finishes." Then call show_slide("process"). Do NOT pause.`,

      process: `Four process steps are shown with images. Narrate: "Here's how it all comes together. Step one, a free consultation to discuss your vision. Step two, precision laser measurement — every fraction of an inch matters. Step three, custom fabrication, usually two to three weeks. Step four, professional installation, most done in a single day. Start to finish, about three to four weeks." Then say: "That's our complete frameless shower line. I'd love to send you our buyer's guide — it covers everything we just discussed plus pricing. Would you like that?" Then call offer_buyers_guide("Frameless Shower").`,
    };

    return scripts[slideId] || `Slide "${slideId}" is showing. Narrate what you see and continue.`;
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
    this.tourActive = false;
    this.tourSlideIndex = 0;
    deactivateTourTriggers();
    this.onStateChange?.('idle');
    setState({ agentState: 'idle' });
  }

  get isConnected(): boolean {
    return this.session !== null;
  }
}
