import { describe, expect, it } from "vitest";
import {
  formatVocabularyAnnotation,
  formatVocabularyFix,
  formatVocabularyFixFromAnnotation,
  formatVocabularyFixIntro,
  formatVocabularyFixMarkdown,
  inferVocabularyKind,
  parseVocabularyAnnotation,
  vocabularyKind,
} from "./vocabulary.js";

describe("vocabularyKind", () => {
  it("normalizes signal types, fix types, and categories", () => {
    expect(vocabularyKind("spacing-value")).toBe("spacing");
    expect(vocabularyKind("hardcoded-spacing")).toBe("spacing");
    expect(vocabularyKind("font-size")).toBe("type");
    expect(vocabularyKind("typography")).toBe("type");
    expect(vocabularyKind("radius-value")).toBe("radius");
    expect(vocabularyKind("color")).toBe("color");
  });
});

describe("formatVocabularyFix", () => {
  it("annotates an exact spacing substitution in design language", () => {
    expect(
      formatVocabularyFix({
        kind: "spacing",
        current: "17px",
        token: "spacing.4",
      }),
    ).toBe("Harmonize this spacing to the scale: 17px → spacing.4");
  });

  it("annotates an exact color substitution, including a CSS variable ref", () => {
    expect(
      formatVocabularyFix({
        kind: "color",
        current: "#3b82f6",
        token: "var(--color-primary)",
      }),
    ).toBe("Harmonize this color to the token: #3b82f6 → var(--color-primary)");
  });

  it("says the value is off-token when no exact match exists", () => {
    expect(formatVocabularyFix({ kind: "spacing", current: "13px" })).toBe(
      "This spacing is off-token: 13px (no exact match in the system)",
    );
  });

  it("uses type-scale language for font sizes", () => {
    expect(
      formatVocabularyFix({
        kind: "font-size",
        current: "19px",
        token: "font-size.md",
      }),
    ).toBe("Harmonize this type size to the scale: 19px → font-size.md");
  });
});

describe("formatVocabularyFixMarkdown", () => {
  it("wraps both values in backticks for PR comments", () => {
    expect(
      formatVocabularyFixMarkdown({
        kind: "spacing",
        current: "17px",
        token: "spacing.4",
      }),
    ).toBe("Harmonize this spacing to the scale: `17px` → `spacing.4`");
  });
});

describe("formatVocabularyFixFromAnnotation", () => {
  it("rephrases a stored value → token annotation", () => {
    expect(
      formatVocabularyFixFromAnnotation("#ff0000 → --color-danger", "color"),
    ).toBe("Harmonize this color to the token: #ff0000 → --color-danger");
  });

  it("ignores trailing confidence text in the annotation", () => {
    expect(
      formatVocabularyFixFromAnnotation(
        "#3b82f6 → --color-primary (92% match)",
        "color",
      ),
    ).toBe("Harmonize this color to the token: #3b82f6 → --color-primary");
  });
});

describe("formatVocabularyAnnotation and intro", () => {
  it("formats the bare substitution", () => {
    expect(formatVocabularyAnnotation("17px", "spacing.4")).toBe(
      "17px → spacing.4",
    );
  });

  it("chooses singular or plural intro copy", () => {
    expect(formatVocabularyFixIntro("color", 1)).toBe(
      "Harmonize this color to the token",
    );
    expect(formatVocabularyFixIntro("color", 2)).toBe(
      "Harmonize these colors to the tokens",
    );
    expect(formatVocabularyFixIntro("spacing", 3)).toBe(
      "Harmonize these spacing values to the scale",
    );
  });
});

describe("inferVocabularyKind", () => {
  it("keeps specific types", () => {
    expect(inferVocabularyKind({ type: "hardcoded-spacing" })).toBe("spacing");
  });

  it("reads color vs spacing from a generic hardcoded-value message", () => {
    expect(
      inferVocabularyKind({
        type: "hardcoded-value",
        message: 'Component "Card" has 1 hardcoded color: #fff',
      }),
    ).toBe("color");
    expect(
      inferVocabularyKind({
        type: "hardcoded-value",
        message: 'Component "Card" has 1 hardcoded size value: 17px',
      }),
    ).toBe("spacing");
  });

  it("does not take category words from the component name", () => {
    expect(
      inferVocabularyKind({
        type: "hardcoded-value",
        message: 'Component "RadiusCard" has 1 hardcoded color: #fff',
        current: "#fff",
      }),
    ).toBe("color");
    expect(
      inferVocabularyKind({
        type: "hardcoded-value",
        message: 'Component "PaddingCard" has 1 hardcoded color: #fff',
        current: "#fff",
      }),
    ).toBe("color");
    expect(
      inferVocabularyKind({
        type: "hardcoded-value",
        message: 'Component "SpacingCard" has 1 hardcoded color: #fff',
        current: "#fff",
      }),
    ).toBe("color");
    expect(
      inferVocabularyKind({
        type: "hardcoded-value",
        message: 'Component "colorPicker" has 1 hardcoded size value: 17px',
        current: "17px",
      }),
    ).toBe("spacing");
    expect(
      inferVocabularyKind({
        type: "hardcoded-radius",
        message: 'Component "Card" has a hardcoded radius: 8px',
      }),
    ).toBe("radius");
    expect(
      inferVocabularyKind({
        type: "hardcoded-value",
        message: "Off-system spacing in layout: 17px",
        current: "17px",
      }),
    ).toBe("spacing");
  });
});
