/** The part of WebSocket the Live provider uses, so tests can swap in a fake. */
export type LiveSocket = {
  binaryType: string;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number; reason: string }) => void) | null;
  send(data: string): void;
  close(code?: number): void;
};

export type SocketFactory = (url: string) => LiveSocket;

/** Service workers have the global WebSocket; no headers can be set, so the key rides in the URL. */
export const browserSocket: SocketFactory = (url) => new WebSocket(url) as unknown as LiveSocket;
