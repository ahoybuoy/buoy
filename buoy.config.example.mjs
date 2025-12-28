/** @type {import('@buoy/cli').BuoyConfig} */
export default {
  project: {
    name: 'my-design-system',
    // apiEndpoint: 'https://api.buoy.design',
  },

  sources: {
    react: {
      enabled: true,
      include: ['src/components/**/*.tsx', 'src/**/*.tsx'],
      exclude: ['**/*.test.tsx', '**/*.spec.tsx', '**/*.stories.tsx'],
      // Package containing your design system components
      // designSystemPackage: '@mycompany/design-system',
    },

    figma: {
      enabled: false,
      // Get your access token from: https://www.figma.com/developers/api#access-tokens
      // accessToken: process.env.FIGMA_ACCESS_TOKEN,
      // File keys from Figma URLs: https://www.figma.com/file/[FILE_KEY]/...
      fileKeys: [],
      // Page name containing components (default: 'Components')
      componentPageName: 'Components',
    },

    storybook: {
      enabled: false,
      // URL of running Storybook instance
      // url: 'http://localhost:6006',
      // Or path to static Storybook build
      // staticDir: './storybook-static',
    },

    tokens: {
      enabled: true,
      // Paths to token files (JSON, CSS, SCSS)
      files: [
        // 'src/tokens/colors.json',
        // 'src/styles/variables.css',
      ],
      // Only scan CSS variables with this prefix
      // cssVariablePrefix: '--ds-',
    },
  },

  drift: {
    // Patterns to ignore during drift detection
    ignore: [
      // { type: 'deprecated-pattern', pattern: 'Legacy.*' },
      // { type: 'naming-inconsistency', pattern: 'internal.*', reason: 'Internal components exempt' },
    ],
    // Override default severity levels
    severity: {
      // 'accessibility-conflict': 'critical',
      // 'naming-inconsistency': 'info',
    },
  },

  // Claude integration (Phase 4)
  claude: {
    enabled: false,
    model: 'claude-sonnet-4-20250514',
    autoExplain: {
      enabled: false,
      minSeverity: 'warning',
    },
  },

  output: {
    format: 'table', // 'table' | 'json' | 'markdown'
    colors: true,
  },
};
