import type { Platform } from './models';
import { PlatformError } from '../platforms/common/errors';
export interface ChannelLink {
  platform: Platform;
  kind: 'channel' | 'handle' | 'username' | 'video';
  target: string;
  url: string;
}
export function parseChannelLink(platform: Platform, input: string): ChannelLink {
  const invalid = () =>
    new PlatformError(
      'INVALID_CHANNEL_LINK',
      platform === 'twitch'
        ? 'Вставьте ссылку twitch.tv/канал или twitch.tv/popout/канал/chat.'
        : 'Вставьте ссылку YouTube на трансляцию, live_chat, @канал или /channel/UC… .',
    );
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`);
  } catch {
    throw invalid();
  }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port)
    throw invalid();
  let parts: string[];
  try {
    parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    throw invalid();
  }
  const host = url.hostname.toLowerCase();
  if (platform === 'twitch') {
    if (!['twitch.tv', 'www.twitch.tv', 'm.twitch.tv'].includes(host)) throw invalid();
    const nested = ['popout', 'embed'].includes(parts[0]);
    const name = (nested ? parts[1] : parts[0])?.toLowerCase();
    if (
      !name ||
      !/^[a-z0-9_]{1,25}$/.test(name) ||
      ['directory', 'videos', 'settings', 'downloads', 'login', 'signup', 'search'].includes(name)
    )
      throw invalid();
    if (
      nested
        ? parts.length !== 3 || parts[2] !== 'chat'
        : parts.length > 2 || (parts[1] && parts[1] !== 'chat')
    )
      throw invalid();
    return { platform, kind: 'channel', target: name, url: `https://www.twitch.tv/${name}` };
  }
  if (
    ![
      'youtube.com',
      'www.youtube.com',
      'm.youtube.com',
      'gaming.youtube.com',
      'youtu.be',
      'www.youtu.be',
    ].includes(host)
  )
    throw invalid();
  const video = host.endsWith('youtu.be')
    ? parts[0]
    : ['watch', 'live_chat', 'live_chat_replay'].includes(parts[0])
      ? url.searchParams.get('v')
      : ['live', 'embed', 'shorts'].includes(parts[0])
        ? parts[1]
        : undefined;
  if (video) {
    if (!/^[\w-]{11}$/.test(video)) throw invalid();
    return {
      platform,
      kind: 'video',
      target: video,
      url: `https://www.youtube.com/watch?v=${video}`,
    };
  }
  if (
    parts[0]?.startsWith('@') &&
    /^@[\p{L}\p{N}_.-]{1,100}$/u.test(parts[0]) &&
    (parts.length === 1 || (parts.length === 2 && ['live', 'streams'].includes(parts[1])))
  )
    return {
      platform,
      kind: 'handle',
      target: parts[0],
      url: `https://www.youtube.com/${encodeURIComponent(parts[0]).replace('%40', '@')}`,
    };
  if (
    ['channel', 'user'].includes(parts[0]) &&
    parts[1] &&
    parts.length <= 3 &&
    (!parts[2] || ['live', 'streams'].includes(parts[2]))
  ) {
    if (
      parts[0] === 'channel' ? !/^UC[\w-]{22}$/.test(parts[1]) : !/^[\w.-]{1,100}$/.test(parts[1])
    )
      throw invalid();
    return {
      platform,
      kind: parts[0] === 'channel' ? 'channel' : 'username',
      target: parts[1],
      url: `https://www.youtube.com/${parts[0]}/${parts[1]}`,
    };
  }
  throw invalid();
}
