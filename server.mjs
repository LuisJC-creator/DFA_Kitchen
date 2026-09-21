// Minimal static file server for local development. The app needs to be served over HTTP
// because ES modules and Web Workers are not available on file:// URLs.

import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = 4173;
const HOST = '127.0.0.1';  // loopback only; this server is not hardened for exposure

const CONTENT_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.svg': 'image/svg+xml'
};

/** Resolves a request path inside ROOT, or null if it escapes the project directory. */
function resolveFile(url) {
  const pathname = decodeURIComponent(new URL(url, 'http://localhost').pathname);
  const file = path.resolve(ROOT, '.' + (pathname === '/' ? '/index.html' : pathname));
  return file.startsWith(ROOT + path.sep) ? file : null;
}

const server = http.createServer(async (request, response) => {
  try {
    const file = resolveFile(request.url);
    if (!file) {
      response.writeHead(403).end();
      return;
    }
    const content = await readFile(file);
    response.writeHead(200, {
      'Content-Type': CONTENT_TYPES[path.extname(file)] || 'text/plain',
      'Cache-Control': 'no-store'  // edits show up on a plain refresh
    }).end(content);
  } catch {
    response.writeHead(404).end('Not found');
  }
});

server.listen(PORT, HOST, () => console.log(`DFA Kitchen: http://${HOST}:${PORT}`));
