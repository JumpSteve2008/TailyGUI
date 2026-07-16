const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '../src/renderer');
const dest = path.join(__dirname, '../dist/renderer');

// Clean and recreate
if (fs.existsSync(dest)) {
  fs.rmSync(dest, { recursive: true });
}
fs.mkdirSync(dest, { recursive: true });

// Copy all files
const files = fs.readdirSync(src);
for (const file of files) {
  const srcPath = path.join(src, file);
  const destPath = path.join(dest, file);
  if (fs.statSync(srcPath).isFile()) {
    fs.copyFileSync(srcPath, destPath);
  }
}

console.log('Renderer files copied to dist/renderer/');
