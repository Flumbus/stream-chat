import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { fallbackFonts, normalizeFonts } from '../../shared/fonts';
import type { SystemFontList } from '../../shared/desktop';
// Fixed, read-only Windows API call. Renderer supplies no script, paths or arguments.
const script = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Drawing
$collection = New-Object System.Drawing.Text.InstalledFontCollection
try { ConvertTo-Json -Compress -InputObject @($collection.Families | ForEach-Object { $_.Name }) }
finally { $collection.Dispose() }
`;
let cached: Promise<SystemFontList> | undefined;
export function listSystemFonts(): Promise<SystemFontList> {
  cached ??= new Promise((resolve) => {
    const fallback = () => resolve({ families: [...fallbackFonts], fallback: true });
    if (process.platform !== 'win32') return fallback();
    execFile(
      join(
        process.env.SystemRoot ?? 'C:\\Windows',
        'System32',
        'WindowsPowerShell',
        'v1.0',
        'powershell.exe',
      ),
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, timeout: 10000, maxBuffer: 2 * 1024 * 1024, encoding: 'utf8' },
      (error, stdout) => {
        if (error) return fallback();
        try {
          const families = normalizeFonts(JSON.parse(stdout.replace(/^\uFEFF/, '')));
          if (!families.length) return fallback();
          resolve({ families, fallback: false });
        } catch {
          fallback();
        }
      },
    );
  });
  return cached;
}
