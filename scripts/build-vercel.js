import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const webRoot = path.join(repoRoot, "apps", "web");
const publicRoot = path.join(repoRoot, "public");
const webSrcRoot = path.join(webRoot, "src");
const publicSrcRoot = path.join(publicRoot, "src");

async function cleanPublicDirectory() {
  await fs.rm(publicRoot, { recursive: true, force: true });
  await fs.mkdir(publicSrcRoot, { recursive: true });
}

async function copyFile(from, to) {
  await fs.mkdir(path.dirname(to), { recursive: true });
  await fs.copyFile(from, to);
}

async function copyDirectory(from, to) {
  await fs.mkdir(path.dirname(to), { recursive: true });
  await fs.cp(from, to, { recursive: true });
}

await cleanPublicDirectory();
await copyFile(path.join(webRoot, "index.html"), path.join(publicRoot, "index.html"));
await copyDirectory(webSrcRoot, publicSrcRoot);
