import { describe, expect, it } from "vitest";
import { classValue, exactTailwindClass, themeColorMap, themeSizeMap } from "./exact-class.js";

describe("exactTailwindClass", () => {
  it.each([
    ["pt-[4px]", "pt-1"],
    ["p-[1px]", "p-px"],
    ["gap-[0.5rem]", "gap-2"],
    ["-mt-[8px]", "-mt-2"],
    ["md:hover:px-[24px]", "md:hover:px-6"],
    ["!mb-[16px]", "!mb-4"],
    ["text-[14px]", "text-sm"],
    ["text-[1.125rem]", "text-lg"],
    ["rounded-[6px]", "rounded-md"],
    ["rounded-t-[12px]", "rounded-t-xl"],
    ["rounded-[9999px]", "rounded-full"],
    ["leading-[1.5]", "leading-normal"],
    ["leading-[24px]", "leading-6"],
    ["tracking-[0.025em]", "tracking-wide"],
    ["font-[700]", "font-bold"],
    ["text-[#FFF]", "text-white"],
    ["border-[#e5e7eb]", "border-gray-200"],
    ["bg-[#3b82f6]/50", "bg-blue-500/50"],
  ])("%s -> %s", (from, to) => {
    expect(exactTailwindClass(from)).toBe(to);
  });

  it.each([
    "text-[13px]", // off the default scale
    "rounded-[4px]", // rounded (v3) vs rounded-sm (v4)
    "rounded-[2px]",
    "pt-[13px]",
    "p-[18px]", // 4.5 is valid in v4 only
    "leading-[1.15]",
    "w-[50%]",
    "text-[#123456]",
    "fill-[#zzz]",
    "p-[4px]/50",
  ])("%s has no exact class", (cls) => {
    expect(exactTailwindClass(cls)).toBeNull();
  });

  it("prefers the project's theme colour", () => {
    const themeColors = themeColorMap([
      { name: "tw-brown-500", category: "color", value: { type: "color", hex: "#BFA094" } },
      { name: "brand.DEFAULT", category: "color", value: { type: "color", hex: "#6b7280" } },
      { name: "tw-brand-dark", category: "color", value: { type: "color", hex: "#111111" } },
    ]);
    expect(exactTailwindClass("text-[#bfa094]", { themeColors })).toBe("text-brown-500");
    expect(exactTailwindClass("bg-[#6b7280]", { themeColors })).toBe("bg-brand");
    expect(themeColors.has("#111111")).toBe(false);
  });

  it("uses the project's own sizes (dub's 2xs)", () => {
    const themeSizes = themeSizeMap([
      { name: "tw-text-2xs", value: { type: "raw", value: "0.625rem [lineHeight: 0.875rem]" } },
      { name: "tw-text-lineHeight", value: { type: "raw", value: "0.875rem" } },
      { name: "tw-spacing-18", value: { type: "spacing", value: 4.5, unit: "rem" } },
      { name: "tw-radius-DEFAULT", value: { type: "raw", value: "10px" } },
    ]);
    expect(exactTailwindClass("text-[0.625rem]", { themeSizes })).toBe("text-2xs");
    expect(exactTailwindClass("text-[14px]", { themeSizes })).toBe("text-sm");
    expect(exactTailwindClass("p-[72px]", { themeSizes })).toBe("p-18");
    expect(exactTailwindClass("rounded-[10px]", { themeSizes })).toBe("rounded");
    expect(themeSizes.text.has(14)).toBe(false);
  });
});

describe("classValue", () => {
  it.each([
    ["p-4", { category: "spacing", property: "padding", value: "16px" }],
    ["md:gap-x-2.5", { category: "spacing", property: "column-gap", value: "10px" }],
    ["mt-px", { category: "spacing", property: "margin-top", value: "1px" }],
    ["text-sm", { category: "font-size", property: "font-size", value: "14px" }],
    ["text-[13px]", { category: "font-size", property: "font-size", value: "13px" }],
    ["bg-gray-500/50", { category: "color", property: "background-color", value: "#6b7280" }],
    ["text-[#FFF]", { category: "color", property: "color", value: "#ffffff" }],
    ["rounded-lg", { category: "radius", property: "border-radius", value: "8px" }],
    ["rounded-full", { category: "radius", property: "border-radius", value: "9999px" }],
  ])("%s", (cls, expected) => {
    expect(classValue(cls)).toEqual(expected);
  });

  it("reads v4's renamed radii", () => {
    expect(classValue("rounded-sm", 3)?.value).toBe("2px");
    expect(classValue("rounded-sm", 4)?.value).toBe("4px");
  });

  it("ignores classes that set no design value", () => {
    for (const cls of ["flex", "text-center", "w-full", "p-4.5", "text-primary", "bg-[url(x.png)]", "rounded-[50%]"]) {
      expect(classValue(cls)).toBeNull();
    }
  });
});

describe("replaced default scales", () => {
  it("never suggests a class from a scale the project replaced", () => {
    const replaced = new Set(["colors", "spacing"]);
    expect(exactTailwindClass("bg-[#6b7280]", { replaced })).toBeNull();
    expect(exactTailwindClass("p-[16px]", { replaced })).toBeNull();
    expect(exactTailwindClass("text-[14px]", { replaced })).toBe("text-sm");
    const themeColors = new Map([["#6b7280", "muted"]]);
    expect(exactTailwindClass("bg-[#6b7280]", { replaced, themeColors })).toBe("bg-muted");
  });
});
