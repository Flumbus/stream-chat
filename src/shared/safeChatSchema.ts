import { z } from 'zod';
const flags = z.object({ filtering: z.boolean(), automoderation: z.boolean() }).strict();
const punishment = z
  .object({
    action: z.enum(['none', 'delete', 'timeout', 'ban']),
    duration: z.number().int().min(1).max(1209600),
  })
  .strict();
export const safeChatSchema = z
  .object({
    version: z.literal(1),
    commandDisplayMode: z.enum(['show', 'mask', 'hide']).default('mask'),
    commandPrefixes: z
      .array(
        z
          .string()
          .min(1)
          .max(8)
          .regex(/^[^\s\p{Cf}]+$/u),
      )
      .min(1)
      .max(10)
      .default(() => ['!']),
    hideViewerLinks: z.boolean().default(true),
    allowSubscriberLinks: z.boolean().default(false),
    trustedUsers: z
      .array(
        z
          .object({
            platform: z.enum(['twitch', 'youtube']),
            userId: z.string().min(1).max(100),
            label: z.string().max(100),
          })
          .strict(),
      )
      .max(500)
      .default(() => []),
    filtering: z.boolean(),
    automoderation: z.boolean(),
    commonRules: z.boolean(),
    platforms: z.object({ twitch: flags, youtube: flags }).strict(),
    dictionary: z
      .array(
        z
          .object({
            id: z.string().regex(/^[\w-]{1,80}$/),
            text: z
              .string()
              .trim()
              .min(2)
              .max(100)
              .refine((t) => /[\p{L}\p{N}]/u.test(t), 'Введите слово или фразу'),
            category: z.enum(['soft', 'blocked', 'exception']),
          })
          .strict(),
      )
      .max(500)
      .refine(
        (entries) => new Set(entries.map((e) => e.id)).size === entries.length,
        'Повторяющийся ID',
      ),
    punishments: z.object({ soft: punishment, blocked: punishment }).strict(),
    kindMode: z
      .object({ enabled: z.boolean(), replacement: z.string().trim().min(1).max(80) })
      .strict(),
  })
  .strict();
