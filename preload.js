const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getDesktopPath: () => ipcRenderer.invoke('system:getDesktopPath'),
  openFiles: () => ipcRenderer.invoke('dialog:openFiles'),
  selectOutput: (defaultName) => ipcRenderer.invoke('dialog:selectOutput', defaultName),
  createArchive: (opts) => ipcRenderer.invoke('archive:create', opts),
});
