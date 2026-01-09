/** @type {import('@buoy-design/cli').BuoyConfig} */
export default {
  project: {
    name: 'buoy',
  },
  sources: {
    react: {
      enabled: true,
      include: [
        'apps/figma-plugin/src/**/*.tsx',
        'apps/dashboard/src/**/*.tsx',
        'packages/figma-widget/src/**/*.tsx',
      ],
      exclude: ['**/*.test.tsx', '**/*.stories.tsx'],
    },
    tokens: {
      enabled: true,
      files: [
        'apps/dashboard/src/**/*.css',
        'packages/figma-widget/src/**/*.css',
      ],
    },
    figma: {
      enabled: false,
      // accessToken: process.env.FIGMA_ACCESS_TOKEN,
      // fileKeys: [],
    },
  },
  output: {
    format: 'table',
    colors: true,
  },
};
