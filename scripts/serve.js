/* Dead simple static server for local development. No dependencies.
   The game also runs straight off the filesystem - this is only for when you
   want a real http origin (service workers, sharing on a LAN). */
const http = require('http'), fs = require('fs'), path = require('path'), url = require('url');
const ROOT = path.join(__dirname, '..');
const PORT = process.env.PORT || 5173;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json', '.json': 'application/json',
  '.md': 'text/markdown; charset=utf-8'
};
http.createServer((req, res) => {
  let p = decodeURIComponent(url.parse(req.url).pathname);
  if (p === '/') p = '/index.html';
  var rel = path.normalize(p);
  while (rel.charAt(0) === path.sep || rel.charAt(0) === '/') rel = rel.slice(1);
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found'); return; }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(buf);
  });
}).listen(PORT, () => console.log('Routesetters dev server: http://localhost:' + PORT));
