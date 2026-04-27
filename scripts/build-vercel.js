import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const webRoot = path.join(repoRoot, "apps", "web");
const publicRoot = path.join(repoRoot, "public");

async function cleanPublicDirectory() {
  await fs.rm(publicRoot, { recursive: true, force: true });
  await fs.mkdir(path.join(publicRoot, "src"), { recursive: true });
}

async function copyFile(from, to) {
  await fs.mkdir(path.dirname(to), { recursive: true });
  await fs.copyFile(from, to);
}

await cleanPublicDirectory();
await copyFile(path.join(webRoot, "index.html"), path.join(publicRoot, "index.html"));
await copyFile(path.join(webRoot, "src", "app.js"), path.join(publicRoot, "src", "app.js"));
await copyFile(path.join(webRoot, "src", "authSession.js"), path.join(publicRoot, "src", "authSession.js"));
await copyFile(path.join(webRoot, "src", "network.js"), path.join(publicRoot, "src", "network.js"));
await copyFile(path.join(webRoot, "src", "roleAccess.js"), path.join(publicRoot, "src", "roleAccess.js"));
await copyFile(path.join(webRoot, "src", "styles.css"), path.join(publicRoot, "src", "styles.css"));
