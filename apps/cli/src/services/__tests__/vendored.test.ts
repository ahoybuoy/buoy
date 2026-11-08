import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DriftSignal } from "@buoy-design/core";
import { isVendoredFile, setAsideVendored, shadcnUiDirs } from "../vendored.js";

function drift(location: string, affected: string[]): DriftSignal {
  return {
    id: `drift:${location}`,
    type: "hardcoded-value",
    severity: "info",
    source: { entityType: "component", entityId: location, entityName: location, location },
    message: "Hardcoded font size",
    details: { affectedFiles: affected },
    detectedAt: new Date(),
  } as DriftSignal;
}

describe("vendored shadcn/ui files", () => {
  it("finds the ui folder from components.json, including in a workspace app", async () => {
    const root = mkdtempSync(join(tmpdir(), "buoy-vendored-"));
    writeFileSync(join(root, "components.json"), JSON.stringify({ $schema: "https://ui.shadcn.com/schema.json", aliases: { components: "@/components" } }));
    mkdirSync(join(root, "apps/web"), { recursive: true });
    writeFileSync(join(root, "apps/web/components.json"), JSON.stringify({ aliases: { components: "@/components", ui: "@/ui" } }));
    const dirs = await shadcnUiDirs(root);
    expect(dirs).toContain("components/ui/");
    expect(dirs).toContain("src/components/ui/");
    expect(dirs).toContain("apps/web/ui/");
  });

  it("needs a components.json", async () => {
    const root = mkdtempSync(join(tmpdir(), "buoy-vendored-"));
    expect(await shadcnUiDirs(root)).toEqual([]);
  });

  it("only sets aside shadcn component files directly in the ui folder", () => {
    const dirs = ["components/ui/"];
    expect(isVendoredFile("components/ui/calendar.tsx", dirs)).toBe(true);
    expect(isVendoredFile("components/ui/pricing-card.tsx", dirs)).toBe(false);
    expect(isVendoredFile("components/forms/input.tsx", dirs)).toBe(false);
    expect(isVendoredFile("components/ui/nested/button.tsx", dirs)).toBe(false);
  });

  it("moves findings in vendored files to noted values", () => {
    const { drifts, noted } = setAsideVendored(
      [
        drift("components/ui/calendar.tsx:37", ["text-[0.8rem] (line 37)"]),
        drift("components/chat/chat-files-display.tsx:144", ["md:text-[10px] (line 144)"]),
      ],
      ["components/ui/"],
    );
    expect(drifts.map((d) => d.source.location)).toEqual(["components/chat/chat-files-display.tsx:144"]);
    expect(noted).toEqual([
      { file: "components/ui/calendar.tsx", line: 37, value: "text-[0.8rem]", kind: "vendored", reason: "shadcn/ui component (components.json)" },
    ]);
  });
});
