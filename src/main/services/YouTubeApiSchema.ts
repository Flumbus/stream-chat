import { z } from 'zod';
const id = z
  .string()
  .min(1)
  .max(500)
  .regex(/^[A-Za-z0-9_-]+$/);
const cursor = z
  .string()
  .min(1)
  .max(2048)
  .regex(/^[A-Za-z0-9_+/=-]+$/);
const channel = z.string().regex(/^UC[A-Za-z0-9_-]{22}$/);
const safeText = z.string().max(20000);
export const youtubeQueries = {
  channels: z
    .object({
      part: z.literal('id'),
      forHandle: z
        .string()
        .min(1)
        .max(100)
        .regex(/^@?[\p{L}\p{N}_.-]+$/u)
        .optional(),
      forUsername: z
        .string()
        .min(1)
        .max(100)
        .regex(/^[\p{L}\p{N}_.-]+$/u)
        .optional(),
    })
    .strict()
    .refine((v) => Boolean(v.forHandle) !== Boolean(v.forUsername)),
  search: z
    .object({
      part: z.literal('id'),
      channelId: channel,
      eventType: z.literal('live'),
      type: z.literal('video'),
      maxResults: z.literal('5'),
    })
    .strict(),
  videos: z
    .object({
      part: z.literal('snippet,liveStreamingDetails'),
      id: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
    })
    .strict(),
  liveChatMessages: z.object({ liveChatId: id, pageToken: cursor.optional() }).strict(),
};
export const youtubeResponses = {
  channels: z.object({
    items: z
      .array(z.object({ id: channel }))
      .max(50)
      .default([]),
  }),
  search: z.object({
    items: z
      .array(z.object({ id: z.object({ videoId: z.string().max(20) }) }))
      .max(5)
      .default([]),
  }),
  videos: z.object({
    items: z
      .array(
        z.object({
          id: z.string().max(20),
          snippet: z.object({ title: safeText, channelId: channel }),
          liveStreamingDetails: z.object({ activeLiveChatId: id.optional() }).optional(),
        }),
      )
      .max(1)
      .default([]),
  }),
  liveChatMessages: z.object({
    nextPageToken: cursor.optional(),
    offlineAt: safeText.optional(),
    pollingIntervalMillis: z.number().min(1000).max(120000).default(5000),
    items: z
      .array(
        z.object({
          id,
          snippet: z.object({
            type: safeText,
            publishedAt: safeText,
            liveChatId: id.optional(),
            authorChannelId: id.optional(),
            displayMessage: safeText.optional(),
            textMessageDetails: z.object({ messageText: safeText }).optional(),
            userBannedDetails: z
              .object({
                bannedUserDetails: z.object({ channelId: id }),
                banType: safeText,
                banDurationSeconds: z.union([z.string(), z.number()]).optional(),
              })
              .optional(),
            superChatDetails: z.object({ amountDisplayString: safeText }).optional(),
            superStickerDetails: z
              .object({
                amountDisplayString: safeText,
                superStickerMetadata: z.object({ altText: safeText }).optional(),
              })
              .optional(),
          }),
          authorDetails: z
            .object({
              channelId: id,
              displayName: safeText,
              profileImageUrl: z
                .url()
                .max(2000)
                .refine((v) => new URL(v).protocol === 'https:')
                .optional(),
              isChatOwner: z.boolean().optional(),
              isChatModerator: z.boolean().optional(),
              isChatSponsor: z.boolean().optional(),
              isVerified: z.boolean().optional(),
            })
            .optional(),
        }),
      )
      .max(2000)
      .default([]),
  }),
};
