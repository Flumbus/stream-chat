import type { ChatTheme, ChatMessage } from '../../../shared/models';
import { MessageRow } from '../../components/ChatRenderer';
import { chatStyle } from '../../components/chatStyle';
import { resolveAppearance } from '../../../shared/chatAppearance';
const message: ChatMessage = {
  id: 'mini',
  accountId: 'preview',
  channelId: 'preview',
  platform: 'twitch',
  createdAt: '2026-01-01T12:00:00Z',
  kind: 'message',
  text: 'Hello, chat!',
  user: {
    platformUserId: 'mini',
    username: 'flamberor',
    displayName: 'flamberor',
    roles: [],
    badges: [],
  },
};
export function PresetPreview({ theme }: { theme: ChatTheme }) {
  const computed = resolveAppearance({ ...theme, fontSize: 12 });
  return (
    <span className="preset-mini" aria-hidden="true" inert>
      <span className={`chat-renderer layout-${theme.layout}`} style={chatStyle(computed)}>
        <MessageRow message={message} theme={computed} enter={false} decorative />
      </span>
    </span>
  );
}
