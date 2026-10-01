import { useEffect } from "react";

type Direction = "left" | "right" | "up" | "down";

function center(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function nextElement(current: HTMLElement, candidates: HTMLElement[], direction: Direction) {
  const origin = center(current);
  return candidates
    .filter((candidate) => candidate !== current)
    .map((candidate) => {
      const point = center(candidate);
      const dx = point.x - origin.x;
      const dy = point.y - origin.y;
      const valid =
        (direction === "left" && dx < -8) ||
        (direction === "right" && dx > 8) ||
        (direction === "up" && dy < -8) ||
        (direction === "down" && dy > 8);
      const primary = direction === "left" || direction === "right" ? Math.abs(dx) : Math.abs(dy);
      const secondary = direction === "left" || direction === "right" ? Math.abs(dy) : Math.abs(dx);
      return { candidate, valid, score: primary + secondary * 2.4 };
    })
    .filter((item) => item.valid)
    .sort((a, b) => a.score - b.score)[0]?.candidate;
}

export function useSpatialNavigation(enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const keyDirections: Record<string, Direction> = {
      ArrowLeft: "left",
      ArrowRight: "right",
      ArrowUp: "up",
      ArrowDown: "down",
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const direction = keyDirections[event.key];
      if (!direction) return;
      const scope = document.querySelector<HTMLElement>("[aria-modal='true']") ?? document;
      const candidates = Array.from(
        scope.querySelectorAll<HTMLElement>("[data-focusable]:not([disabled])"),
      ).filter((element) => element.offsetParent !== null);
      if (!candidates.length) return;
      const current = document.activeElement instanceof HTMLElement ? document.activeElement : candidates[0];
      if (current instanceof HTMLInputElement && (direction === "left" || direction === "right")) return;
      const target = current.hasAttribute("data-focusable")
        ? nextElement(current, candidates, direction)
        : candidates[0];
      if (target) {
        event.preventDefault();
        target.focus();
        target.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    };

    window.addEventListener("keydown", onKeyDown);
    const first = document.querySelector<HTMLElement>("[data-focusable]:not([disabled])");
    window.setTimeout(() => first?.focus(), 80);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
