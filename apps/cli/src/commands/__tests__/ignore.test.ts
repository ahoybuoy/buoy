import { describe, expect, it } from "vitest";
import type { DriftSignal } from "@buoy-design/core";
import {
  createIgnoreList,
  filterIgnored,
  fingerprintDrift,
  preserveIgnoreEntries,
  type IgnoreList,
} from "../ignore.js";

function drift(overrides: Partial<DriftSignal> = {}): DriftSignal {
  return {
    id: "drift:generated:one",
    type: "hardcoded-color",
    severity: "warning",
    source: {
      entityType: "component",
      entityId: "button",
      entityName: "Button",
      location: "src/Button.tsx:10:4",
    },
    message: "Hardcoded color #ff0000",
    details: { actual: "#ff0000", suggestions: ["--color-danger"] },
    detectedAt: new Date(),
    ...overrides,
  };
}

describe("legacy drift baselines", () => {
  it("keeps a stable fingerprint when only the line and generated ID change", () => {
    const first = drift();
    const moved = drift({
      id: "drift:generated:two",
      source: { ...first.source, location: "src/Button.tsx:88:2" },
    });

    expect(fingerprintDrift(moved)).toBe(fingerprintDrift(first));
  });

  it("filters moved legacy drift by fingerprint", () => {
    const first = drift();
    const baseline = createIgnoreList(
      [first],
      "Accepted during migration",
      "Design systems",
    );
    const moved = drift({
      id: "different-id",
      source: { ...first.source, location: "src/Button.tsx:42:1" },
    });

    expect(filterIgnored([moved], baseline)).toEqual({
      newDrifts: [],
      ignoredCount: 1,
    });
  });

  it("continues to support version 1 ID-only baselines", () => {
    const finding = drift();
    const legacy: IgnoreList = {
      version: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      reason: "Legacy",
      driftIds: [finding.id],
      summary: { critical: 0, warning: 1, info: 0, total: 1 },
    };

    expect(filterIgnored([finding], legacy).ignoredCount).toBe(1);
  });

  it("records a reason and actor for every version 2 fingerprint", () => {
    const baseline = createIgnoreList(
      [drift()],
      "Approved legacy",
      "Frontend platform",
    );
    const key = baseline.fingerprints?.[0];

    expect(baseline.version).toBe(2);
    expect(key).toBeDefined();
    expect(baseline.entries?.[key!]).toMatchObject({
      reason: "Approved legacy",
      createdBy: "Frontend platform",
    });
  });

  it("preserves v1 audit reasons when migrating entries to fingerprints", () => {
    const finding = drift({ id: "legacy-id" });
    const existing = createIgnoreList([finding], "Original review", "Alice");
    existing.version = 1;
    existing.entries = {
      "legacy-id": existing.entries![fingerprintDrift(finding)]!,
    };
    delete existing.fingerprints;
    const next = createIgnoreList([finding], "New scan", "Bob");

    preserveIgnoreEntries(next, existing, [finding]);

    expect(next.entries?.[fingerprintDrift(finding)]).toMatchObject({
      reason: "Original review",
      createdBy: "Alice",
    });
  });
});
