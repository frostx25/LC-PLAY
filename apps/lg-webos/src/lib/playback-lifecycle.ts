export function attachPlaybackLifecycle(
  video: Pick<HTMLVideoElement, "paused" | "ended" | "pause" | "play">,
  visibility: Pick<Document, "hidden" | "addEventListener" | "removeEventListener">,
  page: Pick<Window, "addEventListener" | "removeEventListener">,
  callbacks: { suspend?: () => void; resume?: () => void } = {},
) {
  let suspended = false;
  let resumePlayback = false;
  const suspend = () => {
    if (suspended) return;
    suspended = true;
    resumePlayback = !video.paused && !video.ended;
    video.pause();
    callbacks.suspend?.();
  };
  const resume = () => {
    if (!suspended || visibility.hidden) return;
    suspended = false;
    if (resumePlayback && !video.ended) {
      callbacks.resume?.();
      void video.play().catch(() => undefined);
    }
    resumePlayback = false;
  };
  const change = () => visibility.hidden ? suspend() : resume();
  visibility.addEventListener("visibilitychange", change);
  page.addEventListener("pagehide", suspend);
  page.addEventListener("pageshow", resume);
  return () => {
    visibility.removeEventListener("visibilitychange", change);
    page.removeEventListener("pagehide", suspend);
    page.removeEventListener("pageshow", resume);
  };
}
