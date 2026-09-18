import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { DriftSignal, Fix } from "@buoy-design/core";
import { createIgnoreList, fingerprintDrift } from "../commands/ignore.js";
import {
  createRunId,
  loadRescueManifest,
  saveRescueManifest,
} from "./store.js";
import { renderRescueMarkdown, writeRescueReports } from "./report.js";
import {
  acceptedFingerprintsFor,
  detectVerificationCommands,
  restoreBackups,
  selectSafeFixes,
  statusAfterVerification,
} from "./workflow.js";
import type { RescueManifest } from "./types.js";

function finding(id = "drift-one"): DriftSignal {
  return {
    id,
    type: "hardcoded-color",
    severity: "warning",
    source: {
      entityType: "component",
      entityId: "button",
      entityName: "Button",
      location: "src/Button.tsx:4:12",
    },
    message: "Hardcoded color #ff0000",
    details: { actual: "#ff0000", suggestions: ["--color-danger"] },
    detectedAt: new Date(),
  };
}

function fix(overrides: Partial<Fix> = {}): Fix {
  return {
    id: "fix-one",
    driftSignalId: "drift-one",
    confidence: "high",
    confidenceScore: 98,
    file: "src/Button.tsx",
    line: 4,
    column: 12,
    original: "#ff0000",
    replacement: "var(--color-danger)",
    reason: "Exact token value",
    fixType: "hardcoded-color",
    tokenName: "--color-danger",
    ...overrides,
  };
}

function manifest(projectRoot: string): RescueManifest {
  const now = new Date().toISOString();
  return {
    version: 1,
    id: "rescue-test",
    projectRoot,
    projectName: "Test project",
    createdAt: now,
    updatedAt: now,
    status: "planned",
    source: { branch: "main", head: "abc" },
    before: {
      summary: { total: 2, critical: 0, warning: 2, info: 0 },
      componentCount: 1,
      tokenCount: 1,
    },
    findings: [],
    safeFixes: [fix()],
    appliedFixIds: [],
    backups: [],
  };
}

describe("Rescue workflow foundations", () => {
  it("selects only unique high-confidence fixes inside the project", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "buoy-rescue-"));
    mkdirSync(join(projectRoot, "src"));
    const drift = finding();
    const selected = selectSafeFixes(
      [
        fix(),
        fix({ id: "medium", confidence: "medium", line: 8 }),
        fix({ id: "outside", file: "../outside.ts", line: 9 }),
      ],
      [drift],
      projectRoot,
      new Set(),
    );

    expect(selected.map((item) => item.id)).toEqual(["fix-one"]);
  });

  it("keeps accepted legacy drift out of the safe-fix set", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "buoy-rescue-"));
    mkdirSync(join(projectRoot, "src"));
    const drift = finding();

    expect(
      selectSafeFixes(
        [fix()],
        [drift],
        projectRoot,
        new Set([fingerprintDrift(drift)]),
      ),
    ).toEqual([]);
  });

  it("upgrades a v1 ID baseline to stable fingerprints during planning", () => {
    const drift = finding();
    const baseline = createIgnoreList([drift], "Accepted during migration");
    baseline.version = 1;
    delete baseline.fingerprints;

    expect(acceptedFingerprintsFor([drift], baseline)).toContain(
      fingerprintDrift(drift),
    );
  });

  it("rejects conflicting fixes at the same source location", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "buoy-rescue-"));
    mkdirSync(join(projectRoot, "src"));
    const drift = finding();
    const selected = selectSafeFixes(
      [fix(), fix({ id: "fix-two", replacement: "var(--color-error)" })],
      [drift],
      projectRoot,
      new Set(),
    );

    expect(selected).toEqual([]);
  });

  it("detects typecheck and CI-test scripts without executing package text", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "buoy-rescue-"));
    writeFileSync(
      join(projectRoot, "package.json"),
      JSON.stringify({
        packageManager: "pnpm@9.15.1",
        scripts: {
          typecheck: "tsc --noEmit",
          test: "vitest",
          "test:ci": "vitest run",
        },
      }),
    );

    expect(detectVerificationCommands(projectRoot)).toEqual([
      { label: "typecheck", command: "pnpm", args: ["run", "typecheck"] },
      { label: "test:ci", command: "pnpm", args: ["run", "test:ci"] },
    ]);
  });

  it("does not label a run failed when no automated checks exist", () => {
    expect(
      statusAfterVerification("applied", {
        completedAt: new Date().toISOString(),
        passed: false,
        skipped: true,
        commands: [],
      }),
    ).toBe("applied");
  });

  it("refuses to overwrite human edits made after Rescue", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "buoy-rescue-"));
    const sourceDir = join(projectRoot, "src");
    const backupDir = join(projectRoot, ".buoy", "rescue", "backups");
    mkdirSync(sourceDir, { recursive: true });
    mkdirSync(backupDir, { recursive: true });
    const source = join(sourceDir, "Button.tsx");
    const backup = join(backupDir, "Button.tsx");
    writeFileSync(backup, "before");
    writeFileSync(source, "human edit");
    const run = manifest(projectRoot);
    run.backups = [
      {
        file: "src/Button.tsx",
        backupPath: backup,
        beforeHash: createHash("sha256").update("before").digest("hex"),
        afterHash: createHash("sha256").update("after Rescue").digest("hex"),
      },
    ];

    await expect(restoreBackups(run, false)).rejects.toThrow(
      "changed after Rescue",
    );
    expect(readFileSync(source, "utf8")).toBe("human edit");
  });

  it("persists a latest run pointer and report artifacts", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "buoy-rescue-"));
    const run = manifest(projectRoot);
    await saveRescueManifest(run);
    const loaded = await loadRescueManifest(projectRoot);
    const paths = await writeRescueReports(loaded);

    expect(loaded.id).toBe(run.id);
    expect(readFileSync(paths.markdown, "utf8")).toContain(
      "Buoy Rescue report",
    );
    expect(readFileSync(paths.html, "utf8")).toContain(
      "Before-and-after implementation report",
    );
    expect(JSON.parse(readFileSync(paths.json, "utf8")).id).toBe(run.id);
  });

  it("states the human guardrail when no baseline exists", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "buoy-rescue-"));
    expect(renderRescueMarkdown(manifest(projectRoot))).toContain(
      "Ambiguous findings remain review-required",
    );
  });

  it("creates sortable run IDs", () => {
    expect(createRunId(new Date("2026-08-04T21:36:31.123Z"))).toBe(
      "rescue-20260804T213631Z",
    );
  });
});
