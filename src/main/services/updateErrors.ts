import type { UpdateError } from '../../shared/updater';

// Inspect provider diagnostics internally, but expose only fixed codes to UI/logs.
// electron-updater 6.8.x reports an empty GitHub feed as ERR_XML_MISSED_ELEMENT.
export function classifyUpdateError(
  error: unknown,
  stage: 'check' | 'download' | 'install',
): UpdateError {
  const value = error && typeof error === 'object' ? error : {};
  const code = 'code' in value && typeof value.code === 'string' ? value.code : '';
  const message = 'message' in value && typeof value.message === 'string' ? value.message : '';
  if (stage === 'install') return 'UPDATE_INSTALL_FAILED';
  if (
    code === 'ERR_UPDATER_NO_PUBLISHED_VERSIONS' ||
    (code === 'ERR_XML_MISSED_ELEMENT' && message === 'No published versions on GitHub')
  ) return 'UPDATE_NOT_PUBLISHED';
  if (
    ['ERR_UPDATER_CHANNEL_FILE_NOT_FOUND', 'ERR_UPDATER_ASSET_NOT_FOUND',
      'ERR_UPDATER_NO_FILES_PROVIDED'].includes(code)
  ) return 'UPDATE_RELEASE_INCOMPLETE';
  if (
    ['ERR_UPDATER_INVALID_UPDATE_INFO', 'ERR_UPDATER_INVALID_RELEASE_FEED',
      'ERR_UPDATER_INVALID_VERSION', 'ERR_UPDATER_NO_CHECKSUM', 'ERR_CHECKSUM_MISMATCH',
      'ERR_UPDATER_INVALID_SIGNATURE'].includes(code)
  ) return 'UPDATE_INVALID_RELEASE';
  if (
    /^(?:ECONN|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ERR_INTERNET_DISCONNECTED|ERR_CONNECTION|ERR_NAME_NOT_RESOLVED)/.test(code) ||
    /net::ERR_(?:INTERNET_DISCONNECTED|CONNECTION_[A-Z_]+|NAME_NOT_RESOLVED|TIMED_OUT|PROXY_CONNECTION_FAILED|TUNNEL_CONNECTION_FAILED)/.test(message)
  ) return 'UPDATE_NETWORK_ERROR';
  return 'UPDATE_FAILED';
}
