import { contextBridge, ipcRenderer } from 'electron';

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
});
