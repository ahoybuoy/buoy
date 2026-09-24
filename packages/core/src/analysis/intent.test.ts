import { describe, expect, it } from "vitest";
import { commentIntent, commentText, commitIntent, lineIntent, tailwindValueIntent, valueIntent } from "./intent.js";

const at = (src: string) => {
  const lines = src.split("\n");
  return commentIntent(lines, lines.length - 1);
};

describe("commentText", () => {
  it("reads line, block, JSX and HTML comments", () => {
    expect(commentText("margin-top: 0.125rem; // Slight adjustment to align with text")).toBe("Slight adjustment to align with text");
    expect(commentText("border-radius: 0.75rem; /* 12px */")).toBe("12px");
    expect(commentText("{/* Inline font-size because the wrapper breaks the rule */}")).toBe("Inline font-size because the wrapper breaks the rule");
    expect(commentText("<!-- keep in sync with email -->")).toBe("keep in sync with email");
    expect(commentText(" * used directly yet. Switch to var(--radius--sm) once removed.")).toContain("Switch to var(--radius--sm)");
  });

  it("does not mistake URLs, selectors or tool directives for comments", () => {
    expect(commentText('background: url("https://example.com/a.png");')).toBeNull();
    expect(commentText("*::-webkit-scrollbar-track {")).toBeNull();
    expect(commentText("* {")).toBeNull();
    expect(commentText("{/* eslint-disable-next-line react/forbid-dom-props */}")).toBeNull();
  });
});

describe("commentIntent", () => {
  it("recognises explanations from real repos (PostHog, n8n)", () => {
    expect(at("margin-top: 0.125rem; // Slight adjustment to align with text")?.kind).toBe("explained");
    expect(at("{/* Inline font-size because the wrapper breaks the `button > svg` size rule */}\n<span style={{ fontSize: 14 }}>")?.kind).toBe("explained");
    expect(at("// min-height doesn't work in IE10 and IE11\n// set empty text line height as workaround.\nline-height: 60px;")?.kind).toBe("explained");
  });

  it("recognises known debt", () => {
    const src = "/*\n * Switch to var(--radius--sm) once that legacy override is removed.\n */\nborder-radius: 0.75rem;";
    expect(at(src)).toEqual({ kind: "known-debt", reason: expect.stringContaining("Switch to var(--radius--sm)") });
    expect(at("color: #999; // TODO: use --muted once the palette lands")?.kind).toBe("known-debt");
  });

  it("treats buoy-ignore as an allowlist entry", () => {
    expect(at("// buoy-ignore: brand partner colour\ncolor: #ff6600;")?.kind).toBe("allowlisted");
  });

  it("does not read layout descriptions as reasons", () => {
    expect(at('// Base header — blend: both labels; split: "Before" left-aligned\n<span className="text-[11px]">')).toBeNull();
  });

  it("ignores comments that give no reason", () => {
    expect(at("/* Header */\n.header { color: #333; }")).toBeNull();
    expect(at("padding: 12px; // 12px")).toBeNull();
  });

  it("does not borrow a trailing comment from the previous declaration", () => {
    expect(at(".a {\n  margin-top: 0.3rem; // align with the avatar\n  color: #333;")).toBeNull();
  });

  it("applies a comment above a rule to its declarations", () => {
    expect(at("/* Match the OS scrollbar, per design */\n::-webkit-scrollbar-thumb {\n  background: #ccc;")?.kind).toBe("explained");
  });

  it("does not borrow a comment from an earlier block", () => {
    expect(at("// workaround for Safari\n.a { margin: 4px; }\n\n.b { color: #333; }")).toBeNull();
  });
});

describe("valueIntent", () => {
  it("treats 2-3px spacing and 1px calc offsets as optical nudges", () => {
    expect(valueIntent("margin-top", "3px")?.kind).toBe("optical-nudge");
    expect(valueIntent("marginTop", "-2px")?.kind).toBe("optical-nudge");
    expect(valueIntent("margin-left", "calc(-0.25rem - 1px)")?.kind).toBe("optical-nudge");
    expect(valueIntent("padding", "0.125rem !important")?.kind).toBe("optical-nudge");
  });

  it("keeps design-sized values and non-spacing properties", () => {
    expect(valueIntent("margin", "8px")).toBeNull();
    expect(valueIntent("border-radius", "3px")).toBeNull();
    expect(valueIntent("font-size", "3px")).toBeNull();
    expect(valueIntent("gap", "2px")).toBeNull();
  });
});

describe("tailwindValueIntent", () => {
  it("recognises Tailwind nudges with variants and negatives (Formbricks)", () => {
    expect(tailwindValueIntent("mt-[3px]")?.kind).toBe("optical-nudge");
    expect(tailwindValueIntent("hover:px-[2px]")?.kind).toBe("optical-nudge");
    expect(tailwindValueIntent("-translate-y-[2px]")?.kind).toBe("optical-nudge");
    expect(tailwindValueIntent("py-[100px]")).toBeNull();
    expect(tailwindValueIntent("rounded-[3px]")).toBeNull();
    expect(tailwindValueIntent("text-[3px]")).toBeNull();
  });
});

describe("commitIntent", () => {
  it("accepts clear statements of intent", () => {
    expect(commitIntent("fix(toolbar): align icon with label (#1234)")?.kind).toBe("history");
    expect(commitIntent("Safari workaround for sticky header")?.kind).toBe("history");
    expect(commitIntent("match Figma spacing on settings page")?.kind).toBe("history");
    // umami: the tooltip styles were kept on purpose during a theme migration.
    expect(commitIntent("preserve tooltip css")?.kind).toBe("history");
  });

  it("ignores ordinary commits", () => {
    expect(commitIntent("feat: add billing page")).toBeNull();
    expect(commitIntent("Merge pull request #12 from x/align-fix")).toBeNull();
    expect(commitIntent("refactor settings")).toBeNull();
    expect(commitIntent("fix sharetable UI/CSS issues")).toBeNull();
    expect(commitIntent("Add Property filters for booleans, dates, arrays")).toBeNull();
    expect(commitIntent("Migrate board layout UI to react-zen and preserve empty component titles")).toBeNull();
    expect(commitIntent("Migrate UI styles to Zen theme tokens and preserve brand colors")?.kind).toBe("history");
  });
});

describe("lineIntent", () => {
  it("prefers the comment's reason over the value's shape", () => {
    const lines = ["margin-top: 3px; // align with the avatar baseline"];
    expect(lineIntent(lines, 0, { property: "margin-top", value: "3px" })?.kind).toBe("explained");
    expect(lineIntent(["margin-top: 3px;"], 0, { property: "margin-top", value: "3px" })?.kind).toBe("optical-nudge");
    expect(lineIntent(["color: #333;"], 0, { property: "color", value: "#333" })).toBeNull();
  });
});
