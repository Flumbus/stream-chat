import { randomUUID } from 'node:crypto';
import type { MessageFragment, StreamEvent } from '../../shared/models';
export function parseIrc(line: string) {
  const m = /^(?:@([^ ]+) )?(?::([^ ]+) )?([A-Z0-9]+)(?: (.*))?$/.exec(line);
  if (!m) return;
  const tags = Object.fromEntries(
    (m[1] ?? '')
      .split(';')
      .filter(Boolean)
      .map((entry) => {
        const pos = entry.indexOf('=');
        return [
          pos < 0 ? entry : entry.slice(0, pos),
          (pos < 0 ? '' : entry.slice(pos + 1)).replace(
            /\\([s:nr\\])/g,
            (_, c: string) => ({ s: ' ', ':': ';', n: '\n', r: '\r', '\\': '\\' })[c] ?? c,
          ),
        ];
      }),
  );
  const rest = m[4] ?? '';
  const separator = rest.indexOf(' :');
  return {
    tags,
    prefix: m[2] ?? '',
    command: m[3],
    params: separator < 0 ? rest : rest.slice(0, separator),
    text: separator < 0 ? rest.replace(/^:/, '') : rest.slice(separator + 2),
  };
}
export function ircEvent(line: string, accountId: string, login: string): StreamEvent | undefined {
  const p = parseIrc(line);
  if (!p) return;
  const t = p.tags;
  const channelId = t['room-id'] || login;
  const common = { platform: 'twitch' as const, channelId, source: 'live' as const };
  if (p.command === 'CLEARMSG')
    return {
      type: 'moderation',
      ...common,
      action: 'delete',
      targetUserId: '',
      messageId: t['target-msg-id'],
    };
  if (p.command === 'CLEARCHAT')
    return t['target-user-id']
      ? { type: 'moderation', ...common, action: 'purge', targetUserId: t['target-user-id'] }
      : { type: 'clear', ...common };
  if (p.command !== 'PRIVMSG') return;
  const username = p.prefix.split('!')[0];
  const badges = (t.badges ?? '')
    .split(',')
    .filter(Boolean)
    .map((b) => ({ id: b.split('/')[0], label: b.split('/')[0] }));
  const chars = Array.from(p.text);
  const ranges = (t.emotes ?? '')
    .split('/')
    .flatMap((emote) => {
      const [id, positions] = emote.split(':');
      return (positions ?? '')
        .split(',')
        .filter(Boolean)
        .map((position) => {
          const [start, end] = position.split('-').map(Number);
          return { id, start, end };
        });
    })
    .filter(
      (r) =>
        /^[\w-]+$/.test(r.id) &&
        Number.isInteger(r.start) &&
        Number.isInteger(r.end) &&
        r.start >= 0 &&
        r.end >= r.start &&
        r.end < chars.length,
    )
    .sort((a, b) => a.start - b.start);
  const fragments: MessageFragment[] = [];
  let cursor = 0;
  for (const r of ranges) {
    if (r.start < cursor) continue;
    if (r.start > cursor)
      fragments.push({ type: 'text', text: chars.slice(cursor, r.start).join('') });
    fragments.push({
      type: 'emote',
      text: chars.slice(r.start, r.end + 1).join(''),
      imageUrl: `https://static-cdn.jtvnw.net/emoticons/v2/${r.id}/default/dark/2.0`,
    });
    cursor = r.end + 1;
  }
  if (cursor < chars.length) fragments.push({ type: 'text', text: chars.slice(cursor).join('') });
  const time = Number(t['tmi-sent-ts']);
  return {
    type: 'chat',
    message: {
      ...common,
      id: t.id || randomUUID(),
      accountId,
      kind: 'message',
      text: p.text,
      fragments,
      createdAt: new Date(Number.isFinite(time) && time > 0 ? time : Date.now()).toISOString(),
      user: {
        platformUserId: t['user-id'] || `irc:${username}`,
        username,
        displayName: t['display-name'] || username,
        color: /^#[a-f\d]{6}$/i.test(t.color ?? '') ? t.color : undefined,
        roles: badges.map((b) => b.id),
        badges,
      },
    },
  };
}
