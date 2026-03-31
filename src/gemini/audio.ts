/**
 * Audio pipeline for Gemini Live API
 * - Mic capture: getUserMedia -> downsample to 16kHz PCM Int16 -> base64
 * - Playback: base64 PCM 24kHz -> AudioBuffer queue -> speakers
 */

type AudioChunkCallback = (base64: string) => void;

export class AudioCapture {
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private onChunk: AudioChunkCallback | null = null;
  private _isCapturing = false;

  get isCapturing(): boolean {
    return this._isCapturing;
  }

  async start(onChunk: AudioChunkCallback): Promise<void> {
    this.onChunk = onChunk;

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    this.audioContext = new AudioContext({ sampleRate: 16000 });
    this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);

    // Use ScriptProcessor for broad compatibility (AudioWorklet needs HTTPS + separate file)
    const bufferSize = 4096;
    this.processorNode = this.audioContext.createScriptProcessor(bufferSize, 1, 1);

    this.processorNode.onaudioprocess = (event) => {
      if (!this._isCapturing || !this.onChunk) return;

      const float32 = event.inputBuffer.getChannelData(0);
      const int16 = float32ToInt16(float32);
      const base64 = arrayBufferToBase64(int16.buffer);
      this.onChunk(base64);
    };

    this.sourceNode.connect(this.processorNode);
    this.processorNode.connect(this.audioContext.destination);
    this._isCapturing = true;
  }

  stop(): void {
    this._isCapturing = false;

    if (this.processorNode) {
      this.processorNode.disconnect();
      this.processorNode = null;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.onChunk = null;
  }
}

export class AudioPlayer {
  private audioContext: AudioContext | null = null;
  private queue: AudioBuffer[] = [];
  private isPlaying = false;
  private currentSource: AudioBufferSourceNode | null = null;
  private nextStartTime = 0;
  private scheduledSources: AudioBufferSourceNode[] = [];

  get context(): AudioContext | null {
    return this.audioContext;
  }

  init(): void {
    if (!this.audioContext) {
      this.audioContext = new AudioContext({ sampleRate: 24000 });
    }
  }

  enqueue(base64Pcm: string): void {
    if (!this.audioContext) this.init();
    const ctx = this.audioContext!;

    const raw = base64ToArrayBuffer(base64Pcm);
    const int16 = new Int16Array(raw);
    const float32 = int16ToFloat32(int16);

    const buffer = ctx.createBuffer(1, float32.length, 24000);
    buffer.getChannelData(0).set(float32);

    this.queue.push(buffer);
    this.scheduleNext();
  }

  private scheduleNext(): void {
    if (!this.audioContext || this.queue.length === 0) return;
    const ctx = this.audioContext;

    const buffer = this.queue.shift()!;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const startTime = Math.max(ctx.currentTime, this.nextStartTime);
    source.start(startTime);
    this.nextStartTime = startTime + buffer.duration;

    this.scheduledSources.push(source);
    source.onended = () => {
      const idx = this.scheduledSources.indexOf(source);
      if (idx >= 0) this.scheduledSources.splice(idx, 1);
    };

    this.isPlaying = true;
    this.currentSource = source;

    // Schedule remaining chunks
    if (this.queue.length > 0) {
      this.scheduleNext();
    }
  }

  clearQueue(): void {
    this.queue = [];

    // Stop all scheduled sources
    this.scheduledSources.forEach((s) => {
      try { s.stop(); } catch (_e) { /* may already be stopped */ }
    });
    this.scheduledSources = [];

    this.isPlaying = false;
    this.currentSource = null;
    this.nextStartTime = 0;
  }

  async ensureResumed(): Promise<void> {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }
}

// --- Utility functions ---

function float32ToInt16(float32: Float32Array): Int16Array {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16;
}

function int16ToFloat32(int16: Int16Array): Float32Array {
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / (int16[i] < 0 ? 0x8000 : 0x7fff);
  }
  return float32;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
