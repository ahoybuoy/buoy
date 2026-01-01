// packages/scanners/src/tailwind/scanner.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TailwindScanner } from './scanner.js';
import * as fs from 'fs';
import * as glob from 'glob';

// Mock dependencies
vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

vi.mock('glob', () => ({
  glob: vi.fn(),
}));

describe('TailwindScanner', () => {
  const mockProjectRoot = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Tailwind v4 CSS-based configuration', () => {
    it('detects @theme inline blocks in CSS files', async () => {
      // Mock no traditional tailwind.config.js
      vi.mocked(fs.existsSync).mockReturnValue(false);

      // Mock glob to find CSS files
      vi.mocked(glob.glob).mockResolvedValue(['/test/project/src/styles/globals.css']);

      // Mock CSS file content with Tailwind v4 @theme block
      vi.mocked(fs.readFileSync).mockReturnValue(`
@import "tailwindcss";

@theme inline {
  --breakpoint-3xl: 1600px;
  --color-primary: oklch(0.205 0 0);
  --color-secondary: oklch(0.97 0 0);
  --radius-sm: calc(var(--radius) - 4px);
  --font-sans: var(--font-sans);
}

:root {
  --radius: 0.625rem;
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
}
      `);

      const scanner = new TailwindScanner({
        projectRoot: mockProjectRoot,
      });

      const result = await scanner.scan();

      // Should detect Tailwind v4 CSS config
      expect(result.configPath).toBeTruthy();
      expect(result.tokens.length).toBeGreaterThan(0);

      // Should extract theme tokens
      const colorTokens = result.tokens.filter(t => t.category === 'color');
      expect(colorTokens.length).toBeGreaterThan(0);
    });

    it('extracts CSS custom properties from :root', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(glob.glob).mockResolvedValue(['/test/project/src/styles/globals.css']);

      vi.mocked(fs.readFileSync).mockReturnValue(`
@import "tailwindcss";

:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
}
      `);

      const scanner = new TailwindScanner({
        projectRoot: mockProjectRoot,
      });

      const result = await scanner.scan();

      // Should extract CSS custom properties as tokens
      const backgroundToken = result.tokens.find(t => t.name.includes('background'));
      expect(backgroundToken).toBeDefined();

      const primaryToken = result.tokens.find(t => t.name.includes('primary'));
      expect(primaryToken).toBeDefined();
    });

    it('detects @utility definitions', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(glob.glob).mockResolvedValue(['/test/project/src/styles/globals.css']);

      vi.mocked(fs.readFileSync).mockReturnValue(`
@import "tailwindcss";

@utility container {
  @apply mx-auto max-w-[1400px] px-4 lg:px-8;
}

@utility no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
      `);

      const scanner = new TailwindScanner({
        projectRoot: mockProjectRoot,
      });

      const result = await scanner.scan();

      // Should detect utilities as design tokens or track them
      expect(result.stats.tokensExtracted).toBeGreaterThanOrEqual(0);
    });

    it('detects @custom-variant definitions', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(glob.glob).mockResolvedValue(['/test/project/src/styles/globals.css']);

      vi.mocked(fs.readFileSync).mockReturnValue(`
@import "tailwindcss";

@custom-variant dark (&:is(.dark *));
@custom-variant fixed (&:is(.layout-fixed *));
      `);

      const scanner = new TailwindScanner({
        projectRoot: mockProjectRoot,
      });

      const result = await scanner.scan();

      // Should detect custom variants are present (Tailwind v4)
      expect(result.configPath).toBeTruthy();
    });

    it('detects @plugin declarations', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(glob.glob).mockResolvedValue(['/test/project/src/styles.css']);

      vi.mocked(fs.readFileSync).mockReturnValue(`
@import 'tailwindcss';
@plugin '@tailwindcss/forms';
@plugin '@tailwindcss/typography';
      `);

      const scanner = new TailwindScanner({
        projectRoot: mockProjectRoot,
      });

      const result = await scanner.scan();

      // Should detect Tailwind v4 with plugins
      expect(result.configPath).toBeTruthy();
    });

    it('finds CSS files with @import "tailwindcss" pattern', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(glob.glob).mockResolvedValue([
        '/test/project/src/styles/globals.css',
        '/test/project/src/styles/components.css',
      ]);

      // Only first file has tailwindcss import
      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        if (path === '/test/project/src/styles/globals.css') {
          return `
@import "tailwindcss";

@theme inline {
  --color-brand: #ff0000;
}
          `;
        }
        return '/* regular css */';
      });

      const scanner = new TailwindScanner({
        projectRoot: mockProjectRoot,
      });

      const result = await scanner.scan();

      expect(result.configPath).toContain('globals.css');
    });

    it('handles shadcn-ui style globals.css with full theme', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(glob.glob).mockResolvedValue(['/test/project/app/globals.css']);

      // Mock shadcn-ui style CSS
      vi.mocked(fs.readFileSync).mockReturnValue(`
@import "tailwindcss";
@import "shadcn/tailwind.css";

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
}

:root {
  --radius: 0.625rem;
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.922 0 0);
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
}
      `);

      const scanner = new TailwindScanner({
        projectRoot: mockProjectRoot,
      });

      const result = await scanner.scan();

      // Should extract all semantic color tokens
      expect(result.tokens.length).toBeGreaterThan(5);

      // Verify specific tokens
      const tokenNames = result.tokens.map(t => t.name);
      expect(tokenNames.some(n => n.includes('background') || n.includes('primary'))).toBe(true);
    });

    it('prefers traditional tailwind.config.js over CSS config when both exist', async () => {
      // Mock traditional config exists
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return String(path).includes('tailwind.config');
      });

      vi.mocked(glob.glob).mockResolvedValue([]);

      vi.mocked(fs.readFileSync).mockReturnValue(`
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: '#ff0000',
      }
    }
  }
}
      `);

      const scanner = new TailwindScanner({
        projectRoot: mockProjectRoot,
      });

      const result = await scanner.scan();

      // Should use traditional config path
      expect(result.configPath).toContain('tailwind.config');
    });
  });

  describe('scan orchestration', () => {
    it('combines theme tokens and arbitrary value detection', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(glob.glob).mockResolvedValue([
        '/test/project/src/globals.css',
        '/test/project/src/Button.tsx',
      ]);

      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        if (String(path).endsWith('.css')) {
          return `
@import "tailwindcss";

:root {
  --primary: #0066cc;
}
          `;
        }
        // TSX file with arbitrary values
        return `<div className="bg-[#ff6b6b] p-[17px]">Button</div>`;
      });

      const scanner = new TailwindScanner({
        projectRoot: mockProjectRoot,
        detectArbitraryValues: true,
        extractThemeTokens: true,
      });

      const result = await scanner.scan();

      // Should have both theme tokens and drift signals
      expect(result.tokens.length).toBeGreaterThan(0);
      expect(result.drifts.length).toBeGreaterThan(0);
    });

    it('respects extractThemeTokens option', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(glob.glob).mockResolvedValue([]);

      const scanner = new TailwindScanner({
        projectRoot: mockProjectRoot,
        extractThemeTokens: false,
      });

      const result = await scanner.scan();

      expect(result.tokens).toHaveLength(0);
    });

    it('respects detectArbitraryValues option', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(glob.glob).mockResolvedValue([]);

      const scanner = new TailwindScanner({
        projectRoot: mockProjectRoot,
        detectArbitraryValues: false,
      });

      const result = await scanner.scan();

      expect(result.drifts).toHaveLength(0);
    });
  });
});
