// packages/scanners/src/tailwind/arbitrary-detector.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ArbitraryValueDetector } from "./arbitrary-detector.js";
import * as fs from "fs";
import * as glob from "glob";

// Mock fs and glob
vi.mock("fs", () => ({
  readFileSync: vi.fn(),
}));

vi.mock("glob", () => ({
  glob: vi.fn(),
}));

describe("ArbitraryValueDetector", () => {
  const mockProjectRoot = "/test/project";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("design-value rules (2026-09 audit)", () => {
    it("does not start a match mid-word (border-[x] is not order-[x], shadow-[x] is not w-[x])", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Card.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`<div className="border-[var(--brand)] shadow-[0_4px_12px_#0001]" />`);
      const values = await new ArbitraryValueDetector({ projectRoot: mockProjectRoot }).detect();
      expect(values.map((v) => v.fullClass)).toEqual(["shadow-[0_4px_12px_#0001]"]);
    });

    it("skips artwork, email templates, OG images and tests", async () => {
      for (const file of ["src/icons/BunLogoIcon.tsx", "packages/email/src/templates/welcome.tsx", "app/opengraph-image.tsx", "src/Button.stories.tsx"]) {
        vi.mocked(glob.glob).mockResolvedValue([`/test/project/${file}`]);
        vi.mocked(fs.readFileSync).mockReturnValue(`<div className="bg-[#fbf0df] p-[7px]" />`);
        const values = await new ArbitraryValueDetector({ projectRoot: mockProjectRoot }).detect();
        expect(values, file).toHaveLength(0);
      }
    });
  });

  describe("detect", () => {
    it("detects hardcoded color values", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Button.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="bg-[#ff6b6b] text-[#333]">
          Button
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();

      const colorValues = values.filter((v) => v.type === "color");
      expect(colorValues).toHaveLength(2);
      expect(colorValues.map((v) => v.value)).toContain("#ff6b6b");
      expect(colorValues.map((v) => v.value)).toContain("#333");
    });

    it("detects rgb/rgba color values", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Card.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="bg-[rgb(255,107,107)] border-[rgba(0,0,0,0.5)]">
          Card
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();

      const colorValues = values.filter((v) => v.type === "color");
      expect(colorValues).toHaveLength(2);
    });

    it("ignores css variable references", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Theme.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="bg-[var(--primary-color)] text-[var(--text-color)]">
          Theme
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();

      const colorValues = values.filter((v) => v.type === "color");
      expect(colorValues).toHaveLength(0);
    });

    it("detects spacing arbitrary values", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Layout.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="p-[17px] m-[2rem] gap-[10px]">
          Layout
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();

      const spacingValues = values.filter((v) => v.type === "spacing");
      expect(spacingValues).toHaveLength(3);
      expect(spacingValues.map((v) => v.value)).toContain("17px");
      expect(spacingValues.map((v) => v.value)).toContain("2rem");
      expect(spacingValues.map((v) => v.value)).toContain("10px");
    });

    it("ignores size arbitrary values (not a design value)", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Box.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="w-[100px] h-[50vh] min-w-[300px]">
          Box
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();


      // Layout, mechanics, keywords and token references are not drift.

      expect(values).toHaveLength(0);
    });

    it("detects font size arbitrary values as typography", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Text.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <span className="text-[14px] text-[1.5rem]">
          Text
        </span>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();

      const sizeValues = values.filter((v) => v.type === "typography");
      expect(sizeValues).toHaveLength(2);
    });

    it("provides correct line and column information", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Button.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(
        `line1\nline2\n<div className="bg-[#ff6b6b]">`,
      );

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();

      expect(values).toHaveLength(1);
      expect(values[0]!.line).toBe(3);
      expect(values[0]!.column).toBeGreaterThan(0);
    });

    it("returns empty array when no files match", async () => {
      vi.mocked(glob.glob).mockResolvedValue([]);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();

      expect(values).toEqual([]);
    });

    it("uses custom include patterns", async () => {
      vi.mocked(glob.glob).mockResolvedValue([]);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
        include: ["**/*.blade.php"],
      });

      await detector.detect();

      expect(glob.glob).toHaveBeenCalledWith(
        "**/*.blade.php",
        expect.objectContaining({ cwd: mockProjectRoot }),
      );
    });

    it("uses custom exclude patterns", async () => {
      vi.mocked(glob.glob).mockResolvedValue([]);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
        exclude: ["**/vendor/**"],
      });

      await detector.detect();

      expect(glob.glob).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          ignore: ["**/vendor/**"],
        }),
      );
    });

    it("deduplicates files from multiple patterns", async () => {
      vi.mocked(glob.glob)
        .mockResolvedValueOnce([
          "/test/project/src/Button.tsx",
          "/test/project/src/Card.tsx",
        ])
        .mockResolvedValueOnce([
          "/test/project/src/Button.tsx", // duplicate
          "/test/project/src/Modal.tsx",
        ]);

      vi.mocked(fs.readFileSync).mockReturnValue("");

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
        include: ["**/*.tsx", "**/*.jsx"],
      });

      await detector.detect();

      // readFileSync should be called 3 times (deduplicated)
      expect(fs.readFileSync).toHaveBeenCalledTimes(3);
    });
  });

  describe("detectAsDriftSignals", () => {
    it("converts arbitrary values to drift signals", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Button.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="bg-[#ff6b6b] p-[17px] w-[100px]">
          Button
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const signals = await detector.detectAsDriftSignals();

      // Should create drift signals grouped by type per file
      expect(signals.length).toBeGreaterThan(0);
      expect(signals.every((s) => s.type === "hardcoded-value")).toBe(true);
    });

    it("creates separate signals for each value type", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Mixed.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="bg-[#ff6b6b] p-[17px] w-[100px]">
          Mixed
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const signals = await detector.detectAsDriftSignals();

      // Colour and spacing; the one-off width w-[100px] is layout, not drift.
      expect(signals).toHaveLength(2);
    });

    it("assigns warning severity to color values", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Color.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(
        `<div className="bg-[#ff6b6b]">`,
      );

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const signals = await detector.detectAsDriftSignals();
      const colorSignal = signals.find((s) =>
        s.details.actual?.includes("color"),
      );

      expect(colorSignal?.severity).toBe("warning");
    });

    it("assigns info severity to spacing/size values", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Spacing.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`<div className="p-[17px]">`);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const signals = await detector.detectAsDriftSignals();
      const spacingSignal = signals.find((s) =>
        s.details.actual?.includes("spacing"),
      );

      expect(spacingSignal?.severity).toBe("info");
    });

    it("includes example values in signal details", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Multi.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="bg-[#111] bg-[#222] bg-[#333] bg-[#444] bg-[#555] bg-[#666]">
          Multi
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const signals = await detector.detectAsDriftSignals();
      const colorSignal = signals.find((s) =>
        s.details.actual?.includes("color"),
      );

      expect(colorSignal?.details.suggestions).toBeDefined();
      expect(colorSignal?.details.suggestions?.[2]).toContain("bg-[#");
    });

    it("sets correct source location", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Button.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(
        `line1\nline2\n<div className="bg-[#ff6b6b]">`,
      );

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const signals = await detector.detectAsDriftSignals();

      expect(signals[0]!.source.location).toBe("src/Button.tsx:3");
    });
  });

  describe("pseudo-class prefixed arbitrary values", () => {
    it("ignores before: and after: prefixed arbitrary values (not a design value)", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Next.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="before:h-[300px] before:w-[480px] after:h-[180px] after:w-[240px]">
          Next style
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();


      // Layout, mechanics, keywords and token references are not drift.

      expect(values).toHaveLength(0);
    });

    it("detects dark: prefixed arbitrary color values", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Dark.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="dark:bg-[#1a1a1a] dark:text-[#ffffff]">
          Dark mode
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();

      const colorValues = values.filter((v) => v.type === "color");
      expect(colorValues).toHaveLength(2);
      expect(colorValues.map((v) => v.fullClass)).toContain("dark:bg-[#1a1a1a]");
    });

    it("detects nested modifiers with arbitrary values", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Nested.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="before:lg:p-[36px] after:dark:via-[#0141ff]">
          Nested modifiers
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();

      expect(values.length).toBeGreaterThanOrEqual(2);
    });

    it("detects drop-shadow with arbitrary values", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Shadow.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="dark:drop-shadow-[0_0_0.3rem_#ffffff70]">
          Shadow
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();

      // Should detect at least the drop-shadow (may also detect as 'other' due to pattern overlap)
      expect(values.length).toBeGreaterThanOrEqual(1);
      expect(values.some((v) => v.fullClass.includes("drop-shadow-[0_0_0.3rem_#ffffff70]"))).toBe(true);
    });
  });

  describe("grid template arbitrary values", () => {
    it("ignores grid-cols with arbitrary values (not a design value)", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Grid.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="grid-cols-[repeat(auto-fill,minmax(350px,1fr))] grid-cols-[.75fr_1fr]">
          Grid layout
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();


      // Layout, mechanics, keywords and token references are not drift.

      expect(values).toHaveLength(0);
    });

    it("ignores grid-rows with arbitrary values (not a design value)", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Grid.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="grid-rows-[auto_1fr_auto]">
          Grid layout
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();


      // Layout, mechanics, keywords and token references are not drift.

      expect(values).toHaveLength(0);
    });
  });

  describe("HSL color values", () => {
    it("detects hsl() and hsla() color values", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/HSL.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <span className="text-[hsl(280,100%,70%)] bg-[hsla(0,0%,0%,0.5)]">
          HSL colors
        </span>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();

      const colorValues = values.filter((v) => v.type === "color");
      expect(colorValues).toHaveLength(2);
    });
  });

  describe("duration arbitrary values", () => {
    it("ignores duration with arbitrary values (not a design value)", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Transition.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="duration-[5s] delay-[200ms] transition-[opacity,transform]">
          Transition
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();


      // Layout, mechanics, keywords and token references are not drift.

      expect(values).toHaveLength(0);
    });
  });

  describe("arbitrary CSS properties", () => {
    it("ignores arbitrary CSS custom properties (not a design value)", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/CustomProps.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="[--anchor-gap:--spacing(1)] [--anchor-max-height:--spacing(60)]">
          Custom props
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();


      // Layout, mechanics, keywords and token references are not drift.

      expect(values).toHaveLength(0);
    });
  });

  describe("color with alpha modifier", () => {
    it("detects arbitrary colors with alpha modifiers", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Alpha.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="via-[#0141ff]/40 bg-[#ff6b6b]/50">
          Alpha colors
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();

      const colorValues = values.filter((v) => v.type === "color");
      expect(colorValues).toHaveLength(2);
      expect(colorValues.map((v) => v.fullClass)).toContain("via-[#0141ff]/40");
    });
  });

  describe("container query arbitrary values", () => {
    it("ignores container query prefixed arbitrary values (not a design value)", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Container.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="@min-[28rem]/field-group:grid @md/field-group:max-w-[200px]">
          Container queries
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();


      // Layout, mechanics, keywords and token references are not drift.

      expect(values).toHaveLength(0);
    });
  });

  describe("border-radius arbitrary values", () => {
    it("detects rounded with arbitrary values", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Rounded.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="rounded-[2px] rounded-t-[4px] rounded-bl-[8px]">
          Rounded corners
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();

      expect(values).toHaveLength(3);
      expect(values.every((v) => v.type === "border")).toBe(true);
      expect(values.map((v) => v.fullClass)).toContain("rounded-[2px]");
    });
  });

  describe("aspect ratio arbitrary values", () => {
    it("ignores aspect with arbitrary values (not a design value)", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Aspect.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="aspect-[2/0.5] aspect-[16/9]">
          Aspect ratios
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();


      // Layout, mechanics, keywords and token references are not drift.

      expect(values).toHaveLength(0);
    });
  });

  describe("transform arbitrary values", () => {
    it("ignores translate with arbitrary values (not a design value)", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Transform.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="translate-x-[10px] translate-y-[50%] -translate-x-[20px]">
          Translations
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();


      // Layout, mechanics, keywords and token references are not drift.

      expect(values).toHaveLength(0);
    });

    it("ignores rotate with arbitrary values (not a design value)", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Rotate.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="rotate-[45deg] -rotate-[90deg]">
          Rotations
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();


      // Layout, mechanics, keywords and token references are not drift.

      expect(values).toHaveLength(0);
    });

    it("ignores scale with arbitrary values (not a design value)", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Scale.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="scale-[1.1] scale-x-[0.9] scale-y-[1.2]">
          Scales
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();


      // Layout, mechanics, keywords and token references are not drift.

      expect(values).toHaveLength(0);
    });

    it("ignores skew with arbitrary values (not a design value)", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Skew.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="skew-x-[12deg] skew-y-[6deg]">
          Skews
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();


      // Layout, mechanics, keywords and token references are not drift.

      expect(values).toHaveLength(0);
    });
  });

  describe("filter arbitrary values", () => {
    it("ignores blur with arbitrary values (not a design value)", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Blur.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="blur-[2px] blur-[0.5rem]">
          Blurs
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();


      // Layout, mechanics, keywords and token references are not drift.

      expect(values).toHaveLength(0);
    });

    it("ignores brightness and contrast with arbitrary values (not a design value)", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/BrightnessContrast.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="brightness-[1.25] contrast-[1.1]">
          Brightness and contrast
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();


      // Layout, mechanics, keywords and token references are not drift.

      expect(values).toHaveLength(0);
    });

    it("ignores saturate and hue-rotate with arbitrary values (not a design value)", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/SaturateHue.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="saturate-[1.2] hue-rotate-[90deg]">
          Saturate and hue rotate
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();


      // Layout, mechanics, keywords and token references are not drift.

      expect(values).toHaveLength(0);
    });

    it("ignores invert and sepia with arbitrary values (not a design value)", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/InvertSepia.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="invert-[0.5] sepia-[0.75]">
          Invert and sepia
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();


      // Layout, mechanics, keywords and token references are not drift.

      expect(values).toHaveLength(0);
    });
  });

  describe("backdrop filter arbitrary values", () => {
    it("ignores backdrop-blur and backdrop-brightness with arbitrary values (not a design value)", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Backdrop.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="backdrop-blur-[4px] backdrop-brightness-[0.5] backdrop-contrast-[1.2]">
          Backdrop filters
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();


      // Layout, mechanics, keywords and token references are not drift.

      expect(values).toHaveLength(0);
    });
  });

  describe("z-index arbitrary values", () => {
    it("ignores z with arbitrary values (not a design value)", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/ZIndex.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="z-[100] z-[9999] -z-[1]">
          Z-indices
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();


      // Layout, mechanics, keywords and token references are not drift.

      expect(values).toHaveLength(0);
    });
  });

  describe("opacity arbitrary values", () => {
    it("ignores opacity with arbitrary values (not a design value)", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Opacity.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="opacity-[0.85] opacity-[.5] opacity-[33%]">
          Opacities
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();


      // Layout, mechanics, keywords and token references are not drift.

      expect(values).toHaveLength(0);
    });
  });

  describe("typography arbitrary values", () => {
    it("detects leading (line-height) with arbitrary values", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Leading.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="leading-[1.5] leading-[24px]">
          Line heights
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();

      expect(values).toHaveLength(2);
      expect(values.every((v) => v.type === "typography")).toBe(true);
    });

    it("detects tracking (letter-spacing) with arbitrary values", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Tracking.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="tracking-[0.02em] tracking-[-0.5px]">
          Letter spacing
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();

      expect(values).toHaveLength(2);
      expect(values.every((v) => v.type === "typography")).toBe(true);
    });

    it("detects font-weight with arbitrary values", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/FontWeight.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="font-[500] font-[450]">
          Font weights
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();

      expect(values).toHaveLength(2);
      expect(values.every((v) => v.type === "typography")).toBe(true);
    });
  });

  describe("flex/layout arbitrary values", () => {
    it("ignores basis with arbitrary values (not a design value)", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Basis.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="basis-[25%] basis-[200px]">
          Flex basis
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();


      // Layout, mechanics, keywords and token references are not drift.

      expect(values).toHaveLength(0);
    });

    it("ignores grow and shrink with arbitrary values (not a design value)", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/GrowShrink.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="grow-[2] shrink-[0]">
          Flex grow/shrink
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();


      // Layout, mechanics, keywords and token references are not drift.

      expect(values).toHaveLength(0);
    });

    it("ignores order with arbitrary values (not a design value)", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Order.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="order-[13] -order-[1]">
          Order
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();


      // Layout, mechanics, keywords and token references are not drift.

      expect(values).toHaveLength(0);
    });

    it("ignores columns with arbitrary values (not a design value)", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Columns.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="columns-[3] columns-[200px]">
          Columns
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();


      // Layout, mechanics, keywords and token references are not drift.

      expect(values).toHaveLength(0);
    });
  });

  describe("ring width arbitrary values", () => {
    it("detects ring width with arbitrary values (not ring color)", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Ring.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="ring-[3px] ring-[0.5rem]">
          Ring widths
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();

      // ring-[3px] is a width value, not a color
      const nonColorValues = values.filter((v) => v.type !== "color");
      expect(nonColorValues).toHaveLength(2);
      expect(nonColorValues.every((v) => v.type === "border")).toBe(true);
    });
  });

  describe("divide arbitrary values", () => {
    it("detects divide width with arbitrary values", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Divide.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="divide-x-[3px] divide-y-[2px]">
          Divide widths
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();

      expect(values).toHaveLength(2);
      expect(values.every((v) => v.type === "border")).toBe(true);
    });
  });

  describe("outline arbitrary values", () => {
    it("detects outline width and offset with arbitrary values", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Outline.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="outline-[3px] outline-offset-[4px]">
          Outline
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();

      expect(values).toHaveLength(2);
      expect(values.every((v) => v.type === "border")).toBe(true);
    });
  });

  describe("scroll arbitrary values", () => {
    it("detects scroll margin and padding with arbitrary values", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Scroll.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="scroll-m-[10px] scroll-p-[20px] scroll-mt-[5px]">
          Scroll spacing
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();

      expect(values).toHaveLength(3);
      expect(values.every((v) => v.type === "spacing")).toBe(true);
    });
  });

  describe("arbitrary variant selectors with values", () => {
    it("ignores size values inside arbitrary variant selectors (not a design value)", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/ArbitraryVariant.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="[&>svg]:h-[0.9rem] [&>svg]:w-[0.9rem] [&>div]:h-[137px] [&_pre]:max-h-[650px]">
          Arbitrary variant sizes
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();


      // Layout, mechanics, keywords and token references are not drift.

      expect(values).toHaveLength(0);
    });

    it("detects spacing values inside arbitrary variant selectors", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/ArbitraryVariantSpacing.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="[&>div]:p-[20px] [&_pre]:pb-[100px]">
          Arbitrary variant spacing
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();

      const spacingValues = values.filter((v) => v.type === "spacing");
      expect(spacingValues.length).toBeGreaterThanOrEqual(2);
      expect(spacingValues.map((v) => v.fullClass)).toContain("[&>div]:p-[20px]");
      expect(spacingValues.map((v) => v.fullClass)).toContain("[&_pre]:pb-[100px]");
    });

    it("detects border values inside arbitrary variant selectors", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/ArbitraryVariantBorder.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="[&>kbd]:rounded-[calc(var(--radius)-5px)] [&_button]:rounded-[4px]">
          Arbitrary variant borders
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();

      const borderValues = values.filter((v) => v.type === "border");
      // rounded-[calc(...)] is derived from a token; only the 4px literal is drift.
      expect(borderValues.map((v) => v.fullClass)).toEqual(["[&_button]:rounded-[4px]"]);
    });
  });

  describe("arbitrary box-shadow values", () => {
    it("detects shadow with complex arbitrary values (not colors)", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Shadow.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="shadow-[0_0_0_1px_hsl(var(--sidebar-border))] hover:shadow-[0_35px_60px_-15px_rgba(0,0,0,0.3)]">
          Box shadows
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();

      // The literal shadow is drift; the one whose colour is a token is not.
      expect(values.map((v) => v.fullClass)).toEqual(["hover:shadow-[0_35px_60px_-15px_rgba(0,0,0,0.3)]"]);
      expect(values.every((v) => v.type !== "color")).toBe(true);
    });
  });

  describe("line-clamp arbitrary values", () => {
    it("ignores line-clamp with arbitrary values (not a design value)", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/LineClamp.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <span className="line-clamp-[3] [&>span]:line-clamp-[2]">
          Line clamp
        </span>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();


      // Layout, mechanics, keywords and token references are not drift.

      expect(values).toHaveLength(0);
    });
  });

  describe("text-[size] distinct from text-[color]", () => {
    it("detects text-[1.05rem] as typography, not color", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/TextSize.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <p className="text-[1.05rem] text-[15px] text-[0.875em]">
          Text sizes
        </p>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();

      const sizeValues = values.filter((v) => v.type === "typography");
      expect(sizeValues.length).toBeGreaterThanOrEqual(3);
      expect(sizeValues.map((v) => v.value)).toContain("1.05rem");
    });
  });

  describe("border width arbitrary values", () => {
    it("detects border-[1.5px] as border width", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Border.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="border-[1.5px] border-[2px] border-[0.5rem]">
          Border widths
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();

      const borderValues = values.filter((v) => v.type === "border");
      expect(borderValues).toHaveLength(3);
      expect(borderValues.map((v) => v.fullClass)).toContain("border-[1.5px]");
      expect(borderValues.map((v) => v.fullClass)).toContain("border-[2px]");
      expect(borderValues.map((v) => v.fullClass)).toContain("border-[0.5rem]");
    });

    it("detects directional border widths", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/DirectionalBorder.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="border-t-[2px] border-r-[1.5px] border-b-[3px] border-l-[1px]">
          Directional borders
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();

      const borderValues = values.filter((v) => v.type === "border");
      // A 1px hairline is an idiom, not a scale value.
      expect(borderValues).toHaveLength(3);
      expect(borderValues.map((v) => v.fullClass)).toContain("border-t-[2px]");
      expect(borderValues.map((v) => v.fullClass)).not.toContain("border-l-[1px]");
    });

    it("does not treat border-[#color] as width", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/BorderColor.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="border-[#ff0000] border-[rgb(0,0,0)]">
          Border colors
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();

      const colorValues = values.filter((v) => v.type === "color");
      expect(colorValues).toHaveLength(2);
      // Should not have any border-type values for color patterns
      const borderValues = values.filter((v) => v.type === "border");
      expect(borderValues).toHaveLength(0);
    });
  });

  describe("transform-origin arbitrary values", () => {
    it("ignores origin-[...] values (not a design value)", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Origin.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="origin-[--radix-dropdown-menu-content-transform-origin] origin-[center_bottom] origin-[50%_50%]">
          Transform origins
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();


      // Layout, mechanics, keywords and token references are not drift.

      expect(values).toHaveLength(0);
    });
  });

  describe("grid shorthand arbitrary values", () => {
    it("ignores cols-[...] shorthand for grid-template-columns (not a design value)", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/GridShort.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="cols-[repeat(auto-fill,minmax(350px,1fr))] cols-[1fr_2fr_1fr]">
          Grid columns shorthand
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();


      // Layout, mechanics, keywords and token references are not drift.

      expect(values).toHaveLength(0);
    });

    it("ignores rows-[...] shorthand for grid-template-rows (not a design value)", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/GridRowsShort.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="rows-[auto_1fr_auto] rows-[100px_auto]">
          Grid rows shorthand
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();


      // Layout, mechanics, keywords and token references are not drift.

      expect(values).toHaveLength(0);
    });
  });

  describe("content arbitrary values", () => {
    it("ignores content-[''] and content-[...] values (not a design value)", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Content.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="before:content-[''] after:content-['*'] content-['Hello']">
          Content values
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();


      // Layout, mechanics, keywords and token references are not drift.

      expect(values).toHaveLength(0);
    });
  });

  describe("size-[...] arbitrary values", () => {
    it("ignores size-[...] for width and height simultaneously (not a design value)", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Size.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="size-[100px] size-[50%] size-[--cell-size]">
          Size values
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();


      // Layout, mechanics, keywords and token references are not drift.

      expect(values).toHaveLength(0);
    });
  });

  describe("stroke arbitrary values", () => {
    it("ignores stroke-[width] as border type (not color) (not a design value)", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/SVG.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <svg className="stroke-[2px] stroke-[1.5px] stroke-[0.5rem]">
          SVG strokes
        </svg>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();


      // Layout, mechanics, keywords and token references are not drift.

      expect(values).toHaveLength(0);
    });

    it("detects stroke-[#color] as color type", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/SVGColor.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <button className="p-2">
          <svg className="stroke-[#333333] stroke-[rgb(0,0,0)]" />
          Themed icon inside a UI component
        </button>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();

      const colorValues = values.filter((v) => v.type === "color");
      expect(colorValues).toHaveLength(2);
    });
  });

  describe("text decoration arbitrary values", () => {
    it("ignores underline-offset with arbitrary values (not a design value)", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Underline.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <span className="underline-offset-[4px] underline-offset-[0.5em]">
          Underline offset
        </span>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();


      // Layout, mechanics, keywords and token references are not drift.

      expect(values).toHaveLength(0);
    });
  });

  describe("text indent arbitrary values", () => {
    it("ignores indent-[...] values (not a design value)", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Indent.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <p className="indent-[2em] indent-[20px]">
          Text indent
        </p>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();


      // Layout, mechanics, keywords and token references are not drift.

      expect(values).toHaveLength(0);
    });
  });

  describe("will-change arbitrary values", () => {
    it("ignores will-change-[...] values (not a design value)", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/WillChange.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="will-change-[transform] will-change-[opacity,transform]">
          Will change
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();


      // Layout, mechanics, keywords and token references are not drift.

      expect(values).toHaveLength(0);
    });
  });

  describe("list style arbitrary values", () => {
    it("ignores list-[...] values (not a design value)", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/List.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <ul className="list-[upper-roman] list-[lower-alpha]">
          List styles
        </ul>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();


      // Layout, mechanics, keywords and token references are not drift.

      expect(values).toHaveLength(0);
    });
  });

  describe("auto-cols and auto-rows arbitrary values", () => {
    it("ignores auto-cols-[...] values (not a design value)", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/AutoGrid.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="auto-cols-[minmax(0,2fr)] auto-cols-[min-content]">
          Auto columns
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();


      // Layout, mechanics, keywords and token references are not drift.

      expect(values).toHaveLength(0);
    });

    it("ignores auto-rows-[...] values (not a design value)", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/AutoRows.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="auto-rows-[min-content] auto-rows-[auto]">
          Auto rows
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();


      // Layout, mechanics, keywords and token references are not drift.

      expect(values).toHaveLength(0);
    });
  });

  describe("object position arbitrary values", () => {
    it("ignores object-[...] position values (not a design value)", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/ObjectPos.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <img className="object-[center_top] object-[25%_75%]" />
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();


      // Layout, mechanics, keywords and token references are not drift.

      expect(values).toHaveLength(0);
    });
  });

  describe("cursor arbitrary values", () => {
    it("ignores cursor-[...] values (not a design value)", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Cursor.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="cursor-[pointer] cursor-[url(hand.cur),_pointer] cursor-[grab]">
          Cursor values
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();


      // Layout, mechanics, keywords and token references are not drift.

      expect(values).toHaveLength(0);
    });
  });

  describe("Tailwind v4 CSS variable syntax", () => {
    it("ignores w-(--button-width) parentheses syntax for CSS variables (not a design value)", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/TailwindV4.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="w-(--button-width) h-(--header-height) min-w-(--sidebar-width)">
          Tailwind v4 variable syntax
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();


      // Layout, mechanics, keywords and token references are not drift.

      expect(values).toHaveLength(0);
    });

    it("ignores p-(--spacing) parentheses syntax for spacing (not a design value)", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/TailwindV4Spacing.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="p-(--card-padding) m-(--section-margin) gap-(--item-gap)">
          Tailwind v4 spacing syntax
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();


      // Layout, mechanics, keywords and token references are not drift.

      expect(values).toHaveLength(0);
    });

    it("ignores text-(--color) parentheses syntax for colors (not a design value)", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/TailwindV4Color.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="text-(--primary-color) bg-(--background) border-(--border-color)">
          Tailwind v4 color syntax
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();


      // Layout, mechanics, keywords and token references are not drift.

      expect(values).toHaveLength(0);
    });
  });

  describe("character unit values", () => {
    it("ignores max-w-[30ch] with character units (not a design value)", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/CharUnits.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="max-w-[30ch] w-[60ch] min-w-[20ch]">
          Character unit widths
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();


      // Layout, mechanics, keywords and token references are not drift.

      expect(values).toHaveLength(0);
    });
  });

  describe("type hint color syntax", () => {
    it("detects bg-[color:rgba(...)] with type hint syntax", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/TypeHint.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="bg-[color:rgba(254,204,27,0.5)] text-[color:hsl(0,0%,100%)]">
          Type hint colors
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();

      // Should detect the color values despite the type hint prefix
      expect(values.length).toBeGreaterThanOrEqual(2);
      expect(values.some((v) => v.fullClass.includes("bg-[color:rgba"))).toBe(true);
    });
  });

  describe("calc expressions in arbitrary values", () => {
    it("ignores w-[calc(...)] with calc expressions (not a design value)", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/CalcExpr.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="w-[calc(var(--input-width)+var(--button-width))] h-[calc(100vh-64px)]">
          Calc expressions
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();


      // Layout, mechanics, keywords and token references are not drift.

      expect(values).toHaveLength(0);
    });
  });

  describe("Tailwind v4 --spacing() function", () => {
    it("ignores [--cell-size:--spacing(12)] CSS property with spacing function (not a design value)", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/SpacingFn.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="[--cell-size:--spacing(12)] md:[--cell-size:--spacing(10)]">
          Tailwind v4 spacing function
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();


      // Layout, mechanics, keywords and token references are not drift.

      expect(values).toHaveLength(0);
    });

    it("ignores --spacing() with decimal values like --spacing(9.5) (not a design value)", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/SpacingDecimal.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="[--cell-size:--spacing(9.5)] [--sidebar-width:--spacing(40)]">
          Decimal spacing values
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();


      // Layout, mechanics, keywords and token references are not drift.

      expect(values).toHaveLength(0);
    });

    it("ignores --spacing() inside calc() expressions (not a design value)", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/SpacingCalc.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="[--header-height:calc(--spacing(14))] [--footer-height:calc(var(--spacing)*24)]">
          Spacing in calc
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();


      // Layout, mechanics, keywords and token references are not drift.

      expect(values).toHaveLength(0);
    });

    it("ignores --spacing() with nested var() in the argument (not a design value)", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/SpacingVar.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="[--toggle-gap:--spacing(var(--gap))]">
          Spacing with var
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();


      // Layout, mechanics, keywords and token references are not drift.

      expect(values).toHaveLength(0);
    });
  });

  describe("CSS properties with embedded hardcoded values", () => {
    it("ignores [background-image:radial-gradient(#color)] with embedded colors (not a design value)", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Gradient.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="[background-image:radial-gradient(#d4d4d4_1px,transparent_1px)] [background-size:20px_20px]">
          Gradient background
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();


      // Layout, mechanics, keywords and token references are not drift.

      expect(values).toHaveLength(0);
    });

    it("ignores [background-size:20px_20px] as CSS property (not a design value)", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/BgSize.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="[background-size:20px_20px]">
          Background size
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();


      // Layout, mechanics, keywords and token references are not drift.

      expect(values).toHaveLength(0);
    });
  });

  describe("complex CSS functions in arbitrary values", () => {
    it("ignores max-h-[min(...)] with nested CSS functions (not a design value)", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/CssFn.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="max-h-[min(calc(--spacing(96)),calc(var(--available-height)))]">
          Complex CSS function
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();


      // Layout, mechanics, keywords and token references are not drift.

      expect(values).toHaveLength(0);
    });

    it("ignores [--cell-size:clamp(...)] with clamp function (not a design value)", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Clamp.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="[--cell-size:clamp(0px,calc(100vw/7.5),52px)]">
          Clamp function
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();


      // Layout, mechanics, keywords and token references are not drift.

      expect(values).toHaveLength(0);
    });
  });

  describe("svh/dvh/lvh viewport units", () => {
    it("ignores h-[80svh] with small viewport height unit (not a design value)", async () => {
      vi.mocked(glob.glob).mockResolvedValue(["/test/project/src/Svh.tsx"]);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <div className="h-[80svh] min-h-[50dvh] max-h-[100lvh]">
          Viewport units
        </div>
      `);

      const detector = new ArbitraryValueDetector({
        projectRoot: mockProjectRoot,
      });

      const values = await detector.detect();


      // Layout, mechanics, keywords and token references are not drift.

      expect(values).toHaveLength(0);
    });
  });
});
