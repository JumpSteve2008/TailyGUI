const fs = require('fs');
const path = require('path');

const stDir = path.join(__dirname, '../vendor/SillyTavern');

// Patch 1: webpack.config.js - replace shake256 with sha256 (Node 24 compatibility)
const webpackConfigPath = path.join(stDir, 'webpack.config.js');
let webpackContent = fs.readFileSync(webpackConfigPath, 'utf-8');
if (webpackContent.includes("crypto.createHash('shake256'")) {
  webpackContent = webpackContent.replace(
    "crypto.createHash('shake256', { outputLength: 8 })",
    "crypto.createHash('sha256')",
  );
  webpackContent = webpackContent.replace(
    ".digest('hex')",
    ".digest('hex').substring(0, 16)",
  );
  fs.writeFileSync(webpackConfigPath, webpackContent);
  console.log('[PATCH] Fixed crypto hash in webpack.config.js');
} else {
  console.log('[PATCH] webpack.config.js already patched');
}

// Patch 2: server-main.js - disable helmet frameguard (allows WebContentsView embedding)
const serverMainPath = path.join(stDir, 'src', 'server-main.js');
let serverMainContent = fs.readFileSync(serverMainPath, 'utf-8');
if (!serverMainContent.includes('frameguard: false')) {
  serverMainContent = serverMainContent.replace(
    'contentSecurityPolicy: false,',
    'contentSecurityPolicy: false,\n    frameguard: false,',
  );
  fs.writeFileSync(serverMainPath, serverMainContent);
  console.log('[PATCH] Disabled frameguard in server-main.js');
} else {
  console.log('[PATCH] server-main.js already patched');
}

console.log('ST patches applied successfully.');
