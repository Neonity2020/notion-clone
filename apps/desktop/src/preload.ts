import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  openExternal: (url: string) => ipcRenderer.send('app:open-external', url),
  onMenuAction: (callback: (action: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, action: string) => callback(action);
    ipcRenderer.on('menu:action', handler);
    return () => ipcRenderer.removeListener('menu:action', handler);
  },
  db: {
    loadAllPages: () => ipcRenderer.invoke('db:load-all-pages'),
    loadPages: (ids: string[]) => ipcRenderer.invoke('db:load-pages', ids),
    writePages: (put: any[], del: string[]) => ipcRenderer.invoke('db:write-pages', { put, del }),
    clearAll: () => ipcRenderer.invoke('db:clear-all'),
  },
});

// Inject desktop classes immediately and on DOM ready
try {
  document.documentElement.classList.add('is-electron', `platform-${process.platform}`);
} catch {
  // ignore
}

window.addEventListener('DOMContentLoaded', () => {
  document.documentElement.classList.add('is-electron', `platform-${process.platform}`);
  document.body?.classList.add('is-electron', `platform-${process.platform}`);
});
