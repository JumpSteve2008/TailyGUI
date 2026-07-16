import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import net from 'net';
import os from 'os';
import { createLogger } from './logger';

const logger = createLogger('Sandbox');

const APP_DATA_ROOT = path.join(app.getPath('appData'), 'sillyTaily');
const PROFILES_DIR = path.join(APP_DATA_ROOT, 'profiles');
const START_PORT = 8000;
const LOCK_STALE_MS = 24 * 60 * 60 * 1000; // 24 hours

interface LockData {
  pid: number;
  port: number;
  timestamp: number;
  hostname: string;
}

interface ProfileRegistry {
  version: number;
  profiles: Record<string, {
    name: string;
    createdAt: string;
    lastUsedAt: string;
    lastPort: number;
  }>;
}

export interface ProfileContext {
  profileName: string;
  port: number;
  dataRoot: string;
  configPath: string;
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readLockFile(lockPath: string): LockData | null {
  try {
    const raw = fs.readFileSync(lockPath, 'utf-8');
    return JSON.parse(raw) as LockData;
  } catch {
    return null;
  }
}

function writeLockFile(lockPath: string, data: LockData): void {
  const dir = path.dirname(lockPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(lockPath, JSON.stringify(data, null, 2), 'utf-8');
}

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function readRegistry(): ProfileRegistry {
  const registryPath = path.join(APP_DATA_ROOT, 'profiles.json');
  try {
    const raw = fs.readFileSync(registryPath, 'utf-8');
    return JSON.parse(raw) as ProfileRegistry;
  } catch {
    return { version: 1, profiles: {} };
  }
}

function writeRegistry(registry: ProfileRegistry): void {
  ensureDir(APP_DATA_ROOT);
  fs.writeFileSync(
    path.join(APP_DATA_ROOT, 'profiles.json'),
    JSON.stringify(registry, null, 2),
    'utf-8',
  );
}

function updateRegistry(profileName: string, port: number): void {
  const registry = readRegistry();
  const now = new Date().toISOString();
  if (registry.profiles[profileName]) {
    registry.profiles[profileName].lastUsedAt = now;
    registry.profiles[profileName].lastPort = port;
  } else {
    registry.profiles[profileName] = {
      name: profileName.charAt(0).toUpperCase() + profileName.slice(1),
      createdAt: now,
      lastUsedAt: now,
      lastPort: port,
    };
  }
  writeRegistry(registry);
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true));
    });
  });
}

async function findAvailablePort(startPort: number): Promise<number> {
  let port = startPort;
  while (port < startPort + 1000) {
    if (await isPortAvailable(port)) {
      return port;
    }
    port++;
  }
  throw new Error('No available port found in range ' + startPort + ' - ' + (startPort + 1000));
}

export function acquireLock(profileName: string): LockData | null {
  const profileDir = path.join(PROFILES_DIR, profileName);
  const lockPath = path.join(profileDir, '.lock');
  const existingLock = readLockFile(lockPath);

  if (existingLock) {
    if (isPidAlive(existingLock.pid)) {
      return existingLock;
    }

    const age = Date.now() - existingLock.timestamp;
    if (existingLock.pid === 0 || age > LOCK_STALE_MS) {
      logger.warn('Cleaning stale lock for profile', profileName, '(age:', age, 'ms)');
    } else {
      logger.warn('Dead PID in lock, cleaning:', existingLock.pid);
    }
  }

  return null;
}

export function writeLock(profileName: string, port: number): void {
  const profileDir = path.join(PROFILES_DIR, profileName);
  const lockPath = path.join(profileDir, '.lock');
  const lockData: LockData = {
    pid: process.pid,
    port,
    timestamp: Date.now(),
    hostname: os.hostname(),
  };
  writeLockFile(lockPath, lockData);
}

export function releaseLock(profileName: string): void {
  const lockPath = path.join(PROFILES_DIR, profileName, '.lock');
  try {
    if (fs.existsSync(lockPath)) {
      fs.unlinkSync(lockPath);
      logger.info('Lock released for profile', profileName);
    }
  } catch (err) {
    logger.error('Error releasing lock:', err);
  }
}

export function ensureProfileDirs(profileName: string): void {
  const profileDir = path.join(PROFILES_DIR, profileName);
  const dataDir = path.join(profileDir, 'data');
  ensureDir(profileDir);
  ensureDir(dataDir);
}

export function initProfileConfig(profileName: string): void {
  const profileDir = path.join(PROFILES_DIR, profileName);
  const targetConfig = path.join(profileDir, 'config.yaml');

  if (!fs.existsSync(targetConfig)) {
    const defaultConfigPath = path.join(
      app.isPackaged
        ? path.join(process.resourcesPath, 'st-src', 'default', 'config.yaml')
        : path.join(__dirname, '../../vendor/SillyTavern/default/config.yaml'),
    );

    if (fs.existsSync(defaultConfigPath)) {
      fs.copyFileSync(defaultConfigPath, targetConfig);
      logger.info('Initialized config.yaml for profile', profileName);
    } else {
      logger.warn('Default config.yaml not found, profile will create its own');
    }
  }
}

export async function allocatePort(profileName: string): Promise<number> {
  const lockPath = path.join(PROFILES_DIR, profileName, '.lock');
  const existingLock = readLockFile(lockPath);

  if (existingLock && existingLock.port > 0) {
    if (await isPortAvailable(existingLock.port)) {
      logger.info('Reusing last port for', profileName, ':', existingLock.port);
      return existingLock.port;
    }
  }

  const registry = readRegistry();
  const savedPort = registry.profiles[profileName]?.lastPort;
  if (savedPort && savedPort > 0) {
    if (await isPortAvailable(savedPort)) {
      logger.info('Reusing registry port for', profileName, ':', savedPort);
      return savedPort;
    }
  }

  const port = await findAvailablePort(START_PORT);
  logger.info('Allocated new port for', profileName, ':', port);
  return port;
}

export function buildProfileContext(profileName: string, port: number): ProfileContext {
  const profileDir = path.join(PROFILES_DIR, profileName);
  return {
    profileName,
    port,
    dataRoot: path.join(profileDir, 'data'),
    configPath: path.join(profileDir, 'config.yaml'),
  };
}

export async function setupProfile(profileName: string): Promise<{ context: ProfileContext; conflict: boolean; existingLock?: LockData }> {
  const existingLock = acquireLock(profileName);

  if (existingLock) {
    return { context: null as unknown as ProfileContext, conflict: true, existingLock };
  }

  ensureProfileDirs(profileName);
  initProfileConfig(profileName);

  const port = await allocatePort(profileName);
  writeLock(profileName, port);
  updateRegistry(profileName, port);

  const context = buildProfileContext(profileName, port);
  logger.info('Profile setup complete:', profileName, 'port:', port);

  return { context, conflict: false };
}
