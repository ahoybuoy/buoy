/**
 * buoy capture [url]  Render every component from the running app (local only).
 * buoy see            Open Buoy's visualizers on this project, on this machine.
 */
import { Command } from "commander";
import { createServer } from "http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { createInterface } from "readline";
import open from "open";
import { buildCurrentSnapshot } from "./show.js";
import { error, info, spinner, success } from "../output/reporters.js";
import { flushAndExit } from "./check.js";

const COMMON_PORTS = [5173, 3000, 5174, 4321, 8080, 4200, 3001, 8000];

async function findRunningApp(): Promise<string | null> {
  for (const port of COMMON_PORTS) {
    try {
      const res = await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(800) });
      if (res.ok || res.status < 500) return `http://localhost:${port}/`;
    } catch { /* not this one */ }
  }
  return null;
}

const PRIVATE_FILES = ["capture-session.json", "captures.json", "snapshot.json"];

/** .buoy/ with a .gitignore that keeps sign-in cookies and screenshots out of git. */
function buoyDir(root: string): string {
  const d = join(root, ".buoy");
  mkdirSync(d, { recursive: true });
  const gi = join(d, ".gitignore");
  const have = existsSync(gi) ? readFileSync(gi, "utf-8").split(/\r?\n/) : [];
  const missing = PRIVATE_FILES.filter((f) => !have.includes(f));
  if (missing.length) writeFileSync(gi, [...have.filter(Boolean), "# Written by buoy capture: sign-in session and screenshots stay local", ...missing].join("\n") + "\n");
  return d;
}

export function createCaptureCommand(): Command {
  return new Command("capture")
    .description("Render every component the way it really looks, from your running app (stays on this machine)")
    .argument("[url]", "Your app's dev server, e.g. http://localhost:5173 (found automatically if omitted)")
    .option("--pages <n>", "Most pages to visit", "25")
    .option("--login", "Open a browser to sign in first; the session is saved in .buoy/ and reused")
    .option("--light", "Capture in light mode (default: dark)")
    .option("--no-isolate", "Only capture what pages show; don't render other components on their own")
    .action(async (url: string | undefined, options) => {
      try {
        const start = url ?? (await findRunningApp());
        if (!start) {
          error("No running app found. Start your dev server, then run: buoy capture http://localhost:<port>");
          return flushAndExit(1);
        }
        const { capture, login } = await import("../capture/run.js");
        const spin = spinner("Mapping the code...");
        const { snapshot, projectRoot } = await buildCurrentSnapshot({ onProgress: (m) => { spin.text = m; } });
        spin.stop();
        const dir = buoyDir(projectRoot);
        const statePath = join(dir, "capture-session.json");

        if (options.login) {
          info(`Opening ${start}. Sign in, then come back here and press Enter.`);
          await login(start, statePath, () => new Promise<void>((resolve) => {
            const rl = createInterface({ input: process.stdin, output: process.stdout });
            rl.question("Press Enter when you're signed in… ", () => { rl.close(); resolve(); });
          }));
          success("Session saved to .buoy/capture-session.json (keep it out of git).");
        }

        const run = spinner(`Capturing ${start}...`);
        const result = await capture({
          start,
          projectRoot,
          snapshot,
          maxPages: Math.max(1, Number(options.pages) || 25),
          isolate: options.isolate !== false,
          scheme: options.light ? "light" : "dark",
          storageState: existsSync(statePath) ? statePath : undefined,
          onProgress: (m) => { run.text = m; },
        });
        run.stop();
        writeFileSync(join(dir, "snapshot.json"), JSON.stringify(snapshot));
        writeFileSync(join(dir, "captures.json"), JSON.stringify(result));

        const comps = snapshot.components.filter((c) => c.kind !== "icon");
        const seen = comps.filter((c) => result.components[c.id]?.some((s) => !s.placeholder)).length;
        const any = comps.filter((c) => result.components[c.id]?.length).length;
        if (!result.framework) {
          error(`Visited ${result.pages.length} page(s) but found no React dev build. buoy capture reads React apps running in development mode for now.`);
          return flushAndExit(1);
        }
        success(`${any} of ${comps.length} components rendered: ${seen} seen in the app, ${any - seen} with sample data, across ${result.pages.length} page(s).`);
        if (result.pages.length <= 3 && !options.login) info("Few pages reached. If most of your app is behind a sign-in, run: buoy capture --login");
        info("See them: buoy see");
      } catch (err) {
        error(err instanceof Error ? err.message : String(err));
        flushAndExit(1);
      }
    });
}

const VIZ_API = process.env.BUOY_VIZ_URL || "https://api.buoy.design/viz";
// Same rules as the hosted visualizers: no network, no forms; the page only
// draws what it's handed.
const VIZ_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'";

export function hostPage(list: Array<{ slug: string; name: string; description: string }>, project: string): string {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(project)} · Buoy</title>
<style>
:root{color-scheme:dark;--bg:#0b111c;--panel:#121a28;--ink:#e9edf4;--muted:#8d97a9;--line:#223047;--accent:#f07a33}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 system-ui,-apple-system,sans-serif}
header{padding:18px 20px 10px;display:flex;flex-wrap:wrap;gap:6px 18px;align-items:baseline;justify-content:space-between}
h1{margin:0;font-size:20px}p{margin:0;color:var(--muted);font-size:13px}
nav{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:8px;padding:0 20px 12px}
nav button{text-align:left;font:inherit;color:inherit;background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:9px 12px;cursor:pointer}
nav button[aria-pressed=true]{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}
nav b{display:block;font-size:13px}nav span{font-size:12px;color:var(--muted)}
iframe{display:block;width:100%;border:0;min-height:600px}
</style></head><body>
<header><h1>See inside ${esc(project)}</h1><p>Local only: your code and screenshots stay on this machine.</p></header>
<nav id="nav">${list.map((v, i) => `<button type="button" data-slug="${esc(v.slug)}" aria-pressed="${i === 0}"><b>${esc(v.name)}</b><span>${esc(v.description)}</span></button>`).join("")}</nav>
<iframe id="f" sandbox="allow-scripts" title="Visualizer"></iframe>
<script>
const f = document.getElementById('f'); let snap = null; const html = {};
const META = ${JSON.stringify(`<meta http-equiv="Content-Security-Policy" content="${VIZ_CSP}">`).replace(/</g, "\\u003c")};
async function show(slug) {
  document.querySelectorAll('[data-slug]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.slug === slug)));
  html[slug] ??= await fetch('/viz/' + slug).then((r) => r.text());
  f.srcdoc = html[slug].replace('<head>', '<head>' + META);
}
addEventListener('message', (e) => {
  if (e.source !== f.contentWindow) return;
  const m = e.data || {};
  if (m.type === 'buoy:ready' && snap) f.contentWindow.postMessage({ type: 'buoy:snapshot', snapshot: snap, theme: 'dark', repo: null }, '*');
  if (m.type === 'buoy:resize' && typeof m.height === 'number') f.style.height = Math.max(600, Math.min(8000, m.height)) + 'px';
  if (m.type === 'buoy:open' && typeof m.id === 'string') fetch('/open?id=' + encodeURIComponent(m.id));
});
document.getElementById('nav').addEventListener('click', (e) => { const b = e.target.closest('[data-slug]'); if (b) show(b.dataset.slug); });
fetch('/snapshot.json').then((r) => r.json()).then((s) => { snap = s; show(document.querySelector('[data-slug]').dataset.slug); });
</script></body></html>`;
}

export function createSeeCommand(): Command {
  return new Command("see")
    .description("Open Buoy's visualizers for this project in your browser (runs locally)")
    .option("--port <n>", "Port for the local viewer", "4747")
    .option("--no-open", "Don't open the browser")
    .action(async (options) => {
      try {
        const spin = spinner("Mapping the code...");
        let snapshot: unknown;
        let projectRoot: string;
        const cwd = process.cwd();
        const saved = join(cwd, ".buoy", "snapshot.json");
        if (existsSync(saved)) {
          snapshot = JSON.parse(readFileSync(saved, "utf-8"));
          projectRoot = cwd;
        } else {
          const built = await buildCurrentSnapshot({ onProgress: (m) => { spin.text = m; } });
          snapshot = built.snapshot;
          projectRoot = built.projectRoot;
        }
        const capturesPath = join(projectRoot, ".buoy", "captures.json");
        if (existsSync(capturesPath)) {
          const c = JSON.parse(readFileSync(capturesPath, "utf-8"));
          (snapshot as Record<string, unknown>).captures = { start: c.start, pages: c.pages, components: c.components };
          (snapshot as Record<string, unknown>).captureFailures = c.failures;
        }
        spin.text = "Loading visualizers...";
        const listRes = await fetch(VIZ_API, { signal: AbortSignal.timeout(10000) });
        if (!listRes.ok) throw new Error(`Could not load visualizers from ${VIZ_API} (${listRes.status}).`);
        const list = ((await listRes.json()) as { visualizers: Array<{ slug: string; name: string; description: string; url: string }> }).visualizers;
        const cache = new Map<string, string>();
        spin.stop();

        const project = projectRoot.split(/[\\/]/).pop() || "this project";
        const page = hostPage(list, project);
        const body = JSON.stringify(snapshot);
        const server = createServer(async (req, res): Promise<void> => {
          const u = new URL(req.url || "/", "http://localhost");
          if (u.pathname === "/") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(page); return; }
          if (u.pathname === "/snapshot.json") { res.writeHead(200, { "content-type": "application/json" }); res.end(body); return; }
          if (u.pathname.startsWith("/viz/")) {
            const slug = u.pathname.slice(5);
            const v = list.find((x) => x.slug === slug);
            if (!v) { res.writeHead(404); res.end(); return; }
            if (!cache.has(slug)) cache.set(slug, await (await fetch(v.url)).text());
            res.writeHead(200, { "content-type": "text/html; charset=utf-8", "content-security-policy": VIZ_CSP });
            res.end(cache.get(slug));
            return;
          }
          if (u.pathname === "/open") {
            const id = u.searchParams.get("id") || "";
            const snap = snapshot as { components?: Array<{ id: string; path: string; line?: number }>; tokens?: Array<{ id: string; path?: string }> };
            let path: string | undefined, line: number | undefined;
            if (id.startsWith("c:")) { const c = snap.components?.find((x) => x.id === id); path = c?.path; line = c?.line; }
            else if (id.startsWith("t:")) path = snap.tokens?.find((x) => x.id === id)?.path;
            else path = id;
            if (path && !path.includes("..")) {
              const file = join(projectRoot, path);
              // Opens in the user's editor if it handles vscode:// links, else the default app.
              await open(`vscode://file/${file}${line ? `:${line}` : ""}`).catch(() => open(file).catch(() => {}));
            }
            res.writeHead(204); res.end(); return;
          }
          res.writeHead(404); res.end();
        });
        const port = Number(options.port) || 4747;
        server.listen(port, "127.0.0.1", () => {
          const url = `http://localhost:${port}/`;
          success(`Buoy viewer running at ${url} (Ctrl+C to stop)`);
          if (options.open !== false) open(url).catch(() => {});
        });
      } catch (err) {
        error(err instanceof Error ? err.message : String(err));
        flushAndExit(1);
      }
    });
}
