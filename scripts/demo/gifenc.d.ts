declare module 'gifenc' {
  export type Palette = number[][];
  export function GIFEncoder(): {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      options?: { palette?: Palette; delay?: number; repeat?: number },
    ): void;
    finish(): void;
    bytes(): Uint8Array;
  };
  export function quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number): Palette;
  export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: Palette): Uint8Array;
}

declare module 'gifenc' {
  const gifenc: {
    GIFEncoder: typeof import('gifenc').GIFEncoder;
    quantize: typeof import('gifenc').quantize;
    applyPalette: typeof import('gifenc').applyPalette;
  };
  export default gifenc;
}
