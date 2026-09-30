export type UpdatePhase =
  'idle' | 'checking' | 'update-available' | 'downloading' | 'downloaded' | 'up-to-date' | 'error';
export interface UpdateState {
  phase: UpdatePhase;
  installedVersion: string;
  enabled: boolean;
  availableVersion?: string;
  progress?: number;
  error?: 'UPDATE_FAILED';
}
export type UpdateAction = 'check' | 'download' | 'install';

export function updatesEnabled(environment: {
  packaged: boolean;
  platform: string;
  portable: boolean;
  installed: boolean;
  metadata: boolean;
}): boolean {
  return (
    environment.packaged &&
    environment.platform === 'win32' &&
    !environment.portable &&
    environment.installed &&
    environment.metadata
  );
}
