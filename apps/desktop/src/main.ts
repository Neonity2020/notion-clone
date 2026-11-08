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

let mainWindow: BrowserWindow | null = null;

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
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
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
    // Try multiple possible paths to web/dist/index.html (dev vs packaged)
    const candidates = [
      path.join(__dirname, '../../web/dist/index.html'),
      path.join(__dirname, '../web/dist/index.html'),
      path.join(app.getAppPath(), 'apps/web/dist/index.html'),
      path.join(app.getAppPath(), 'dist/index.html'),
    ];

    const targetFile = candidates.find((p) => fs.existsSync(p));
    if (targetFile) {
      await mainWindow.loadFile(targetFile);
    } else {
      // If web dist doesn't exist yet, show guidance or try dev server
      console.warn('Web build not found in candidates:', candidates);
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
  return loadAllPagesFromDb();
});

ipcMain.handle('db:load-pages', async (_event, ids: string[]) => {
  return loadPagesFromDb(ids);
});

ipcMain.handle(
  'db:write-pages',
  async (_event, payload: { put: PagePayload[]; del: string[] }) => {
    writePagesToDb(payload.put, payload.del);
    return true;
  },
);

ipcMain.handle('db:clear-all', async () => {
  clearAllPagesFromDb();
  return true;
});

// IPC Handlers
ipcMain.on('app:open-external', (_event, url: string) => {
  if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
    shell.openExternal(url);
  }
});

app.whenReady().then(() => {
  initDatabase();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
