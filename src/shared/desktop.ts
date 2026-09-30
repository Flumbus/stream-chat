export interface WindowState {
  maximized: boolean;
}
export interface DesktopBridge {
  applicationInfo(): Promise<import('./appVersion').ApplicationInfo>;
  openExternal(link: import('./links').ExternalLink): Promise<void>;
  updateState(): Promise<import('./updater').UpdateState>;
  updateAction(action: import('./updater').UpdateAction): Promise<void>;
  onUpdateState(listener: (state: import('./updater').UpdateState) => void): () => void;
  copyText(text: string): Promise<void>;
  listFonts(): Promise<SystemFontList>;
  windowAction(action: 'minimize' | 'maximize' | 'close'): Promise<void>;
  windowState(): Promise<WindowState>;
  onWindowState(listener: (state: WindowState) => void): () => void;
}
export interface SystemFontList {
  families: string[];
  fallback: boolean;
}
declare global {
  interface Window {
    desktop: DesktopBridge;
  }
}

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
export function fitWindow(bounds: WindowBounds | undefined, areas: WindowBounds[]): WindowBounds {
  const primary = areas[0] ?? { x: 0, y: 0, width: 1440, height: 960 };
  const overlap = (a: WindowBounds) =>
    bounds
      ? Math.max(0, Math.min(a.x + a.width, bounds.x + bounds.width) - Math.max(a.x, bounds.x)) *
        Math.max(0, Math.min(a.y + a.height, bounds.y + bounds.height) - Math.max(a.y, bounds.y))
      : 0;
  const target = bounds
    ? areas.reduce((best, a) => (overlap(a) > overlap(best) ? a : best), primary)
    : primary;
  const width = Math.min(
    target.width,
    Math.max(Math.min(900, target.width), bounds?.width ?? 1440),
  );
  const height = Math.min(
    target.height,
    Math.max(Math.min(640, target.height), bounds?.height ?? 960),
  );
  return {
    width,
    height,
    x: Math.round(
      Math.max(
        target.x,
        Math.min(
          target.x + target.width - width,
          bounds && overlap(target) ? bounds.x : target.x + (target.width - width) / 2,
        ),
      ),
    ),
    y: Math.round(
      Math.max(
        target.y,
        Math.min(
          target.y + target.height - height,
          bounds && overlap(target) ? bounds.y : target.y + (target.height - height) / 2,
        ),
      ),
    ),
  };
}
