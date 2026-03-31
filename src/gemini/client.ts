import { GoogleGenAI } from '@google/genai';
import { AudioCapture, AudioPlayer } from './audio';
import { SYSTEM_PROMPT } from './system-prompt';
import { TOOL_DECLARATIONS, handleToolCall } from './tools';
import { setState } from '../utils/state';
import { activateTourTriggers, feedTranscript, deactivateTourTriggers, resetTranscriptBuffer } from './transcript-triggers';

const API_KEY = 'AIzaSyACRCzxmxeO3lJ6v9Ss4P6yd9ncHzV71VA';
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
          onclose: () => {
            console.log('[Gemini] Closed');
            this.onStateChange?.('idle');
            setState({ agentState: 'idle' });
            this.audioCapture.stop();
          },
        },
      });

      console.log('[Gemini] Session established, starting mic...');
      await this.startMic();

      console.log('[Gemini] Sending initial greeting prompt...');
      this.session.sendRealtimeInput({ text: 'Hello, I just arrived at the Precision Glass website.' });
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
            resetTranscriptBuffer();
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
    const scripts: Record<string, string> = {
      gallery: `The screen now shows a gallery of completed shower installations. Narrate ALL of this without stopping: "These are some of our recent projects. Each one was designed specifically for the homeowner's space and style. You can see the range — sleek minimalist single doors, dramatic floor-to-ceiling enclosures, corner units that make the most of compact bathrooms. No two are alike, because no two bathrooms are alike. That's what makes custom frameless glass so special. Now let me walk you through exactly how we build yours." Then IMMEDIATELY call show_slide("enclosures"). Do NOT pause or ask questions.`,

      enclosures: `The screen shows nine enclosure types in a grid. As you mention each one, it will highlight automatically. Narrate ALL of this: "We offer nine distinct enclosure configurations to fit any layout. The single door is our most popular — minimal hardware, maximum elegance, perfect for standard alcove openings. The door and panel is our classic choice for wider openings, with a fixed glass panel alongside the swinging door. Neo-angle enclosures are designed for corner spaces — they maximize interior room while keeping a compact footprint. Our frameless slider is perfect when you don't have clearance for a swinging door — smooth bypass operation, clean lines. We also build curved glass, arched tops, splash panels, steam shower enclosures, and fully custom configurations for unique spaces." Then IMMEDIATELY call show_slide("glass"). Do NOT pause.`,

      glass: `The screen shows three glass types with large images. Narrate ALL of this: "Now let's talk glass. All our glass is three-eighths or half-inch tempered safety glass — it's up to five times stronger than regular glass. Clear glass is our bestseller. It's crystal-clear, maximizes light transmission, and really shows off your tilework. It makes any bathroom feel larger and brighter. Frosted glass is acid-etched for a smooth, elegant finish. It provides privacy while still letting plenty of light through — perfect for shared bathrooms. And rain glass has this beautiful textured pattern that mimics rain droplets on a window. It provides privacy with an artistic touch that catches the light beautifully." Then IMMEDIATELY call show_slide("hardware"). Do NOT pause.`,

      hardware: `The screen shows six hardware finishes with circular swatches. Narrate ALL of this: "Hardware is where you really personalize the look. Matte black is our hottest trend right now — it creates a bold, modern contrast against the glass. Polished chrome is the timeless choice — versatile, easy to maintain, and it complements virtually any bathroom. Brushed nickel has that warm, subtle sophistication — it hides water spots better than chrome. Polished brass brings classic luxury warmth. Satin brass gives you that soft golden elegance that's been making a huge comeback. And we carry additional custom finishes for those unique design visions." Then IMMEDIATELY call show_slide("accessories"). Do NOT pause.`,

      accessories: `The screen shows key shower accessories. Narrate ALL of this: "The finishing touches make all the difference. Every piece is solid brass construction with a lifetime warranty. Our pull handles are the most requested accessory — clean lines, substantial feel, premium every time you use them. The towel bar mounts directly through the glass — no wall drilling needed, and it holds full-size bath towels. We've got matching hinges, U-handles, door knobs, and support bars. Every accessory is available in all six hardware finishes so everything coordinates perfectly." Then IMMEDIATELY call show_slide("process"). Do NOT pause.`,

      process: `The screen shows the four-step process timeline. Narrate ALL of this: "Here's how we bring it all together. Step one — a free in-home consultation where we discuss your vision, measure your space, and review design options. Step two — precision laser measurement to ensure every panel fits perfectly. Every fraction of an inch matters with frameless glass. Step three — custom fabrication in our shop. We cut, temper, and polish every panel to your exact specifications. This typically takes two to three weeks. And step four — professional installation by our certified team. Most installs are completed in a single day. From first meeting to finished shower, the whole process usually takes about three to four weeks." TOUR IS NOW COMPLETE. Transition naturally: "That's our complete frameless shower collection. I'd love to send you our comprehensive buyer's guide — it covers everything we just went through plus pricing ranges and care tips. Would you like me to send that to your email?" Then call offer_buyers_guide("Frameless Shower"). This is the ONLY time during the tour you should ask a question.`,
    };

    return scripts[slideId] || `Slide "${slideId}" is now showing. Describe what you see and continue the tour.`;
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
