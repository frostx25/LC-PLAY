import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const required = [
  "manifest",
  "source/main.brs",
  "components/MainScene.xml",
  "components/MainScene.brs",
  "components/ActivateTask.xml",
  "components/ActivateTask.brs",
];

await Promise.all(required.map((file) => access(resolve(root, file))));
const manifest = await readFile(resolve(root, "manifest"), "utf8");
if (!manifest.includes("title=LC PLAY")) throw new Error("Manifesto Roku sem identidade LC PLAY.");
console.log("Estrutura Roku validada.");

