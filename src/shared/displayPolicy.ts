import type { ChatMessage, MessageFragment, Platform } from './models';

export type CommandDisplayMode = 'show' | 'mask' | 'hide';
export interface TrustedViewer {
  platform: Platform;
  userId: string;
  label: string;
}
export interface DisplayPolicySettings {
  commandDisplayMode: CommandDisplayMode;
  commandPrefixes: string[];
  hideViewerLinks: boolean;
  allowSubscriberLinks: boolean;
  trustedUsers: TrustedViewer[];
}
export interface DisplayAnnotation {
  command?: 'mask' | 'hide';
  linksRemoved?: boolean;
  hidden: boolean;
}
export const displayPolicyDefaults = (): DisplayPolicySettings => ({
  commandDisplayMode: 'mask',
  commandPrefixes: ['!'],
  hideViewerLinks: true,
  allowSubscriberLinks: false,
  trustedUsers: [],
});
export interface ViewerTrust {
  broadcaster: boolean;
  moderator: boolean;
  vip: boolean;
  bot: boolean;
  subscriber: boolean;
  explicitlyTrusted: boolean;
  linksAllowed: boolean;
}
/** Only normalized platform roles/badge IDs or explicit platform user IDs confer trust. */
export function viewerTrust(message: ChatMessage, settings: DisplayPolicySettings): ViewerTrust {
  const { broadcaster, moderator, vip, bot, subscriber } = normalizedViewerRoles(message);
  const explicitlyTrusted = settings.trustedUsers.some(
    (u) => u.platform === message.platform && u.userId === message.user.platformUserId,
  );
  return {
    broadcaster,
    moderator,
    vip,
    bot,
    subscriber,
    explicitlyTrusted,
    linksAllowed:
      broadcaster ||
      moderator ||
      vip ||
      bot ||
      explicitlyTrusted ||
      (subscriber && settings.allowSubscriberLinks),
  };
}
export function isCommand(text: string, prefixes: string[]) {
  const start = text.trimStart();
  return prefixes.some(
    (prefix) =>
      prefix.length > 0 &&
      start.startsWith(prefix) &&
      start.length > prefix.length &&
      !/\s/u.test(start[prefix.length]),
  );
}
export interface TextRange {
  start: number;
  end: number;
}
/** Conservative literal domains, no spaced/dot-word obfuscation or network lookups. */
export function findLinks(text: string): TextRange[] {
  const pattern =
    /(?<![\p{L}\p{N}_@.-])(?:https?:\/\/[^\s<>"']+|(?:www\.)?(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?\.)+(?:[a-z]{2,24}|xn--[a-z0-9-]{2,59}|рф)(?::\d{1,5})?(?:[/?#][^\s<>"']*)?)(?![\p{L}\p{N}_-])/giu;
  const ranges: TextRange[] = [];
  for (const match of text.matchAll(pattern)) {
    let value = match[0].replace(/[.,!?;:…]+$/u, '');
    // Strip wrapping punctuation, but retain balanced URL path parentheses.
    for (const [left, right] of [
      ['(', ')'],
      ['[', ']'],
      ['{', '}'],
    ]) {
      while (value.endsWith(right) && value.split(right).length > value.split(left).length)
        value = value.slice(0, -1);
    }
    if (value) ranges.push({ start: match.index, end: match.index + value.length });
  }
  return ranges;
}
function replaceRanges(
  text: string,
  fragments: MessageFragment[] | undefined,
  ranges: (TextRange & { replacement: string })[],
) {
  const source = fragments?.map((f) => f.text).join('') === text ? fragments : undefined;
  const output: MessageFragment[] = [];
  let result = '',
    cursor = 0;
  const append = (start: number, end: number) => {
    result += text.slice(start, end);
    if (!source) return;
    let offset = 0;
    for (const fragment of source) {
      const left = Math.max(start, offset),
        right = Math.min(end, offset + fragment.text.length);
      if (left < right)
        output.push(
          left === offset && right === offset + fragment.text.length
            ? fragment
            : { type: 'text', text: fragment.text.slice(left - offset, right - offset) },
        );
      offset += fragment.text.length;
    }
  };
  for (const range of ranges) {
    append(cursor, range.start);
    result += range.replacement;
    if (source && range.replacement) output.push({ type: 'text', text: range.replacement });
    cursor = range.end;
  }
  append(cursor, text.length);
  return { text: result, fragments: source ? output : undefined };
}
export function applyDisplayPolicy(
  original: string,
  text: string,
  fragments: MessageFragment[] | undefined,
  settings: DisplayPolicySettings,
  trust: Pick<ViewerTrust, 'linksAllowed'>,
) {
  const command =
    isCommand(original, settings.commandPrefixes) && settings.commandDisplayMode !== 'show'
      ? settings.commandDisplayMode
      : undefined;
  if (command)
    return {
      text: command === 'mask' ? '***' : '',
      fragments: undefined,
      annotation: { command, hidden: command === 'hide' } satisfies DisplayAnnotation,
    };
  const links = settings.hideViewerLinks && !trust.linksAllowed ? findLinks(text) : [];
  let display = { text, fragments };
  if (links.length) {
    display = replaceRanges(
      text,
      fragments,
      links.map((r) => ({ ...r, replacement: '' })),
    );
    const whitespace = [...display.text.matchAll(/\s+/gu)].map((m) => ({
      start: m.index,
      end: m.index + m[0].length,
      replacement: m.index === 0 || m.index + m[0].length === display.text.length ? '' : ' ',
    }));
    display = replaceRanges(display.text, display.fragments, whitespace);
  } else if (settings.hideViewerLinks && !trust.linksAllowed && fragments) {
    // Inconsistent provider fragments must never bypass the authoritative display text.
    if (findLinks(fragments.map((f) => f.text).join('')).length) display.fragments = undefined;
  }
  if (
    fragments &&
    fragments.map((f) => f.text).join('') !== text &&
    settings.commandDisplayMode !== 'show' &&
    isCommand(fragments.map((f) => f.text).join(''), settings.commandPrefixes)
  )
    display.fragments = undefined;
  return {
    ...display,
    annotation: {
      linksRemoved: links.length > 0,
      hidden: !display.text.trim(),
    } satisfies DisplayAnnotation,
  };
}
/** Legacy profile hideCommands is superseded by the global display policy (default mask). */
export function migrateLegacyCommands<T extends { hideCommands: boolean }>(theme: T): T {
  return { ...theme, hideCommands: false };
}

export function normalizedViewerRoles(message: ChatMessage) {
  const roles = new Set(
    [...message.user.roles, ...message.user.badges.map((b) => b.id.split('/')[0])].map((r) =>
      r.toLowerCase(),
    ),
  );
  const broadcaster = roles.has('broadcaster') || roles.has('owner');
  const moderator = roles.has('moderator');
  const vip = roles.has('vip');
  const bot = message.metadata?.bot === true || roles.has('bot');
  const subscriber = ['subscriber', 'member', 'sponsor', 'founder'].some((r) => roles.has(r));
  return { broadcaster, moderator, vip, bot, subscriber };
}
