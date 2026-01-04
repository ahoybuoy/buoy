import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes('--watch');

// Build the main plugin code (runs in Figma sandbox)
const mainBuild = {
  entryPoints: [join(__dirname, 'src/main.ts')],
  bundle: true,
  outfile: join(__dirname, 'dist/code.js'),
  format: 'iife',
  target: 'es2020',
  minify: !watch,
};

// Build the UI code
const uiBuild = {
  entryPoints: [join(__dirname, 'src/ui.tsx')],
  bundle: true,
  outfile: join(__dirname, 'dist/ui.js'),
  format: 'iife',
  target: 'es2020',
  minify: !watch,
  jsxFactory: 'h',
  jsxFragment: 'Fragment',
  define: {
    'process.env.NODE_ENV': watch ? '"development"' : '"production"',
  },
};

async function build() {
  // Ensure dist directory exists
  mkdirSync(join(__dirname, 'dist'), { recursive: true });

  if (watch) {
    // Watch mode
    const mainCtx = await esbuild.context(mainBuild);
    const uiCtx = await esbuild.context(uiBuild);

    await Promise.all([mainCtx.watch(), uiCtx.watch()]);

    console.log('Watching for changes...');

    // Initial build of HTML
    buildHtml();
  } else {
    // Production build
    await Promise.all([esbuild.build(mainBuild), esbuild.build(uiBuild)]);

    // Build HTML with inlined JS
    buildHtml();

    console.log('Build complete!');
  }
}

function buildHtml() {
  // Read the HTML template
  const htmlTemplate = readFileSync(join(__dirname, 'src/ui.html'), 'utf8');

  // For production, inline the JS
  let html = htmlTemplate;

  try {
    const uiJs = readFileSync(join(__dirname, 'dist/ui.js'), 'utf8');
    // Replace the script src with inline script
    html = html.replace(
      '<script src="ui.js"></script>',
      `<script>${uiJs}</script>`
    );
  } catch {
    // ui.js doesn't exist yet during first watch build
  }

  writeFileSync(join(__dirname, 'dist/ui.html'), html);
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
