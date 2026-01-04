// Main plugin code - runs in Figma's sandbox
// This file has access to Figma API but NOT the DOM

figma.showUI(__html__, {
  width: 300,
  height: 500,
  themeColors: true,
});

// Handle messages from the UI
figma.ui.onmessage = (msg: { type: string; payload?: unknown }) => {
  switch (msg.type) {
    case 'close':
      figma.closePlugin();
      break;
    case 'notify':
      figma.notify(msg.payload as string);
      break;
    case 'copy':
      // Can't copy to clipboard from sandbox, but we can notify
      figma.notify('Copied to clipboard!');
      break;
  }
};
