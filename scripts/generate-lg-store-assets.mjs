import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import ffmpeg from 'ffmpeg-static';
import sharp from 'sharp';

const run = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'artifacts/lg-store');
const media = resolve(output, 'media');
const assets = resolve(output, 'assets');
await mkdir(media, { recursive: true });
await mkdir(assets, { recursive: true });

const mark = await readFile(resolve(root, 'assets/brand/lc-play-mark.svg'));
const wordmark = await readFile(resolve(root, 'assets/brand/lc-play-wordmark.svg'));
const markPng = await sharp(mark).resize(400, 400).flatten({ background: '#ff6656' }).png().toBuffer();
await writeFile(resolve(assets, 'store-icon-400.png'), markPng);
if (process.argv.includes('--icon-only')) {
  console.log('Exported square opaque 400x400 store icon; app artwork and media unchanged.');
  process.exit(0);
}

const wordmarkPng = await sharp(wordmark).resize(620, 180, { fit: 'inside' }).png().toBuffer();
const splashPng = await sharp({ create: { width: 1920, height: 1080, channels: 4, background: '#11151b' } })
  .composite([{ input: wordmarkPng, gravity: 'center' }])
  .png().toBuffer();
await Promise.all([
  writeFile(resolve(assets, 'splash-candidate-1920.png'), splashPng),
  writeFile(resolve(root, 'apps/lg-webos/public/splash.png'), splashPng),
]);

for (const [filename, label, colour] of [
  ['poster-live.png', 'TESTE DE CANAL', '#176478'],
  ['poster-movie.png', 'FILME TÉCNICO', '#3855a1'],
  ['poster-series.png', 'SÉRIE TÉCNICA', '#783855'],
]) {
  const poster = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="#11151b"/><rect y="660" width="600" height="240" fill="${colour}"/><text x="300" y="760" fill="white" font-family="Arial,sans-serif" font-size="34" text-anchor="middle">${label}</text><text x="300" y="815" fill="white" font-family="Arial,sans-serif" font-size="24" text-anchor="middle">LC PLAY QA</text></svg>`);
  await sharp(poster).composite([{ input: await sharp(mark).resize(300, 300).png().toBuffer(), top: 160, left: 150 }])
    .png().toFile(resolve(assets, filename));
}

const overlay = resolve(media, 'qa-overlay.png');
const overlayBase = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="130"><rect width="640" height="130" fill="#11151b"/><text x="140" y="52" fill="white" font-family="Arial,sans-serif" font-size="32">LC PLAY QA</text><text x="140" y="95" fill="white" font-family="Arial,sans-serif" font-size="20">Clipe técnico / Test clip</text></svg>');
await sharp(overlayBase).composite([{ input: await sharp(mark).resize(92, 92).png().toBuffer(), left: 22, top: 19 }])
  .png().toFile(overlay);

if (!ffmpeg) throw new Error('FFmpeg unavailable on this platform.');
const sample = resolve(media, 'sample.mp4');
const options = { timeout: 120_000, windowsHide: true, maxBuffer: 1024 * 1024 };
await run(ffmpeg, [
  '-hide_banner', '-loglevel', 'error', '-y',
  '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30',
  '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
  '-i', overlay,
  '-filter_complex', '[0:v][2:v]overlay=(W-w)/2:H-h-36[v];[1:a]volume=0.15[a]',
  '-map', '[v]', '-map', '[a]', '-t', '16',
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '25', '-profile:v', 'main',
  '-level:v', '3.1', '-pix_fmt', 'yuv420p', '-g', '60',
  '-c:a', 'aac', '-b:a', '96k', '-ac', '2', '-movflags', '+faststart', sample,
], options);
await run(ffmpeg, [
  '-hide_banner', '-loglevel', 'error', '-y', '-i', sample, '-c', 'copy',
  '-hls_time', '4', '-hls_list_size', '0', '-hls_playlist_type', 'vod',
  '-hls_segment_filename', resolve(media, 'segment-%03d.ts'), resolve(media, 'clip.m3u8'),
], options);

const manifest = JSON.parse(await readFile(resolve(root, 'apps/lg-webos/public/appinfo.json'), 'utf8'));
await writeFile(resolve(output, 'rights.json'), JSON.stringify({
  status: 'LOCAL_QA_ONLY_NOT_SUBMITTED',
  generatedAt: new Date().toISOString(),
  appId: manifest.id,
  appVersion: manifest.version,
  responsible: 'Leonardo Pereira',
  supportEmail: 'suportelcplay@gmail.com',
  media: 'Original procedural colour patterns, moving marker and synthetic test tone. No third-party movie or channel is included.',
  artwork: 'Existing LC PLAY SVG mark and wordmark, converted to PNG; original technical labels.',
  generationTool: 'FFmpeg via ffmpeg-static (development only, not included in the TV app)',
  sampleSha256: createHash('sha256').update(await readFile(sample)).digest('hex'),
  warning: 'Finite test clip and illustrative EPG, not a live broadcast. Ownership of the LC PLAY brand must be confirmed for release.',
}, null, 2) + '\n');

if (process.argv.includes('--official-template')) {
  const source = 'https://webostv.developer.lge.com/assets/checklist/documents_for_app_qa.zip';
  const response = await fetch(source, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Official template download failed: ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  if (data.length > 25 * 1024 * 1024 || data.subarray(0, 2).toString() !== 'PK') throw new Error('Unexpected official template archive.');
  const directory = resolve(output, 'official');
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, 'documents_for_app_qa.zip'), data);
  await writeFile(resolve(directory, 'source.json'), JSON.stringify({ source, downloadedAt: new Date().toISOString(), sha256: createHash('sha256').update(data).digest('hex'), status: 'UNFILLED_OFFICIAL_TEMPLATE' }, null, 2) + '\n');
}

console.log(`Local LG store candidates and QA media generated in ${output}`);
console.log('The tracked LG splash is refreshed from the same approved brand source. No device, playlist, database or production server was changed.');
