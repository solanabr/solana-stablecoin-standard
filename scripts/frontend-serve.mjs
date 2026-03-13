import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { createServer } from "node:http";

const root = normalize(join(process.cwd(), "frontend"));
const host = "127.0.0.1";
const port = Number(process.env.PORT || 4173);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".map": "application/json; charset=utf-8",
};

function send404(response) {
  response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Not found");
}

createServer((request, response) => {
  const urlPath = new URL(request.url || "/", `http://${host}:${port}`).pathname;
  const relativePath = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const resolvedPath = normalize(join(root, relativePath));

  if (!resolvedPath.startsWith(root) || !existsSync(resolvedPath)) {
    send404(response);
    return;
  }

  const stats = statSync(resolvedPath);
  const filePath = stats.isDirectory() ? join(resolvedPath, "index.html") : resolvedPath;
  if (!existsSync(filePath)) {
    send404(response);
    return;
  }

  response.writeHead(200, {
    "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  createReadStream(filePath).pipe(response);
}).listen(port, host, () => {
  console.log(`SSS frontend available at http://${host}:${port}`);
});
