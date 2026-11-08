/**
 * buoy capture: see every component the way it really renders.
 *
 * 1. Crawl the running app (same origin, up to N pages) in a headless browser,
 *    asking React which component drew what: crop, source line, real props.
 * 2. Components no page reached are rendered on their own through the app's
 *    own dev server (Vite today), with props built from their TypeScript
 *    types (real captured props win) and every variant side by side.
 *
 * Everything stays on this machine. Output: buoy-captures/v1.
 */
import { existsSync, readdirSync } from "fs";
import { homedir } from "os";
import { join, relative } from "path";
import type { Snapshot } from "../services/snapshot.js";
import { collectReact } from "./collect-react.js";
import { renderIsolated } from "./isolate.js";
import { placeholderProps } from "./typegen.js";

export interface CaptureShot {
  /** Rendered on its own with sample data rather than seen in the app. */
  placeholder?: boolean;
  /** "variant=outline" for variant renders. */
  variant?: string | null;
  page?: string;
  usedAt?: string;
  props: Record<string, unknown>;
  box: { x: number; y: number; w: number; h: number };
  /** data:image/webp;base64,… */
  image: string;
}

export interface Captures {
  schema: "buoy-captures/v1";
  start: string;
  capturedAt: string;
  framework: string | null;
  pages: Array<{ url: string; title: string; instances: number }>;
  components: Record<string, CaptureShot[]>;
  /** Why a component could not be rendered on its own. */
  failures: Record<string, string>;
}

export interface CaptureOptions {
  start: string;
  projectRoot: string;
  snapshot: Snapshot;
  maxPages: number;
  isolate: boolean;
  scheme: "dark" | "light";
  /** Playwright storage state (cookies) from `buoy capture --login`. */
  storageState?: string;
  onProgress?: (msg: string) => void;
}

const MAX_PER_COMPONENT = 4;

/** System Chrome first, then a Playwright-installed Chromium. */
export function findBrowser(): { executablePath?: string; channel?: string } | null {
  const chrome = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  ].find((p) => existsSync(p));
  if (chrome) return { executablePath: chrome };
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH || join(homedir(), process.platform === "darwin" ? "Library/Caches/ms-playwright" : ".cache/ms-playwright");
  if (existsSync(cache)) {
    const dir = readdirSync(cache).filter((d) => /^chromium-\d+/.test(d)).sort().pop();
    if (dir) {
      const exe = [
        join(cache, dir, "chrome-mac/Chromium.app/Contents/MacOS/Chromium"),
        join(cache, dir, "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"),
        join(cache, dir, "chrome-linux/chrome"), join(cache, dir, "chrome-linux64/chrome"),
        join(cache, dir, "chrome-win/chrome.exe"), join(cache, dir, "chrome-win64/chrome.exe"),
      ].find((p) => existsSync(p));
      if (exe) return { executablePath: exe };
    }
  }
  return null;
}

async function loadPlaywright() {
  try {
    return await import("playwright-core");
  } catch {
    throw new Error("buoy capture needs playwright-core. Install it next to Buoy: npm i -D playwright-core");
  }
}

function common(a: string, b: string): number {
  const x = a.split("/"), y = b.split("/");
  let n = 0;
  while (n < x.length && n < y.length && x[n] === y[n]) n++;
  return n;
}

/** Open a visible browser at `start` so the user can sign in; returns the saved storage state. */
export async function login(start: string, statePath: string, waitForEnter: () => Promise<void>): Promise<void> {
  const { chromium } = await loadPlaywright();
  const where = findBrowser();
  if (!where) throw new Error("No Chrome or Chromium found. Install Google Chrome, or run: npx playwright install chromium");
  const browser = await chromium.launch({ ...where, headless: false });
  const context = await browser.newContext({ viewport: null });
  const page = await context.newPage();
  await page.goto(start).catch(() => {});
  await waitForEnter();
  await context.storageState({ path: statePath });
  await browser.close();
}

export async function capture(opts: CaptureOptions): Promise<Captures> {
  const log = opts.onProgress ?? (() => {});
  const { chromium } = await loadPlaywright();
  const where = findBrowser();
  if (!where) throw new Error("No Chrome or Chromium found. Install Google Chrome, or run: npx playwright install chromium");
  const browser = await chromium.launch({ ...where, headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, colorScheme: opts.scheme,
    ...(opts.storageState && existsSync(opts.storageState) ? { storageState: opts.storageState } : {}),
  });
  const page = await context.newPage();
  const cropper = await browser.newPage();
  const crop = async (png: Buffer, boxes: CaptureShot["box"][]): Promise<Array<string | null>> =>
    cropper.evaluate(async ({ src, boxes }) => {
      const img = new Image(); img.src = src; await img.decode();
      return boxes.map((b) => {
        const w = Math.min(b.w, img.width - b.x), h = Math.min(b.h, img.height - b.y, 1200);
        if (w < 2 || h < 2) return null;
        const scale = Math.min(1, 640 / w);
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(w * scale)); c.height = Math.max(1, Math.round(h * scale));
        c.getContext("2d")!.drawImage(img, b.x, b.y, w, h, 0, 0, c.width, c.height);
        return c.toDataURL("image/webp", 0.8);
      });
    }, { src: `data:image/png;base64,${png.toString("base64")}`, boxes });

  const byName = new Map<string, Snapshot["components"]>();
  for (const c of opts.snapshot.components) {
    if (!byName.has(c.name)) byName.set(c.name, []);
    byName.get(c.name)!.push(c);
  }

  const origin = new URL(opts.start).origin;
  const queue = [opts.start];
  const seen = new Set<string>();
  const pages: Captures["pages"] = [];
  const components: Captures["components"] = {};
  const failures: Captures["failures"] = {};
  let framework: string | null = null;

  try {
    // 1. Crawl.
    while (queue.length && pages.length < opts.maxPages) {
      const url = queue.shift()!;
      const key = url.replace(/#.*$/, "");
      if (seen.has(key)) continue;
      seen.add(key);
      try { await page.goto(url, { waitUntil: "networkidle", timeout: 20000 }); } catch { continue; }
      await page.waitForTimeout(400);
      const finalUrl = page.url().replace(/#.*$/, "");
      if (new URL(finalUrl).origin !== origin) continue;
      if (finalUrl !== key && seen.has(finalUrl) && pages.some((p) => p.url === finalUrl)) continue;
      seen.add(finalUrl);
      const result = await page.evaluate(collectReact, { maxInstances: 3000 }) as { framework: string | null; instances: Array<{ name: string; usedAt: { file: string; line: number }; box: CaptureShot["box"]; props: Record<string, unknown> }>; page?: { title: string } };
      framework = framework ?? result.framework;
      if (!result.framework) { pages.push({ url: finalUrl, title: await page.title(), instances: 0 }); continue; }
      const wanted: Array<CaptureShot & { sig: string }> = [];
      for (const inst of result.instances) {
        const cands = byName.get(inst.name);
        if (!cands?.length || inst.box.w < 4 || inst.box.h < 4) continue;
        const usedAt = relative(opts.projectRoot, inst.usedAt.file);
        const comp = cands.length === 1 ? cands[0]! : [...cands].sort((a, b) => common(b.path, usedAt) - common(a.path, usedAt))[0]!;
        const list = (components[comp.id] ??= []);
        if (list.length >= MAX_PER_COMPONENT) continue;
        const sig = JSON.stringify(inst.props);
        if (list.some((x) => JSON.stringify(x.props) === sig) || wanted.some((w) => w.sig === `${comp.id}|${sig}`)) continue;
        const shot = { sig: `${comp.id}|${sig}`, page: finalUrl, usedAt: `${usedAt}:${inst.usedAt.line}`, box: inst.box, props: inst.props, image: "" };
        list.push(shot);
        wanted.push(shot);
      }
      if (wanted.length) {
        const png = await page.screenshot({ fullPage: true, type: "png" });
        const crops = await crop(png, wanted.map((w) => w.box));
        wanted.forEach((w, i) => { w.image = crops[i] ?? ""; delete (w as Partial<typeof w>).sig; });
      }
      pages.push({ url: finalUrl, title: result.page?.title ?? "", instances: result.instances.length });
      log(`${new URL(finalUrl).pathname}: ${result.instances.length} components on the page, ${wanted.length} new`);
      const links = await page.$$eval("a[href]", (as) => as.map((a) => (a as HTMLAnchorElement).href));
      for (const l of links) {
        try { const u = new URL(l); if (u.origin === origin && !seen.has(u.href.replace(/#.*$/, ""))) queue.push(u.href); } catch { /* skip */ }
      }
    }
    for (const id of Object.keys(components)) {
      components[id] = components[id]!.filter((x) => x.image);
      if (!components[id]!.length) delete components[id];
    }

    // 2. Render the rest on their own (Vite dev servers).
    if (opts.isolate && framework === "react") {
      await page.goto(opts.start, { waitUntil: "networkidle", timeout: 20000 }).catch(() => {});
      const isVite = await page.evaluate(() => performance.getEntriesByType("resource").some((e) => /\/node_modules\/\.vite\/deps\/react(-dom_client)?\.js/.test(e.name)));
      if (!isVite) {
        log("Rendering components on their own needs a Vite dev server for now; skipping that step.");
      } else {
        const todo = opts.snapshot.components.filter((c) => c.kind !== "page" && c.kind !== "icon" && !components[c.id]);
        let typed: Record<string, { props?: Record<string, unknown>; variants?: Array<{ prop: string; values: string[] }> }> = {};
        try { typed = placeholderProps(opts.projectRoot, todo); } catch (e) { log(`Could not read prop types (${(e as Error).message}); using name-based sample data.`); }
        const realProps = (id: string) => components[id]?.[0]?.props ?? {};
        const cells: Array<Record<string, unknown>> = [];
        for (const c of todo) {
          const t = typed[c.id] ?? {};
          const base = { id: c.id, name: c.name, path: c.path, props: c.props, realProps: realProps(c.id), typedProps: t.props ?? {} };
          cells.push({ ...base, label: null });
          const v = t.variants?.[0];
          if (v) for (const val of v.values.slice(0, 6)) cells.push({ ...base, typedProps: { ...base.typedProps, [v.prop]: val }, label: `${v.prop}=${val}` });
        }
        let rendered = 0;
        for (let i = 0; i < cells.length; i += 30) {
          await page.goto(opts.start, { waitUntil: "networkidle", timeout: 20000 }).catch(() => {});
          await page.setViewportSize({ width: 1100, height: 800 });
          const res = await page.evaluate(renderIsolated, { components: cells.slice(i, i + 30), cellW: 1000, cellH: 700 }) as Array<{ id: string; label: string | null; ok: boolean; reason?: string; box?: CaptureShot["box"]; props?: Record<string, unknown> }>;
          for (const r of res) if (!r.ok && !r.label) failures[r.id] = r.reason ?? "did not render";
          const ok = res.filter((r) => r.ok && r.box);
          if (!ok.length) continue;
          const png = await page.screenshot({ fullPage: true, type: "png" });
          const crops = await crop(png, ok.map((r) => r.box!));
          ok.forEach((r, j) => {
            if (!crops[j]) return;
            (components[r.id] ??= []).push({ placeholder: true, variant: r.label, props: r.props ?? {}, box: r.box!, image: crops[j]! });
            rendered++;
          });
          log(`Rendered ${Math.min(i + 30, cells.length)}/${cells.length} on their own`);
        }
        log(`${rendered} renders with sample data`);
      }
    }
  } finally {
    await browser.close();
  }

  return { schema: "buoy-captures/v1", start: opts.start, capturedAt: new Date().toISOString(), framework, pages, components, failures };
}
