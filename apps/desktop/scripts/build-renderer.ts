/**
 * Builds the static renderer and copies it into the desktop app bundle.
 *
 * The renderer is loaded from `file://` in the packaged app, so it must live
 * inside the Electron app directory. Bun's bundler rewrites `__dirname` to the
 * build-time source folder, therefore the main process resolves every path
 * through `app.getAppPath()` instead of `__dirname`.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(here, '..');
const webDir = path.resolve(desktopDir, '../web');
const source = path.join(webDir, 'dist-desktop');
const target = path.join(desktopDir, 'dist/renderer');

const bunBin = process.execPath.includes('bun') ? process.execPath : 'bun';

if (!process.argv.includes('--copy-only')) {
  const build = spawnSync(bunBin, ['run', 'build:desktop'], {
    cwd: webDir,
    stdio: 'inherit',
    env: process.env,
  });
  if (build.status !== 0) {
    console.error('[build-renderer] 渲染构建失败');
    process.exit(build.status ?? 1);
  }
}

const entry = path.join(source, 'desktop.html');
if (!existsSync(entry)) {
  console.error(`[build-renderer] 找不到渲染入口: ${entry}`);
  process.exit(1);
}

rmSync(target, { recursive: true, force: true });
mkdirSync(path.dirname(target), { recursive: true });
cpSync(source, target, { recursive: true });

console.log(`[build-renderer] 渲染产物已复制到 ${path.relative(desktopDir, target)}`);
