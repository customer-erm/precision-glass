/**
 * Text-based chat client for Gemini.
 * Mirrors GeminiLiveClient's contract but uses the REST generateContent API
 * with the same TOOL_DECLARATIONS + handleToolCall. The chat panel drives
 * the same slideshow as the voice agent — only the I/O is different.
 */

import { buildSystemPrompt } from './system-prompt';
import { TOOL_DECLARATIONS, handleToolCall } from './tools';
import { loadUser } from '../utils/user-storage';

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
const MODEL = 'gemini-2.5-flash';

interface ChatPart {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: { result: string } };
}

interface ChatContent {
  role: 'user' | 'model';
  parts: ChatPart[];
}

export type ChatCallbacks = {
  onAgentMessage?: (text: string) => void;
  onTypingStart?: () => void;
  onTypingEnd?: () => void;
  onToolCall?: (name: string) => void;
  onError?: (err: unknown) => void;
};

export class GeminiChatClient {
  private history: ChatContent[] = [];
  private systemPrompt = '';
  private cbs: ChatCallbacks = {};
  private busy = false;
  private active = false;

  setCallbacks(cbs: ChatCallbacks): void {
    this.cbs = cbs;
  }

  get isActive(): boolean {
    return this.active;
  }

  /**
   * Start a fresh chat session. Sends the opening stage cue and gets
   * the agent's greeting as the first rendered message.
   */
  async start(): Promise<void> {
    if (this.active) return;
    this.active = true;
    this.history = [];
    this.systemPrompt = buildSystemPrompt({ mode: 'chat' });

    const user = loadUser();
    const isReturning = !!(user && user.visitCount > 0 && user.name);
    const seedText = isReturning
      ? `[STAGE CUE — NOT FROM THE USER]: The chat session has started. This is a RETURNING customer named ${user!.name}. Deliver your warm returning-customer greeting now (use their name from the first sentence${user!.lastQuote?.service ? `, acknowledge they were looking at ${user!.lastQuote.service} last time` : ''}). Keep it to 1-2 sentences total, then end with your question. Do NOT call any tools yet.]`
      : '[STAGE CUE — NOT FROM THE USER]: The chat session has started. Deliver your Step 1 greeting (1-2 short sentences — introduce yourself as Alex and ask their name). Do NOT call any tools yet.]';

    // Seed as a user message and ask for the greeting back
    await this.sendInternal(seedText, { hidden: true });
  }

  /** Send a free-form user message (from the text input). */
  async sendUserMessage(text: string): Promise<void> {
    if (!text.trim()) return;
    if (!this.active) await this.start();
    await this.sendInternal(text, { hidden: false });
  }

  /**
   * Core send loop: post to Gemini, handle any function calls inline
   * (dispatching to handleToolCall), keep looping until the model returns
   * a pure text response.
   */
  private async sendInternal(text: string, opts: { hidden: boolean }): Promise<void> {
    if (this.busy) {
      console.warn('[Chat] Already busy, dropping message');
      return;
    }
    this.busy = true;
    this.cbs.onTypingStart?.();

    try {
      this.history.push({ role: 'user', parts: [{ text }] });

      // Loop so tool calls can be processed inline before the next text reply
      for (let hop = 0; hop < 6; hop++) {
        const response = await this.callGemini();
        const candidate = response?.candidates?.[0];
        const parts: ChatPart[] = candidate?.content?.parts || [];

        // Record the model turn
        this.history.push({ role: 'model', parts });

        let sawToolCall = false;
        let textReply = '';

        for (const part of parts) {
          if (part.functionCall) {
            sawToolCall = true;
            console.log('[Chat] Tool call:', part.functionCall.name, part.functionCall.args);
            this.cbs.onToolCall?.(part.functionCall.name);
            const result = await handleToolCall(
              part.functionCall.name,
              (part.functionCall.args || {}) as Record<string, string>,
            );
            // Record the function response as a user-role function_response
            this.history.push({
              role: 'user',
              parts: [{
                functionResponse: {
                  name: part.functionCall.name,
                  response: { result: result.message || 'Done.' },
                },
              }],
            });
          } else if (part.text) {
            textReply += part.text;
          }
        }

        if (textReply.trim()) {
          if (!opts.hidden) {
            // User-visible reply
          }
          this.cbs.onAgentMessage?.(textReply.trim());
        }

        // If the turn had tool calls, loop so the model gets to see the tool
        // response and continue (it may produce follow-up text or more calls).
        if (!sawToolCall) break;
      }
    } catch (err) {
      console.error('[Chat] Error:', err);
      this.cbs.onError?.(err);
    } finally {
      this.cbs.onTypingEnd?.();
      this.busy = false;
    }
  }

  private async callGemini(): Promise<any> {
    if (!API_KEY) throw new Error('Missing VITE_GEMINI_API_KEY');

    const body = {
      contents: this.history,
      systemInstruction: { parts: [{ text: this.systemPrompt }] },
      tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 512,
      },
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn('[Chat] API error:', res.status, errText.substring(0, 300));
      throw new Error(`Chat API ${res.status}`);
    }
    return res.json();
  }

  stop(): void {
    this.active = false;
    this.history = [];
  }
}
