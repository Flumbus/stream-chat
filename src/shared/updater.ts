export type UpdatePhase =
  'idle' | 'checking' | 'update-available' | 'downloading' | 'downloaded' | 'up-to-date' | 'error';
export interface UpdateState {
  phase: UpdatePhase;
  installedVersion: string;
  enabled: boolean;
  availableVersion?: string;
  progress?: number;
  error?: UpdateError;
}
export type UpdateAction = 'check' | 'download' | 'install';
export type UpdateError =
  | 'UPDATE_FAILED'
  | 'UPDATE_NOT_PUBLISHED'
  | 'UPDATE_RELEASE_INCOMPLETE'
  | 'UPDATE_INVALID_RELEASE'
  | 'UPDATE_NETWORK_ERROR'
  | 'UPDATE_INSTALL_FAILED';

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
