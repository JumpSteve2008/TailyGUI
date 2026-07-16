const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '../vendor/SillyTavern');
const dest = path.join(__dirname, '../bundle/st-src');

const EXCLUDE = [
  /[\\/]\.git[\\/]/,
  /[\\/]\.git$/,
  /[\\/]\.gitignore$/,
  /[\\/]\.gitattributes$/,
  /[\\/]\.github[\\/]/,
  /[\\/]node_modules[\\/]\.cache[\\/]/,
  /[\\/]\.eslintrc/,
  /[\\/]\.prettierrc/,
  /\.map$/,
  /\.ts$/,
  /\.d\.ts$/,
  /[\\/]test[\\/]/,
  /[\\/]tests[\\/]/,
  /[\\/]__tests__[\\/]/,
  /[\\/]docs[\\/]/,
  /[\\/]\.vscode[\\/]/,
  /[\\/]\.idea[\\/]/,
  /[\\/]Dockerfile/,
  /[\\/]docker-compose/,
  /[\\/]\.dockerignore/,
  /[\\/]tsconfig/,
  /[\\/]\.npmrc/,
  /LICENSE$/,
  /CHANGELOG/,
];

function shouldExclude(relativePath) {
  return EXCLUDE.some((pattern) => pattern.test(relativePath));
}

function copyDir(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return;

  fs.mkdirSync(destDir, { recursive: true });

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const relative = path.relative(src, srcPath);

    if (shouldExclude(relative)) {
      continue;
    }

    if (entry.isDirectory()) {
      // Rename node_modules to st-deps to bypass electron-builder's default exclude
      const destName = entry.name === 'node_modules' ? 'st-deps' : entry.name;
      const destPath = path.join(destDir, destName);
      copyDir(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, path.join(destDir, entry.name));
    }
  }
}

function main() {
  const start = Date.now();

  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true });
  }

  console.log('Copying ST source to bundle/st-src/ (node_modules -> st-deps)...');
  copyDir(src, dest);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`Done in ${elapsed}s`);
}

main();
