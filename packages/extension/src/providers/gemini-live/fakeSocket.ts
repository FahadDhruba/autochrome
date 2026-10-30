import type { LiveSocket } from './socket';

/** A scripted stand-in for WebSocket: `emit*` plays server events, `sent` records client frames. */
export function fakeSocket(onSend?: (message: Record<string, unknown>) => void) {
  const sent: Record<string, unknown>[] = [];
  const urls: string[] = [];
  let closedWith: number | undefined;
  const socket = {
    binaryType: 'blob',
    onopen: null,
    onmessage: null,
    onclose: null,
    send(data: string) {
      const message = JSON.parse(data) as Record<string, unknown>;
      sent.push(message);
      onSend?.(message);
    },
    close(code?: number) {
      closedWith ??= code;
    },
  } as LiveSocket;
  return {
    socket,
    sent,
    urls,
    factory: (url: string) => {
      urls.push(url);
      return socket;
    },
    get closedWith() {
      return closedWith;
    },
    open: () => socket.onopen?.(),
    emit: (message: object | string | ArrayBuffer) =>
      socket.onmessage?.({
        data:
          typeof message === 'object' && !(message instanceof ArrayBuffer)
            ? JSON.stringify(message)
            : message,
      } as MessageEvent),
    close: (code: number, reason = '') => socket.onclose?.({ code, reason } as CloseEvent),
  };
}
