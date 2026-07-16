const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const NODE_VERSION = '24.18.0';
const NODE_MIRROR = process.env.NODE_MIRROR || 'https://npmmirror.com/mirrors/node';
const BUNDLE_DIR = path.join(__dirname, '../bundle/node');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    console.log('Downloading:', url);

    let redirectedUrl = url;
    const doDownload = (downloadUrl) => {
      https.get(downloadUrl, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          redirectedUrl = response.headers.location;
          doDownload(redirectedUrl);
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}: ${downloadUrl}`));
          return;
        }

        const file = fs.createWriteStream(dest);
        const totalSize = parseInt(response.headers['content-length'], 10);
        let downloadedSize = 0;

        response.on('data', (chunk) => {
          downloadedSize += chunk.length;
          if (totalSize) {
            const pct = ((downloadedSize / totalSize) * 100).toFixed(0);
            process.stdout.write(`\r  Progress: ${pct}% (${(downloadedSize / 1024 / 1024).toFixed(1)} MB)`);
          }
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          console.log('\n  Download complete.');
          resolve();
        });

        file.on('error', (err) => {
          fs.unlinkSync(dest);
          reject(err);
        });
      }).on('error', reject);
    };

    doDownload(url);
  });
}

async function main() {
  const start = Date.now();

  ensureDir(BUNDLE_DIR);

  const dest = path.join(BUNDLE_DIR, 'node.exe');

  if (fs.existsSync(dest)) {
    console.log('Node.js portable already exists at', dest);
    return;
  }

  const arch = process.env.PROCESSOR_ARCHITECTURE === 'AMD64' ? 'x64' : 'x86';
  const fileName = `node-v${NODE_VERSION}-win-${arch}.zip`;
  const url = `${NODE_MIRROR}/v${NODE_VERSION}/${fileName}`;
  const zipPath = path.join(BUNDLE_DIR, fileName);

  try {
    await downloadFile(url, zipPath);

    console.log('Extracting node.exe...');

    // Use PowerShell to extract just node.exe from the zip
    execSync(
      `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${BUNDLE_DIR}' -Force"`,
      { stdio: 'pipe' },
    );

    // Move node.exe from extracted dir
    const extractedDir = path.join(BUNDLE_DIR, `node-v${NODE_VERSION}-win-${arch}`);
    const extractedNode = path.join(extractedDir, 'node.exe');

    if (fs.existsSync(extractedNode)) {
      fs.copyFileSync(extractedNode, dest);
      // Clean up extracted dir and zip
      fs.rmSync(extractedDir, { recursive: true, force: true });
      fs.unlinkSync(zipPath);
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`Node.js v${NODE_VERSION} prepared in ${elapsed}s`);
  } catch (err) {
    console.error('Failed to prepare Node.js:', err.message);
    process.exit(1);
  }
}

main();
