/**
 * Knowledge Hub – read-only Webflow Data API proxy (Cloudflare Worker).
 *
 * The Data API does not accept requests straight from the Designer
 * extension's iframe, so this forwards them and adds CORS headers.
 * Only GET requests are forwarded, so it can never change a site.
 * The site token travels in the request; nothing is stored here.
 *
 * Deploy: `npx wrangler deploy proxy/worker.js --name knowledge-hub-proxy`
 * Optional: set ALLOWED_ORIGIN to your extension's origin (e.g. https://<app-id>.webflow-ext.com).
 */
export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || '*';
    const cors = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Accept',
      'Access-Control-Max-Age': '86400',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'GET') return new Response('Read-only proxy: only GET is allowed', { status: 405, headers: cors });

    const url = new URL(request.url);
    if (!url.pathname.startsWith('/v2/')) return new Response('Not found', { status: 404, headers: cors });
    const auth = request.headers.get('Authorization');
    if (!auth) return new Response('Missing Authorization header', { status: 401, headers: cors });

    const upstream = await fetch(`https://api.webflow.com${url.pathname}${url.search}`, {
      headers: { Authorization: auth, Accept: 'application/json' },
    });
    const headers = new Headers(cors);
    headers.set('Content-Type', upstream.headers.get('Content-Type') || 'application/json');
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};
