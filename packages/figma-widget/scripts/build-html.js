const fs = require('fs');
const path = require('path');

// Read the built JS
const jsPath = path.join(__dirname, '../dist/ui.js');
const js = fs.readFileSync(jsPath, 'utf8');

// Read CSS if it exists
let css = '';
const cssPath = path.join(__dirname, '../dist/ui.css');
if (fs.existsSync(cssPath)) {
  css = fs.readFileSync(cssPath, 'utf8');
}

// Create HTML with inlined JS and CSS (Figma requires single file)
const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 12px;
      color: #1C1917;
      background: #FFFFFF;
    }
    ${css}
  </style>
</head>
<body>
  <div id="root"></div>
  <script>${js}</script>
</body>
</html>`;

fs.writeFileSync(path.join(__dirname, '../dist/ui.html'), html);
console.log('Built ui.html');
