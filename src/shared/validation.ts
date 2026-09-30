import { nicknameDefaults } from './nicknameColors';
import { safeChatDefaults } from './safeChat';
import { safeChatSchema } from './safeChatSchema';
import { z } from 'zod';
import { normalizeAppearance } from './chatAppearance';
import { desktopDefaults, experimentalFeatureNames } from './preferences';
import { isFontFamily } from './fonts';
const fontFamilySchema = z.string().trim().refine(isFontFamily, 'Invalid font family');
const autoNumber = (min: number, max: number, integer = false) =>
  z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('auto') }).strict(),
    z
      .object({
        mode: z.literal('manual'),
        value: integer ? z.number().int().min(min).max(max) : z.number().min(min).max(max),
      })
      .strict(),
  ]);
const appearanceSchema = z
  .object({
    version: z.literal(1),
    density: z.enum(['compact', 'normal', 'spacious']),
    avatarSize: autoNumber(16, 80),
    lineHeight: autoNumber(1, 2.5),
    messageSpacing: autoNumber(0, 64),
    displayLimit: autoNumber(10, 500, true),
    maxLines: z.union([z.literal(0), z.literal(3), z.literal(5)]),
  })
  .strict();
export const platformSchema = z.enum(['twitch', 'youtube']);
export const settingsSchema = z
  .object({
    autoDownloadUpdates: z.boolean().default(true),
    safeChat: safeChatSchema.default(safeChatDefaults),
    theme: z.enum(['dark', 'light', 'system']),
    desktop: z
      .object({
        locale: z.enum(['ru', 'en']).default('ru'),
        feedback: z
          .object({
            sounds: z.boolean(),
            volume: z.number().min(0).max(1),
            reducedMotion: z.enum(['system', 'on', 'off']),
          })
          .strict()
          .default(() => desktopDefaults().feedback),
        experimental: z
          .object({
            enabled: z.boolean(),
            features: z.partialRecord(z.enum(experimentalFeatureNames), z.boolean()),
          })
          .strict(),
        chat: z
          .object({
            platform: z.enum(['all', 'twitch', 'youtube']),
            category: z.enum(['all', 'message', 'donation', 'members']),
            senderId: z.string().max(100).optional(),
            fontFamily: fontFamilySchema.optional(),
          })
          .strict(),
      })
      .strict()
      .default(desktopDefaults),
    accent: z.string().regex(/^#[0-9a-f]{6}$/i),
    uiScale: z.number().min(80).max(150),
    developerMode: z.boolean(),
    onboardingComplete: z.boolean(),
    activeTheme: z
      .enum([
        'modern',
        'minimal',
        'bubble',
        'twitch',
        'youtube',
        'overlay',
        'neon',
        'twitch-like',
        'youtube-like',
      ])
      .transform((id) =>
        id === 'twitch-like' ? 'twitch' : id === 'youtube-like' ? 'youtube' : id,
      ),
    overlayPort: z.number().int().min(1024).max(65535).optional(),
  })
  .strict();
export const themeSchema = z
  .object({
    id: z.string().min(1).max(80),
    nicknameColors: z
      .object({
        mode: z.enum(['platform', 'random', 'role', 'single']),
        single: z.string().regex(/^#[0-9a-f]{6}$/i),
        roles: z
          .object({
            owner: z.string().regex(/^#[0-9a-f]{6}$/i),
            moderator: z.string().regex(/^#[0-9a-f]{6}$/i),
            bot: z.string().regex(/^#[0-9a-f]{6}$/i),
            viewer: z.string().regex(/^#[0-9a-f]{6}$/i),
          })
          .strict(),
      })
      .strict()
      .default(() => nicknameDefaults()),
    appearance: appearanceSchema.optional(),
    name: z.string().min(1).max(80),
    background: z.string().regex(/^#[0-9a-f]{6}$/i),
    textColor: z.string().regex(/^#[0-9a-f]{6}$/i),
    fontFamily: fontFamilySchema,
    fontSize: z.number().min(10).max(40),
    usernameFontWeight: z.number().min(400).max(800),
    showAvatar: z.boolean(),
    avatarSize: z.number().min(16).max(112).optional(),
    showBadges: z.boolean(),
    showPlatformIcon: z.boolean(),
    showTimestamps: z.boolean(),
    messageSpacing: z.number().min(0).max(64).optional(),
    borderRadius: z.number().min(0).max(24),
    maxMessages: z.number().int().min(10).max(500).optional(),
    animation: z.enum(['none', 'fade', 'slide-up', 'slide-left', 'scale']),
    layout: z
      .enum([
        'minimal',
        'modern',
        'bubble',
        'twitch',
        'youtube',
        'overlay',
        'neon',
        'twitch-like',
        'youtube-like',
      ])
      .transform((id) =>
        id === 'twitch-like' ? 'twitch' : id === 'youtube-like' ? 'youtube' : id,
      ),
    lineHeight: z.number().min(1).max(2.5).optional(),
    opacity: z.number().min(0).max(100),
    hideCommands: z.boolean(),
    hideBots: z.boolean(),
    multiline: z.boolean().default(true),
    maxLength: z.number().int().min(20).max(2000).default(1000),
    platforms: z.array(platformSchema).max(2),
    lifetime: z.number().int().min(0).max(3600).optional(),
    shadow: z.boolean().optional(),
    messageBackground: z
      .string()
      .regex(/^#[0-9a-f]{6}$/i)
      .optional(),
  })
  .strict()
  .transform(normalizeAppearance);
export const profileSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
    name: z.string().trim().min(1).max(80),
    theme: themeSchema,
  })
  .strict();
export const moderationSchema = z
  .object({
    accountId: z.string().min(1).max(100),
    channelId: z.string().min(1).max(100),
    targetUserId: z.string().min(1).max(100),
    targetUsername: z.string().max(100),
    action: z.enum(['timeout', 'ban', 'unban', 'delete']),
    messageId: z.string().max(100).optional(),
    duration: z.number().int().min(1).max(1209600).optional(),
    reason: z.string().max(500).optional(),
  })
  .strict()
  .superRefine((v, c) => {
    if (v.action === 'timeout' && !v.duration)
      c.addIssue({ code: 'custom', message: 'Duration required' });
    if (v.action === 'delete' && !v.messageId)
      c.addIssue({ code: 'custom', message: 'Message ID required' });
  });
