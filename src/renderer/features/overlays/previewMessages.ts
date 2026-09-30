import type { ChatMessage, Platform } from '../../../shared/models';
import avatarUrl from '../../assets/preview-avatar.jpg';

// Local presentation data only: never sent to the backend, history or OBS.
export function createPreviewMessages(platforms: Platform[]): ChatMessage[] {
  const timestamp = Date.now();
  return ['Всем привет, вот так будет выглядеть сообщение!', 'тут могла быть ваша реклама :)'].map(
    (text, index) => ({
      id: `appearance-preview-${index}`,
      accountId: 'appearance-preview',
      channelId: 'appearance-preview',
      platform: platforms[index % platforms.length] ?? 'twitch',
      user: {
        platformUserId: 'appearance-preview-flamberor',
        username: 'flamberor',
        displayName: 'flamberor',
        avatarUrl,
        color: '#b9f36b',
        roles: [],
        badges: [],
      },
      text,
      createdAt: new Date(timestamp + index).toISOString(),
      kind: 'message',
    }),
  );
}
