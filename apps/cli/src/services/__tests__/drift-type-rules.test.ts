import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFileClassifier, isDriftTypeEnabled, OPT_IN_DRIFT_TYPES } from "../drift-analysis.js";
import type { BuoyConfig } from "../../config/schema.js";

const config = (types: Record<string, { enabled?: boolean }> = {}) => ({ drift: { types } }) as unknown as BuoyConfig;

describe("drift type rules", () => {
  it("keeps unreliable types off unless a repo opts in", () => {
    for (const type of OPT_IN_DRIFT_TYPES) {
      expect(isDriftTypeEnabled(config(), type)).toBe(false);
      expect(isDriftTypeEnabled(config({ [type]: { enabled: true } }), type)).toBe(true);
    }
    expect(isDriftTypeEnabled(config(), "hardcoded-value")).toBe(true);
    expect(isDriftTypeEnabled(config({ "hardcoded-value": { enabled: false } }), "hardcoded-value")).toBe(false);
  });

  it("classifies files by content, not only path", () => {
    const root = mkdtempSync(join(tmpdir(), "buoy-classify-"));
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src/Receipt.tsx"), "import { Html } from '@react-email/components';\nexport const R = () => <Html/>;");
    writeFileSync(join(root, "src/Mark.tsx"), 'export const M = () => (<svg><path fill="#f00"/></svg>);');
    writeFileSync(join(root, "src/Card.tsx"), 'export const C = () => <div style={{ color: "#333" }}/>;');
    const classify = createFileClassifier(root);
    expect(classify("src/Receipt.tsx")).toBe("email");
    expect(classify("src/Mark.tsx")).toBe("artwork");
    expect(classify("src/Card.tsx")).toBeNull();
    expect(classify("src/missing.tsx")).toBeNull();
  });
});
