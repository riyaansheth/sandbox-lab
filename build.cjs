const fs = require('node:fs');
const path = require('node:path');
const files = ['index.html', 'style.css', 'app.js', 'engine.js', 'items.js', 'art.js', 'body.js', 'vendor/matter.min.js', 'vendor/MATTER-LICENSE.txt', 'README.md'];
for (const file of files) {
  const target = path.join(__dirname, 'dist', file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(__dirname, file), target);
}
console.log('Built standalone game in dist/ — open dist/index.html to play.');
