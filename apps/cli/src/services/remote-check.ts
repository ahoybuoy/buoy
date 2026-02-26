import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { DriftSignal, Severity } from "@buoy-design/core";
import type { BuoyConfig } from "../config/schema.js";
import { DriftAnalysisService, calculateDriftSummary } from "./drift-analysis.js";

export type InputSourceContextKind = "local" | "remote-url" | "remote-fixture";

export interface RemoteSourceContext {
  mode: InputSourceContextKind;
  confidence: "full" | "reduced";
  reason?: string;
  source: string;
  tokens?: string[];
}

export interface RemoteCheckRunResult {
  drifts: DriftSignal[];
  summary: ReturnType<typeof calculateDriftSummary>;
  sourceContext: RemoteSourceContext;
}

export interface RemoteCheckOptions {
  failOn: Severity | "none";
  verbose?: boolean;
  strictRemote?: boolean;
  allowPrivateNetwork?: boolean;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  cache?: boolean;
  tokens?: string;
  fixture?: string;
  url?: string;
  target?: string;
}

interface FetchedAsset {
  original: string;
  resolvedUrl?: string;
  content: Buffer;
  contentType: string;
  localPath?: string;
}

interface FixtureManifest {
  source: string | { url: string; path?: string };
  tokens?: Array<string | { url: string; path?: string }> | string;
  config?: Partial<BuoyConfig>;
  framework?: string;
  type?: string;
}

export function looksLikePublicUrl(input: string): boolean {
  const s = input.trim();
  if (!s) return false;
  if (/^https?:\/\//i.test(s)) return true;
  if (/^[./~]/.test(s)) return false;
  if (/^[A-Za-z]:[\\/]/.test(s)) return false;
  if (s.includes("\\") && !s.includes("/")) return false;
  const slashIdx = s.indexOf("/");
  const host = (slashIdx === -1 ? s : s.slice(0, slashIdx)).toLowerCase();
  if (!host || !host.includes(".")) return false;
  if (host.endsWith(".") || host.includes("..")) return false;
  if (!/^[a-z0-9.-]+(?::\d+)?$/i.test(host)) return false;
  return true;
}

export function normalizePublicUrl(input: string): string {
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (looksLikePublicUrl(trimmed)) return `https://${trimmed}`;
  throw new Error(`Not a public URL: ${input}`);
}

export function classifyCheckInput(
  target: string | undefined,
  options: { url?: string; fixture?: string },
): "project" | "local-file" | "remote-url" | "remote-fixture" {
  if (options.fixture) return "remote-fixture";
  if (options.url) return "remote-url";
  if (!target) return "project";
  if (looksLikePublicUrl(target)) return "remote-url";
  return "local-file";
}

export async function runSingleSourceOrRemoteCheck(
  opts: RemoteCheckOptions,
): Promise<RemoteCheckRunResult> {
  const mode = classifyCheckInput(opts.target, { url: opts.url, fixture: opts.fixture });
  if (mode === "project") {
    throw new Error("runSingleSourceOrRemoteCheck called without a target");
  }

  const tempRoot = await mkdtemp(join(tmpdir(), "buoy-remote-check-"));
  try {
    const remoteOpts: Required<Pick<RemoteCheckOptions, "allowPrivateNetwork" | "timeoutMs" | "maxBytes" | "cache">> = {
      allowPrivateNetwork: !!opts.allowPrivateNetwork,
      timeoutMs: opts.timeoutMs ?? 10_000,
      maxBytes: opts.maxBytes ?? 1_048_576,
      cache: !!opts.cache,
    };

    const fixture = mode === "remote-fixture"
      ? await loadFixtureManifest(opts.fixture!, tempRoot, remoteOpts)
      : null;

    const sourceRef =
      fixture
        ? (typeof fixture.source === "string" ? fixture.source : fixture.source.url)
        : mode === "remote-url"
          ? (opts.url ?? opts.target)!
          : opts.target!;

    const sourceAsset = await loadAsset(sourceRef, tempRoot, remoteOpts);
    const sourceNameRef = sourceAsset.resolvedUrl || sourceRef;
    const sourceExt = extname(inferFilename(sourceNameRef, sourceAsset.contentType)) || inferExtensionFromContent(sourceAsset.content) || ".txt";
    const sourceRelPath = inferSourceRelativePath(sourceExt, fixture);
    const sourceAbsPath = resolve(tempRoot, sourceRelPath);
    await mkdir(dirnameSafe(sourceAbsPath), { recursive: true });
    await writeFile(sourceAbsPath, sourceAsset.content);

    const tokenRefs = fixture
      ? normalizeFixtureTokenRefs(fixture.tokens)
      : opts.tokens
        ? [opts.tokens]
        : [];
    const tokenFiles: string[] = [];
    for (let i = 0; i < tokenRefs.length; i++) {
      const tokenRef = tokenRefs[i]!;
      const tokenAsset = await loadAsset(typeof tokenRef === "string" ? tokenRef : tokenRef.url, tempRoot, remoteOpts);
      const tokenFilename = (typeof tokenRef === "object" && tokenRef.path) || inferFilename(
        typeof tokenRef === "string" ? tokenRef : tokenRef.url,
        tokenAsset.contentType,
      ) || `tokens-${i}.json`;
      const rel = sanitizeRelativePath(tokenFilename, `tokens/tokens-${i}${extname(tokenFilename) || ".json"}`);
      const abs = resolve(tempRoot, rel);
      await mkdir(dirnameSafe(abs), { recursive: true });
      await writeFile(abs, tokenAsset.content);
      tokenFiles.push(rel);
    }

    const inferred = inferSourceConfig(sourceRelPath, fixture);
    if (!inferred) {
      throw new Error(`Unsupported source type for drift check: ${sourceRelPath}`);
    }

    const hasContextAssets = tokenFiles.length > 0 || !!fixture?.config;
    if (opts.strictRemote && !hasContextAssets) {
      throw new Error(
        "Strict remote mode requires tokens or fixture config context (use --tokens or --fixture)",
      );
    }

    const baseConfig = buildRemoteConfig({
      sourceRelPath,
      tokenFiles,
      inferred,
      fixtureConfig: fixture?.config,
      reducedConfidence: !hasContextAssets,
    });

    const service = new DriftAnalysisService(baseConfig, tempRoot);
    const result = await service.analyze({
      onProgress: opts.verbose ? (m) => console.error(m) : undefined,
      includeIgnored: false,
    });

    return {
      drifts: result.drifts,
      summary: calculateDriftSummary(result.drifts),
      sourceContext: {
        mode: mode === "local-file" ? "local" : mode,
        confidence: hasContextAssets ? "full" : "reduced",
        reason: hasContextAssets
          ? undefined
          : "No tokens/config context supplied; results may miss semantic-token mappings and project-level drift signals",
        source: sourceRef,
        tokens: tokenRefs.map((t) => (typeof t === "string" ? t : t.url)),
      },
    };
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function loadFixtureManifest(
  fixtureRef: string,
  tempRoot: string,
  opts: Required<Pick<RemoteCheckOptions, "allowPrivateNetwork" | "timeoutMs" | "maxBytes" | "cache">>,
): Promise<FixtureManifest> {
  const asset = await loadAsset(fixtureRef, tempRoot, opts);
  const contentType = (asset.contentType || "").toLowerCase();
  if (!contentType.includes("json") && !fixtureRef.endsWith(".json")) {
    throw new Error(`Fixture must be JSON (got content-type "${asset.contentType || "unknown"}")`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(asset.content.toString("utf-8"));
  } catch (err) {
    throw new Error(`Invalid fixture JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!parsed || typeof parsed !== "object" || !("source" in parsed)) {
    throw new Error("Invalid fixture manifest: missing required `source` field");
  }
  return parsed as FixtureManifest;
}

async function loadAsset(
  ref: string,
  tempRoot: string,
  opts: Required<Pick<RemoteCheckOptions, "allowPrivateNetwork" | "timeoutMs" | "maxBytes" | "cache">>,
): Promise<FetchedAsset> {
  if (looksLikePublicUrl(ref) || /^https?:\/\//i.test(ref.trim())) {
    return fetchRemoteAsset(normalizePublicUrl(ref), tempRoot, opts);
  }
  const fullPath = resolve(process.cwd(), ref);
  try {
    const [content, meta] = await Promise.all([readFile(fullPath), stat(fullPath)]);
    if (!meta.isFile()) throw new Error("Not a file");
    return { original: ref, content, contentType: contentTypeFromExt(extname(fullPath)) || "application/octet-stream", localPath: fullPath };
  } catch (err) {
    throw new Error(`Failed to read local file "${ref}": ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function fetchRemoteAsset(
  url: string,
  tempRoot: string,
  opts: Required<Pick<RemoteCheckOptions, "allowPrivateNetwork" | "timeoutMs" | "maxBytes" | "cache">>,
): Promise<FetchedAsset> {
  let currentUrl = url;
  const cachePath = opts.cache ? getRemoteCachePath(tempRoot, url) : null;
  if (cachePath && existsSync(cachePath)) {
    const content = await readFile(cachePath);
    let inferredType = "application/octet-stream";
    try {
      const parsed = new URL(url);
      inferredType = contentTypeFromExt(extname(parsed.pathname)) || inferredType;
    } catch {}
    return { original: url, resolvedUrl: url, content, contentType: inferredType };
  }
  let response: Response | null = null;
  let redirects = 0;
  const maxRedirects = 5;
  while (true) {
    const parsed = new URL(currentUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error(`Unsupported URL protocol: ${parsed.protocol}`);
    }
    await enforceNetworkGuards(parsed, opts.allowPrivateNetwork);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), opts.timeoutMs);
    try {
      response = await fetch(currentUrl, {
        signal: controller.signal,
        redirect: "manual",
        headers: { "user-agent": "buoy-cli/remote-check" },
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`Remote fetch timed out after ${opts.timeoutMs}ms: ${currentUrl}`);
      }
      throw new Error(`Failed to fetch URL ${currentUrl}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      clearTimeout(timeout);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw new Error(`Redirect response missing Location header (HTTP ${response.status}) for ${currentUrl}`);
      }
      redirects += 1;
      if (redirects > maxRedirects) {
        throw new Error(`Too many redirects (${maxRedirects}) while fetching ${url}`);
      }
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    if (!response.ok) {
      throw new Error(`Remote fetch failed with HTTP ${response.status} for ${currentUrl}`);
    }
    break;
  }

  const contentType = response!.headers.get("content-type") || "";
  const body = await readResponseBodyWithLimit(response!, opts.maxBytes, currentUrl);
  if (cachePath) {
    await mkdir(dirnameSafe(cachePath), { recursive: true });
    await writeFile(cachePath, body);
  }
  return { original: url, resolvedUrl: currentUrl, content: body, contentType };
}

async function readResponseBodyWithLimit(response: Response, maxBytes: number, url: string): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = response.body?.getReader();
  if (!reader) {
    const ab = await response.arrayBuffer();
    const buf = Buffer.from(ab);
    if (buf.length > maxBytes) {
      throw new Error(`Remote response exceeded max size (${maxBytes} bytes): ${url}`);
    }
    return buf;
  }
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      try { await reader.cancel(); } catch {}
      throw new Error(`Remote response exceeded max size (${maxBytes} bytes): ${url}`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}

async function enforceNetworkGuards(url: URL, allowPrivateNetwork: boolean): Promise<void> {
  const host = url.hostname.toLowerCase();
  if (!allowPrivateNetwork) {
    if (host === "localhost" || host.endsWith(".localhost")) {
      throw new Error(`Blocked private/localhost URL: ${url.toString()} (use --allow-private-network to override)`);
    }
    if (host === "[::1]" || host === "::1") {
      throw new Error(`Blocked private loopback URL: ${url.toString()} (use --allow-private-network to override)`);
    }
  }
  const literalIp = isIP(host.replace(/^\[|\]$/g, ""));
  if (literalIp && !allowPrivateNetwork && isPrivateIp(host)) {
    throw new Error(`Blocked private IP URL: ${url.toString()} (use --allow-private-network to override)`);
  }
  if (!allowPrivateNetwork) {
    try {
      const resolved = await lookup(host, { all: true });
      for (const addr of resolved) {
        if (isPrivateIp(addr.address)) {
          throw new Error(
            `Blocked URL resolving to private IP (${addr.address}): ${url.toString()} (use --allow-private-network to override)`,
          );
        }
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("Blocked URL resolving")) throw err;
      throw new Error(`Failed to resolve host ${host}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

function isPrivateIp(address: string): boolean {
  const a = address.replace(/^\[|\]$/g, "");
  const version = isIP(a);
  if (version === 4) {
    const parts = a.split(".").map((n) => Number(n));
    const p1 = parts[0] ?? -1;
    const p2 = parts[1] ?? -1;
    if (p1 === 10) return true;
    if (p1 === 127) return true;
    if (p1 === 169 && p2 === 254) return true;
    if (p1 === 192 && p2 === 168) return true;
    if (p1 === 172 && p2 >= 16 && p2 <= 31) return true;
    return false;
  }
  if (version === 6) {
    const lower = a.toLowerCase();
    return (
      lower === "::1" ||
      lower.startsWith("fc") ||
      lower.startsWith("fd") ||
      lower.startsWith("fe80:")
    );
  }
  return false;
}

function getRemoteCachePath(tempRoot: string, url: string): string {
  const key = createHash("sha256").update(url).digest("hex");
  return join(tempRoot, ".remote-cache", key);
}

function inferSourceRelativePath(ext: string, fixture: FixtureManifest | null): string {
  if (fixture?.framework === "astro" || ext === ".astro") return `src/remote-fixture${ext}`;
  if ([".tsx", ".jsx", ".ts", ".js"].includes(ext)) return `src/remote-fixture${ext}`;
  if ([".vue", ".svelte"].includes(ext)) return `src/remote-fixture${ext}`;
  if ([".html", ".mdx", ".md"].includes(ext)) return `templates/remote-fixture${ext}`;
  return `src/remote-fixture${ext || ".txt"}`;
}

function inferSourceConfig(sourceRelPath: string, fixture: FixtureManifest | null): {
  sourceConfig: Partial<BuoyConfig["sources"]>;
  tailwindFiles?: string[];
} | null {
  const ext = extname(sourceRelPath).toLowerCase();
  const forced = fixture?.framework || fixture?.type;

  if (forced === "astro" || ext === ".astro") {
    return {
      sourceConfig: {
        templates: { enabled: true, include: [sourceRelPath], exclude: [], type: "astro" },
        tailwind: { enabled: true, files: [sourceRelPath], exclude: [] },
      } as any,
    };
  }
  if (ext === ".tsx" || ext === ".jsx") {
    return {
      sourceConfig: {
        react: { enabled: true, include: [sourceRelPath], exclude: [] },
        tailwind: { enabled: true, files: [sourceRelPath], exclude: [] },
      } as any,
    };
  }
  if (ext === ".vue") {
    return {
      sourceConfig: {
        vue: { enabled: true, include: [sourceRelPath], exclude: [] },
        tailwind: { enabled: true, files: [sourceRelPath], exclude: [] },
      } as any,
    };
  }
  if (ext === ".svelte") {
    return {
      sourceConfig: {
        svelte: { enabled: true, include: [sourceRelPath], exclude: [] },
        tailwind: { enabled: true, files: [sourceRelPath], exclude: [] },
      } as any,
    };
  }
  if (ext === ".html" || ext === ".mdx" || ext === ".md") {
    return {
      sourceConfig: {
        templates: { enabled: true, include: [sourceRelPath], exclude: [], type: ext === ".html" ? "html" : "markdown" },
      } as any,
    };
  }
  return null;
}

function buildRemoteConfig(args: {
  sourceRelPath: string;
  tokenFiles: string[];
  inferred: { sourceConfig: Partial<BuoyConfig["sources"]> };
  fixtureConfig?: Partial<BuoyConfig>;
  reducedConfidence: boolean;
}): BuoyConfig {
  const base: BuoyConfig = {
    project: { name: "remote-fixture-check" },
    sources: {
      ...args.inferred.sourceConfig,
      tokens: args.tokenFiles.length > 0 ? { enabled: true, files: args.tokenFiles } as any : undefined,
    } as any,
    drift: {
      ignore: [],
      promote: [],
      enforce: [],
      severity: {},
      aggregation: { strategies: ["value", "suggestion", "path", "entity"], minGroupSize: 2, pathPatterns: [] },
      types: {},
      exclude: args.reducedConfidence
        ? ["unused-component", "unused-token", "framework-sprawl"]
        : undefined,
    } as any,
    health: {},
    claude: { enabled: false, model: "claude-sonnet-4-20250514" } as any,
    output: { format: "table", colors: true },
    experimental: {},
  };

  if (!args.fixtureConfig) return base;
  return {
    ...base,
    ...args.fixtureConfig,
    project: { ...base.project, ...(args.fixtureConfig.project || {}) },
    sources: { ...base.sources, ...(args.fixtureConfig.sources || {}) } as any,
    drift: { ...base.drift, ...(args.fixtureConfig.drift || {}) } as any,
    health: { ...base.health, ...(args.fixtureConfig.health || {}) },
    claude: { ...base.claude, ...(args.fixtureConfig.claude || {}) } as any,
    output: { ...base.output, ...(args.fixtureConfig.output || {}) },
    experimental: { ...base.experimental, ...(args.fixtureConfig.experimental || {}) },
  };
}

function inferFilename(ref: string, contentType: string): string {
  try {
    const u = new URL(/^https?:\/\//i.test(ref) ? ref : `https://${ref}`);
    const fromPath = basename(u.pathname);
    if (fromPath) {
      if (extname(fromPath)) return fromPath;
      const inferredExt = extensionFromContentType(contentType);
      if (inferredExt) return `${fromPath}${inferredExt}`;
      return fromPath;
    }
  } catch {
    // local path
  }
  const ext = extensionFromContentType(contentType) || ".txt";
  return `remote${ext}`;
}

function contentTypeFromExt(ext: string): string | null {
  switch (ext.toLowerCase()) {
    case ".astro": return "text/plain";
    case ".tsx": return "text/typescript";
    case ".ts": return "text/typescript";
    case ".jsx": return "text/javascript";
    case ".js": return "text/javascript";
    case ".json": return "application/json";
    case ".css": return "text/css";
    case ".scss": return "text/x-scss";
    case ".html": return "text/html";
    default: return null;
  }
}

function extensionFromContentType(contentType: string): string | null {
  const type = contentType.toLowerCase();
  if (type.includes("application/json")) return ".json";
  if (type.includes("text/css")) return ".css";
  if (type.includes("text/html")) return ".html";
  if (type.includes("typescript")) return ".ts";
  if (type.includes("javascript")) return ".js";
  return null;
}

function inferExtensionFromContent(content: Buffer): string | null {
  const text = content.toString("utf-8", 0, Math.min(content.length, 2048));
  if (/^---\s*\n[\s\S]{0,800}\n---\s*\n/.test(text) || /\bclass(Name)?=/.test(text)) return ".astro";
  if (/<template[\s>]/.test(text) && /<script/.test(text)) return ".vue";
  if (/<svelte:/.test(text) || /\bon:click=/.test(text)) return ".svelte";
  if (/<html|<body|<!doctype html/i.test(text)) return ".html";
  if (/\bexport\s+default\b/.test(text) || /\bimport\s.+from\s+['"]/.test(text)) return ".ts";
  return null;
}

function dirnameSafe(path: string): string {
  return path.slice(0, Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"))) || ".";
}

function sanitizeRelativePath(candidate: string, fallback: string): string {
  const normalized = candidate.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("..")) return fallback;
  return normalized;
}

function normalizeFixtureTokenRefs(tokens: FixtureManifest["tokens"]): Array<string | { url: string; path?: string }> {
  if (!tokens) return [];
  if (typeof tokens === "string") return [tokens];
  if (!Array.isArray(tokens)) return [];
  return tokens.filter((t): t is string | { url: string; path?: string } => typeof t === "string" || (!!t && typeof t === "object" && typeof (t as any).url === "string"));
}
