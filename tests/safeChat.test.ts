import { displayPolicyDefaults, findLinks, viewerTrust } from '../src/shared/displayPolicy';
import { themeSchema } from '../src/shared/validation';
import { themes } from '../src/shared/themes';
import { normalizeTwitch } from '../src/platforms/twitch/normalize';
import { normalizeYouTube } from '../src/platforms/youtube/normalize';
import { safeChatSchema } from '../src/shared/safeChatSchema';
import { describe, expect, it, vi } from 'vitest';
import {
  SafeChatEngine,
  SafeChatMatcher,
  safeChatDefaults,
  automaticSkipReason,
  platformSafety,
} from '../src/shared/safeChat';
import { defaultSettings } from '../src/shared/themes';
import { settingsSchema } from '../src/shared/validation';
import { publicMessage } from '../src/shared/overlay';
import { Automoderator } from '../src/main/services/Automoderator';
import type {
  ChatMessage,
  PlatformAccount,
  ModerationRequest,
  ModerationRecord,
} from '../src/shared/models';
const entry = (text: string, category: 'soft' | 'blocked' | 'exception' = 'blocked') => ({
  id: category + '-' + text.replace(/\W/g, 'a'),
  text,
  category,
});
const message = (text: string): ChatMessage => ({
  id: crypto.randomUUID(),
  accountId: 't',
  platform: 'twitch',
  channelId: 'channel',
  text,
  createdAt: new Date().toISOString(),
  kind: 'message',
  user: {
    platformUserId: 'viewer',
    username: 'Viewer',
    displayName: 'Viewer',
    roles: [],
    badges: [],
  },
});
const account: PlatformAccount = {
  id: 't',
  platform: 'twitch',
  platformAccountId: 'owner',
  username: 'owner',
  displayName: 'Owner',
  scopes: [],
  authStatus: 'authorized',
  connectionStatus: 'connected',
  capabilities: { send: true, timeout: true, ban: true, unban: true, delete: true },
};
describe('Safe Chat detection', () => {
  it.each([
    'banword',
    'BANWORD',
    'b.a.n.w.o.r.d',
    'b-a-n-w-o-r-d',
    'b_a_n_w_o_r_d',
    'b a n w o r d',
    'bаnwоrd',
    'b@nword',
    'banw0rd',
    'bannnwooord',
    'ｂａｎｗｏｒｄ',
    'ban\u200bword',
    'ban\u2060word',
  ])('recognizes %s', (text) =>
    expect(new SafeChatMatcher([entry('banword')]).detect(text)).toHaveLength(1),
  );
  it.each(['privet', 'пpивет', 'п р и в е т', 'ПРИВЕТ'])(
    'transliteration/mixed Cyrillic: %s',
    (text) => expect(new SafeChatMatcher([entry('привет')]).detect(text)).toHaveLength(1),
  );
  it('normalizes leetspeak without fuzzy matching', () => {
    expect(new SafeChatMatcher([entry('toxic')]).detect('t0x1c')).toHaveLength(1);
    expect(new SafeChatMatcher([entry('test')]).detect('te$t')).toHaveLength(1);
    expect(new SafeChatMatcher([entry('banword')]).detect('banwrod')).toHaveLength(0);
  });
  it('detects phrases and respects whole-word boundaries', () => {
    const matcher = new SafeChatMatcher([entry('red flag')]);
    expect(matcher.detect('a red   flag!')).toHaveLength(1);
    expect(matcher.detect('red flagpole')).toHaveLength(0);
    expect(new SafeChatMatcher([entry('cat')]).detect('concatenate cats')).toHaveLength(0);
  });
  it('exceptions cover only their own spans', () => {
    const matcher = new SafeChatMatcher([entry('red'), entry('red flag', 'exception')]);
    expect(matcher.detect('red flag and red')).toMatchObject([{ start: 13, end: 16 }]);
  });
  it('dictionary strings are literal and do not execute regex', () => {
    expect(new SafeChatMatcher([entry('a.*b')]).detect('axxxxxb')).toHaveLength(0);
    expect(safeChatSchema.safeParse({ ...safeChatDefaults(), script: 'run' }).success).toBe(false);
  });
});
describe('Safe display policy and backward compatibility', () => {
  const engine = () => {
    const e = new SafeChatEngine();
    e.configure({
      ...safeChatDefaults(),
      dictionary: [entry('badword', 'soft'), entry('banword')],
    });
    return e;
  };
  it('migrates missing Safe Chat settings with both toggles on and a one hour timeout', () => {
    const old = { ...defaultSettings, safeChat: undefined };
    const config = settingsSchema.parse(old).safeChat;
    expect(config.filtering).toBe(true);
    expect(config.automoderation).toBe(true);
    expect(config.punishments).toEqual({
      soft: { action: 'none', duration: 3600 },
      blocked: { action: 'timeout', duration: 3600 },
    });
  });
  it('censors only soft spans and hides the complete blocked message', () => {
    const e = engine();
    expect(e.display(message('hello badword world')).text).toBe('hello **** world');
    expect(e.display(message('hello banword world')).text).toBe('[Сообщение скрыто]');
  });
  it('keeps UTF-16 offsets, merges overlapping phrases, and preserves unaffected emotes', () => {
    const e = engine();
    const m = message('😀 badword ✨');
    m.fragments = [
      { type: 'emote', text: '😀' },
      { type: 'text', text: ' badword ' },
      { type: 'emote', text: '✨', imageUrl: 'https://example.org/emote.png' },
    ];
    const result = e.display(m);
    expect(result.text).toBe('😀 **** ✨');
    expect(result.fragments?.at(-1)).toEqual(m.fragments.at(-1));
    e.configure({
      ...e.settings,
      dictionary: [entry('red flag', 'soft'), entry('flag here', 'soft')],
    });
    expect(e.display(message('red flag here')).text).toBe('****');
  });
  it('strips hidden originals from the actual public DTO, including fragments/reply/metadata', () => {
    const e = engine();
    const m = message('banword');
    m.fragments = [{ type: 'emote', text: 'banword', imageUrl: 'https://example.org/x' }];
    m.reply = { messageId: 'other', username: 'Viewer', text: 'banword' };
    m.metadata = { amount: 'banword' };
    const serialized = JSON.stringify(publicMessage(e.display(m)));
    expect(serialized).not.toContain('banword');
    expect(serialized).not.toContain('safeChat');
    expect(m.text).toBe('banword');
  });
  it('does not trust inconsistent fragment contents', () => {
    const e = engine();
    const m = message('ordinary');
    m.fragments = [{ type: 'text', text: 'banword' }];
    expect(JSON.stringify(publicMessage(e.display(m)))).not.toContain('banword');
  });
  it('Kind Mode changes display only and dictionary edits invalidate the cache', () => {
    const e = engine();
    const m = message('banword');
    e.configure({ ...e.settings, kindMode: { enabled: true, replacement: 'котик' } });
    expect(e.display(m).text).toBe('котик');
    expect(e.detect(m.text)[0].category).toBe('blocked');
    expect(e.display(m)).toBe(e.display(m));
    e.configure({ ...e.settings, dictionary: [] });
    expect(e.display(m).text).toBe('banword');
  });
  it('filtering and automoderation remain independent per platform', () => {
    const e = engine();
    e.configure({ ...e.settings, filtering: false });
    expect(e.display(message('banword')).text).toBe('banword');
    expect(platformSafety(e.settings, 'youtube').automoderation).toBe(true);
    e.configure({
      ...e.settings,
      filtering: true,
      commonRules: false,
      platforms: {
        twitch: { filtering: false, automoderation: true },
        youtube: { filtering: true, automoderation: false },
      },
    });
    expect(e.display(message('banword')).text).toBe('banword');
    expect(e.display({ ...message('banword'), platform: 'youtube' }).text).toBe(
      '[Сообщение скрыто]',
    );
  });
  it('updates annotation when filtering is switched off', () => {
    const e = engine();
    const m = {
      ...message('banword'),
      safeChat: {
        category: 'blocked' as const,
        ruleIds: ['x'],
        filtered: true,
        status: 'success' as const,
      },
    };
    e.configure({ ...e.settings, filtering: false });
    expect(e.display(m).safeChat?.filtered).toBe(false);
  });
});
describe('automatic moderation', () => {
  it.each(['none', 'delete', 'timeout', 'ban'] as const)(
    'honors a category action: %s',
    async (action) => {
      const engine = new SafeChatEngine();
      engine.configure({
        ...safeChatDefaults(),
        dictionary: [entry('softtoken', 'soft')],
        punishments: { ...safeChatDefaults().punishments, soft: { action, duration: 47 } },
      });
      const moderate = vi.fn<(request: ModerationRequest) => Promise<void>>(async () => {});
      const record = vi.fn<(record: ModerationRecord) => Promise<void>>(async () => {});
      const worker = new Automoderator({
        engine,
        account: async () => account,
        moderate,
        record,
        update: () => {},
      });
      worker.submit(message('softtoken'));
      await vi.waitFor(() => expect(record).toHaveBeenCalledTimes(1));
      if (action === 'none') expect(moderate).not.toHaveBeenCalled();
      else
        expect(moderate).toHaveBeenCalledWith(
          expect.objectContaining({ action, duration: action === 'timeout' ? 47 : undefined }),
        );
      await worker.close();
    },
  );
  it('keeps filtering when automatic punishments are disabled', async () => {
    const engine = new SafeChatEngine();
    engine.configure({
      ...safeChatDefaults(),
      automoderation: false,
      dictionary: [entry('banword')],
    });
    const moderate = vi.fn(async () => {}),
      record = vi.fn(async () => {});
    const worker = new Automoderator({
      engine,
      account: async () => account,
      moderate,
      record,
      update: () => {},
    });
    const m = message('banword');
    worker.submit(m);
    await vi.waitFor(() => expect(record).toHaveBeenCalledTimes(1));
    expect(moderate).not.toHaveBeenCalled();
    expect(engine.display(m).text).toBe('[Сообщение скрыто]');
    await worker.close();
  });
  it.each(['twitch', 'youtube'] as const)(
    'defaults to one hour, deduplicates, protects cooldown and logs %s',
    async (platform) => {
      const engine = new SafeChatEngine();
      engine.configure({ ...safeChatDefaults(), dictionary: [entry('banword')] });
      const moderate = vi.fn<(r: ModerationRequest) => Promise<void>>(async () => {}),
        record = vi.fn<(r: ModerationRecord) => Promise<void>>(async () => {}),
        update = vi.fn();
      const a = new Automoderator({
        engine,
        account: async () => ({ ...account, platform }),
        moderate,
        record,
        update,
      });
      const m = { ...message('banword'), platform };
      a.submit(m);
      a.submit(m);
      a.submit({ ...m, id: 'second' });
      await vi.waitFor(() => expect(record).toHaveBeenCalledTimes(2));
      expect(moderate).toHaveBeenCalledTimes(1);
      expect(moderate.mock.calls[0][0]).toMatchObject({ action: 'timeout', duration: 3600 });
      expect(record.mock.calls[0][0]).toMatchObject({
        success: true,
        reason: expect.stringContaining('AUTO'),
      });
      expect(record.mock.calls[1][0]).toMatchObject({
        success: false,
        error: expect.stringContaining('30 секунд'),
      });
      await a.close();
    },
  );
  it.each(['readonly', 'permission', 'protected', 'offline'] as const)(
    'skips %s while still filtering',
    async (reason) => {
      const engine = new SafeChatEngine();
      engine.configure({ ...safeChatDefaults(), dictionary: [entry('banword')] });
      const acc = { ...account, capabilities: { ...account.capabilities } };
      const m = message('banword');
      if (reason === 'readonly') acc.readOnlyLink = 'https://twitch.tv/test';
      if (reason === 'permission') acc.capabilities.timeout = false;
      if (reason === 'protected') m.user.roles = ['moderator'];
      if (reason === 'offline') acc.connectionStatus = 'offline';
      expect(automaticSkipReason(acc, m, 'timeout')).toBeTruthy();
      const moderate = vi.fn<(r: ModerationRequest) => Promise<void>>(async () => {}),
        record = vi.fn<(r: ModerationRecord) => Promise<void>>(async () => {});
      const a = new Automoderator({
        engine,
        account: async () => acc,
        moderate,
        record,
        update: () => {},
      });
      a.submit(m);
      await vi.waitFor(() => expect(record).toHaveBeenCalledTimes(1));
      expect(moderate).not.toHaveBeenCalled();
      expect(engine.display(m).text).toBe('[Сообщение скрыто]');
      await a.close();
    },
  );
  it('records API failures without exposing original message text', async () => {
    const engine = new SafeChatEngine();
    engine.configure({ ...safeChatDefaults(), dictionary: [entry('banword')] });
    const record = vi.fn<(r: ModerationRecord) => Promise<void>>(async () => {});
    const a = new Automoderator({
      engine,
      account: async () => account,
      moderate: async () => {
        throw Error('Unavailable');
      },
      record,
      update: () => {},
    });
    a.submit(message('banword'));
    await vi.waitFor(() => expect(record).toHaveBeenCalledTimes(1));
    expect(record.mock.calls[0][0]).toMatchObject({ success: false });
    expect(record.mock.calls[0][0]).not.toHaveProperty('text');
    await a.close();
  });
});

describe('Safe Chat commands and viewer links', () => {
  it.each(['!discord', '!so flamberor', '  !discord'])('masks command %s by default', (text) => {
    const m = message(text),
      e = new SafeChatEngine();
    expect(e.display(m).text).toBe('***');
    expect(e.display(m).displayPolicy?.command).toBe('mask');
    expect(m.text).toBe(text);
  });
  it('handles show/hide/custom prefixes without treating trailing punctuation as a command', () => {
    const e = new SafeChatEngine();
    expect(e.display(message('Это было круто!')).text).toBe('Это было круто!');
    e.configure({ ...e.settings, commandDisplayMode: 'show' });
    expect(e.display(message('!discord')).text).toBe('!discord');
    e.configure({ ...e.settings, commandDisplayMode: 'hide', commandPrefixes: ['!', '/'] });
    expect(e.display(message('/so viewer'))).toMatchObject({
      text: '',
      displayPolicy: { hidden: true, command: 'hide' },
    });
  });
  it('migrates old safety settings and hideCommands profiles into the default mask policy', () => {
    const {
      commandDisplayMode,
      commandPrefixes,
      hideViewerLinks,
      allowSubscriberLinks,
      trustedUsers,
      ...old
    } = safeChatDefaults();
    void commandDisplayMode;
    void commandPrefixes;
    void hideViewerLinks;
    void allowSubscriberLinks;
    void trustedUsers;
    expect(safeChatSchema.parse(old)).toMatchObject(displayPolicyDefaults());
    const profile = themeSchema.parse({ ...themes[0], hideCommands: true });
    expect(profile.hideCommands).toBe(false);
    expect(new SafeChatEngine().display(message('!discord')).text).toBe('***');
  });
  it.each([
    'https://example.com',
    'http://example.com',
    'www.example.com',
    'example.com',
    'example.ru/path',
    'discord.gg/example',
    't.me/example',
  ])('removes only URL %s', (link) => {
    const e = new SafeChatEngine();
    expect(e.display(message(`hello ${link} world`)).text).toBe('hello world');
    expect(e.display(message(link))).toMatchObject({
      text: '',
      displayPolicy: { linksRemoved: true, hidden: true },
    });
  });
  it('normalizes whitespace around multiple URLs and preserves punctuation', () => {
    const e = new SafeChatEngine();
    expect(e.display(message('one.com hello https://two.com world')).text).toBe('hello world');
    expect(e.display(message('  hello   example.com   world  ')).text).toBe('hello world');
    expect(e.display(message('hello https://example.com, world')).text).toBe('hello , world');
  });
  it.each(['moderator', 'broadcaster', 'owner', 'vip', 'bot'])(
    'trusts platform role %s',
    (role) => {
      const m = message('Discord: https://discord.gg/example');
      m.user.roles = [role];
      expect(new SafeChatEngine().display(m).text).toBe(m.text);
    },
  );
  it.each(['subscriber', 'member', 'sponsor', 'founder', 'verified'])(
    'does not trust %s by default',
    (role) => {
      const m = message('hello example.com world');
      m.user.roles = [role];
      expect(new SafeChatEngine().display(m).text).toBe('hello world');
    },
  );
  it('allows opt-in subscribers and platform-scoped explicit user IDs', () => {
    const e = new SafeChatEngine(),
      m = message('https://example.com');
    m.user.roles = ['member'];
    e.configure({ ...e.settings, allowSubscriberLinks: true });
    expect(e.display(m).text).toBe(m.text);
    e.configure({
      ...e.settings,
      allowSubscriberLinks: false,
      trustedUsers: [{ platform: 'twitch', userId: m.user.platformUserId, label: 'Friendly name' }],
    });
    expect(e.display(m).text).toBe(m.text);
    expect(e.display({ ...m, platform: 'youtube' }).text).toBe('');
  });
  it('trusts confirmed bot metadata and badge IDs, never bot-like usernames or translated badge labels', () => {
    const e = new SafeChatEngine(),
      m = message('example.com');
    m.user.username = 'TotallyTrustedBot';
    m.user.badges = [{ id: 'other', label: 'moderator' }];
    expect(e.display(m).text).toBe('');
    expect(e.display({ ...m, metadata: { bot: true } }).text).toBe('example.com');
    expect(
      viewerTrust(
        { ...m, user: { ...m.user, badges: [{ id: 'vip/1', label: 'VIP' }] } },
        displayPolicyDefaults(),
      ).vip,
    ).toBe(true);
  });
  it('uses normalized Twitch and YouTube role data', () => {
    const twitch = normalizeTwitch(
      'channel.chat.message',
      {
        broadcaster_user_id: 'owner',
        chatter_user_id: 'viewer',
        message_id: 't',
        message: { text: 'example.com' },
        badges: [{ set_id: 'moderator', id: '1', info: '' }],
      },
      't',
      new Date().toISOString(),
    );
    const yt = normalizeYouTube(
      {
        id: 'y',
        snippet: {
          type: 'textMessageEvent',
          publishedAt: new Date().toISOString(),
          displayMessage: 'example.com',
        },
        authorDetails: { channelId: 'v', displayName: 'V', isChatOwner: true },
      },
      'y',
      'live',
    );
    for (const event of [twitch, yt]) {
      expect(event && 'message' in event).toBe(true);
      if (event && 'message' in event)
        expect(new SafeChatEngine().display(event.message).text).toBe('example.com');
    }
  });
  it('keeps emotes and removes URLs split across fragments or inconsistent provider fragments', () => {
    const e = new SafeChatEngine(),
      m = message('hello example.com ✨');
    m.fragments = [
      { type: 'text', text: 'hello exa' },
      { type: 'text', text: 'mple.com ' },
      { type: 'emote', text: '✨', imageUrl: 'https://cdn.test/emote' },
    ];
    const safe = e.display(m);
    expect(safe.text).toBe('hello ✨');
    expect(safe.fragments?.map((f) => f.text).join('')).toBe(safe.text);
    expect(safe.fragments?.at(-1)?.type).toBe('emote');
    expect(
      e.display({ ...message('ordinary'), fragments: [{ type: 'text', text: 'example.com' }] })
        .fragments,
    ).toBeUndefined();
    expect(
      e.display({ ...message('ordinary'), fragments: [{ type: 'text', text: '!discord' }] })
        .fragments,
    ).toBeUndefined();
  });
  it('does not aggressively interpret obfuscated URLs, versions or email substrings', () => {
    for (const text of ['example . com', 'example dot com', 'версия 1.2.3', 'name@example.com'])
      expect(findLinks(text)).toHaveLength(0);
  });
  it('does not punish commands or URLs; banword detection still uses their original text', async () => {
    const engine = new SafeChatEngine();
    const moderate = vi.fn(async () => {}),
      record = vi.fn(async () => {});
    const worker = new Automoderator({
      engine,
      account: async () => account,
      moderate,
      record,
      update: () => {},
    });
    worker.submit(message('!discord'));
    worker.submit(message('example.com'));
    await worker.close();
    expect(moderate).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
    engine.configure({ ...engine.settings, dictionary: [entry('banword')] });
    expect(engine.display(message('!so banword')).text).toBe('***');
    expect(engine.detect('!so banword')).toHaveLength(1);
  });
  it('protects reply payloads and keeps independent toggles', () => {
    const e = new SafeChatEngine(),
      m = message('hello example.com world');
    m.reply = { messageId: 'reply', username: 'Viewer', text: '!discord' };
    expect(e.display(m).reply?.text).toBe('***');
    e.configure({ ...e.settings, filtering: false });
    expect(e.display(m).text).toBe('hello world');
    e.configure({ ...e.settings, hideViewerLinks: false, commandDisplayMode: 'show' });
    expect(e.display(m).text).toBe(m.text);
    expect(e.display(m).reply?.text).toBe('!discord');
  });
});
