import { app, BrowserWindow, Menu, MenuItemConstructorOptions, shell, ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import {
  initDatabase,
  loadAllPagesFromDb,
  loadPagesFromDb,
  writePagesToDb,
  clearAllPagesFromDb,
  type PagePayload,
} from './db';

if (app) {
  app.name = 'NotionClone';
}

let mainWindow: BrowserWindow | null = null;

/**
 * Root of the running Electron app.
 *
 * `__dirname` must not be used here: Bun's bundler rewrites it to the source
 * folder of the machine that produced the bundle, which breaks packaged apps
 * on any other machine. `app.getAppPath()` is resolved at runtime instead.
 */
function appRoot(): string {
  try {
    return app.getAppPath();
  } catch {
    return process.cwd();
  }
}

function getPreloadPath(): string {
  const root = appRoot();
  const candidates = [
    path.join(root, 'dist/preload.js'),
    path.join(root, 'preload.js'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

/** Static renderer entry, packaged inside the app directory as `dist/renderer`. */
function getRendererEntry(): string | null {
  const root = appRoot();
  const candidates = [
    path.join(root, 'dist/renderer/desktop.html'),
    // Development fallback: renderer built in place by the web app.
    path.join(root, '..', 'web', 'dist-desktop', 'desktop.html'),
    // Legacy packaged layout, where the web workspace shipped as a dependency.
    path.join(root, 'node_modules', '@notion-clone', 'web', 'dist-desktop', 'desktop.html'),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

function checkDevServer(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      resolve(res.statusCode === 200 || res.statusCode === 304);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function createWindow() {
  const isMac = process.platform === 'darwin';

  mainWindow = new BrowserWindow({
    width: 1240,
    height: 840,
    minWidth: 840,
    minHeight: 560,
    title: 'Notion Clone',
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: isMac ? { x: 16, y: 16 } : undefined,
    backgroundColor: '#ffffff',
    show: false,
    webPreferences: {
      preload: getPreloadPath(),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  mainWindow.webContents.on('preload-error', (event, preloadPath, error) => {
    console.error('PRELOAD_ERROR at', preloadPath, error);
  });

  mainWindow.webContents.on('console-message', (event, ...rest) => {
    // Electron >= 37 exposes the payload on the event object; the positional
    // arguments are deprecated and removed in a future release.
    const detail = rest[0] && typeof rest[0] === 'object' ? rest[0] : (event as any);
    const message = detail?.message ?? String(event ?? '');
    console.log('[Renderer Console]', message);
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
  const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');

  let loaded = false;
  if (isDev) {
    const hasDevServer = await checkDevServer(devServerUrl);
    if (hasDevServer) {
      await mainWindow.loadURL(devServerUrl);
      mainWindow.webContents.openDevTools({ mode: 'detach' });
      loaded = true;
    }
  }

  if (!loaded) {
    const targetFile = getRendererEntry();
    if (targetFile) {
      console.log('[main] renderer entry:', targetFile);
      await mainWindow.loadFile(targetFile);
    } else {
      // If the renderer build is missing, show guidance or try the dev server
      console.warn('[main] renderer build not found under', appRoot());
      try {
        await mainWindow.loadURL(devServerUrl);
      } catch {
        await mainWindow.loadURL(
          `data:text/html;charset=utf-8,${encodeURIComponent(
            '<div style="font-family:sans-serif;padding:40px;text-align:center;"><h2>Web 构建未找到</h2><p>请先运行 <code>bun run build</code> 构建前端，或运行 <code>bun run dev</code> 启动 Vite 开发服务。</p></div>',
          )}`,
        );
      }
    }
  }

  setupMenu();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function setupMenu() {
  const isMac = process.platform === 'darwin';

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),
    {
      label: '文件',
      submenu: [
        {
          label: '新建页面',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow?.webContents.send('menu:action', 'new-page'),
        },
        { type: 'separator' },
        isMac ? { role: 'close' as const } : { role: 'quit' as const },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        { role: 'selectAll' as const },
      ],
    },
    {
      label: '视图',
      submenu: [
        {
          label: '切换 AI Agent 侧边栏',
          accelerator: 'CmdOrCtrl+J',
          click: () => mainWindow?.webContents.send('menu:action', 'toggle-agent'),
        },
        {
          label: '切换目录侧边栏',
          accelerator: 'CmdOrCtrl+\\',
          click: () => mainWindow?.webContents.send('menu:action', 'toggle-sidebar'),
        },
        { type: 'separator' },
        { role: 'reload' as const },
        { role: 'forceReload' as const },
        { role: 'toggleDevTools' as const },
        { type: 'separator' },
        { role: 'resetZoom' as const },
        { role: 'zoomIn' as const },
        { role: 'zoomOut' as const },
        { type: 'separator' },
        { role: 'togglefullscreen' as const },
      ],
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize' as const },
        { role: 'zoom' as const },
        ...(isMac
          ? [
              { type: 'separator' as const },
              { role: 'front' as const },
              { type: 'separator' as const },
              { role: 'window' as const },
            ]
          : [{ role: 'close' as const }]),
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// Database IPC Handlers
ipcMain.handle('db:load-all-pages', async () => {
  try {
    return loadAllPagesFromDb();
  } catch (err) {
    console.error('[IPC db:load-all-pages] Error:', err);
    return [];
  }
});

ipcMain.handle('db:load-pages', async (_event, ids: string[]) => {
  try {
    return loadPagesFromDb(ids);
  } catch (err) {
    console.error('[IPC db:load-pages] Error:', err);
    return [];
  }
});

ipcMain.handle(
  'db:write-pages',
  async (_event, payload: { put: PagePayload[]; del: string[] }) => {
    try {
      writePagesToDb(payload.put, payload.del);
      return true;
    } catch (err) {
      console.error('[IPC db:write-pages] Error:', err);
      return false;
    }
  },
);

ipcMain.handle('db:clear-all', async () => {
  try {
    clearAllPagesFromDb();
    return true;
  } catch (err) {
    console.error('[IPC db:clear-all] Error:', err);
    return false;
  }
});

// IPC Handlers
ipcMain.on('app:open-external', (_event, url: string) => {
  if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
    shell.openExternal(url);
  }
});

app.whenReady().then(async () => {
  try {
    initDatabase();
  } catch (err) {
    console.error('Failed to initialize database on startup:', err);
  }

  try {
    await createWindow();
  } catch (err) {
    console.error('Failed to create main window:', err);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow().catch((err) => console.error('Failed to recreate window on activate:', err));
    }
  });
}).catch((err) => {
  console.error('Error during app.whenReady:', err);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
