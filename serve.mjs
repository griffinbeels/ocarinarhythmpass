// A tiny local web server for this folder, with no packages to install.
// Run: node serve.mjs   Then open http://localhost:5200/
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 5200;
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".txt": "text/plain", ".md": "text/plain" };

http.createServer((req, res) => {
  let rel;
  try { rel = decodeURIComponent(req.url.split("?")[0]).replace(/\/$/, "/index.html"); } catch { res.statusCode = 400; return res.end("Bad request"); }
  const file = path.join(root, rel);
  if (!file.startsWith(root + path.sep) ||!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; return res.end("Not found"); }
  res.setHeader("Content-Type", types[path.extname(file)] || "application/octet-stream");
  res.setHeader("Cache-Control", "no-store");
  fs.createReadStream(file).pipe(res);
}).listen(port, "localhost", () => console.log(`Ocarina Rhythm Pass: http://localhost:${port}/  (close this window to stop it)`));
