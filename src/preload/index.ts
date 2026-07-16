import { contextBridge, ipcRenderer } from 'electron';

export interface ServerStatus {
  state: 'loading' | 'ready' | 'error';
  profileName: string;
  port: number;
  error?: string;
}

contextBridge.exposeInMainWorld('sillyTaily', {
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    onMaximizeChange: (callback: (maximized: boolean) => void) => {
      ipcRenderer.on('window:maximizeChange', (_event, maximized: boolean) => {
        callback(maximized);
      });
    },
  },

  server: {
    onStatusChange: (callback: (status: ServerStatus) => void) => {
      ipcRenderer.on('server:status', (_event, status: ServerStatus) => {
        callback(status);
      });
    },
    onUrl: (callback: (url: string) => void) => {
      ipcRenderer.on('server:url', (_event, url: string) => {
        callback(url);
      });
    },
  },
});
