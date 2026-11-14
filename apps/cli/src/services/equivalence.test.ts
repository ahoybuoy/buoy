import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { runSingleSourceOrRemoteCheck } from "./remote-check.js";

// "Ten competent people" test: equivalent implementations of one design intent
// must all pass, and real-drift controls must all be flagged.
const root = join(__dirname, "__fixtures__/equivalence");
const tokens = join(root, "tokens.json");
const files = readdirSync(join(root, "variants"));
const run = (f: string) =>
  runSingleSourceOrRemoteCheck({
    target: join(root, "variants", f),
    tokens,
    failOn: "critical",
  });

describe("equivalence: compliant implementations are not flagged", () => {
  for (const f of files.filter((x) => x.startsWith("e"))) {
    it(f, async () => {
      expect((await run(f)).drifts).toHaveLength(0);
    }, 30_000);
  }
});

// d07 (magic spacing) and d08 (var() fallback) are known gaps, tracked as todo.
describe("equivalence: drift controls are flagged", () => {
  for (const f of files.filter((x) => x.startsWith("d"))) {
    const known = f.startsWith("d07") || f.startsWith("d08");
    (known ? it.todo : it)(f, async () => {
      expect((await run(f)).drifts.length).toBeGreaterThan(0);
    }, 30_000);
  }
});

describe("equivalence: unverifiable files are not reported as complete", () => {
  for (const [prefix, kind] of [["e02", "token-import"], ["e06", "style-module-import"], ["e08", "dynamic-css-variable"]] as const) {
    it(`${prefix} reports partial verification`, async () => {
      const r = await run(files.find((x) => x.startsWith(prefix))!);
      expect(r.sourceContext.verification?.status).toBe("partial");
      expect(r.sourceContext.verification?.unverified[0]?.kind).toBe(kind);
    }, 30_000);
  }
});
