const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  pickSavePath: () => ipcRenderer.invoke('pick-save-path'),
  saveProjectJson: (params) => ipcRenderer.invoke('save-project-json', params),
  exportVideo: (params) => ipcRenderer.invoke('export-video', params),
  checkFfmpeg: () => ipcRenderer.invoke('check-ffmpeg'),
  onExportProgress: (callback) => {
    ipcRenderer.on('export-progress', (_event, progress) => callback(progress));
  },
  removeExportProgress: () => {
    ipcRenderer.removeAllListeners('export-progress');
  },
});
