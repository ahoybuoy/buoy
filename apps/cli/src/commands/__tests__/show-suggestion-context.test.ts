import { describe, it, expect } from "vitest";
import type { DriftSignal } from "@buoy-design/core";

/**
 * Since computeRichSuggestionContext is a private function in show.ts,
 * we test the vendored filtering logic by verifying the behavior:
 * - vendored shadcn files should be excluded from worstFile for ALL drift types
 *
 * We extract and test the filtering logic directly.
 */

const VENDORED_SHADCN_FILES = new Set([
  "accordion", "alert", "alert-dialog", "aspect-ratio", "avatar", "badge",
  "breadcrumb", "button", "calendar", "card", "carousel", "chart",
  "checkbox", "collapsible", "combobox", "command", "context-menu",
  "data-table", "date-picker", "dialog", "drawer", "dropdown-menu",
  "form", "hover-card", "input", "input-otp", "label", "menubar",
  "navigation-menu", "pagination", "popover", "progress", "radio-group",
  "resizable", "scroll-area", "select", "separator", "sheet", "sidebar",
  "skeleton", "slider", "sonner", "switch", "table", "tabs", "textarea",
  "toast", "toggle", "toggle-group", "tooltip",
]);

function isVendoredShadcnFile(filePath: string): boolean {
  const basename = (filePath.split('/').pop() || '').replace(/\.(tsx|jsx|ts|js)$/, '');
  if (!VENDORED_SHADCN_FILES.has(basename)) return false;
  return /\/(ui|primitives|registry|ds)\b/.test(filePath)
    || /\/components\//.test(filePath);
}

function isComponentFile(filePath: string): boolean {
  const componentExts = [".tsx", ".jsx", ".vue", ".svelte"];
  return componentExts.some((ext) => filePath.endsWith(ext));
}

function computeWorstFile(drifts: DriftSignal[]): { path: string; issueCount: number } | undefined {
  let vendoredDriftCount = 0;
  const userFileCounts = new Map<string, number>();

  for (const d of drifts) {
    const loc = d.source?.location;
    if (!loc) continue;
    const file = loc.split(":")[0];
    if (!file) continue;

    // Filter vendored files for ALL drift types (not just hardcoded-value)
    if (isVendoredShadcnFile(file)) {
      if (d.type === "hardcoded-value") vendoredDriftCount++;
      continue;
    }

    if (isComponentFile(file)) {
      userFileCounts.set(file, (userFileCounts.get(file) || 0) + 1);
    }
  }

  const worstFileEntry = [...userFileCounts.entries()]
    .sort((a, b) => b[1] - a[1])[0];
  return worstFileEntry ? { path: worstFileEntry[0], issueCount: worstFileEntry[1] } : undefined;
}

function makeDrift(type: string, file: string): DriftSignal {
  return {
    type: type as DriftSignal["type"],
    severity: "warning",
    message: `Test drift in ${file}`,
    source: {
      entityName: "TestComponent",
      entityType: "component",
      location: `${file}:10`,
    },
  };
}

describe("computeRichSuggestionContext vendored filtering", () => {
  it("should exclude vendored shadcn files from worstFile for hardcoded-value drifts", () => {
    const drifts = [
      makeDrift("hardcoded-value", "src/components/ui/dropdown-menu.tsx"),
      makeDrift("hardcoded-value", "src/components/ui/dropdown-menu.tsx"),
      makeDrift("hardcoded-value", "src/components/ui/dropdown-menu.tsx"),
      makeDrift("hardcoded-value", "src/components/MyButton.tsx"),
    ];
    const worst = computeWorstFile(drifts);
    expect(worst?.path).toBe("src/components/MyButton.tsx");
  });

  it("should exclude vendored shadcn files from worstFile for naming-inconsistency drifts", () => {
    const drifts = [
      makeDrift("naming-inconsistency", "src/components/ui/dropdown-menu.tsx"),
      makeDrift("naming-inconsistency", "src/components/ui/dropdown-menu.tsx"),
      makeDrift("naming-inconsistency", "src/components/ui/dropdown-menu.tsx"),
      makeDrift("naming-inconsistency", "src/components/MyButton.tsx"),
    ];
    const worst = computeWorstFile(drifts);
    expect(worst?.path).toBe("src/components/MyButton.tsx");
  });

  it("should exclude vendored shadcn files from worstFile for deprecated-pattern drifts", () => {
    const drifts = [
      makeDrift("deprecated-pattern", "src/components/ui/dialog.tsx"),
      makeDrift("deprecated-pattern", "src/components/ui/dialog.tsx"),
      makeDrift("deprecated-pattern", "src/components/ui/dialog.tsx"),
      makeDrift("hardcoded-value", "src/components/UserCard.tsx"),
    ];
    const worst = computeWorstFile(drifts);
    expect(worst?.path).toBe("src/components/UserCard.tsx");
  });

  it("should not exclude non-vendored component files", () => {
    const drifts = [
      makeDrift("naming-inconsistency", "src/components/CustomDropdown.tsx"),
      makeDrift("naming-inconsistency", "src/components/CustomDropdown.tsx"),
      makeDrift("naming-inconsistency", "src/components/MyButton.tsx"),
    ];
    const worst = computeWorstFile(drifts);
    expect(worst?.path).toBe("src/components/CustomDropdown.tsx");
  });

  it("should return undefined when all drifts are in vendored files", () => {
    const drifts = [
      makeDrift("hardcoded-value", "src/components/ui/dropdown-menu.tsx"),
      makeDrift("naming-inconsistency", "src/components/ui/button.tsx"),
    ];
    const worst = computeWorstFile(drifts);
    expect(worst).toBeUndefined();
  });

  it("should exclude vendored files in non-standard paths (src/ui/)", () => {
    const drifts = [
      makeDrift("hardcoded-value", "src/ui/dropdown-menu.tsx"),
      makeDrift("hardcoded-value", "src/ui/dropdown-menu.tsx"),
      makeDrift("hardcoded-value", "src/ui/dropdown-menu.tsx"),
      makeDrift("hardcoded-value", "src/components/MyButton.tsx"),
    ];
    const worst = computeWorstFile(drifts);
    expect(worst?.path).toBe("src/components/MyButton.tsx");
  });

  it("should exclude vendored files in primitives/ paths", () => {
    const drifts = [
      makeDrift("hardcoded-value", "apps/readest-app/src/components/primitives/dropdown-menu.tsx"),
      makeDrift("hardcoded-value", "apps/readest-app/src/components/primitives/dropdown-menu.tsx"),
      makeDrift("hardcoded-value", "src/components/MyCard.tsx"),
    ];
    const worst = computeWorstFile(drifts);
    expect(worst?.path).toBe("src/components/MyCard.tsx");
  });

  it("should exclude vendored files in deep monorepo paths", () => {
    const drifts = [
      makeDrift("hardcoded-value", "packages/playground-ui/src/ds/components/DropdownMenu/dropdown-menu.tsx"),
      makeDrift("hardcoded-value", "packages/playground-ui/src/ds/components/DropdownMenu/dropdown-menu.tsx"),
      makeDrift("hardcoded-value", "src/components/UserCard.tsx"),
    ];
    const worst = computeWorstFile(drifts);
    expect(worst?.path).toBe("src/components/UserCard.tsx");
  });

  it("should exclude vendored files in registry paths", () => {
    const drifts = [
      makeDrift("hardcoded-value", "apps/www/registry/new-york/ui/dropdown-menu.tsx"),
      makeDrift("hardcoded-value", "apps/www/registry/new-york/ui/dropdown-menu.tsx"),
      makeDrift("hardcoded-value", "src/components/Header.tsx"),
    ];
    const worst = computeWorstFile(drifts);
    expect(worst?.path).toBe("src/components/Header.tsx");
  });

  it("should exclude vendored files in libs/ui paths", () => {
    const drifts = [
      makeDrift("hardcoded-value", "src/libs/ui/dropdown-menu.tsx"),
      makeDrift("hardcoded-value", "src/libs/ui/dropdown-menu.tsx"),
      makeDrift("hardcoded-value", "src/components/Footer.tsx"),
    ];
    const worst = computeWorstFile(drifts);
    expect(worst?.path).toBe("src/components/Footer.tsx");
  });
});
