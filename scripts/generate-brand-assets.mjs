import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mark = await readFile(resolve(root, "assets/brand/lc-play-mark.svg"));
const wordmark = await readFile(resolve(root, "assets/brand/lc-play-wordmark.svg"));
const homeArtwork = resolve(root, "apps/lg-webos/public/assets/lc-play-home.png");

await Promise.all([
  sharp(mark).resize(80, 80).png().toFile(resolve(root, "apps/lg-webos/public/icon.png")),
  sharp(mark).resize(130, 130).png().toFile(resolve(root, "apps/lg-webos/public/largeIcon.png")),
  sharp(mark).resize(64, 64).png().toFile(resolve(root, "apps/admin-web/src/app/icon.png")),
  sharp({ create: { width: 336, height: 210, channels: 4, background: "#090b10" } })
    .composite([{ input: await sharp(wordmark).resize(252, 66, { fit: "inside" }).png().toBuffer(), gravity: "center" }])
    .png()
    .toFile(resolve(root, "apps/roku/images/icon-focus-hd.png")),
  sharp({ create: { width: 108, height: 69, channels: 4, background: "#090b10" } })
    .composite([{ input: await sharp(mark).resize(54, 54).png().toBuffer(), gravity: "center" }])
    .png()
    .toFile(resolve(root, "apps/roku/images/icon-side-hd.png")),
  sharp(homeArtwork)
    .resize(1280, 720, { fit: "cover" })
    .composite([
      { input: { create: { width: 1280, height: 720, channels: 4, background: "#090b10aa" } } },
      { input: await sharp(wordmark).resize(430, 120, { fit: "inside" }).png().toBuffer(), gravity: "center" },
    ])
    .png()
    .toFile(resolve(root, "apps/roku/images/splash-hd.png")),
]);

console.log("Ativos LC PLAY gerados para LG, Roku e painel.");
