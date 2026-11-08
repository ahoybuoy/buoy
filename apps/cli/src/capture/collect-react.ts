/// <reference lib="dom" />
/* eslint-disable */
// Runs in the page (React dev build): every user component instance on screen,
// with where it is used in source, its box, and its props. Must stay self-contained:
// Playwright serializes this function into the page.
// @ts-nocheck
export function collectReact(opts) {
  const maxInstances = (opts && opts.maxInstances) || 4000;
  const anyNode = [...document.querySelectorAll('body *')].find((n) => Object.keys(n).some((k) => k.startsWith('__reactFiber')));
  if (!anyNode) return { framework: null, instances: [] };
  const fk = Object.keys(anyNode).find((k) => k.startsWith('__reactFiber'));
  let root = anyNode[fk];
  while (root.return) root = root.return;

  const nameOf = (t) => {
    if (!t) return null;
    if (typeof t === 'function') return t.displayName || t.name || null;
    if (typeof t === 'object') {
      if (t.displayName) return t.displayName;
      if (t.render) return t.render.displayName || t.render.name || null; // forwardRef
      if (t.type) return nameOf(t.type); // memo
    }
    return null;
  };
  const isLibrary = (src) => !src || /node_modules/.test(src.fileName || '');

  function hostNodes(fiber) {
    const out = [];
    const walk = (f) => {
      for (let c = f.child; c; c = c.sibling) {
        if (c.tag === 5 || c.tag === 6) { if (c.stateNode && c.stateNode.nodeType === 1) out.push(c.stateNode); }
        else walk(c);
      }
    };
    walk(fiber);
    return out;
  }

  function box(nodes) {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const n of nodes) {
      const r = n.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const cs = getComputedStyle(n);
      if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
      x1 = Math.min(x1, r.left); y1 = Math.min(y1, r.top); x2 = Math.max(x2, r.right); y2 = Math.max(y2, r.bottom);
    }
    if (!isFinite(x1)) return null;
    return { x: Math.round(x1 + scrollX), y: Math.round(y1 + scrollY), w: Math.round(x2 - x1), h: Math.round(y2 - y1) };
  }

  function safe(v, depth) {
    if (v == null || typeof v === 'boolean' || typeof v === 'number') return v;
    if (typeof v === 'string') return v.length > 120 ? v.slice(0, 117) + '…' : v;
    if (typeof v === 'function') return '[function]';
    if (depth > 1) return Array.isArray(v) ? `[${v.length} items]` : '[object]';
    if (Array.isArray(v)) return v.slice(0, 5).map((x) => safe(x, depth + 1));
    if (v.$$typeof) return '[element]';
    if (typeof v === 'object') {
      const o = {};
      for (const k of Object.keys(v).slice(0, 12)) o[k] = safe(v[k], depth + 1);
      return o;
    }
    return String(v);
  }
  function props(p) {
    const o = {};
    if (!p || typeof p !== 'object') return o;
    for (const k of Object.keys(p)) {
      if (k === 'children') { o.children = typeof p.children === 'string' ? safe(p.children, 0) : p.children == null ? undefined : '[children]'; continue; }
      if (k === 'key' || k === 'ref' || k === '__source' || k === '__self') continue;
      o[k] = safe(p[k], 0);
    }
    return o;
  }

  const instances = [];
  const stack = [root];
  while (stack.length && instances.length < maxInstances) {
    const f = stack.pop();
    if ((f.tag === 0 || f.tag === 1 || f.tag === 11 || f.tag === 14 || f.tag === 15) && !isLibrary(f._debugSource)) {
      const name = nameOf(f.type);
      if (name && /^[A-Z]/.test(name)) {
        const b = box(hostNodes(f));
        if (b) instances.push({ name, usedAt: { file: f._debugSource.fileName, line: f._debugSource.lineNumber }, box: b, props: props(f.memoizedProps) });
      }
    }
    for (let c = f.child; c; c = c.sibling) stack.push(c);
  }
  return { framework: 'react', instances, page: { w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight, title: document.title } };
}
