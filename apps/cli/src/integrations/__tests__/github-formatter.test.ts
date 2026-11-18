import { describe, expect, it } from "vitest";
import type { DriftSignal } from "@buoy-design/core";
import {
  formatDriftSignalForInline,
  formatInlineComment,
} from "../github-formatter.js";

function drift(overrides: Partial<DriftSignal> = {}): DriftSignal {
  return {
    id: "drift:hardcoded-value:btn:color",
    type: "hardcoded-value",
    severity: "warning",
    source: {
      entityType: "component",
      entityId: "comp-Button",
      entityName: "Button",
      location: "src/Button.tsx:12",
    },
    message: 'Component "Button" has 1 hardcoded color: #3b82f6',
    details: {
      tokenSuggestions: ["#3b82f6 → --color-primary"],
      suggestions: [
        "Harmonize this color to the token:\n  #3b82f6 → --color-primary",
      ],
    },
    detectedAt: new Date(),
    ...overrides,
  };
}

describe("formatInlineComment vocabulary", () => {
  it("annotates the exact color substitution in design language", () => {
    const body = formatInlineComment({
      type: "hardcoded-color",
      severity: "warning",
      message: "Off-system color in Button",
      tokenSuggestions: ["#3b82f6 → var(--color-primary)"],
    });
    expect(body).toContain(
      "**Fix:** Harmonize this color to the token: `#3b82f6` → `var(--color-primary)`",
    );
  });

  it("uses scale language for spacing values", () => {
    const body = formatInlineComment({
      type: "hardcoded-spacing",
      severity: "warning",
      message: "Off-system spacing in Card",
      tokenSuggestions: ["17px → spacing.4"],
    });
    expect(body).toContain(
      "**Fix:** Harmonize this spacing to the scale: `17px` → `spacing.4`",
    );
  });
});

describe("formatDriftSignalForInline", () => {
  it("phrases tokenSuggestions from a scan signal as a vocabulary fix", () => {
    const body = formatDriftSignalForInline(drift(), "sig-1");
    expect(body).toContain(
      "**Fix:** Harmonize this color to the token: `#3b82f6` → `--color-primary`",
    );
  });
});
