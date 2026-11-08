/// <reference lib="dom" />
/* eslint-disable */
// @ts-nocheck
// Runs in a page served by the app's own Vite dev server. Imports each
// component module through Vite, renders it on its own with placeholder props
// (real captured props win), wrapped in the providers the app uses, and
// reports where each one landed so the caller can screenshot and crop.
export async function renderIsolated({ components, cellW, cellH }) {
  const deps = performance.getEntriesByType('resource').map((e) => e.name);
  const find = (re) => deps.find((n) => re.test(n));
  // Vite pre-bundles CommonJS packages, so exports may sit under `default`.
  const load = async (url) => { if (!url) return null; const m = await import(url); return m.default && Object.keys(m).length === 1 ? m.default : m; };
  const React = await load(find(/\.vite\/deps\/react\.js/));
  const { createRoot } = await load(find(/\.vite\/deps\/react-dom_client\.js/));
  const routerUrl = find(/\.vite\/deps\/react-router-dom\.js/);
  const queryUrl = find(/\.vite\/deps\/@tanstack_react-query\.js/);
  const Router = await load(routerUrl);
  const Query = await load(queryUrl);
  const h = React.createElement;

  const IMG = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#94a3b8"/><circle cx="32" cy="26" r="11" fill="#e2e8f0"/><rect x="14" y="42" width="36" height="14" rx="7" fill="#e2e8f0"/></svg>');
  const now = new Date().toISOString();
  const item = (i) => ({ id: `demo-${i}`, name: ['Checkout button', 'Pricing card', 'Settings form'][i % 3], title: ['Checkout button', 'Pricing card', 'Settings form'][i % 3], label: `Item ${i + 1}`, value: 40 + i * 7, count: 3 + i, createdAt: now, updatedAt: now, timestamp: now, status: 'active', severity: ['error', 'warning', 'info'][i % 3], message: 'Hardcoded colour #4A90D9 (use --primary)' });
  function placeholder(name) {
    const n = name.toLowerCase();
    if (/^on[A-Z]/.test(name) || /callback|handler/.test(n)) return () => {};
    if (/^(is|has|show|can|should)[A-Z]/.test(name) || /^(disabled|loading|selected|checked|active)$/.test(n)) return false;
    if (/^(open|visible|expanded)$/.test(n)) return true;
    if (/children/.test(n)) return 'Label';
    if (/(href|url|link|^to)$/.test(n)) return '#';
    if (/(src|image|avatar|logo|icon)url?$/.test(n)) return IMG;
    if (/(date|time|at)$/.test(n)) return now;
    if (/(count|total|number|score|amount|size|index|percent|value)$/.test(n)) return 42;
    if (/(items|rows|list|data|entries|options|results|repos|issues|signals|tokens|components)$/.test(n)) return [0, 1, 2].map(item);
    if (/(id)$/.test(n)) return 'demo';
    if (/(title|heading|name|label)$/.test(n)) return 'Sample title';
    if (/(description|text|subtitle|message|summary|body|content)$/.test(n)) return 'A short line of sample text to show the layout.';
    if (/(color|colour)$/.test(n)) return '#4A90D9';
    return undefined;
  }

  class Boundary extends React.Component {
    constructor(p) { super(p); this.state = { error: null }; }
    static getDerivedStateFromError(error) { return { error }; }
    componentDidCatch() {}
    render() { return this.state.error ? h('div', { 'data-iso-error': String(this.state.error && this.state.error.message || this.state.error).slice(0, 160) }) : this.props.children; }
  }
  const qc = Query ? new Query.QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, enabled: false } } }) : null;
  const wrap = (el) => {
    let out = el;
    if (Router) out = h(Router.MemoryRouter, null, out);
    if (Query && qc) out = h(Query.QueryClientProvider, { client: qc }, out);
    return out;
  };

  document.body.innerHTML = '';
  document.body.style.margin = '0';
  const grid = document.createElement('div');
  grid.style.cssText = `display:grid;grid-template-columns:${cellW}px;gap:32px;padding:24px;align-items:start`;
  document.body.append(grid);

  // Swallow console noise from components that expect real data.
  const origError = console.error; console.error = () => {};
  const results = [];
  for (const c of components) {
    const cell = document.createElement('div');
    cell.style.cssText = `width:${cellW}px;max-height:${cellH}px;overflow:hidden;position:relative`;
    const stage = document.createElement('div');
    stage.style.cssText = 'display:block;width:100%';
    cell.append(stage);
    grid.append(cell);
    let mod;
    try { mod = await import('/' + c.path); } catch (e) { results.push({ id: c.id, ok: false, reason: 'import failed' }); cell.remove(); continue; }
    const Comp = mod[c.name] || (mod.default && (mod.default.name === c.name || mod.default.displayName === c.name) ? mod.default : null);
    if (!Comp) { results.push({ id: c.id, ok: false, reason: 'not exported' }); cell.remove(); continue; }
    const materialize = (v) => {
      if (v === '__img') return IMG;
      if (Array.isArray(v)) return v.map(materialize);
      if (v && typeof v === 'object') { if (v.__fn) return () => {}; if (v.__date) return new Date(v.__date); const o = {}; for (const k of Object.keys(v)) o[k] = materialize(v[k]); return o; }
      return v;
    };
    const props = {};
    for (const p of c.props || []) { const v = placeholder(p); if (v !== undefined) props[p] = v; }
    Object.assign(props, materialize(c.typedProps || {}));
    for (const [k, v] of Object.entries(c.realProps || {})) if (v !== '[function]' && v !== '[element]' && v !== '[children]' && v !== '[object]') props[k] = v;
    if (!('children' in props) && /button|badge|tag|chip|pill|link|label|tab/i.test(c.name)) props.children = c.name.replace(/([a-z])([A-Z])/g, '$1 $2');
    try {
      createRoot(stage).render(wrap(h(Boundary, null, h(Comp, props))));
    } catch (e) { results.push({ id: c.id, ok: false, reason: 'render threw' }); cell.remove(); continue; }
    results.push({ id: c.id, label: c.label, cell, stage, props });
  }
  await new Promise((r) => setTimeout(r, 900));
  console.error = origError;
  // Drop failures first, then measure, so removals don't shift measured boxes.
  for (const r of results) {
    if (!r.cell) continue;
    const err = r.stage.querySelector('[data-iso-error]');
    const b = r.stage.getBoundingClientRect();
    if (err) r.failed = err.getAttribute('data-iso-error');
    else if (b.width < 2 || b.height < 2) r.failed = 'rendered nothing';
    if (r.failed) r.cell.remove();
  }
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return results.map((r) => {
    if (!r.cell) return r;
    if (r.failed) return { id: r.id, label: r.label, ok: false, reason: r.failed };
    // Union of what the component actually drew, so a small button isn't cropped at full cell width.
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const el of r.stage.querySelectorAll('*')) {
      const q = el.getBoundingClientRect();
      if (q.width < 1 || q.height < 1) continue;
      x1 = Math.min(x1, q.left); y1 = Math.min(y1, q.top); x2 = Math.max(x2, q.right); y2 = Math.max(y2, q.bottom);
    }
    const sb = r.stage.getBoundingClientRect();
    const b = isFinite(x1) ? { left: Math.max(sb.left, x1 - 6), top: Math.max(sb.top, y1 - 6), width: Math.min(sb.right, x2 + 6) - Math.max(sb.left, x1 - 6), height: Math.min(sb.bottom, y2 + 6) - Math.max(sb.top, y1 - 6) } : sb;
    return { id: r.id, label: r.label, ok: true, box: { x: Math.round(b.left + scrollX), y: Math.round(b.top + scrollY), w: Math.round(Math.min(b.width, cellW)), h: Math.round(Math.min(b.height, cellH)) }, props: Object.fromEntries(Object.entries(r.props).map(([k, v]) => [k, typeof v === 'function' ? '[function]' : v])) };
  });
}
