import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { createLogger } from './logger';
import { registerIpcHandlers } from './ipc';
import { setupProfile, releaseLock, type ProfileContext } from './sandbox';
import { startServer, stopServer } from './st-server';

const logger = createLogger('Main');

interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized: boolean;
}

let store: any = null;

async function initStore(): Promise<void> {
  const Store = (await import('electron-store')).default;
  store = new Store<{ windowState: WindowState; lastProfile: string }>({
    defaults: {
      windowState: { width: 1280, height: 800, isMaximized: false },
      lastProfile: 'default',
    },
  });
}

let mainWindow: BrowserWindow | null = null;
let currentProfile: ProfileContext | null = null;

function parseProfileName(): string {
  const args = process.argv;
  const profileIndex = args.indexOf('--profile');
  if (profileIndex !== -1 && profileIndex + 1 < args.length) {
    return args[profileIndex + 1];
  }
  return store?.get('lastProfile', 'default') ?? 'default';
}

function getRendererPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'renderer', 'index.html');
  }
  return path.join(__dirname, '../renderer/index.html');
}

function getPreloadPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'preload', 'index.js');
  }
  return path.join(__dirname, '../preload/index.js');
}

function createWindow(): BrowserWindow {
  const savedState: WindowState = store?.get('windowState') ?? { width: 1280, height: 800, isMaximized: false };

  const win = new BrowserWindow({
    x: savedState.x,
    y: savedState.y,
    width: savedState.width || 1280,
    height: savedState.height || 800,
    minWidth: 1024,
    minHeight: 700,
    frame: false,
    backgroundColor: '#1f1f1f',
    titleBarStyle: 'hidden',
    show: false,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false,
    },
  });

  if (savedState.isMaximized) {
    win.maximize();
  }

  win.loadFile(getRendererPath());

  win.once('ready-to-show', () => {
    win.show();
    if (currentProfile) {
      win.webContents.send('server:status', {
        state: 'loading',
        profileName: currentProfile.profileName,
        port: currentProfile.port,
      });
    }
  });

  win.on('maximize', () => {
    win.webContents.send('window:maximizeChange', true);
  });
  win.on('unmaximize', () => {
    win.webContents.send('window:maximizeChange', false);
  });

  win.on('close', () => {
    const bounds = win.getBounds();
    const isMaximized = win.isMaximized();
    store?.set('windowState', {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      isMaximized,
    });
  });

  win.on('closed', () => {
    mainWindow = null;
  });

  return win;
}

function ipcMainBroadcast(channel: string, ...args: unknown[]): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args);
  }
}

async function startApp(): Promise<void> {
  const profileName = parseProfileName();
  logger.info('Starting with profile:', profileName);

  const result = await setupProfile(profileName);

  if (result.conflict && result.existingLock) {
    logger.warn('Profile already running, attempting to activate existing window');
    app.quit();
    return;
  }

  currentProfile = result.context;
  store?.set('lastProfile', profileName);

  mainWindow = createWindow();
  registerIpcHandlers(() => mainWindow);

  ipcMainBroadcast('server:status', {
    state: 'loading',
    profileName: currentProfile.profileName,
    port: currentProfile.port,
  });

  try {
    await startServer(currentProfile);

    ipcMainBroadcast('server:status', {
      state: 'ready',
      profileName: currentProfile.profileName,
      port: currentProfile.port,
    });

    mainWindow.webContents.send('server:url', `http://127.0.0.1:${currentProfile.port}/`);
  } catch (err) {
    logger.error('Failed to start ST server:', err);

    ipcMainBroadcast('server:status', {
      state: 'error',
      profileName: currentProfile.profileName,
      port: currentProfile.port,
      error: String(err),
    });
  }
}

async function shutdownApp(): Promise<void> {
  logger.info('Shutting down...');

  await stopServer();

  if (currentProfile) {
    releaseLock(currentProfile.profileName);
    currentProfile = null;
  }
}

app.whenReady().then(async () => {
  logger.info('App ready');

  await initStore();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      startApp();
    }
  });

  startApp().catch((err) => {
    logger.error('App startup failed:', err);
  });
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('before-quit', async (event) => {
  event.preventDefault();
  await shutdownApp();
  app.exit();
});
