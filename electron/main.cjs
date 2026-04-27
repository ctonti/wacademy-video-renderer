const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { exportVideo } = require('./ffmpeg.cjs');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    backgroundColor: '#0c0c0f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // In dev, load from Vite dev server
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ═══ IPC HANDLERS ═══

// Pick output file

ipcMain.handle('save-project-json', async (event, { defaultName, content }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Salva Progetto JSON W.Academy',
    defaultPath: defaultName,
    filters: [{ name: 'JSON Project', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePath) return { success: false };
  const fs = require('fs');
  fs.writeFileSync(result.filePath, content, 'utf-8');
  return { success: true, path: result.filePath };
});

ipcMain.handle('pick-save-path', async () => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Esporta Video MP4',
    defaultPath: 'lezione.mp4',
    filters: [{ name: 'Video MP4', extensions: ['mp4'] }],
  });
  return result.canceled ? null : result.filePath;
});

// Export video
ipcMain.handle('export-video', async (event, { scenes, backgroundPath, outputPath }) => {
  try {
    // Resolve absolute path for background
    // backgroundPath is like "/background_1080p.png"
    let absBackgroundPath = backgroundPath;

    // Only resolve locally if it's a local static asset
    if (!backgroundPath.startsWith('http')) {
      if (process.env.VITE_DEV_SERVER_URL) {
        absBackgroundPath = path.join(__dirname, '../public', backgroundPath);
      } else {
        const asarPath = path.join(__dirname, '../dist', backgroundPath);
        const fs = require('fs');
        const os = require('os');
        
        const cacheDir = path.join(os.homedir(), 'VideoRenderer', 'cache');
        fs.mkdirSync(cacheDir, { recursive: true });
        
        absBackgroundPath = path.join(cacheDir, 'bg_cached.png');
        if (fs.existsSync(asarPath)) {
          fs.copyFileSync(asarPath, absBackgroundPath);
        }
      }
    }

    await exportVideo({
      scenes,
      backgroundPath: absBackgroundPath,
      outputPath,
      onProgress: (progress) => {
        mainWindow.webContents.send('export-progress', progress);
      },
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Check ffmpeg
ipcMain.handle('check-ffmpeg', async () => {
  const { execSync } = require('child_process');
  try {
    const version = execSync('ffmpeg -version').toString().split('\n')[0];
    return { available: true, version };
  } catch {
    return { available: false, version: null };
  }
});
