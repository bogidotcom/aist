#!/usr/bin/env node
// Static host so /market and /exchange match the contract (not *.html).
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 8788);

const ROUTES = {
  '/': 'index.html',
  '/market': 'market.html',
  '/exchange': 'exchange.html',
  '/strategies': 'strategies.html',
};

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
  '.md': 'text/markdown; charset=utf-8',
};

function safe(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  const rel = normalize(clean).replace(/^(\.\.[/\\])+/, '');
  return join(root, rel);
}

createServer((req, res) => {
  const pathOnly = (req.url || '/').split('?')[0].replace(/\/+$/, '') || '/';
  let file = ROUTES[pathOnly];
  if (!file) {
    const abs = safe(pathOnly);
    if (existsSync(abs) && statSync(abs).isFile()) file = abs.slice(root.length + 1);
  }
  if (!file) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
    return;
  }
  const abs = join(root, file);
  try {
    const body = readFileSync(abs);
    res.writeHead(200, { 'content-type': TYPES[extname(abs)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('not found');
  }
}).listen(port, () => {
  console.log(`AIST Exchange  http://127.0.0.1:${port}`);
  console.log(`  /  /market  /strategies  /exchange?pair=KGST-USDT-TRC20`);
});
