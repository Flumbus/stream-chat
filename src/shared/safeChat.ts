import {
  applyDisplayPolicy,
  displayPolicyDefaults,
  viewerTrust,
  type DisplayPolicySettings,
} from './displayPolicy';
import type { ChatMessage, MessageFragment, Platform, PlatformAccount } from './models';

export type SafeCategory = 'soft' | 'blocked';
export type SafeAction = 'none' | 'delete' | 'timeout' | 'ban';
export interface DictionaryEntry {
  id: string;
  text: string;
  category: SafeCategory | 'exception';
}
export interface SafeChatSettings extends DisplayPolicySettings {
  version: 1;
  filtering: boolean;
  automoderation: boolean;
  commonRules: boolean;
  platforms: Record<Platform, { filtering: boolean; automoderation: boolean }>;
  dictionary: DictionaryEntry[];
  punishments: Record<SafeCategory, { action: SafeAction; duration: number }>;
  kindMode: { enabled: boolean; replacement: string };
}
export interface SafeAnnotation {
  category: SafeCategory;
  ruleIds: string[];
  filtered: boolean;
  action?: SafeAction;
  status?: 'pending' | 'success' | 'skipped' | 'failed';
  reason?: string;
  duration?: number;
}
export function safeChatDefaults(): SafeChatSettings {
  return {
    ...displayPolicyDefaults(),
    version: 1,
    filtering: true,
    automoderation: true,
    commonRules: true,
    platforms: {
      twitch: { filtering: true, automoderation: true },
      youtube: { filtering: true, automoderation: true },
    },
    dictionary: [
      { id: 'default-soft-1', text: 'дурак', category: 'soft' },
      { id: 'default-soft-2', text: 'идиот', category: 'soft' },
      { id: 'default-blocked-1', text: 'сука', category: 'blocked' },
      { id: 'default-blocked-2', text: 'блядь', category: 'blocked' },
      { id: 'default-blocked-3', text: 'fuck', category: 'blocked' },
    ],
    punishments: {
      soft: { action: 'none', duration: 3600 },
      blocked: { action: 'timeout', duration: 3600 },
    },
    kindMode: { enabled: false, replacement: '[скрыто]' },
  };
}
export function platformSafety(settings: SafeChatSettings, platform: Platform) {
  return settings.commonRules
    ? settings
    : {
        filtering: settings.filtering && settings.platforms[platform].filtering,
        automoderation: settings.automoderation && settings.platforms[platform].automoderation,
      };
}
const phonetic: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'i',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'shch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};
const visual: Record<string, string> = {
  ...phonetic,
  в: 'b',
  н: 'h',
  п: 'n',
  р: 'p',
  с: 'c',
  у: 'y',
  х: 'x',
};
const leet: Record<string, string> = {
  '@': 'a',
  '0': 'o',
  '1': 'i',
  $: 's',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
};
interface Normalized {
  text: string;
  starts: number[];
  ends: number[];
}
function normalize(input: string, map: Record<string, string>): Normalized {
  let text = '',
    offset = 0;
  const starts: number[] = [],
    ends: number[] = [];
  for (const original of input) {
    for (const c of original.normalize('NFKC').toLowerCase()) {
      if (/[\p{Cf}\p{Mn}]/u.test(c)) continue;
      const value = leet[c] ?? map[c] ?? c;
      for (const v of value) {
        text += v;
        for (let unit = 0; unit < v.length; unit++) {
          starts.push(offset);
          ends.push(offset + original.length);
        }
      }
    }
    offset += original.length;
  }
  return { text, starts, ends };
}
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function pattern(text: string) {
  // Only generated expressions are allowed. Dictionary entries are always literal data.
  const words = text
    .trim()
    .split(/[\s._-]+/u)
    .filter(Boolean);
  if (!words.length) return undefined;
  const body = words
    .map((word) =>
      [...word.replace(/(.)\1+/gu, '$1')].map((c) => `${escape(c)}+`).join('[\\s._-]*'),
    )
    .join('[\\s._-]+');
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, 'gu');
}
export interface SafeMatch {
  start: number;
  end: number;
  category: SafeCategory;
  ruleId: string;
}
export class SafeChatMatcher {
  private compiled: { entry: DictionaryEntry; patterns: (RegExp | undefined)[] }[];
  constructor(entries: DictionaryEntry[]) {
    this.compiled = entries.map((entry) => ({
      entry,
      patterns: [visual, phonetic].map((map) => pattern(normalize(entry.text, map).text)),
    }));
  }
  detect(input: string): SafeMatch[] {
    const forms = [normalize(input, visual), normalize(input, phonetic)];
    const found: SafeMatch[] = [],
      exceptions: { start: number; end: number }[] = [];
    for (const { entry, patterns } of this.compiled) {
      for (let i = 0; i < forms.length; i++) {
        const re = patterns[i];
        if (!re) continue;
        re.lastIndex = 0;
        for (const m of forms[i].text.matchAll(re)) {
          const start = forms[i].starts[m.index],
            end = forms[i].ends[m.index + m[0].length - 1];
          if (entry.category === 'exception') exceptions.push({ start, end });
          else found.push({ start, end, category: entry.category, ruleId: entry.id });
        }
      }
    }
    return found
      .filter(
        (m, i) =>
          !exceptions.some((e) => e.start <= m.start && e.end >= m.end) &&
          found.findIndex(
            (v) => v.start === m.start && v.end === m.end && v.ruleId === m.ruleId,
          ) === i,
      )
      .sort((a, b) => a.start - b.start || b.end - a.end);
  }
}
export function automaticSkipReason(
  account: PlatformAccount | undefined,
  message: ChatMessage,
  action: SafeAction,
) {
  if (!account) return 'Аккаунт недоступен';
  if (account.readOnlyLink) return 'Канал только для чтения — модерация невозможна';
  if (account.connectionStatus !== 'connected') return 'Нет подключения';
  if (action === 'none') return 'Наказание отключено';
  if (!account.capabilities[action]) return 'Недостаточно прав платформы';
  if (
    message.user.platformUserId === account.platformAccountId ||
    message.user.roles.some((r) => ['broadcaster', 'moderator', 'owner'].includes(r))
  )
    return 'Владелец канала или модератор защищён';
  return undefined;
}
/** Compiled dictionary and per-message display cache, shared by every output path. */
export class SafeChatEngine {
  private signature = '';
  private matcher = new SafeChatMatcher([]);
  private cache = new WeakMap<ChatMessage, ChatMessage>();
  private detections = new Map<string, SafeMatch[]>();
  settings = safeChatDefaults();
  constructor() {
    this.configure(this.settings);
  }
  configure(settings: SafeChatSettings) {
    const signature = JSON.stringify(settings.dictionary);
    if (signature !== this.signature) {
      this.matcher = new SafeChatMatcher(settings.dictionary);
      this.detections.clear();
      this.signature = signature;
    }
    this.settings = { ...displayPolicyDefaults(), ...settings };
    this.cache = new WeakMap();
  }
  detect(text: string) {
    const cached = this.detections.get(text);
    if (cached) return cached;
    const matches = this.matcher.detect(text);
    this.detections.set(text, matches);
    while (this.detections.size > 5000)
      this.detections.delete(this.detections.keys().next().value!);
    return matches;
  }
  display(message: ChatMessage): ChatMessage {
    const cached = this.cache.get(message);
    if (cached) return cached;
    const matches = this.detect(message.text);
    const category = matches.some((m) => m.category === 'blocked') ? 'blocked' : 'soft';
    const filtering = platformSafety(this.settings, message.platform).filtering;
    const replacement = this.settings.kindMode.enabled
      ? this.detect(this.settings.kindMode.replacement).length
        ? '•••'
        : this.settings.kindMode.replacement
      : '****';
    const redact = (text: string, found = this.detect(text)) => {
      if (!filtering || !found.length) return text;
      if (found.some((m) => m.category === 'blocked'))
        return this.settings.kindMode.enabled ? replacement : '[Сообщение скрыто]';
      let result = '',
        end = 0;
      const ranges: { start: number; end: number }[] = [];
      for (const m of found) {
        const previous = ranges.at(-1);
        if (previous && m.start <= previous.end) previous.end = Math.max(previous.end, m.end);
        else ranges.push({ start: m.start, end: m.end });
      }
      for (const m of ranges) {
        result += text.slice(end, m.start) + replacement;
        end = m.end;
      }
      return result + text.slice(end);
    };
    const text = redact(message.text, matches);
    // Slice text runs around matches; a matched emote becomes inert replacement text.
    let fragments: MessageFragment[] | undefined = message.fragments;
    if (filtering && fragments) {
      const joined = fragments.map((f) => f.text).join('');
      if (joined !== message.text) {
        if (matches.length || this.detect(joined).length) fragments = undefined;
      } else if (matches.length) {
        if (category === 'blocked') fragments = undefined;
        else {
          const source = fragments,
            output: MessageFragment[] = [];
          const append = (start: number, end: number) => {
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
          const ranges: { start: number; end: number }[] = [];
          for (const m of matches) {
            const last = ranges.at(-1);
            if (last && m.start <= last.end) last.end = Math.max(last.end, m.end);
            else ranges.push({ ...m });
          }
          let cursor = 0;
          for (const m of ranges) {
            append(cursor, m.start);
            output.push({ type: 'text', text: replacement });
            cursor = m.end;
          }
          append(cursor, message.text.length);
          fragments = output;
        }
      }
    }
    const trust = viewerTrust(message, this.settings);
    const display = applyDisplayPolicy(message.text, text, fragments, this.settings, trust);
    const publicText = (value: string) =>
      applyDisplayPolicy(value, redact(value), undefined, this.settings, { linksAllowed: false })
        .text;
    const result: ChatMessage = {
      ...message,
      text: display.text,
      fragments: display.fragments,
      displayPolicy: display.annotation,
      reply: message.reply
        ? {
            ...message.reply,
            text: publicText(message.reply.text),
            username: redact(message.reply.username),
          }
        : undefined,
      // Names/badge labels are also untrusted text and travel to OBS.
      user: filtering
        ? {
            ...message.user,
            username: redact(message.user.username),
            displayName: redact(message.user.displayName),
            badges: message.user.badges.map((b) => ({ ...b, label: redact(b.label) })),
          }
        : message.user,
      metadata: message.metadata
        ? {
            ...message.metadata,
            amount: message.metadata.amount ? publicText(message.metadata.amount) : undefined,
          }
        : undefined,
      safeChat: matches.length
        ? {
            ...message.safeChat,
            category,
            ruleIds: [...new Set(matches.map((m) => m.ruleId))],
            filtered: filtering,
          }
        : undefined,
    };
    this.cache.set(message, result);
    return result;
  }
}
