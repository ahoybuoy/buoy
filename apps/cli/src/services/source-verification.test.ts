import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { formatVerificationNotice, verifySource } from "./source-verification.js";

const dir = join(__dirname, "__fixtures__/equivalence/variants");
const read = (f: string) => readFileSync(join(dir, f), "utf8");
const byPrefix = (p: string) => readdirSync(dir).filter((f) => f.startsWith(p));

describe("verifySource", () => {
  it("marks a CSS module import as partial", () => {
    const v = verifySource(read(byPrefix("e06")[0]!));
    expect(v.status).toBe("partial");
    expect(v.unverified[0]).toMatchObject({ kind: "style-module-import", line: 2 });
  });

  it("marks a relative token import as partial", () => {
    const v = verifySource(read(byPrefix("e02")[0]!));
    expect(v.status).toBe("partial");
    expect(v.unverified[0]!.kind).toBe("token-import");
  });

  it("marks a runtime-built CSS variable name as partial", () => {
    const v = verifySource(read(byPrefix("e08")[0]!));
    expect(v.status).toBe("partial");
    expect(v.unverified[0]!.kind).toBe("dynamic-css-variable");
  });

  it("treats self-contained equivalents as complete", () => {
    for (const p of ["e01", "e03", "e05", "e07", "e09", "e10"]) {
      expect(verifySource(read(byPrefix(p)[0]!)).status, p).toBe("complete");
    }
  });

  it("does not hide drift controls as unverified", () => {
    for (const f of byPrefix("d")) expect(verifySource(read(f)).status, f).toBe("complete");
  });

  it("formats a notice only when partial", () => {
    expect(formatVerificationNotice({ status: "complete", unverified: [] })).toEqual([]);
    const notice = formatVerificationNotice(verifySource(read(byPrefix("e06")[0]!)));
    expect(notice[0]).toBe("~ Partial: 1 style source could not be verified");
  });
});
