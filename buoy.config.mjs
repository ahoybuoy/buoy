/** @type {import('@buoy/cli').BuoyConfig} */
export default {
  project: {
    name: 'buoy',
  },
  sources: {
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
