export interface Gop {
  readonly index: number;
  /** Presentation time in seconds. Inclusive start, exclusive end. */
  readonly start: number;
  readonly end: number;
  readonly frameCount: number;
}
export interface Mp4Analysis {
  readonly fileName: string;
  readonly duration: number;
  readonly width: number;
  readonly height: number;
  readonly audio: { readonly codec: string; readonly sampleRate?: number } | null;
  readonly gops: readonly Gop[];
}
export interface CutPoints { inSeconds: number; outSeconds: number }
export interface GopRange {
  readonly firstGop: number;
  readonly lastGop: number;
  readonly start: number;
  readonly end: number;
  readonly duration: number;
  readonly frameCount: number;
}
export interface CutResult { blob: Blob; fileName: string; range: GopRange; videoVerified: boolean; hasAudio: boolean }
export interface EngineOptions {
  coreURL?: string;
  wasmURL?: string;
  /** Default 256 MiB: this implementation loads input and outputs into memory. */
  maxInputBytes?: number;
  onStatus?: (message: string) => void;
  onLog?: (message: string) => void;
}
