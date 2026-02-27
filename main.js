const { app, BrowserWindow, dialog, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const archiver = require('archiver');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 820,
    height: 520,
    minWidth: 500,
    minHeight: 300,
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    title: 'ArchivE',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(createWindow);

// Remove application menu
Menu.setApplicationMenu(null);

app.on('window-all-closed', () => {
  app.quit();
});

// ── IPC handlers ────────────────────────────────────────────

ipcMain.handle('system:getDesktopPath', async () => {
  return path.join(os.homedir(), 'Desktop');
});

ipcMain.handle('dialog:openFiles', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
  });
  return canceled ? [] : filePaths;
});

ipcMain.handle('dialog:selectOutput', async (_event, defaultName) => {
  const ext = path.extname(defaultName).replace('.', '');

  const filterMap = {
    zip: { name: 'ZIP archive', extensions: ['zip'] },
    tar: { name: 'TAR archive', extensions: ['tar'] },
    gz:  { name: 'TAR.GZ archive', extensions: ['tar.gz'] },
  };

  const filter = filterMap[ext] || filterMap['zip'];

  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName,
    filters: [filter],
  });
  return canceled ? null : filePath;
});

ipcMain.handle('archive:create', async (_event, { files, outputPath, format }) => {
  return new Promise((resolve, reject) => {
    if (!files || files.length === 0) {
      return reject(new Error('No files selected'));
    }

    const output = fs.createWriteStream(outputPath);

    let archiverFormat;
    let archiverOptions = {};

    switch (format) {
      case 'tar.gz':
        archiverFormat = 'tar';
        archiverOptions = { gzip: true };
        break;
      case 'tar':
        archiverFormat = 'tar';
        break;
      case 'zip':
      default:
        archiverFormat = 'zip';
        archiverOptions = { zlib: { level: 9 } };
        break;
    }

    const archive = archiver(archiverFormat, archiverOptions);

    output.on('close', () => {
      resolve({ success: true, bytes: archive.pointer() });
    });

    archive.on('error', (err) => {
      reject(err);
    });

    archive.pipe(output);

    for (const filePath of files) {
      archive.file(filePath, { name: path.basename(filePath) });
    }

    archive.finalize();
  });
});
