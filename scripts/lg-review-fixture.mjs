export const reviewItems = [
  { id: "qa-mp4", name: "LC PLAY QA - clipe MP4", kind: "LIVE", group: "Canais | Testes técnicos", poster: "poster-live.png", stream: "sample.mp4" },
  { id: "qa-hls", name: "LC PLAY QA - clipe HLS", kind: "LIVE", group: "Canais | Testes técnicos", poster: "poster-live.png", stream: "clip.m3u8" },
  { id: "qa-film-a", name: "Teste de imagem e áudio", kind: "MOVIE", group: "Filmes | Testes técnicos", poster: "poster-movie.png", stream: "sample.mp4" },
  { id: "qa-film-b", name: "Teste de navegação", kind: "MOVIE", group: "Filmes | Testes técnicos", poster: "poster-movie.png", stream: "sample.mp4" },
  { id: "qa-episode-1", name: "Série técnica LC PLAY S01E01", kind: "SERIES", group: "Séries | Testes técnicos", poster: "poster-series.png", stream: "sample.mp4", episode: 1 },
  { id: "qa-episode-2", name: "Série técnica LC PLAY S01E02", kind: "SERIES", group: "Séries | Testes técnicos", poster: "poster-series.png", stream: "sample.mp4", episode: 2 },
];

export function normalizeReviewUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash) {
    throw new Error("LG_REVIEW_BASE_URL must be an HTTP(S) origin without credentials, path, query or fragment.");
  }
  return url.origin;
}

export function reviewStreamUrl(baseUrl, item) {
  const url = new URL(`/media/${item.stream}`, normalizeReviewUrl(baseUrl));
  // Distinct fixture IDs prevent the real M3U parser from deduplicating the repeated technical clip.
  url.searchParams.set('qa', item.id);
  return url.href;
}

export function reviewM3u(baseUrl) {
  const base = normalizeReviewUrl(baseUrl);
  return [
    `#EXTM3U x-tvg-url="${base}/epg.xml"`,
    ...reviewItems.flatMap((item) => [
      `#EXTINF:-1 tvg-id="${item.id}" tvg-logo="${base}/assets/${item.poster}" group-title="${item.group}",${item.name}`,
      reviewStreamUrl(base, item),
    ]),
    '',
  ].join('\n');
}

export function reviewProgrammes(now = new Date()) {
  const halfHour = 30 * 60_000;
  const startsAt = Math.floor(now.getTime() / halfHour) * halfHour;
  return Array.from({ length: 5 }, (_, index) => ({
    title: index === 0 ? "Padrões de teste LC PLAY" : `Programação técnica ${index + 1}`,
    description: "Guia ilustrativo de QA. O vídeo é um clipe técnico finito, não uma transmissão ao vivo.",
    category: "Teste técnico",
    startsAt: new Date(startsAt + index * halfHour).toISOString(),
    endsAt: new Date(startsAt + (index + 1) * halfHour).toISOString(),
  }));
}

function xmlDate(value) {
  return new Date(value).toISOString().replace(/[-:TZ.]/g, '').slice(0, 14) + ' +0000';
}

export function reviewXmltv(now = new Date()) {
  const channels = reviewItems.filter((item) => item.kind === 'LIVE');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<tv generator-info-name="LC PLAY technical QA">',
    ...channels.map((item) => `<channel id="${item.id}"><display-name>${item.name}</display-name></channel>`),
    ...channels.flatMap((item) => reviewProgrammes(now).map((programme) =>
      `<programme channel="${item.id}" start="${xmlDate(programme.startsAt)}" stop="${xmlDate(programme.endsAt)}"><title lang="pt">${programme.title}</title><desc lang="pt">${programme.description}</desc><category>Teste técnico</category></programme>`,
    )),
    '</tv>',
  ].join('\n');
}

export function reviewCatalog(baseUrl, kind = 'LIVE', now = new Date()) {
  if (!['LIVE', 'MOVIE', 'SERIES'].includes(kind)) throw new Error('Invalid catalog kind.');
  const base = normalizeReviewUrl(baseUrl);
  const programmes = reviewProgrammes(now);
  const items = reviewItems.filter((item) => item.kind === kind).map((item) => ({
    id: item.id,
    name: item.name,
    kind: item.kind,
    group: item.group,
    logo: `${base}/assets/${item.poster}`,
    streamUrl: reviewStreamUrl(base, item),
    tvgId: item.kind === 'LIVE' ? item.id : null,
    series: item.kind === 'SERIES' ? { title: 'Série técnica LC PLAY', season: 1, episode: item.episode } : null,
    now: item.kind === 'LIVE' ? programmes[0] : null,
    next: item.kind === 'LIVE' ? programmes[1] : null,
  }));
  return {
    kind,
    source: { id: 'local-qa-fixture', name: 'LC PLAY QA local', type: 'M3U' },
    summary: { total: 6, live: 2, movies: 2, series: 2 },
    groups: [...new Set(items.map((item) => item.group))].map((name) => ({ name, count: items.filter((item) => item.group === name).length })),
    items,
    truncated: false,
    refreshedAt: now.toISOString(),
    epg: { status: 'AVAILABLE', programmes: programmes.length * 2 },
  };
}

export function parseByteRange(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) return false;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || start > end ||
      (!match[1] && Number(match[2]) === 0)) return false;
  return { start, end };
}
