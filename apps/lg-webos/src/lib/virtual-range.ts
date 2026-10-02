export const CHANNEL_ROW_HEIGHT = 92;
const OVERSCAN = 4;

export function virtualChannelRange(count: number, scrollTop: number, viewportHeight: number) {
  const visible = Math.max(1, Math.ceil(viewportHeight / CHANNEL_ROW_HEIGHT));
  const first = Math.min(Math.max(0, Math.floor(scrollTop / CHANNEL_ROW_HEIGHT)), Math.max(0, count - visible));
  const start = Math.max(0, first - OVERSCAN);
  const end = Math.min(count, first + visible + OVERSCAN);
  return { start, end, top: start * CHANNEL_ROW_HEIGHT, bottom: (count - end) * CHANNEL_ROW_HEIGHT };
}
