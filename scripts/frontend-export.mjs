import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = process.cwd();
const frontendRoot = resolve(root, "frontend");
const distRoot = join(frontendRoot, "dist");
const outputRoot = resolve(root, "artifacts", "frontend-static");

if (!existsSync(join(frontendRoot, "index.html"))) {
  throw new Error("frontend/index.html was not found.");
}

if (!existsSync(join(distRoot, "app.js"))) {
  throw new Error("frontend/dist/app.js was not found. Run `npm run build:frontend` first.");
}

rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(outputRoot, { recursive: true });

cpSync(join(frontendRoot, "index.html"), join(outputRoot, "index.html"));
cpSync(join(frontendRoot, "index.html"), join(outputRoot, "404.html"));
cpSync(join(frontendRoot, "styles.css"), join(outputRoot, "styles.css"));
cpSync(distRoot, join(outputRoot, "dist"), { recursive: true });

writeFileSync(
  join(outputRoot, "DEPLOYMENT.txt"),
  [
    "Solana Stablecoin Standard frontend static export",
    "",
    "Host this folder over HTTP or HTTPS.",
    "Do not open index.html via file:// if you need Phantom, Solflare, or Backpack.",
    "",
    "Local preview:",
    "  node scripts/frontend-serve.mjs",
    "  open http://127.0.0.1:4173",
    "",
    "Wallet note:",
    "  Browser extension wallets generally do not inject into file:// pages.",
    "  Demo Wallet continues to work for offline preview.",
  ].join("\n"),
  "utf8"
);

console.log(`Static frontend export written to ${outputRoot}`);
