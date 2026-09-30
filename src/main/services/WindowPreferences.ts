import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { screen, type BrowserWindow } from 'electron';
import { z } from 'zod';
import { fitWindow } from '../../shared/desktop';
const schema = z.object({
  bounds: z.object({
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().positive(),
    height: z.number().positive(),
  }),
  maximized: z.boolean(),
});
const areas = () =>
  [
    screen.getPrimaryDisplay(),
    ...screen.getAllDisplays().filter((d) => d.id !== screen.getPrimaryDisplay().id),
  ].map((d) => d.workArea);
export function loadWindowPreferences(directory: string) {
  let saved: z.infer<typeof schema> | undefined;
  try {
    saved = schema.parse(JSON.parse(readFileSync(join(directory, 'window.json'), 'utf8')));
  } catch {
    /* First run or invalid geometry: use the visible work area. */
  }
  return { bounds: fitWindow(saved?.bounds, areas()), maximized: saved?.maximized ?? false };
}
export function trackWindow(window: BrowserWindow, directory: string) {
  let timer: ReturnType<typeof setTimeout>;
  const save = () => {
    clearTimeout(timer);
    if (window.isDestroyed()) return;
    try {
      const path = join(directory, 'window.json');
      writeFileSync(
        path + '.tmp',
        JSON.stringify({ bounds: window.getNormalBounds(), maximized: window.isMaximized() }),
      );
      renameSync(path + '.tmp', path);
    } catch {
      /* Geometry persistence must not prevent closing the app. */
    }
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(save, 250);
  };
  const ensureVisible = () => {
    if (window.isDestroyed() || window.isMinimized()) return;
    const maximized = window.isMaximized();
    if (!maximized) window.setBounds(fitWindow(window.getBounds(), areas()));
  };
  window.on('resize', schedule);
  window.on('move', schedule);
  window.on('maximize', schedule);
  window.on('unmaximize', schedule);
  window.on('close', save);
  screen.on('display-removed', ensureVisible);
  screen.on('display-metrics-changed', ensureVisible);
  window.on('closed', () => {
    clearTimeout(timer);
    screen.removeListener('display-removed', ensureVisible);
    screen.removeListener('display-metrics-changed', ensureVisible);
  });
}
