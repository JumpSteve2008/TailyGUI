import { app } from 'electron';
import path from 'path';
import { ChildProcess, spawn } from 'child_process';
import http from 'http';
import type { ProfileContext } from './sandbox';
import { createLogger } from './logger';

const logger = createLogger('STServer');
const MAX_RESTART = 3;
const RESTART_DELAY = 2000;
const STARTUP_TIMEOUT = 30000;

let stProcess: ChildProcess | null = null;
let restartCount = 0;

function getStSrcPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'st-src');
  }
  return path.join(__dirname, '../../vendor/SillyTavern');
}

function getNodePath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'node', 'node.exe');
  }
  return process.execPath;
}

function getStArgs(context: ProfileContext): string[] {
  const stSrc = getStSrcPath();
  const serverJs = path.join(stSrc, 'server.js');

  return [
    serverJs,
    '--dataRoot', context.dataRoot,
    '--configPath', context.configPath,
    '--port', String(context.port),
    '--listen', 'false',
    '--whitelist', 'false',
    '--disableCsrf',
    '--browserLaunchEnabled', 'false',
  ];
}

function healthCheck(port: number, timeout: number = STARTUP_TIMEOUT): Promise<boolean> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const poll = () => {
      if (Date.now() - startTime > timeout) {
        resolve(false);
        return;
      }

      const req = http.get(`http://127.0.0.1:${port}/`, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) {
          resolve(true);
        } else {
          setTimeout(poll, 500);
        }
      });

      req.on('error', () => {
        setTimeout(poll, 500);
      });

      req.setTimeout(3000, () => {
        req.destroy();
        setTimeout(poll, 500);
      });
    };
    poll();
  });
}

export function startServer(context: ProfileContext): Promise<number> {
  return new Promise((resolve, reject) => {
    const stSrc = getStSrcPath();
    const args = getStArgs(context);
    const nodePath = getNodePath();

    logger.info('Starting ST server...');
    logger.info('  Executable:', nodePath);
    logger.info('  Working dir:', stSrc);
    logger.info('  Args:', args.join(' '));

    stProcess = spawn(nodePath, args, {
      cwd: stSrc,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NODE_PATH: app.isPackaged ? path.join(stSrc, 'st-deps', 'node_modules') : path.join(stSrc, 'node_modules'),
        NODE_ENV: 'production',
        PORT: String(context.port),
      },
    });

    let startupResolved = false;

    stProcess.stdout?.on('data', (data: Buffer) => {
      const text = data.toString('utf-8');
      process.stdout.write(`[ST:${context.profileName}] ${text}`);
    });

    stProcess.stderr?.on('data', (data: Buffer) => {
      const text = data.toString('utf-8');
      process.stderr.write(`[ST:${context.profileName}] ${text}`);
    });

    stProcess.on('error', (err) => {
      logger.error('Failed to spawn ST process:', err);
      if (!startupResolved) {
        startupResolved = true;
        reject(err);
      }
    });

    stProcess.on('exit', (code, signal) => {
      logger.info('ST process exited. Code:', code, 'Signal:', signal);

      if (!startupResolved) {
        startupResolved = true;
        reject(new Error(`ST process exited with code ${code} before becoming ready`));
        return;
      }

      if (restartCount < MAX_RESTART && stProcess) {
        restartCount++;
        logger.warn('Auto-restarting ST server', restartCount, '/', MAX_RESTART);
        setTimeout(() => {
          startServer(context).then((port) => {
            logger.info('ST server restarted on port', port);
          }).catch((err) => {
            logger.error('ST server restart failed:', err);
          });
        }, RESTART_DELAY);
      }
    });

    healthCheck(context.port, STARTUP_TIMEOUT).then((ready) => {
      if (startupResolved) return;
      startupResolved = true;

      if (ready) {
        restartCount = 0;
        logger.info('ST server is ready on port', context.port);
        resolve(context.port);
      } else {
        logger.error('ST server startup timed out');
        reject(new Error('ST server failed to start within timeout'));
      }
    });
  });
}

export async function stopServer(): Promise<void> {
  if (!stProcess) return;

  logger.info('Stopping ST server...');

  return new Promise((resolve) => {
    const killTimeout = setTimeout(() => {
      if (stProcess) {
        logger.warn('ST did not exit gracefully, force killing');
        stProcess.kill('SIGKILL');
      }
      resolve();
    }, 5000);

    stProcess!.on('exit', () => {
      clearTimeout(killTimeout);
      logger.info('ST server stopped');
      stProcess = null;
      restartCount = 0;
      resolve();
    });

    stProcess!.kill('SIGTERM');
  });
}

export function getStProcess(): ChildProcess | null {
  return stProcess;
}
