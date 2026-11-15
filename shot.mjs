// Capture a dashboard view via Chrome DevTools Protocol: navigate, scroll precisely,
// wait for a repaint, then screenshot. Usage:
//   node shot.mjs <url> <out.jpg> [scrollSelector] [quality]
// scrollSelector: CSS selector to scroll to the top of the viewport ('' = top of page).
import { execFile } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const [url, out, selector = '', quality = '82'] = process.argv.slice(2);
if (!url || !out) {
  console.error('usage: node shot.mjs <url> <out.jpg> [scrollSelector] [quality]');
  process.exit(2);
}
const CHROME = '/home/hatch/workspace/chrome-cft/chrome-linux64/chrome';
const PORT = 9223;

const chrome = execFile(
  CHROME,
  ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', `--remote-debugging-port=${PORT}`, '--window-size=1440,900', 'about:blank'],
  () => {},
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getWsUrl() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://localhost:${PORT}/json/list`);
      const targets = await res.json();
      const page = targets.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error('no debuggable page');
}

let id = 0;
const pending = new Map();
let ws;
async function send(method, params = {}) {
  const mid = ++id;
  const p = new Promise((resolve, reject) => {
    pending.set(mid, { resolve, reject });
    setTimeout(() => pending.has(mid) && pending.delete(mid) && reject(new Error(`timeout ${method}`)), 20000);
  });
  ws.send(JSON.stringify({ id: mid, method, params }));
  return p;
}

try {
  const wsUrl = await getWsUrl();
  ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id).resolve(m.result);
      pending.delete(m.id);
    }
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url });
  await sleep(2500);
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  const ready = await evalJs(`document.readyState + '|' + (window.RADAR ? RADAR.rows.length : 'no-data') + '|' + document.querySelectorAll('#rows tr').length`);
  console.log('page:', ready);
  if (selector) {
    const y = await evalJs(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return -1; const r = el.getBoundingClientRect(); return Math.round(window.scrollY + r.top); })()`);
    console.log('scroll target y:', y);
    if (y >= 0) {
      await evalJs(`window.scrollTo(0, ${y}); 'scrolled:' + window.scrollY`);
      await sleep(600);
    }
  }
  // An explicit clip, beyond the viewport, so the image is exactly 1440x900 even when the
  // headless window reports a smaller viewport.
  const clipY = selector
    ? await evalJs(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); return el ? Math.round(window.scrollY + el.getBoundingClientRect().top) : 0; })()`)
    : 0;
  const shot = await send('Page.captureScreenshot', {
    format: 'jpeg',
    quality: parseInt(quality, 10),
    captureBeyondViewport: true,
    clip: { x: 0, y: Math.max(0, clipY), width: 1440, height: 900, scale: 1 },
  });
  writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log('wrote', out);
} finally {
  try {
    ws?.close();
  } catch {}
  chrome.kill();
  process.exit(0);
}
