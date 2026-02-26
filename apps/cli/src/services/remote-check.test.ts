import { describe, expect, it } from "vitest";
import {
  classifyCheckInput,
  looksLikePublicUrl,
  normalizePublicUrl,
} from "./remote-check.js";

describe("remote-check URL detection", () => {
  it("accepts bare host/path URLs", () => {
    expect(looksLikePublicUrl("buoy.design/ds.astro")).toBe(true);
    expect(looksLikePublicUrl("buoy.design/link")).toBe(true);
    expect(looksLikePublicUrl("www.example.com/path/file.tsx")).toBe(true);
  });

  it("accepts explicit http/https URLs", () => {
    expect(looksLikePublicUrl("https://buoy.design/ds.astro")).toBe(true);
    expect(looksLikePublicUrl("http://example.com/test")).toBe(true);
  });

  it("does not misclassify local paths as URLs", () => {
    expect(looksLikePublicUrl("src/pages/ds.astro")).toBe(false);
    expect(looksLikePublicUrl("./src/pages/ds.astro")).toBe(false);
    expect(looksLikePublicUrl("../fixtures/ds.json")).toBe(false);
    expect(looksLikePublicUrl("/tmp/file.astro")).toBe(false);
    expect(looksLikePublicUrl("C:\\repo\\src\\page.tsx")).toBe(false);
  });

  it("normalizes bare URLs to https", () => {
    expect(normalizePublicUrl("buoy.design/ds.astro")).toBe("https://buoy.design/ds.astro");
    expect(normalizePublicUrl("buoy.design/link")).toBe("https://buoy.design/link");
  });

  it("preserves explicit scheme", () => {
    expect(normalizePublicUrl("http://buoy.design/ds.astro")).toBe("http://buoy.design/ds.astro");
  });
});

describe("classifyCheckInput", () => {
  it("defaults to project mode with no target", () => {
    expect(classifyCheckInput(undefined, {})).toBe("project");
  });

  it("classifies positional local file path correctly", () => {
    expect(classifyCheckInput("src/pages/ds.astro", {})).toBe("local-file");
  });

  it("classifies positional bare URL correctly", () => {
    expect(classifyCheckInput("buoy.design/ds.astro", {})).toBe("remote-url");
  });

  it("prefers --url and --fixture flags over positional target", () => {
    expect(classifyCheckInput("src/pages/ds.astro", { url: "buoy.design/ds.astro" })).toBe("remote-url");
    expect(classifyCheckInput("src/pages/ds.astro", { fixture: "buoy.design/fixture.json" })).toBe("remote-fixture");
  });
});
