import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { Play } from "lucide-react";

type Poster = { id: string; title: string; logo: string | null };

export function VirtualPosterGrid<T extends Poster>({ items, onSelect }: { items: T[]; onSelect: (item: T) => void }) {
  const viewport = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<number | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [size, setSize] = useState({ width: 1100, height: 800, columns: 5 });
  const [scrollTop, setScrollTop] = useState(0);
  const gap = 18;
  const posterHeight = ((size.width - 16 - gap * (size.columns - 1)) / size.columns) * 1.5;
  const rowHeight = posterHeight + 40 + gap;
  const rowCount = Math.ceil(items.length / size.columns);
  const visibleRows = Math.max(1, Math.ceil(size.height / rowHeight));
  const firstRow = Math.min(Math.floor(scrollTop / rowHeight), Math.max(0, rowCount - visibleRows));
  const startRow = Math.max(0, firstRow - 2);
  const endRow = Math.min(rowCount, firstRow + visibleRows + 2);
  const start = startRow * size.columns;
  const end = Math.min(items.length, endRow * size.columns);

  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const measure = () => {
      if (!element.clientWidth) return;
      setSize({ width: element.clientWidth, height: element.clientHeight, columns: window.innerWidth <= 640 ? 2 : window.innerWidth <= 1100 ? 3 : 5 });
      setScrollTop(element.scrollTop);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener("resize", measure);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); };
  }, []);

  useLayoutEffect(() => {
    if (pendingFocus.current === null) return;
    const target = viewport.current?.querySelector<HTMLButtonElement>(`[data-poster-index="${pendingFocus.current}"]`);
    if (target) { pendingFocus.current = null; target.focus({ preventScroll: true }); }
  });

  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    if (event.key === "ArrowDown") next = Math.min(items.length - 1, index + size.columns);
    else if (event.key === "ArrowUp" && index >= size.columns) next = index - size.columns;
    else if (event.key === "ArrowLeft" && index % size.columns !== 0) next = index - 1;
    else if (event.key === "ArrowRight") next = index % size.columns === size.columns - 1 ? index : Math.min(items.length - 1, index + 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else if (event.key === "PageDown") next = Math.min(items.length - 1, index + size.columns * 3);
    else if (event.key === "PageUp") next = Math.max(0, index - size.columns * 3);
    else return;
    event.preventDefault();
    event.stopPropagation();
    const element = viewport.current;
    if (!element) return;
    const top = Math.floor(next / size.columns) * rowHeight;
    const bottom = top + rowHeight - gap;
    const offset = top < element.scrollTop ? top : bottom > element.scrollTop + size.height ? bottom - size.height : element.scrollTop;
    pendingFocus.current = next;
    element.scrollTop = Math.max(0, offset);
    setScrollTop(element.scrollTop);
    setFocusedId(items[next]!.id);
  }

  return (
    <div className="poster-viewport" ref={viewport} onScroll={(event) => { if (event.currentTarget.clientHeight) setScrollTop(event.currentTarget.scrollTop); }}>
      <div aria-hidden="true" style={{ height: startRow * rowHeight }} />
      <div className="poster-grid" style={{ gridTemplateColumns: `repeat(${size.columns}, minmax(0, 1fr))`, gridAutoRows: rowHeight - gap }}>
        {items.slice(start, end).map((item, offset) => (
          <button key={item.id} data-focusable data-poster-index={start + offset}
            data-catalog-selected={focusedId === item.id ? "" : undefined}
            className="content-card poster-card" title={item.title}
            aria-label={item.title} aria-posinset={start + offset + 1} aria-setsize={items.length}
            onFocus={() => setFocusedId(item.id)} onKeyDown={(event) => navigate(event, start + offset)}
            onClick={() => onSelect(item)}>
            <strong>{item.title}</strong>
            <span className="content-art" style={{ height: posterHeight }}>
              <span className="content-fallback">{item.title.slice(0, 2).toUpperCase()}</span>
              {item.logo ? <img key={item.logo} width="400" height="600" src={item.logo} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : null}
              <span className="content-play"><Play fill="currentColor" /></span>
            </span>
          </button>
        ))}
      </div>
      <div aria-hidden="true" style={{ height: Math.max(0, rowCount - endRow) * rowHeight }} />
    </div>
  );
}
