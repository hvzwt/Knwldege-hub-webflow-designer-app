/**
 * Knowledge Hub – read-only Webflow Data API proxy for Node 18+ (no dependencies).
 * Run: `node proxy/server.mjs` (PORT defaults to 8787, ALLOWED_ORIGIN defaults to *).
 * Only GET requests to /v2/* are forwarded, so it can never change a site.
 */
import { createServer } from 'node:http';

const PORT = Number(process.env.PORT || 8787);
const ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const cors = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Accept',
};

createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return res.writeHead(204, cors).end();
  if (req.method !== 'GET') return res.writeHead(405, cors).end('Read-only proxy: only GET is allowed');
  if (!req.url?.startsWith('/v2/')) return res.writeHead(404, cors).end('Not found');
  if (!req.headers.authorization) return res.writeHead(401, cors).end('Missing Authorization header');
  try {
    const upstream = await fetch(`https://api.webflow.com${req.url}`, {
      headers: { Authorization: req.headers.authorization, Accept: 'application/json' },
    });
    res.writeHead(upstream.status, { ...cors, 'Content-Type': upstream.headers.get('content-type') || 'application/json' });
    res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch (err) {
    res.writeHead(502, cors).end(String(err));
  }
}).listen(PORT, () => console.log(`Knowledge Hub proxy on http://localhost:${PORT}`));
