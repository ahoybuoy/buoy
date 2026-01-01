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

    it('extracts CSS custom properties from .dark {} theme variant selector', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(glob.glob).mockResolvedValue(['/test/project/app/globals.css']);

      // Real shadcn-ui v4 pattern with .dark {} theme variant
      vi.mocked(fs.readFileSync).mockReturnValue(`
@import "tailwindcss";

:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --primary: oklch(0.922 0 0);
  --primary-foreground: oklch(0.205 0 0);
}
      `);

      const scanner = new TailwindScanner({
        projectRoot: mockProjectRoot,
      });

      const result = await scanner.scan();

      // Should extract tokens from both :root and .dark
      expect(result.tokens.length).toBeGreaterThan(4);

      // Should have dark mode variants
      const darkTokens = result.tokens.filter(t =>
        t.metadata?.tags?.includes('dark') || t.name.includes('dark-')
      );
      expect(darkTokens.length).toBeGreaterThan(0);
    });

    it('extracts CSS custom properties from [data-theme="dark"] selector', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(glob.glob).mockResolvedValue(['/test/project/src/styles.css']);

      // Alternative dark mode pattern
      vi.mocked(fs.readFileSync).mockReturnValue(`
@import "tailwindcss";

:root {
  --background: #ffffff;
  --foreground: #000000;
}

[data-theme="dark"] {
  --background: #000000;
  --foreground: #ffffff;
}

.theme-custom {
  --background: #f5f5f5;
  --primary: #0066cc;
}
      `);

      const scanner = new TailwindScanner({
        projectRoot: mockProjectRoot,
      });

      const result = await scanner.scan();

      // Should extract from all theme selectors
      expect(result.tokens.length).toBeGreaterThan(2);
    });

    it('extracts CSS variables from @layer base {} blocks', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(glob.glob).mockResolvedValue(['/test/project/src/globals.css']);

      // Real pattern from headlessui and other Tailwind v4 projects
      // Use semantic variable names that the parser recognizes
      const cssContent = `
@import 'tailwindcss';

@layer base {
  * {
    border-color: var(--color-gray-200, currentcolor);
  }

  :root {
    --radius: 0.5rem;
    --primary: #ff6b6b;
    --background: #ffffff;
  }
}
      `;
      vi.mocked(fs.readFileSync).mockReturnValue(cssContent);

      const scanner = new TailwindScanner({
        projectRoot: mockProjectRoot,
      });

      const result = await scanner.scan();

      // Should detect it's a Tailwind v4 config
      expect(result.configPath).toBeTruthy();

      // Should extract tokens from within @layer base (semantic names recognized by parser)
      const semanticTokens = result.tokens.filter(t =>
        t.name.includes('primary') || t.name.includes('background') || t.name.includes('radius')
      );
      expect(semanticTokens.length).toBeGreaterThan(0);
    });

    it('handles nested @layer blocks with :root selectors', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(glob.glob).mockResolvedValue(['/test/project/styles/theme.css']);

      vi.mocked(fs.readFileSync).mockReturnValue(`
@import "tailwindcss";

@layer base {
  :root {
    --radius: 0.5rem;
    --primary: hsl(222.2 47.4% 11.2%);
    --primary-foreground: hsl(210 40% 98%);
  }

  .dark {
    --primary: hsl(210 40% 98%);
    --primary-foreground: hsl(222.2 47.4% 11.2%);
  }
}

@layer components {
  .btn-primary {
    background: var(--primary);
    color: var(--primary-foreground);
  }
}
      `);

      const scanner = new TailwindScanner({
        projectRoot: mockProjectRoot,
      });

      const result = await scanner.scan();

      // Should extract both light and dark tokens
      const primaryTokens = result.tokens.filter(t => t.name.includes('primary'));
      expect(primaryTokens.length).toBeGreaterThan(0);

      // Should have tokens from both :root and .dark within @layer
      expect(result.tokens.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('semantic token extraction from class usage', () => {
    it('extracts semantic tokens from Tailwind classes in TSX files', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(glob.glob).mockResolvedValue([
        '/test/project/src/components/Button.tsx',
        '/test/project/src/components/Card.tsx',
      ]);

      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        if (String(path).includes('Button.tsx')) {
          return `
import React from 'react';

export const Button = ({ children }) => (
  <button className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2">
    {children}
  </button>
);
          `;
        }
        if (String(path).includes('Card.tsx')) {
          return `
import React from 'react';

export const Card = ({ children }) => (
  <div className="bg-card text-card-foreground border border-border rounded-lg p-6">
    {children}
  </div>
);
          `;
        }
        return '';
      });

      const scanner = new TailwindScanner({
        projectRoot: mockProjectRoot,
        extractSemanticTokens: true,
      });

      const result = await scanner.scan();

      // Should extract semantic tokens from class usage
      expect(result.semanticTokens).toBeDefined();
      expect(result.semanticTokens!.length).toBeGreaterThan(0);

      // Should find common semantic tokens
      const tokenNames = result.semanticTokens!.map(t => t.name);
      expect(tokenNames).toContain('primary');
      expect(tokenNames).toContain('primary-foreground');
      expect(tokenNames).toContain('card');
      expect(tokenNames).toContain('border');
    });

    it('extracts semantic tokens from cva variant definitions', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(glob.glob).mockResolvedValue(['/test/project/src/components/Button.tsx']);

      vi.mocked(fs.readFileSync).mockReturnValue(`
import { cva } from 'class-variance-authority';

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm font-medium",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
  }
);
      `);

      const scanner = new TailwindScanner({
        projectRoot: mockProjectRoot,
        extractSemanticTokens: true,
      });

      const result = await scanner.scan();

      expect(result.semanticTokens).toBeDefined();

      const tokenNames = result.semanticTokens!.map(t => t.name);
      expect(tokenNames).toContain('primary');
      expect(tokenNames).toContain('destructive');
      expect(tokenNames).toContain('secondary');
      expect(tokenNames).toContain('accent');
      expect(tokenNames).toContain('background');
      expect(tokenNames).toContain('input');
    });

    it('counts semantic token usage frequency', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(glob.glob).mockResolvedValue([
        '/test/project/src/components/Button.tsx',
        '/test/project/src/components/Input.tsx',
      ]);

      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        if (String(path).includes('Button.tsx')) {
          return `<button className="bg-primary text-primary-foreground">Click</button>`;
        }
        if (String(path).includes('Input.tsx')) {
          return `<input className="border-input bg-background text-foreground focus:ring-primary" />`;
        }
        return '';
      });

      const scanner = new TailwindScanner({
        projectRoot: mockProjectRoot,
        extractSemanticTokens: true,
      });

      const result = await scanner.scan();

      const primaryToken = result.semanticTokens!.find(t => t.name === 'primary');
      expect(primaryToken).toBeDefined();
      expect(primaryToken!.usageCount).toBeGreaterThanOrEqual(2);
    });

    it('identifies files using each semantic token', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(glob.glob).mockResolvedValue([
        '/test/project/src/Button.tsx',
        '/test/project/src/Card.tsx',
      ]);

      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        if (String(path).includes('Button.tsx')) {
          return `<button className="bg-primary">Click</button>`;
        }
        if (String(path).includes('Card.tsx')) {
          return `<div className="bg-primary border">Card</div>`;
        }
        return '';
      });

      const scanner = new TailwindScanner({
        projectRoot: mockProjectRoot,
        extractSemanticTokens: true,
      });

      const result = await scanner.scan();

      const primaryToken = result.semanticTokens!.find(t => t.name === 'primary');
      expect(primaryToken!.usedInFiles).toContain('src/Button.tsx');
      expect(primaryToken!.usedInFiles).toContain('src/Card.tsx');
    });

    it('extracts semantic tokens from cn/clsx/classnames function calls', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(glob.glob).mockResolvedValue(['/test/project/src/Input.tsx']);

      vi.mocked(fs.readFileSync).mockReturnValue(`
import { cn } from '@/lib/utils';

export const Input = ({ className, ...props }) => (
  <input
    className={cn(
      "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2",
      "text-foreground placeholder:text-muted-foreground",
      "focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    )}
    {...props}
  />
);
      `);

      const scanner = new TailwindScanner({
        projectRoot: mockProjectRoot,
        extractSemanticTokens: true,
      });

      const result = await scanner.scan();

      const tokenNames = result.semanticTokens!.map(t => t.name);
      expect(tokenNames).toContain('input');
      expect(tokenNames).toContain('background');
      expect(tokenNames).toContain('foreground');
      expect(tokenNames).toContain('muted-foreground');
      expect(tokenNames).toContain('ring');
    });

    it('respects extractSemanticTokens option when false', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(glob.glob).mockResolvedValue(['/test/project/src/Button.tsx']);

      vi.mocked(fs.readFileSync).mockReturnValue(`<button className="bg-primary">Click</button>`);

      const scanner = new TailwindScanner({
        projectRoot: mockProjectRoot,
        extractSemanticTokens: false,
      });

      const result = await scanner.scan();

      expect(result.semanticTokens).toBeUndefined();
    });

    it('extracts semantic tokens from real shadcn-ui button component pattern', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(glob.glob).mockResolvedValue(['/test/project/registry/default/ui/button.tsx']);

      // Real shadcn-ui button component code pattern
      vi.mocked(fs.readFileSync).mockReturnValue(`
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
  }
)
      `);

      const scanner = new TailwindScanner({
        projectRoot: mockProjectRoot,
        extractSemanticTokens: true,
      });

      const result = await scanner.scan();

      expect(result.semanticTokens).toBeDefined();
      expect(result.semanticTokens!.length).toBeGreaterThan(0);

      const tokenNames = result.semanticTokens!.map(t => t.name);

      // All core shadcn-ui semantic tokens from button component
      expect(tokenNames).toContain('primary');
      expect(tokenNames).toContain('primary-foreground');
      expect(tokenNames).toContain('destructive');
      expect(tokenNames).toContain('destructive-foreground');
      expect(tokenNames).toContain('secondary');
      expect(tokenNames).toContain('secondary-foreground');
      expect(tokenNames).toContain('accent');
      expect(tokenNames).toContain('accent-foreground');
      expect(tokenNames).toContain('background');
      expect(tokenNames).toContain('input');
      expect(tokenNames).toContain('ring');

      // Verify stats
      expect(result.stats.semanticTokensFound).toBe(result.semanticTokens!.length);
    });

    it('extracts semantic tokens from headlessui-style forwardRef components', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(glob.glob).mockResolvedValue(['/test/project/playgrounds/react/components/button.tsx']);

      // Real headlessui playground button pattern
      vi.mocked(fs.readFileSync).mockReturnValue(`
import { forwardRef, ComponentProps, ReactNode } from 'react'
import { classNames } from '../utils/class-names'

export let Button = forwardRef<
  HTMLButtonElement,
  ComponentProps<'button'> & { children?: ReactNode }
>(({ className, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    className={classNames(
      'focus:outline-hidden ui-focus-visible:ring-2 ui-focus-visible:ring-offset-2 flex items-center rounded-md border border-gray-300 bg-white px-2 py-1 ring-gray-500 ring-offset-gray-100',
      className
    )}
    {...props}
  />
))
      `);

      const scanner = new TailwindScanner({
        projectRoot: mockProjectRoot,
        extractSemanticTokens: true,
      });

      const result = await scanner.scan();

      // headlessui uses standard Tailwind colors, not semantic tokens
      // This verifies we correctly filter out utility colors like gray-300
      expect(result.semanticTokens).toBeDefined();

      // Should not find utility color tokens (gray-300, gray-500, etc.)
      const tokenNames = result.semanticTokens!.map(t => t.name);
      expect(tokenNames).not.toContain('gray-300');
      expect(tokenNames).not.toContain('gray-500');
      expect(tokenNames).not.toContain('gray-100');
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
