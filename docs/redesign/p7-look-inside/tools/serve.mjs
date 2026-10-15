// Static server for the prototype. node tools/serve.mjs [port]
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const port = +(process.argv[2] || 5301)
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.json': 'application/json', '.md': 'text/plain; charset=utf-8', '.png': 'image/png' }
http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]); const f = path.join(root, u === '/' ? 'index.html' : u)
  if (!f.startsWith(root)) { r.writeHead(403); r.end(); return }
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return } r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); r.end(d) })
}).listen(port, '127.0.0.1', () => console.log('serving', root, 'on', port))
