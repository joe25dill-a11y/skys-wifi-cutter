import { app, BrowserWindow, shell, dialog, Tray, Menu, nativeImage } from 'electron';
import path from 'path';
import http from 'http';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { ensureNpcapInstalled } from '../server/utils/pythonRuntime.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3001;
let mainWindow = null;
let tray = null;
let serverShutdown = null;
let isQuitting = false;

function readAppSettings() {
  try {
    const dataRoot =
      process.env.DATA_ROOT || path.join(app.getPath('userData'), 'data');
    const file = path.join(dataRoot, 'app-settings.json');
    if (!fs.existsSync(file)) {
      return { minimizeToTrayOnClose: true, stopHotspotOnQuit: true };
    }
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return { minimizeToTrayOnClose: true, stopHotspotOnQuit: true };
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.on('second-instance', () => {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
});

function waitForServer(maxAttempts = 80) {
  return new Promise((resolve, reject) => {
    let attempts = 0;

    const check = () => {
      const req = http.get(`http://127.0.0.1:${PORT}/api/health`, (res) => {
        res.resume();
        if (res.statusCode === 200) {
          resolve();
        } else {
          retry();
        }
      });

      req.on('error', retry);
      req.setTimeout(1500, () => {
        req.destroy();
        retry();
      });
    };

    const retry = () => {
      attempts += 1;
      if (attempts >= maxAttempts) {
        reject(new Error('Backend server did not start in time'));
        return;
      }
      setTimeout(check, 400);
    };

    check();
  });
}

async function startEmbeddedServer() {
  process.env.PORT = String(PORT);
  process.env.NODE_ENV = 'production';
  process.env.ELECTRON_APP = '1';

  const appRoot = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar')
    : path.join(__dirname, '..');

  if (app.isPackaged) {
    const userData = app.getPath('userData');
    process.env.RESOURCES_PATH = process.resourcesPath;
    process.env.BUNDLED_PYTHON = path.join(process.resourcesPath, 'python', 'python.exe');
    process.env.NATIVE_METER = path.join(process.resourcesPath, 'native', 'SkysNativeMeter.exe');
    process.env.NATIVE_ENGINE = process.env.NATIVE_METER;
    process.env.WINDIVERT_PATH = path.join(process.resourcesPath, 'windivert');
    process.env.SCRIPTS_ROOT = path.join(process.resourcesPath, 'app.asar.unpacked', 'scripts');
    process.env.DIST_ROOT = path.join(process.resourcesPath, 'app.asar.unpacked', 'dist');
    process.env.DATA_ROOT = path.join(userData, 'data');
    process.env.LOGS_ROOT = path.join(userData, 'logs');
  }

  const serverEntry = path.join(appRoot, 'server', 'index.js');
  const { startServer, shutdown } = await import(pathToFileURL(serverEntry).href);
  const handle = await startServer(PORT);
  serverShutdown = shutdown;
  return handle;
}

async function gracefulShutdown() {
  if (isQuitting) return;
  isQuitting = true;

  if (mainWindow) {
    mainWindow.removeAllListeners('close');
    mainWindow.destroy();
    mainWindow = null;
  }

  if (tray) {
    tray.destroy();
    tray = null;
  }

  if (serverShutdown) {
    try {
      await serverShutdown();
    } catch (error) {
      console.error('Shutdown error:', error);
    }
    serverShutdown = null;
  }
}

function resolveTrayIcon() {
  const roots = [];

  if (app.isPackaged) {
    roots.push(
      path.join(process.resourcesPath, 'app.asar.unpacked', 'dist'),
      path.join(process.resourcesPath, 'app.asar.unpacked', 'public'),
      path.join(process.resourcesPath, 'public')
    );
  } else {
    roots.push(
      path.join(__dirname, '..', 'public'),
      path.join(__dirname, '..', 'dist')
    );
  }

  const names = [
    'tray-icon-32.png',
    'tray-icon-24.png',
    'tray-icon-48.png',
    'tray-icon-64.png',
    'tray-icon.png',
    'tray-icon-16.png',
    'icon.png',
    'icon.ico'
  ];

  for (const root of roots) {
    for (const name of names) {
      const candidate = path.join(root, name);
      if (!fs.existsSync(candidate)) continue;

      const icon = nativeImage.createFromPath(candidate);
      if (!icon.isEmpty()) {
        const size = name.includes('16') ? 16 : name.includes('24') ? 24 : 32;
        return icon.resize({ width: size, height: size });
      }
    }
  }

  // SVG last — often blank in the Windows notification area.
  for (const root of roots) {
    const svg = path.join(root, 'icon.svg');
    if (!fs.existsSync(svg)) continue;
    const icon = nativeImage.createFromPath(svg);
    if (!icon.isEmpty()) {
      return icon.resize({ width: 16, height: 16 });
    }
  }

  // Embedded fallback so the tray slot is never invisible.
  const fallback =
    'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAA' +
    'pJREFUWEdtlj0OwjAMha9pK0JdGBg4A0fgCBwBqRsH4AgcgQtwBap0YODnJ05iO3ES' +
    'f9I7v2zLgSAi+oBz7gEAmJkBAMzMAGBmBgAzMwCYmQHAzAwAZmYAMDMDgJkZAMzM' +
    'AGBmBgAzMwCYmQHAzAwA/wc8AF8bXQqGZ8V8AAAAAElFTkSuQmCC';
  return nativeImage.createFromDataURL(`data:image/png;base64,${fallback}`);
}

function createTray() {
  tray = new Tray(resolveTrayIcon());
  tray.setToolTip('Skys WiFi Cutter');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Skys WiFi Cutter',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createWindow();
        }
      }
    },
    {
      label: 'Scan network',
      click: async () => {
        try {
          await fetch(`http://127.0.0.1:${PORT}/api/devices/refresh`, { method: 'POST' });
        } catch {
          // ignore
        }
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function readTrayTipShown() {
  try {
    const flag = path.join(app.getPath('userData'), 'tray-tip-shown');
    return fs.existsSync(flag);
  } catch {
    return true;
  }
}

function markTrayTipShown() {
  try {
    fs.writeFileSync(path.join(app.getPath('userData'), 'tray-tip-shown'), new Date().toISOString());
  } catch {
    // ignore
  }
}

function createWindow() {
  const windowIcon = resolveTrayIcon();
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: 'Skys WiFi Cutter',
    icon: windowIcon,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadURL(`http://127.0.0.1:${PORT}`);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('close', (event) => {
    const settings = readAppSettings();
    const minimizeToTray = settings.minimizeToTrayOnClose !== false;
    if (!isQuitting && process.platform === 'win32' && tray && minimizeToTray) {
      event.preventDefault();
      mainWindow.hide();
      if (tray && !readTrayTipShown()) {
        markTrayTipShown();
        tray.displayBalloon({
          title: 'Skys WiFi Cutter',
          content:
            'Still running in the tray. Right-click the icon → Quit to fully exit. Hotspot may stay on until you stop it. Change X behavior in Tools → Settings.'
        });
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  try {
    if (app.isPackaged) {
      process.env.RESOURCES_PATH = process.resourcesPath;
      await ensureNpcapInstalled();
    }
    await startEmbeddedServer();
    await waitForServer();
    createTray();
    createWindow();
  } catch (error) {
    console.error('Failed to launch Skys WiFi Cutter:', error);
    dialog.showErrorBox(
      'Skys WiFi Cutter failed to start',
      error?.message || String(error)
    );
    app.quit();
  }
});

app.on('before-quit', (event) => {
  if (isQuitting) return;
  event.preventDefault();
  gracefulShutdown().finally(() => {
    app.exit(0);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && isQuitting) {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null && app.isReady()) {
    createWindow();
  } else if (mainWindow) {
    mainWindow.show();
  }
});
