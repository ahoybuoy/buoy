import { describe, it, expect } from "vitest";
import { SemanticDiffEngine, type Component } from "@buoy-design/core";
import { dropStorylessComponents } from "./source-classifier.js";

const component = (name: string, type: "react" | "figma" | "storybook"): Component => ({
  id: `${type}:${name}`,
  name,
  source:
    type === "react"
      ? { type: "react", path: `src/${name}.tsx`, exportName: name }
      : type === "figma"
        ? { type: "figma", fileKey: "abc", nodeId: "1:1" }
        : { type: "storybook", storyId: `${name.toLowerCase()}--default`, kind: name },
  props: [],
  variants: [],
  tokens: [],
  dependencies: [],
  metadata: {},
  scannedAt: new Date(),
});

describe("dropStorylessComponents", () => {
  const code = [component("Button", "react"), component("Card", "react"), component("Panel", "react")];

  it("drops code components without a story when there is no Figma source", () => {
    const stories = [component("Button", "storybook"), component("Ghost", "storybook")];
    const diff = new SemanticDiffEngine().compareComponents(code, stories);
    const { drifts, withoutStory } = dropStorylessComponents(diff.drifts, diff.orphanedSource, stories);

    expect(withoutStory).toBe(2);
    expect(drifts.some((d) => d.message.includes('"Card"') || d.message.includes('"Panel"'))).toBe(false);
    // A story with no component is still reported.
    expect(drifts.some((d) => d.message.includes('"Ghost"'))).toBe(true);
  });

  it("keeps them when Figma is the design source", () => {
    const design = [component("Button", "figma"), component("Button", "storybook")];
    const diff = new SemanticDiffEngine().compareComponents(code, design);
    const { drifts, withoutStory } = dropStorylessComponents(diff.drifts, diff.orphanedSource, design);

    expect(withoutStory).toBe(0);
    expect(drifts).toEqual(diff.drifts);
  });

  it("keeps them when Figma is configured but its scan found nothing", () => {
    const stories = [component("Button", "storybook")];
    const diff = new SemanticDiffEngine().compareComponents(code, stories);
    const { drifts, withoutStory } = dropStorylessComponents(diff.drifts, diff.orphanedSource, stories, true);

    expect(withoutStory).toBe(0);
    expect(drifts).toEqual(diff.drifts);
  });
});
