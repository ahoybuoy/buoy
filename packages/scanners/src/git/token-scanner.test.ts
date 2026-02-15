// packages/scanners/src/git/token-scanner.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { TokenScanner } from "./token-scanner.js";
import { vol } from "memfs";

describe("TokenScanner", () => {
  beforeEach(() => {
    vol.reset();
  });

  describe("CSS variable parsing", () => {
    it("extracts CSS custom properties from :root", async () => {
      vol.fromJSON({
        "/project/tokens/colors.css": `
          :root {
            --primary-color: #0066cc;
            --secondary-color: #666666;
            --spacing-sm: 8px;
          }
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.css"],
      });

      const result = await scanner.scan();

      expect(result.items.length).toBeGreaterThanOrEqual(3);
      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: "--primary-color",
          category: "color",
        }),
      );
    });

    it("categorizes tokens by name patterns", async () => {
      vol.fromJSON({
        "/project/tokens/vars.css": `
          :root {
            --color-primary: #0066cc;
            --spacing-md: 16px;
            --font-size-base: 14px;
            --shadow-sm: 0 1px 2px rgba(0,0,0,0.1);
            --border-radius: 4px;
          }
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.css"],
      });

      const result = await scanner.scan();

      const colorToken = result.items.find((t) => t.name.includes("color"));
      const spacingToken = result.items.find((t) => t.name.includes("spacing"));
      const fontToken = result.items.find((t) => t.name.includes("font"));
      const shadowToken = result.items.find((t) => t.name.includes("shadow"));
      const borderToken = result.items.find((t) => t.name.includes("border"));

      expect(colorToken?.category).toBe("color");
      expect(spacingToken?.category).toBe("spacing");
      expect(fontToken?.category).toBe("typography");
      expect(shadowToken?.category).toBe("shadow");
      expect(borderToken?.category).toBe("border");
    });

    it("handles multi-line CSS values", async () => {
      vol.fromJSON({
        "/project/tokens/complex.css": `
          :root {
            --gradient-primary: linear-gradient(
              to right,
              #0066cc,
              #00cc66
            );
            --shadow-lg: 0 4px 6px rgba(0, 0, 0, 0.1),
                         0 2px 4px rgba(0, 0, 0, 0.06);
          }
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.css"],
      });

      const result = await scanner.scan();

      expect(result.items.length).toBeGreaterThanOrEqual(2);
      const gradientToken = result.items.find((t) =>
        t.name.includes("gradient"),
      );
      expect(gradientToken).toBeDefined();
    });

    it("respects cssVariablePrefix config", async () => {
      vol.fromJSON({
        "/project/tokens/prefixed.css": `
          :root {
            --ds-color-primary: #0066cc;
            --ds-spacing-sm: 8px;
            --other-color: #ff0000;
          }
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.css"],
        cssVariablePrefix: "--ds-",
      });

      const result = await scanner.scan();

      expect(result.items.length).toBe(2);
      expect(result.items.every((t) => t.name.startsWith("--ds-"))).toBe(true);
    });

    it("ignores CSS comments", async () => {
      vol.fromJSON({
        "/project/tokens/commented.css": `
          :root {
            /* --commented-out: #ff0000; */
            --active-color: #0066cc;
            /*
             * Multi-line comment
             * --also-commented: #00ff00;
             */
            --another-color: #666666;
          }
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.css"],
      });

      const result = await scanner.scan();

      expect(result.items.length).toBe(2);
      expect(result.items.map((t) => t.name)).not.toContain("--commented-out");
      expect(result.items.map((t) => t.name)).not.toContain("--also-commented");
    });

    it("extracts tokens from Tailwind v4 @theme blocks", async () => {
      vol.fromJSON({
        "/project/styles/app.css": `
          @theme {
            --font-sans: 'Inter Variable', ui-sans-serif, system-ui;
            --color-neutral-50: oklch(0.985 0 0);
            --color-neutral-100: oklch(0.967 0.001 286.375);
            --spacing-safe-top: env(safe-area-inset-top);
          }
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["**/*.css"],
      });

      const result = await scanner.scan();

      expect(result.items.length).toBeGreaterThanOrEqual(4);
      expect(result.items.map((t) => t.name)).toContain("--font-sans");
      expect(result.items.map((t) => t.name)).toContain("--color-neutral-50");
      expect(result.items.map((t) => t.name)).toContain("--color-neutral-100");
      expect(result.items.map((t) => t.name)).toContain("--spacing-safe-top");
    });

    it("extracts tokens from @theme inline blocks", async () => {
      vol.fromJSON({
        "/project/styles/theme.css": `
          @theme inline {
            --color-background: var(--background);
            --color-primary: var(--primary);
            --color-foreground: var(--foreground);
          }
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["**/*.css"],
      });

      const result = await scanner.scan();

      expect(result.items.length).toBeGreaterThanOrEqual(3);
      expect(result.items.map((t) => t.name)).toContain("--color-background");
      expect(result.items.map((t) => t.name)).toContain("--color-primary");
    });

    it("extracts OKLCH color values from @theme blocks", async () => {
      vol.fromJSON({
        "/project/styles/colors.css": `
          @theme {
            --color-red-500: oklch(0.637 0.237 25.331);
            --color-blue-500: oklch(0.546 0.245 262.881);
            --color-green-500: oklch(0.723 0.191 142.499);
          }
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["**/*.css"],
      });

      const result = await scanner.scan();

      expect(result.items.length).toBeGreaterThanOrEqual(3);
      const redToken = result.items.find((t) => t.name === "--color-red-500");
      expect(redToken).toBeDefined();
      expect(redToken?.category).toBe("color");
    });

    it("extracts tokens from Cal.com-style @theme inline with @import tailwindcss", async () => {
      vol.fromJSON({
        "/project/app.css": `
@import "tailwindcss";
@theme inline {
  --color-primary: #0066cc;
  --color-secondary: #6366f1;
  --spacing-lg: 2rem;
  --radius-md: 0.5rem;
}
`,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["**/*.css"],
      });

      const result = await scanner.scan();

      expect(result.items.length).toBeGreaterThanOrEqual(4);
      const names = result.items.map((t) => t.name);
      expect(names).toContain("--color-primary");
      expect(names).toContain("--color-secondary");
      expect(names).toContain("--spacing-lg");
      expect(names).toContain("--radius-md");
    });

    it("discovers @theme files via auto-detection without explicit file patterns", async () => {
      vol.fromJSON({
        "/project/src/app.css": `
@import "tailwindcss";
@theme inline {
  --color-brand: #0066cc;
  --spacing-base: 1rem;
}
`,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
      });

      const result = await scanner.scan();

      expect(result.items.length).toBeGreaterThanOrEqual(2);
      const names = result.items.map((t) => t.name);
      expect(names).toContain("--color-brand");
      expect(names).toContain("--spacing-base");
    });
  });

  describe("JSON token parsing", () => {
    it("extracts tokens from design tokens JSON format", async () => {
      vol.fromJSON({
        "/project/tokens/tokens.json": JSON.stringify({
          color: {
            primary: { value: "#0066cc" },
            secondary: { value: "#666666" },
          },
          spacing: {
            sm: { value: "8px" },
            md: { value: "16px" },
          },
        }),
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.json"],
      });

      const result = await scanner.scan();

      expect(result.items.length).toBeGreaterThanOrEqual(4);
    });

    it("handles nested token structures", async () => {
      vol.fromJSON({
        "/project/tokens/nested.json": JSON.stringify({
          color: {
            brand: {
              primary: { value: "#0066cc" },
              secondary: { value: "#00cc66" },
            },
          },
        }),
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.json"],
      });

      const result = await scanner.scan();

      expect(result.items.length).toBeGreaterThanOrEqual(2);
      // Nested tokens should have dotted names
      const primaryToken = result.items.find((t) => t.name.includes("primary"));
      expect(primaryToken?.name).toContain("brand");
    });

    it("supports $value format (W3C Design Tokens)", async () => {
      vol.fromJSON({
        "/project/tokens/w3c.json": JSON.stringify({
          color: {
            primary: { $value: "#0066cc", $type: "color" },
            secondary: { $value: "#666666", $type: "color" },
          },
        }),
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.json"],
      });

      const result = await scanner.scan();

      expect(result.items.length).toBeGreaterThanOrEqual(2);
      expect(result.items[0]!.category).toBe("color");
    });

    it("includes token metadata like description", async () => {
      vol.fromJSON({
        "/project/tokens/described.json": JSON.stringify({
          color: {
            primary: {
              value: "#0066cc",
              description: "Main brand color",
            },
          },
        }),
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.json"],
      });

      const result = await scanner.scan();

      expect(result.items[0]!.metadata.description).toBe("Main brand color");
    });
  });

  describe("SCSS variable parsing", () => {
    it("extracts SCSS variables", async () => {
      vol.fromJSON({
        "/project/tokens/variables.scss": `
          $primary-color: #0066cc;
          $secondary-color: #666666;
          $spacing-sm: 8px;
          $font-size-base: 14px;
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.scss"],
      });

      const result = await scanner.scan();

      expect(result.items.length).toBeGreaterThanOrEqual(4);
      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: "$primary-color",
        }),
      );
    });

    it("categorizes SCSS variables correctly", async () => {
      vol.fromJSON({
        "/project/tokens/categorized.scss": `
          $color-primary: #0066cc;
          $spacing-lg: 24px;
          $font-family-base: 'Arial', sans-serif;
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.scss"],
      });

      const result = await scanner.scan();

      const colorToken = result.items.find((t) => t.name.includes("color"));
      const spacingToken = result.items.find((t) => t.name.includes("spacing"));
      const fontToken = result.items.find((t) => t.name.includes("font"));

      expect(colorToken?.category).toBe("color");
      expect(spacingToken?.category).toBe("spacing");
      expect(fontToken?.category).toBe("typography");
    });

    it("handles SCSS variables with complex values", async () => {
      vol.fromJSON({
        "/project/tokens/complex.scss": `
          $shadow-base: 0 2px 4px rgba(0, 0, 0, 0.1);
          $transition-all: all 0.3s ease-in-out;
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.scss"],
      });

      const result = await scanner.scan();

      expect(result.items.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("error handling", () => {
    it("handles invalid JSON gracefully", async () => {
      vol.fromJSON({
        "/project/tokens/invalid.json": "{ invalid json }",
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.json"],
      });

      const result = await scanner.scan();

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]!.code).toBe("JSON_PARSE_ERROR");
    });

    it("handles empty files", async () => {
      vol.fromJSON({
        "/project/tokens/empty.css": "",
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.css"],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it("handles files with no tokens", async () => {
      vol.fromJSON({
        "/project/tokens/no-tokens.css": `
          body {
            margin: 0;
            padding: 0;
          }
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.css"],
      });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(0);
    });
  });

  describe("scan statistics", () => {
    it("returns scan stats", async () => {
      vol.fromJSON({
        "/project/tokens/colors.css": ":root { --color: #fff; }",
        "/project/tokens/spacing.css": ":root { --space: 8px; }",
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.css"],
      });

      const result = await scanner.scan();

      expect(result.stats).toBeDefined();
      expect(result.stats.filesScanned).toBe(2);
      expect(result.stats.itemsFound).toBeGreaterThanOrEqual(2);
      expect(result.stats.duration).toBeGreaterThanOrEqual(0);
    });

    it("tracks duration", async () => {
      vol.fromJSON({
        "/project/tokens/colors.css": ":root { --color: #fff; }",
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.css"],
      });

      const result = await scanner.scan();

      expect(typeof result.stats.duration).toBe("number");
    });
  });

  describe("token value parsing", () => {
    it("parses color values correctly", async () => {
      vol.fromJSON({
        "/project/tokens/colors.css": `
          :root {
            --color-hex: #0066cc;
            --color-rgb: rgb(0, 102, 204);
            --color-hsl: hsl(210, 100%, 40%);
          }
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.css"],
      });

      const result = await scanner.scan();

      const hexToken = result.items.find((t) => t.name === "--color-hex");
      expect(hexToken?.value.type).toBe("color");
      expect((hexToken?.value as { type: "color"; hex: string }).hex).toBe(
        "#0066cc",
      );
    });

    it("parses spacing values with units", async () => {
      vol.fromJSON({
        "/project/tokens/spacing.css": `
          :root {
            --spacing-px: 16px;
            --spacing-rem: 1rem;
            --spacing-em: 2em;
          }
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.css"],
      });

      const result = await scanner.scan();

      const pxToken = result.items.find((t) => t.name === "--spacing-px");
      expect(pxToken?.value.type).toBe("spacing");
      expect(
        (pxToken?.value as { type: "spacing"; value: number; unit: string })
          .value,
      ).toBe(16);
      expect(
        (pxToken?.value as { type: "spacing"; value: number; unit: string })
          .unit,
      ).toBe("px");
    });
  });

  describe("token deduplication", () => {
    it("deduplicates tokens with same ID", async () => {
      vol.fromJSON({
        "/project/tokens/vars.css": `
          :root {
            --color-primary: #0066cc;
          }
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.css", "tokens/**/*.css"], // Duplicate pattern
      });

      const result = await scanner.scan();

      // Should only have one token despite duplicate pattern
      const primaryTokens = result.items.filter(
        (t) => t.name === "--color-primary",
      );
      expect(primaryTokens.length).toBe(1);
    });
  });

  describe("source type", () => {
    it("returns correct source type", () => {
      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.css"],
      });

      expect(scanner.getSourceType()).toBe("tokens");
    });
  });

  describe("default file patterns", () => {
    it("scans default token file locations when no files specified", async () => {
      vol.fromJSON({
        "/project/tokens/design.tokens.json": JSON.stringify({
          color: { primary: { value: "#0066cc" } },
        }),
        "/project/src/styles/variables.css": `
          :root {
            --color-secondary: #666666;
          }
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
      });

      const result = await scanner.scan();

      expect(result.items.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("TypeScript union type parsing", () => {
    it("extracts tokens from TypeScript union type definitions", async () => {
      vol.fromJSON({
        "/project/types/variants.ts": `
          type ButtonVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'info' | 'dark' | 'light';
          export type SizeVariant = 'sm' | 'md' | 'lg' | 'xl';
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["types/**/*.ts"],
      });

      const result = await scanner.scan();

      // Should have 8 from ButtonVariant + 4 from SizeVariant = 12 tokens
      expect(result.items.length).toBe(12);

      // Check ButtonVariant tokens
      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: "primary",
          source: expect.objectContaining({
            type: "typescript",
            typeName: "ButtonVariant",
          }),
        }),
      );

      // Check SizeVariant tokens
      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: "lg",
          source: expect.objectContaining({
            type: "typescript",
            typeName: "SizeVariant",
          }),
        }),
      );
    });

    it("extracts tokens from Color union types", async () => {
      vol.fromJSON({
        "/project/types/colors.ts": `
          type Color = 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'info' | 'light' | 'dark';
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["types/**/*.ts"],
      });

      const result = await scanner.scan();

      expect(result.items.length).toBe(8);
      expect(result.items[0]?.category).toBe("color");
    });

    it("categorizes tokens based on type name", async () => {
      vol.fromJSON({
        "/project/types/all.ts": `
          type ColorVariant = 'red' | 'blue';
          type ButtonSizeVariant = 'sm' | 'lg';
          type FontStyle = 'small' | 'large';
          type PaddingStyle = 'tight' | 'loose';
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["types/**/*.ts"],
      });

      const result = await scanner.scan();

      const colorTokens = result.items.filter((t) => t.category === "color");
      const sizingTokens = result.items.filter((t) => t.category === "sizing");
      const typographyTokens = result.items.filter(
        (t) => t.category === "typography",
      );
      const spacingTokens = result.items.filter(
        (t) => t.category === "spacing",
      );

      expect(colorTokens.length).toBe(2);
      expect(sizingTokens.length).toBe(2);
      expect(typographyTokens.length).toBe(2);
      expect(spacingTokens.length).toBe(2);
    });

    it("supports double-quoted strings", async () => {
      vol.fromJSON({
        "/project/types/quoted.ts": `
          type ButtonVariant = "primary" | "secondary" | "tertiary";
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["types/**/*.ts"],
      });

      const result = await scanner.scan();

      expect(result.items.length).toBe(3);
      expect(result.items.map((t) => t.name)).toEqual([
        "primary",
        "secondary",
        "tertiary",
      ]);
    });

    it("ignores non-design-token type names", async () => {
      vol.fromJSON({
        "/project/types/other.ts": `
          type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';
          type LogLevel = 'debug' | 'info' | 'warn' | 'error';
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["types/**/*.ts"],
      });

      const result = await scanner.scan();

      // These should not be detected as design tokens
      expect(result.items.length).toBe(0);
    });

    it("handles mixed union and non-union types", async () => {
      vol.fromJSON({
        "/project/types/mixed.ts": `
          interface ButtonProps {
            variant: ButtonVariant;
            size: Size;
          }

          type ButtonVariant = 'primary' | 'secondary';
          type Size = 'sm' | 'md' | 'lg';

          const myVar = 'something';
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["types/**/*.ts"],
      });

      const result = await scanner.scan();

      expect(result.items.length).toBe(5); // 2 + 3
    });

    it("extracts line numbers correctly", async () => {
      vol.fromJSON({
        "/project/types/lines.ts": `// Line 1
// Line 2
type ButtonVariant = 'primary' | 'secondary';
// Line 4
type SizeType = 'sm' | 'lg';
`,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["types/**/*.ts"],
      });

      const result = await scanner.scan();

      const buttonTokens = result.items.filter(
        (t) =>
          t.source.type === "typescript" &&
          t.source.typeName === "ButtonVariant",
      );
      const sizeTokens = result.items.filter(
        (t) => t.source.type === "typescript" && t.source.typeName === "SizeType",
      );

      // ButtonVariant is on line 3
      expect(buttonTokens[0]?.source.type === "typescript" && buttonTokens[0]?.source.line).toBe(3);
      // SizeType is on line 5
      expect(sizeTokens[0]?.source.type === "typescript" && sizeTokens[0]?.source.line).toBe(5);
    });

    it("handles .tsx files", async () => {
      vol.fromJSON({
        "/project/types/button.types.tsx": `
          type ButtonVariant = 'primary' | 'secondary' | 'ghost';
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["types/**/*.tsx"],
      });

      const result = await scanner.scan();

      expect(result.items.length).toBe(3);
    });

    it("includes description metadata", async () => {
      vol.fromJSON({
        "/project/types/variants.ts": `
          type ButtonVariant = 'primary' | 'secondary';
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["types/**/*.ts"],
      });

      const result = await scanner.scan();

      expect(result.items[0]?.metadata.description).toBe(
        "Value from ButtonVariant union type",
      );
    });

    it("handles additional design token patterns", async () => {
      vol.fromJSON({
        "/project/types/patterns.ts": `
          type AlertSeverity = 'info' | 'warning' | 'error';
          type ButtonState = 'default' | 'hover' | 'active' | 'disabled';
          type BadgeAppearance = 'solid' | 'outline' | 'subtle';
          type InputStatus = 'valid' | 'invalid' | 'pending';
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["types/**/*.ts"],
      });

      const result = await scanner.scan();

      // All these patterns should be recognized: 3 + 4 + 3 + 3 = 13
      expect(result.items.length).toBe(13);
    });

    it("creates unique token IDs for same value in different types", async () => {
      vol.fromJSON({
        "/project/types/overlapping.ts": `
          type ButtonVariant = 'primary' | 'secondary';
          type AlertType = 'primary' | 'secondary';
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["types/**/*.ts"],
      });

      const result = await scanner.scan();

      // Should have 4 tokens (2 from each type)
      expect(result.items.length).toBe(4);

      // IDs should be unique
      const ids = result.items.map((t) => t.id);
      expect(new Set(ids).size).toBe(4);
    });
  });

  describe("TypeScript token object parsing", () => {
    it("extracts tokens from defineTokens.colors pattern (Chakra/Panda)", async () => {
      vol.fromJSON({
        "/project/tokens/colors.ts": `
          import { defineTokens } from "../def"

          export const colors = defineTokens.colors({
            black: {
              value: "#09090B",
            },
            white: {
              value: "#FFFFFF",
            },
            gray: {
              "50": {
                value: "#fafafa",
              },
              "100": {
                value: "#f4f4f5",
              },
            },
          })
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.ts"],
      });

      const result = await scanner.scan();

      // Should detect: black, white, gray.50, gray.100 = 4 tokens
      expect(result.items.length).toBeGreaterThanOrEqual(4);

      // Check that we got the black token
      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: "black",
          category: "color",
          value: expect.objectContaining({ hex: "#09090b" }),
        }),
      );

      // Check nested gray tokens
      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: "gray.50",
          category: "color",
        }),
      );
    });

    it("extracts tokens from defineTokens.spacing pattern", async () => {
      vol.fromJSON({
        "/project/tokens/spacing.ts": `
          import { defineTokens } from "../def"

          export const spacing = defineTokens.spacing({
            "1": {
              value: "0.25rem",
            },
            "2": {
              value: "0.5rem",
            },
            "4": {
              value: "1rem",
            },
          })
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.ts"],
      });

      const result = await scanner.scan();

      expect(result.items.length).toBeGreaterThanOrEqual(3);
      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: "1",
          category: "spacing",
        }),
      );
    });

    it("extracts tokens from plain object exports", async () => {
      vol.fromJSON({
        "/project/tokens/theme.ts": `
          export const colors = {
            primary: {
              value: "#0066cc",
            },
            secondary: {
              value: "#666666",
            },
          }

          export const spacing = {
            sm: {
              value: "8px",
            },
            md: {
              value: "16px",
            },
          }
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.ts"],
      });

      const result = await scanner.scan();

      expect(result.items.length).toBeGreaterThanOrEqual(4);
    });

    it("extracts tokens from const objects with as const", async () => {
      vol.fromJSON({
        "/project/tokens/constants.ts": `
          export const colors = {
            primary: "#0066cc",
            secondary: "#666666",
            success: "#22c55e",
          } as const;

          export const spacing = {
            xs: "4px",
            sm: "8px",
            md: "16px",
          } as const;
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.ts"],
      });

      const result = await scanner.scan();

      // Direct value tokens (not nested { value: "..." })
      expect(result.items.length).toBeGreaterThanOrEqual(6);
    });

    it("detects tokens in files with token-related naming", async () => {
      vol.fromJSON({
        "/project/src/tokens/index.ts": `
          export const colors = {
            brand: {
              value: "#0066cc",
            },
          }
        `,
        "/project/src/theme/tokens.ts": `
          export const spacing = {
            base: {
              value: "8px",
            },
          }
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["**/tokens/**/*.ts", "**/theme/tokens.ts"],
      });

      const result = await scanner.scan();

      expect(result.items.length).toBeGreaterThanOrEqual(2);
    });

    it("handles deeply nested token structures", async () => {
      vol.fromJSON({
        "/project/tokens/semantic.ts": `
          export const colors = defineTokens.colors({
            brand: {
              primary: {
                "50": { value: "#eff6ff" },
                "100": { value: "#dbeafe" },
                "500": { value: "#3b82f6" },
              },
              secondary: {
                "50": { value: "#f0fdf4" },
                "500": { value: "#22c55e" },
              },
            },
          })
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.ts"],
      });

      const result = await scanner.scan();

      expect(result.items.length).toBeGreaterThanOrEqual(5);
      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: expect.stringContaining("brand.primary.500"),
        }),
      );
    });
  });

  describe("Style props theme object parsing", () => {
    it("extracts tokens from Mantine DEFAULT_THEME pattern with rem() calls", async () => {
      vol.fromJSON({
        "/project/theme/default-theme.ts": `
          const rem = (value: number) => \`\${value / 16}rem\`;

          export const DEFAULT_THEME = {
            fontSizes: {
              xs: rem(12),
              sm: rem(14),
              md: rem(16),
              lg: rem(18),
              xl: rem(20),
            },

            spacing: {
              xs: rem(10),
              sm: rem(12),
              md: rem(16),
              lg: rem(20),
              xl: rem(32),
            },

            radius: {
              xs: rem(2),
              sm: rem(4),
              md: rem(8),
              lg: rem(16),
              xl: rem(32),
            },
          };
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["theme/**/*.ts"],
      });

      const result = await scanner.scan();

      // Should detect tokens from fontSizes, spacing, and radius (5 each = 15)
      expect(result.items.length).toBeGreaterThanOrEqual(15);

      // Check fontSizes tokens
      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: expect.stringMatching(/fontSizes\.xs|xs/),
          category: "typography",
        }),
      );

      // Check spacing tokens
      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: expect.stringMatching(/spacing\.md|md/),
          category: "spacing",
        }),
      );

      // Check radius tokens
      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: expect.stringMatching(/radius\.sm|sm/),
          category: "border",
        }),
      );
    });

    it("extracts tokens from theme objects with string literal values", async () => {
      vol.fromJSON({
        "/project/theme/theme.ts": `
          export const theme = {
            lineHeights: {
              xs: '1.4',
              sm: '1.45',
              md: '1.55',
              lg: '1.6',
              xl: '1.65',
            },

            breakpoints: {
              xs: '36em',
              sm: '48em',
              md: '62em',
              lg: '75em',
              xl: '88em',
            },
          };
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["theme/**/*.ts"],
      });

      const result = await scanner.scan();

      // Should detect tokens from lineHeights and breakpoints (5 each = 10)
      expect(result.items.length).toBeGreaterThanOrEqual(10);
    });

    it("extracts tokens from theme with color values", async () => {
      vol.fromJSON({
        "/project/theme/colors.ts": `
          export const theme = {
            white: '#fff',
            black: '#000',
            colors: {
              blue: {
                50: '#eff6ff',
                100: '#dbeafe',
                500: '#3b82f6',
                900: '#1e3a8a',
              },
            },
          };
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["theme/**/*.ts"],
      });

      const result = await scanner.scan();

      // Should detect: white, black, blue.50, blue.100, blue.500, blue.900 = 6
      expect(result.items.length).toBeGreaterThanOrEqual(6);

      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: "white",
          category: "color",
        }),
      );
    });

    it("extracts tokens from shadows with complex values", async () => {
      vol.fromJSON({
        "/project/theme/shadows.ts": `
          const rem = (value: number) => \`\${value / 16}rem\`;

          export const shadows = {
            xs: \`0 \${rem(1)} \${rem(3)} rgba(0, 0, 0, 0.05)\`,
            sm: \`0 \${rem(1)} \${rem(3)} rgba(0, 0, 0, 0.1)\`,
            md: \`0 \${rem(4)} \${rem(6)} rgba(0, 0, 0, 0.1)\`,
          };
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["theme/**/*.ts"],
      });

      const result = await scanner.scan();

      expect(result.items.length).toBeGreaterThanOrEqual(3);
      expect(result.items).toContainEqual(
        expect.objectContaining({
          category: "shadow",
        }),
      );
    });
  });

  describe("Panda CSS / Chakra UI semantic tokens", () => {
    it("extracts tokens from defineSemanticTokens.colors pattern (Chakra UI v3)", async () => {
      vol.fromJSON({
        "/project/semantic-tokens/colors.ts": `
          import { defineSemanticTokens } from "../def"

          export const colors = defineSemanticTokens.colors({
            bg: {
              DEFAULT: {
                value: {
                  _light: "{colors.white}",
                  _dark: "{colors.black}",
                },
              },
              subtle: {
                value: {
                  _light: "{colors.gray.50}",
                  _dark: "{colors.gray.950}",
                },
              },
            },
            fg: {
              DEFAULT: {
                value: {
                  _light: "{colors.black}",
                  _dark: "{colors.gray.50}",
                },
              },
              muted: {
                value: {
                  _light: "{colors.gray.600}",
                  _dark: "{colors.gray.400}",
                },
              },
            },
          })
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["semantic-tokens/**/*.ts"],
      });

      const result = await scanner.scan();

      // Should detect nested semantic tokens: bg.DEFAULT, bg.subtle, fg.DEFAULT, fg.muted
      // Note: The light/dark value format is an alias reference, not a direct color value
      expect(result.items.length).toBeGreaterThanOrEqual(4);

      // Check that we got the bg tokens
      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: expect.stringContaining("bg"),
          category: "color",
        }),
      );

      // Check that we got the fg tokens
      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: expect.stringContaining("fg"),
          category: "color",
        }),
      );
    });

    it("extracts tokens from defineSemanticTokens.shadows pattern", async () => {
      vol.fromJSON({
        "/project/semantic-tokens/shadows.ts": `
          import { defineSemanticTokens } from "../def"

          export const shadows = defineSemanticTokens.shadows({
            xs: {
              value: {
                _light: "0 1px 2px rgba(0, 0, 0, 0.05)",
                _dark: "0 1px 2px rgba(0, 0, 0, 0.2)",
              },
            },
            sm: {
              value: {
                _light: "0 1px 3px rgba(0, 0, 0, 0.1)",
                _dark: "0 1px 3px rgba(0, 0, 0, 0.25)",
              },
            },
          })
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["semantic-tokens/**/*.ts"],
      });

      const result = await scanner.scan();

      expect(result.items.length).toBeGreaterThanOrEqual(2);
      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: "xs",
          category: "shadow",
        }),
      );
    });

    it("handles nested semantic tokens with deeply nested value objects", async () => {
      vol.fromJSON({
        "/project/semantic-tokens/colors.ts": `
          export const colors = defineSemanticTokens.colors({
            gray: {
              contrast: {
                value: {
                  _light: "{colors.white}",
                  _dark: "{colors.black}",
                },
              },
              fg: {
                value: {
                  _light: "{colors.gray.800}",
                  _dark: "{colors.gray.200}",
                },
              },
              solid: {
                value: {
                  _light: "{colors.gray.900}",
                  _dark: "{colors.white}",
                },
              },
            },
          })
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["semantic-tokens/**/*.ts"],
      });

      const result = await scanner.scan();

      // Should detect: gray.contrast, gray.fg, gray.solid
      expect(result.items.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("Mantine-style color arrays", () => {
    it("extracts tokens from color palette arrays like Mantine DEFAULT_COLORS", async () => {
      vol.fromJSON({
        "/project/theme/default-colors.ts": `
          export const DEFAULT_COLORS = {
            dark: [
              '#C9C9C9',
              '#b8b8b8',
              '#828282',
              '#696969',
              '#424242',
            ],
            gray: [
              '#f8f9fa',
              '#f1f3f5',
              '#e9ecef',
            ],
            blue: [
              '#e7f5ff',
              '#d0ebff',
              '#a5d8ff',
            ],
          };
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["theme/**/*.ts"],
      });

      const result = await scanner.scan();

      // Should detect: dark.0-4, gray.0-2, blue.0-2 = 5 + 3 + 3 = 11 tokens
      expect(result.items.length).toBeGreaterThanOrEqual(11);

      // Check that we got indexed color tokens
      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: expect.stringMatching(/dark\.0|dark\[0\]/),
          category: "color",
        }),
      );

      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: expect.stringMatching(/gray\.2|gray\[2\]/),
          category: "color",
        }),
      );
    });

    it("extracts color arrays with type annotations", async () => {
      vol.fromJSON({
        "/project/theme/colors.ts": `
          type MantineThemeColors = Record<string, string[]>;

          export const DEFAULT_COLORS: MantineThemeColors = {
            red: [
              '#fff5f5',
              '#ffe3e3',
              '#ffc9c9',
            ],
            green: [
              '#ebfbee',
              '#d3f9d8',
            ],
          };
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["theme/**/*.ts"],
      });

      const result = await scanner.scan();

      // Should detect red.0-2 and green.0-1 = 3 + 2 = 5 tokens
      expect(result.items.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe("Extended file path patterns", () => {
    it("scans default-theme.ts files outside of /theme/ directory", async () => {
      vol.fromJSON({
        "/project/src/core/Provider/default-theme.ts": `
          const rem = (value: number) => \`\${value / 16}rem\`;

          export const DEFAULT_THEME = {
            fontSizes: {
              xs: rem(12),
              sm: rem(14),
              md: rem(16),
            },
          };
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
      });

      const result = await scanner.scan();

      // Should detect fontSizes.xs, fontSizes.sm, fontSizes.md
      expect(result.items.length).toBeGreaterThanOrEqual(3);
      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: expect.stringContaining("fontSizes"),
          category: "typography",
        }),
      );
    });

    it("scans default-colors.ts files outside of /theme/ directory", async () => {
      vol.fromJSON({
        "/project/src/core/Provider/default-colors.ts": `
          export const DEFAULT_COLORS = {
            gray: [
              '#f8f9fa',
              '#f1f3f5',
              '#e9ecef',
            ],
          };
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
      });

      const result = await scanner.scan();

      // Should detect gray color tokens
      expect(result.items.length).toBeGreaterThanOrEqual(3);
    });

    it("scans *Provider/**/*.ts pattern for theme files", async () => {
      vol.fromJSON({
        "/project/packages/core/src/MantineProvider/default-theme.ts": `
          export const theme = {
            spacing: {
              xs: '10px',
              sm: '12px',
              md: '16px',
            },
          };
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
      });

      const result = await scanner.scan();

      expect(result.items.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("Default patterns - semantic-tokens directory", () => {
    it("scans **/semantic-tokens/**/*.ts files by default (Chakra UI v3 pattern)", async () => {
      vol.fromJSON({
        "/project/packages/panda-preset/src/semantic-tokens/colors.ts": `
          import { defineSemanticTokens } from "../def"

          export const colors = defineSemanticTokens.colors({
            bg: {
              DEFAULT: {
                value: {
                  _light: "{colors.white}",
                  _dark: "{colors.black}",
                },
              },
              subtle: {
                value: {
                  _light: "{colors.gray.50}",
                  _dark: "{colors.gray.950}",
                },
              },
            },
          })
        `,
        "/project/packages/panda-preset/src/semantic-tokens/shadows.ts": `
          import { defineSemanticTokens } from "../def"

          export const shadows = defineSemanticTokens.shadows({
            xs: {
              value: {
                _light: "0 1px 2px rgba(0, 0, 0, 0.05)",
                _dark: "0 1px 2px rgba(0, 0, 0, 0.2)",
              },
            },
          })
        `,
      });

      // No files specified - should use default patterns
      const scanner = new TokenScanner({
        projectRoot: "/project",
      });

      const result = await scanner.scan();

      // Should detect bg.DEFAULT, bg.subtle from colors.ts and xs from shadows.ts
      expect(result.items.length).toBeGreaterThanOrEqual(3);

      // Verify semantic color tokens were found
      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: expect.stringContaining("bg"),
          category: "color",
        }),
      );

      // Verify semantic shadow tokens were found
      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: "xs",
          category: "shadow",
        }),
      );
    });
  });

  describe("Generated token files (*.gen.ts)", () => {
    it("extracts tokens from generated Token union types in .gen.ts files", async () => {
      vol.fromJSON({
        "/project/generated/token.gen.ts": `
          export type Token =
            | "aspectRatios.square"
            | "aspectRatios.landscape"
            | "animations.spin"
            | "animations.bounce"
            | "colors.transparent"
            | "colors.black"
            | "colors.white"
            | "colors.gray.50"
            | "colors.gray.100"
            | "spacing.1"
            | "spacing.2"
            | "fontSizes.xs"
            | "fontSizes.sm"
            | "shadows.xs"
            | "shadows.sm"
            | "radii.none"
            | "radii.sm"
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["generated/**/*.ts"],
      });

      const result = await scanner.scan();

      // Should detect all token paths from the Token union type
      expect(result.items.length).toBeGreaterThanOrEqual(17);

      // Check color tokens
      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: "colors.gray.50",
          category: "color",
        }),
      );

      // Check animation tokens
      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: "animations.spin",
          category: "motion",
        }),
      );

      // Check spacing tokens
      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: "spacing.1",
          category: "spacing",
        }),
      );
    });

    it("handles Token union types with categorization based on path prefix", async () => {
      vol.fromJSON({
        "/project/styled-system/generated/token.gen.ts": `
          export type Token =
            | "blurs.none"
            | "blurs.sm"
            | "borders.xs"
            | "durations.fast"
            | "easings.ease-in"
            | "zIndex.hide"
            | "zIndex.base"
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["styled-system/**/*.ts"],
      });

      const result = await scanner.scan();

      expect(result.items.length).toBeGreaterThanOrEqual(7);

      // Check durations are categorized as motion
      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: "durations.fast",
          category: "motion",
        }),
      );

      // Check easings are categorized as motion
      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: "easings.ease-in",
          category: "motion",
        }),
      );
    });
  });

  describe("Keyframes without defineTokens wrapper", () => {
    it("extracts keyframe animation tokens from plain exported objects", async () => {
      vol.fromJSON({
        "/project/tokens/keyframes.ts": `
          export const keyframes = {
            spin: {
              "0%": { transform: "rotate(0deg)" },
              "100%": { transform: "rotate(360deg)" },
            },
            pulse: {
              "50%": { opacity: "0.5" },
            },
            bounce: {
              "0%, 100%": { transform: "translateY(-25%)" },
              "50%": { transform: "none" },
            },
            "fade-in": {
              from: { opacity: 0 },
              to: { opacity: 1 },
            },
          };
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.ts"],
      });

      const result = await scanner.scan();

      // Should detect keyframe names as animation tokens
      expect(result.items.length).toBeGreaterThanOrEqual(4);

      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: "spin",
          category: "motion",
        }),
      );

      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: "fade-in",
          category: "motion",
        }),
      );
    });

    it("handles keyframes with animation object structure (from/to)", async () => {
      vol.fromJSON({
        "/project/tokens/animations.ts": `
          export const keyframes = {
            "expand-height": {
              from: { height: "var(--collapsed-height, 0)" },
              to: { height: "var(--height)" },
            },
            "collapse-width": {
              from: { width: "var(--width)" },
              to: { width: "var(--collapsed-width, 0)" },
            },
          };
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.ts"],
      });

      const result = await scanner.scan();

      expect(result.items.length).toBeGreaterThanOrEqual(2);

      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: "expand-height",
          category: "motion",
        }),
      );
    });
  });

  describe("Extended JSON file patterns", () => {
    it("scans **/semantic-tokens/**/*.json files by default", async () => {
      vol.fromJSON({
        "/project/apps/www/public/theme/semantic-tokens/colors.json": JSON.stringify([
          "bg",
          "bg.subtle",
          "bg.muted",
          "fg",
          "fg.muted",
          "border",
        ]),
        "/project/apps/www/public/theme/semantic-tokens/shadows.json": JSON.stringify([
          "xs",
          "sm",
          "md",
        ]),
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
      });

      const result = await scanner.scan();

      // Should detect tokens from semantic-tokens directory
      expect(result.items.length).toBeGreaterThanOrEqual(9);

      // Check color tokens from semantic colors
      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: "bg",
          category: "color",
        }),
      );

      // Check shadow tokens
      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: "sm",
          category: "shadow",
        }),
      );
    });

    it("scans **/*-styles.json files for style definition tokens", async () => {
      vol.fromJSON({
        "/project/apps/www/public/theme/text-styles.json": JSON.stringify([
          "2xs",
          "xs",
          "sm",
          "md",
          "lg",
          "xl",
          "2xl",
          "label",
        ]),
        "/project/apps/www/public/theme/animation-styles.json": JSON.stringify([
          "slide-fade-in",
          "slide-fade-out",
          "scale-fade-in",
        ]),
        "/project/apps/www/public/theme/layer-styles.json": JSON.stringify([
          "fill.muted",
          "fill.subtle",
          "outline.solid",
          "disabled",
        ]),
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
      });

      const result = await scanner.scan();

      // Should detect tokens from style definition files
      // text-styles: 8, animation-styles: 3, layer-styles: 4 = 15
      expect(result.items.length).toBeGreaterThanOrEqual(15);

      // Check text style tokens are categorized as typography
      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: "lg",
          category: "typography",
        }),
      );

      // Check animation style tokens are categorized as motion
      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: "slide-fade-in",
          category: "motion",
        }),
      );
    });

    it("scans **/theme/**/*.json files for theme token files", async () => {
      vol.fromJSON({
        "/project/packages/ui/theme/colors.json": JSON.stringify([
          "primary",
          "secondary",
          "success",
          "danger",
        ]),
        "/project/packages/ui/theme/spacing.json": JSON.stringify([
          "1",
          "2",
          "4",
          "8",
        ]),
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
      });

      const result = await scanner.scan();

      // Should detect tokens from theme directory JSON files
      expect(result.items.length).toBeGreaterThanOrEqual(8);
    });
  });

  describe("JSON array format parsing", () => {
    it("extracts tokens from JSON arrays with token names (Chakra UI generated format)", async () => {
      vol.fromJSON({
        "/project/tokens/colors.json": JSON.stringify([
          "transparent",
          "current",
          "black",
          "white",
          "gray.50",
          "gray.100",
          "gray.200",
        ]),
        "/project/tokens/spacing.json": JSON.stringify([
          "1",
          "2",
          "3",
          "4",
        ]),
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.json"],
      });

      const result = await scanner.scan();

      // Should detect all token names from arrays
      expect(result.items.length).toBeGreaterThanOrEqual(11);

      // Check color tokens
      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: "black",
          category: "color",
        }),
      );

      // Check nested color tokens
      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: "gray.50",
          category: "color",
        }),
      );

      // Check spacing tokens
      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: "1",
          category: "spacing",
        }),
      );
    });

    it("categorizes JSON array tokens based on filename", async () => {
      vol.fromJSON({
        "/project/tokens/font-sizes.json": JSON.stringify([
          "xs",
          "sm",
          "md",
          "lg",
        ]),
        "/project/tokens/radii.json": JSON.stringify([
          "none",
          "sm",
          "md",
          "lg",
          "full",
        ]),
        "/project/tokens/shadows.json": JSON.stringify([
          "xs",
          "sm",
          "md",
          "lg",
        ]),
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.json"],
      });

      const result = await scanner.scan();

      // Check typography tokens from font-sizes.json
      const typographyTokens = result.items.filter(
        (t) => t.category === "typography",
      );
      expect(typographyTokens.length).toBeGreaterThanOrEqual(4);

      // Check border tokens from radii.json
      const borderTokens = result.items.filter((t) => t.category === "border");
      expect(borderTokens.length).toBeGreaterThanOrEqual(5);

      // Check shadow tokens from shadows.json
      const shadowTokens = result.items.filter((t) => t.category === "shadow");
      expect(shadowTokens.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe("Chakra/Panda style definition patterns", () => {
    it("extracts tokens from defineTextStyles pattern", async () => {
      vol.fromJSON({
        "/project/theme/text-styles.ts": `
          import { defineTextStyles } from "../styled-system"

          export const textStyles = defineTextStyles({
            "2xs": { value: { fontSize: "2xs", lineHeight: "0.75rem" } },
            xs: { value: { fontSize: "xs", lineHeight: "1rem" } },
            sm: { value: { fontSize: "sm", lineHeight: "1.25rem" } },
            md: { value: { fontSize: "md", lineHeight: "1.5rem" } },
            lg: { value: { fontSize: "lg", lineHeight: "1.75rem" } },
            xl: { value: { fontSize: "xl", lineHeight: "1.875rem" } },
            "2xl": { value: { fontSize: "2xl", lineHeight: "2rem" } },
            none: { value: {} },
            label: {
              value: {
                fontSize: "sm",
                lineHeight: "1.25rem",
                fontWeight: "medium",
              },
            },
          })
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["theme/**/*.ts"],
      });

      const result = await scanner.scan();

      // Should detect all text style tokens: 2xs, xs, sm, md, lg, xl, 2xl, none, label = 9 tokens
      expect(result.items.length).toBeGreaterThanOrEqual(9);

      // Check that we got typography tokens
      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: "xs",
          category: "typography",
        }),
      );

      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: "label",
          category: "typography",
        }),
      );
    });

    it("extracts tokens from defineLayerStyles pattern", async () => {
      vol.fromJSON({
        "/project/theme/layer-styles.ts": `
          import { defineLayerStyles } from "../styled-system"

          export const layerStyles = defineLayerStyles({
            "fill.muted": {
              value: {
                background: "colorPalette.muted",
                color: "colorPalette.fg",
              },
            },
            "fill.subtle": {
              value: {
                background: "colorPalette.subtle",
                color: "colorPalette.fg",
              },
            },
            "fill.solid": {
              value: {
                background: "colorPalette.solid",
                color: "colorPalette.contrast",
              },
            },
            "outline.solid": {
              value: {
                borderWidth: "1px",
                borderColor: "colorPalette.solid",
                color: "colorPalette.fg",
              },
            },
            disabled: {
              value: {
                opacity: "0.5",
                cursor: "not-allowed",
              },
            },
            none: { value: {} },
          })
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["theme/**/*.ts"],
      });

      const result = await scanner.scan();

      // Should detect all layer style tokens: 6 tokens
      expect(result.items.length).toBeGreaterThanOrEqual(6);

      // Check that we got layer style tokens (categorized as "other")
      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: "fill.muted",
        }),
      );

      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: "disabled",
        }),
      );
    });

    it("extracts tokens from defineAnimationStyles pattern", async () => {
      vol.fromJSON({
        "/project/theme/motion-styles.ts": `
          import { defineAnimationStyles } from "../styled-system"

          export const animationStyles = defineAnimationStyles({
            "slide-fade-in": {
              value: {
                transformOrigin: "var(--transform-origin)",
                animationName: "slide-in, fade-in",
              },
            },
            "slide-fade-out": {
              value: {
                transformOrigin: "var(--transform-origin)",
                animationName: "slide-out, fade-out",
              },
            },
            "scale-fade-in": {
              value: {
                transformOrigin: "var(--transform-origin)",
                animationName: "scale-in, fade-in",
              },
            },
            "scale-fade-out": {
              value: {
                transformOrigin: "var(--transform-origin)",
                animationName: "scale-out, fade-out",
              },
            },
          })
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["theme/**/*.ts"],
      });

      const result = await scanner.scan();

      // Should detect all animation style tokens: 4 tokens
      expect(result.items.length).toBeGreaterThanOrEqual(4);

      // Check that we got motion tokens
      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: "slide-fade-in",
          category: "motion",
        }),
      );

      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: "scale-fade-out",
          category: "motion",
        }),
      );
    });

    it("handles all three style definition patterns in one scan", async () => {
      vol.fromJSON({
        "/project/theme/text-styles.ts": `
          export const textStyles = defineTextStyles({
            sm: { value: { fontSize: "sm" } },
            md: { value: { fontSize: "md" } },
            lg: { value: { fontSize: "lg" } },
          })
        `,
        "/project/theme/layer-styles.ts": `
          export const layerStyles = defineLayerStyles({
            "fill.muted": { value: { background: "gray.100" } },
            "fill.solid": { value: { background: "gray.900" } },
          })
        `,
        "/project/theme/motion-styles.ts": `
          export const animationStyles = defineAnimationStyles({
            "fade-in": { value: { animationName: "fade-in" } },
            "fade-out": { value: { animationName: "fade-out" } },
          })
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["theme/**/*.ts"],
      });

      const result = await scanner.scan();

      // Should detect all tokens from all three patterns: 3 + 2 + 2 = 7 tokens
      expect(result.items.length).toBeGreaterThanOrEqual(7);

      // Verify we got typography tokens from text-styles
      const typographyTokens = result.items.filter(
        (t) => t.category === "typography",
      );
      expect(typographyTokens.length).toBeGreaterThanOrEqual(3);

      // Verify we got motion tokens from animation-styles
      const motionTokens = result.items.filter((t) => t.category === "motion");
      expect(motionTokens.length).toBeGreaterThanOrEqual(2);
    });

    it("extracts tokens from defineTokens.animations pattern", async () => {
      vol.fromJSON({
        "/project/tokens/animations.ts": `
          import { defineTokens } from "../styled-system"

          export const animations = defineTokens.animations({
            spin: { value: "spin 1s linear infinite" },
            ping: { value: "ping 1s cubic-bezier(0, 0, 0.2, 1) infinite" },
            pulse: { value: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite" },
            bounce: { value: "bounce 1s infinite" },
          })
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.ts"],
      });

      const result = await scanner.scan();

      // Should detect all animation tokens: 4 tokens
      expect(result.items.length).toBeGreaterThanOrEqual(4);

      // Check that animations are categorized as motion
      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: "spin",
          category: "motion",
        }),
      );

      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: "bounce",
          category: "motion",
        }),
      );
    });
  });

  describe("defineKeyframes pattern (Chakra UI)", () => {
    it("extracts keyframe names from defineKeyframes pattern", async () => {
      vol.fromJSON({
        "/project/tokens/keyframes.ts": `
          import { defineKeyframes } from "../../styled-system"

          export const keyframes = defineKeyframes({
            spin: {
              "0%": { transform: "rotate(0deg)" },
              "100%": { transform: "rotate(360deg)" },
            },
            pulse: {
              "50%": { opacity: "0.5" },
            },
            bounce: {
              "0%, 100%": { transform: "translateY(-25%)" },
              "50%": { transform: "none" },
            },
            "fade-in": {
              from: { opacity: 0 },
              to: { opacity: 1 },
            },
            "slide-from-left": {
              "0%": { translate: "-0.5rem 0" },
              to: { translate: "0" },
            },
          })
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.ts"],
      });

      const result = await scanner.scan();

      // Should detect all keyframe animation names: 5 tokens
      expect(result.items.length).toBeGreaterThanOrEqual(5);

      // Check that keyframes are categorized as motion
      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: "spin",
          category: "motion",
        }),
      );

      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: "fade-in",
          category: "motion",
        }),
      );

      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: "slide-from-left",
          category: "motion",
        }),
      );
    });

    it("handles defineKeyframes with mixed keyframe selectors (%, from, to)", async () => {
      vol.fromJSON({
        "/project/tokens/keyframes.ts": `
          export const keyframes = defineKeyframes({
            "expand-height": {
              from: { height: "var(--collapsed-height, 0)" },
              to: { height: "var(--height)" },
            },
            "circular-progress": {
              "0%": { strokeDasharray: "1, 400" },
              "50%": { strokeDasharray: "400, 400" },
              "100%": { strokeDasharray: "400, 400" },
            },
          })
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.ts"],
      });

      const result = await scanner.scan();

      expect(result.items.length).toBeGreaterThanOrEqual(2);

      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: "expand-height",
          category: "motion",
        }),
      );

      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: "circular-progress",
          category: "motion",
        }),
      );
    });
  });

  describe("modern color space detection", () => {
    it("detects OKLCH colors as color category", async () => {
      vol.fromJSON({
        "/project/tokens/modern-colors.css": `
          :root {
            --color-primary: oklch(50% 0.2 240);
            --color-secondary: oklch(70% 0.15 180);
            --some-value: 16px;
          }
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.css"],
      });

      const result = await scanner.scan();

      const primaryToken = result.items.find((t) => t.name === "--color-primary");
      const secondaryToken = result.items.find((t) => t.name === "--color-secondary");

      expect(primaryToken?.category).toBe("color");
      expect(secondaryToken?.category).toBe("color");
    });

    it("detects OKLAB colors as color category", async () => {
      vol.fromJSON({
        "/project/tokens/oklab.css": `
          :root {
            --accent-color: oklab(50% 0.1 -0.1);
          }
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.css"],
      });

      const result = await scanner.scan();

      const token = result.items.find((t) => t.name === "--accent-color");
      expect(token?.category).toBe("color");
    });

    it("detects LAB colors as color category", async () => {
      vol.fromJSON({
        "/project/tokens/lab.css": `
          :root {
            --brand-color: lab(50% 25 -25);
          }
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.css"],
      });

      const result = await scanner.scan();

      const token = result.items.find((t) => t.name === "--brand-color");
      expect(token?.category).toBe("color");
    });

    it("detects LCH colors as color category", async () => {
      vol.fromJSON({
        "/project/tokens/lch.css": `
          :root {
            --info-color: lch(50% 50 240);
          }
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.css"],
      });

      const result = await scanner.scan();

      const token = result.items.find((t) => t.name === "--info-color");
      expect(token?.category).toBe("color");
    });

    it("detects color() function as color category", async () => {
      vol.fromJSON({
        "/project/tokens/color-func.css": `
          :root {
            --display-p3-color: color(display-p3 1 0.5 0);
          }
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.css"],
      });

      const result = await scanner.scan();

      const token = result.items.find((t) => t.name === "--display-p3-color");
      expect(token?.category).toBe("color");
    });

    it("detects HWB colors as color category", async () => {
      vol.fromJSON({
        "/project/tokens/hwb.css": `
          :root {
            --hwb-color: hwb(240 10% 20%);
          }
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.css"],
      });

      const result = await scanner.scan();

      const token = result.items.find((t) => t.name === "--hwb-color");
      expect(token?.category).toBe("color");
    });
  });

  describe("pt unit detection for spacing", () => {
    it("detects pt values as spacing category", async () => {
      vol.fromJSON({
        "/project/tokens/pdf-tokens.css": `
          :root {
            --pdf-margin: 12pt;
            --pdf-spacing: 6pt;
            --pdf-font: 10pt;
          }
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tokens/**/*.css"],
      });

      const result = await scanner.scan();

      const marginToken = result.items.find((t) => t.name === "--pdf-margin");
      const spacingToken = result.items.find((t) => t.name === "--pdf-spacing");

      // pt values should be detected as spacing
      expect(marginToken?.category).toBe("spacing");
      expect(spacingToken?.category).toBe("spacing");
    });
  });

  describe("Tailwind config token extraction", () => {
    it("should extract colors from theme.extend.colors", async () => {
      vol.fromJSON({
        "/project/tailwind.config.ts": `
          export default {
            content: ['./src/**/*.{ts,tsx}'],
            theme: {
              extend: {
                colors: {
                  primary: '#3b82f6',
                  secondary: '#64748b',
                },
              },
            },
          };
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tailwind.config.ts"],
      });

      const result = await scanner.scan();
      const colorTokens = result.items.filter((t) => t.category === "color");
      expect(colorTokens.length).toBeGreaterThanOrEqual(2);
      expect(colorTokens.some((t) => t.name === "primary")).toBe(true);
      expect(colorTokens.some((t) => t.name === "secondary")).toBe(true);
    });

    it("should extract spacing from theme.extend.spacing", async () => {
      vol.fromJSON({
        "/project/tailwind.config.ts": `
          export default {
            theme: {
              extend: {
                spacing: {
                  '18': '4.5rem',
                  '88': '22rem',
                },
              },
            },
          };
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tailwind.config.ts"],
      });

      const result = await scanner.scan();
      const spacingTokens = result.items.filter((t) => t.category === "spacing");
      expect(spacingTokens.length).toBeGreaterThanOrEqual(2);
    });

    it("should extract nested color objects", async () => {
      vol.fromJSON({
        "/project/tailwind.config.js": `
          module.exports = {
            theme: {
              extend: {
                colors: {
                  brand: {
                    light: '#fbbf24',
                    DEFAULT: '#f59e0b',
                    dark: '#d97706',
                  },
                },
              },
            },
          };
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tailwind.config.js"],
      });

      const result = await scanner.scan();
      const colorTokens = result.items.filter((t) => t.category === "color");
      expect(colorTokens.length).toBeGreaterThanOrEqual(1);
    });

    it("should extract fontSize tokens", async () => {
      vol.fromJSON({
        "/project/tailwind.config.ts": `
          export default {
            theme: {
              extend: {
                fontSize: {
                  'xs': '0.75rem',
                  'sm': '0.875rem',
                },
              },
            },
          };
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tailwind.config.ts"],
      });

      const result = await scanner.scan();
      const typographyTokens = result.items.filter((t) => t.category === "typography");
      expect(typographyTokens.length).toBeGreaterThanOrEqual(2);
    });

    it("should extract colors from Tailwind config with multiple theme.extend entries", async () => {
      vol.fromJSON({
        "/project/tailwind.config.ts": `
          import type { Config } from 'tailwindcss';

          const config: Config = {
            content: ['./src/**/*.{ts,tsx}'],
            theme: {
              extend: {
                colors: {
                  primary: '#3b82f6',
                  secondary: '#64748b',
                  accent: '#f59e0b',
                },
                spacing: {
                  '18': '4.5rem',
                  '88': '22rem',
                },
                borderRadius: {
                  '4xl': '2rem',
                },
              },
            },
            plugins: [],
          };

          export default config;
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["tailwind.config.ts"],
      });

      const result = await scanner.scan();
      // Should find colors, spacing, and borderRadius tokens
      const colorTokens = result.items.filter((t) => t.category === "color");
      const spacingTokens = result.items.filter((t) => t.category === "spacing");
      expect(colorTokens.length).toBeGreaterThanOrEqual(3);
      expect(spacingTokens.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("CSS-in-JS theme token extraction", () => {
    it("should extract tokens from MUI createTheme()", async () => {
      vol.fromJSON({
        "/project/theme.ts": `
          import { createTheme } from '@mui/material/styles';

          export const theme = createTheme({
            palette: {
              primary: { main: '#1976d2', light: '#42a5f5' },
              secondary: { main: '#9c27b0' },
            },
            spacing: { sm: '8px', md: '16px' },
          });
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["theme.ts"],
      });

      const result = await scanner.scan();
      const colorTokens = result.items.filter((t) => t.category === "color");
      expect(colorTokens.length).toBeGreaterThanOrEqual(1);
    });

    it("should extract tokens from Mantine createTheme()", async () => {
      vol.fromJSON({
        "/project/theme.ts": `
          import { createTheme } from '@mantine/core';

          export const theme = createTheme({
            colors: {
              brand: ['#f0f0ff', '#d0d0ff', '#a0a0ff', '#7070ff', '#4040ff', '#1010ff', '#0000dd', '#0000aa', '#000088', '#000066'],
            },
            fontSizes: { xs: '0.75rem', sm: '0.875rem', md: '1rem' },
          });
        `,
      });

      const scanner = new TokenScanner({
        projectRoot: "/project",
        files: ["theme.ts"],
      });

      const result = await scanner.scan();
      expect(result.items.length).toBeGreaterThanOrEqual(1);
    });
  });
});
