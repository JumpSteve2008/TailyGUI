import { BrowserWindow, ipcMain } from 'electron';

export function registerIpcHandlers(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.on('window:minimize', () => {
    getMainWindow()?.minimize();
  });

  ipcMain.on('window:maximize', () => {
    const win = getMainWindow();
    if (win?.isMaximized()) {
      win.unmaximize();
    } else {
      win?.maximize();
    }
  });

  ipcMain.on('window:close', () => {
    getMainWindow()?.close();
  });

  ipcMain.handle('window:isMaximized', () => {
    return getMainWindow()?.isMaximized() ?? false;
  });

  ipcMain.on('app:quit', () => {
    const { app } = require('electron');
    app.quit();
  });
}
