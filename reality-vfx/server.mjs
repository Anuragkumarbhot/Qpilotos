import { createServer } from 'node:http';

const PORT = Number(process.env.API_PORT || 3001);
const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 20;
const MAX_BODY = 16_000;
const clients = new Map();

function send(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
}

const server = createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/api/health') return send(res, 200, { ok: true, provider: 'Google Gemini' });
  if (req.method !== 'POST' || req.url !== '/api/gemini') return send(res, 404, { error: 'Not found' });
  if (!API_KEY) return send(res, 503, { error: 'Gemini backend is not configured. Add GEMINI_API_KEY to the server environment.' });

  const ip = req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = clients.get(ip) || { start: now, count: 0 };
  if (now - entry.start > WINDOW_MS) { entry.start = now; entry.count = 0; }
  entry.count += 1;
  clients.set(ip, entry);
  if (entry.count > MAX_REQUESTS) return send(res, 429, { error: 'Rate limit reached. Try again in one minute.' });

  try {
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > MAX_BODY) return send(res, 413, { error: 'Prompt is too large.' });
    }
    const body = JSON.parse(raw || '{}');
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (!prompt || prompt.length > 4000) return send(res, 400, { error: 'Provide a prompt of 1–4000 characters.' });

    const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent?key=${encodeURIComponent(API_KEY)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: 'You are the Gemini-powered VFX assistant inside Reality VFX Studio. Give practical, concise guidance for video compositing, virtual cinematography, 3D character staging, lighting, and editing. Do not claim to directly modify the project or media. Clearly distinguish suggestions from actions.' }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 1200 }
      }), signal: AbortSignal.timeout(45_000)
    });
    const result = await upstream.json();
    if (!upstream.ok) {
      const message = result?.error?.message || 'Gemini provider request failed.';
      return send(res, upstream.status === 429 ? 429 : 502, { error: message });
    }
    const text = result?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('\n').trim();
    if (!text) return send(res, 502, { error: 'Gemini returned no text. Try a different prompt.' });
    return send(res, 200, { text, model: MODEL });
  } catch (error) {
    return send(res, 500, { error: error instanceof Error ? error.message : 'Unexpected Gemini backend error.' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Reality VFX Gemini API listening on http://0.0.0.0:${PORT}`);
  if (!API_KEY) console.warn('GEMINI_API_KEY is missing. Gemini requests will return 503.');
});
