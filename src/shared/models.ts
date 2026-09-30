export type Platform = 'twitch' | 'youtube';
export type ConnectionStatus =
  | 'disconnected'
  | 'authorizing'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'offline'
  | 'error';
export type EventKind =
  | 'message'
  | 'subscription'
  | 'membership'
  | 'donation'
  | 'raid'
  | 'follow'
  | 'moderation'
  | 'system';
export interface ChatBadge {
  id: string;
  label: string;
  imageUrl?: string;
}
export interface ChatUser {
  platformUserId: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  color?: string;
  roles: string[];
  badges: ChatBadge[];
}
export type MessageFragment =
  { type: 'text'; text: string } | { type: 'emote'; text: string; imageUrl?: string };
export interface ChatMessage {
  displayPolicy?: import('./displayPolicy').DisplayAnnotation;
  safeChat?: import('./safeChat').SafeAnnotation;
  id: string;
  accountId: string;
  platform: Platform;
  channelId: string;
  user: ChatUser;
  text: string;
  fragments?: MessageFragment[];
  createdAt: string;
  kind: EventKind;
  source?: 'mock' | 'live';
  reply?: { messageId: string; username: string; text: string };
  metadata?: {
    amount?: string;
    banned?: boolean;
    timeoutUntil?: string;
    bot?: boolean;
    overlayHidden?: boolean;
  };
}
export type StreamEvent =
  | { type: 'chat'; message: ChatMessage }
  | {
      type: 'subscription' | 'membership' | 'donation' | 'raid' | 'follow' | 'system';
      message: ChatMessage;
    }
  | {
      type: 'moderation';
      platform: Platform;
      channelId: string;
      targetUserId: string;
      action: ModerationAction | 'purge';
      messageId?: string;
      duration?: number;
      source?: 'mock' | 'live';
      occurredAt?: string;
    }
  | { type: 'clear'; platform?: Platform; channelId?: string; source?: 'mock' | 'live' };
export interface ChannelTarget {
  id: string;
  title: string;
  channelId: string;
  liveChatId?: string;
  live: boolean;
}
export interface PlatformAccount {
  readOnlyLink?: string;
  id: string;
  platform: Platform;
  platformAccountId: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  scopes: string[];
  authStatus: 'demo' | 'authorized' | 'expired' | 'signed-out';
  connectionStatus: ConnectionStatus;
  lastValidatedAt?: string;
  capabilities: {
    send: boolean;
    timeout: boolean;
    ban: boolean;
    unban: boolean;
    delete: boolean;
    readProfile?: boolean;
  };
  channel?: ChannelTarget;
  enabled?: boolean;
  lastError?: string;
  errorCode?: string;
  lastReconnectAt?: string;
  transportState?: string;
}
export type ModerationAction = 'timeout' | 'ban' | 'unban' | 'delete';
export interface ModerationRequest {
  accountId: string;
  channelId: string;
  targetUserId: string;
  targetUsername: string;
  action: ModerationAction;
  messageId?: string;
  duration?: number;
  reason?: string;
}
export interface StoredUser {
  id: string;
  platform: Platform;
  platform_user_id: string;
  username: string;
  display_name: string;
  first_seen_at: string;
  last_seen_at: string;
  message_count: number;
  source?: 'mock' | 'live';
  avatar_url?: string;
}
export interface ModerationRecord extends Omit<ModerationRequest, 'action'> {
  action: ModerationAction | 'none';
  id: string;
  platform: Platform;
  createdAt: string;
  success: boolean;
  error?: string;
  externalBanId?: string;
}
export type DemoScenario =
  'message' | 'member' | 'donation' | 'long' | 'emotes' | 'moderator' | 'banned';
export interface ChatTheme {
  nicknameColors?: import('./nicknameColors').NicknameColors;
  appearance?: ChatAppearance;
  id: string;
  name: string;
  background: string;
  textColor: string;
  fontFamily: string;
  fontSize: number;
  usernameFontWeight: number;
  showAvatar: boolean;
  avatarSize: number;
  showBadges: boolean;
  showPlatformIcon: boolean;
  showTimestamps: boolean;
  messageSpacing: number;
  borderRadius: number;
  maxMessages: number;
  animation: 'none' | 'fade' | 'slide-up' | 'slide-left' | 'scale';
  layout: 'minimal' | 'modern' | 'bubble' | 'twitch' | 'youtube' | 'overlay' | 'neon';
  lineHeight: number;
  opacity: number;
  hideCommands: boolean;
  hideBots: boolean;
  multiline: boolean;
  maxLength: number;
  platforms: Platform[];
  lifetime?: number;
  shadow?: boolean;
  messageBackground?: string;
}
export type AutoValue<T> = { mode: 'auto' } | { mode: 'manual'; value: T };
export type MessageDensity = 'compact' | 'normal' | 'spacious';
export interface ChatAppearance {
  version: 1;
  density: MessageDensity;
  avatarSize: AutoValue<number>;
  lineHeight: AutoValue<number>;
  messageSpacing: AutoValue<number>;
  displayLimit: AutoValue<number>;
  maxLines: 0 | 3 | 5;
}
export interface ChatProfile {
  id: string;
  name: string;
  theme: ChatTheme;
}
export interface Settings {
  autoDownloadUpdates?: boolean;
  safeChat?: import('./safeChat').SafeChatSettings;
  desktop?: import('./preferences').DesktopPreferences;
  theme: 'dark' | 'light' | 'system';
  accent: string;
  uiScale: number;
  developerMode: boolean;
  onboardingComplete: boolean;
  activeTheme: string;
  overlayPort?: number;
}
export interface OAuthState {
  platform: Platform;
  state: 'idle' | 'authorizing' | 'error';
  message?: string;
  userCode?: string;
}
export interface OverlayStatus {
  port: number;
  clients: number;
  running: boolean;
  error?: string;
}
export interface UserCard {
  user?: StoredUser;
  profile?: ChatUser;
  history: ModerationRecord[];
  canUnban: boolean;
  banReason?: string;
  timeoutUntil?: string;
  banned: boolean;
}
export interface Snapshot {
  messages: ChatMessage[];
  accounts: PlatformAccount[];
  settings: Settings;
  profiles: ChatProfile[];
  running: boolean;
  databasePath: string;
  oauth?: OAuthState[];
  configured?: Record<Platform, boolean>;
  overlay?: OverlayStatus;
}
export type BackendEvent =
  | { type: 'events'; events: StreamEvent[] }
  | { type: 'state'; snapshot: Snapshot }
  | { type: 'error'; message: string };
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
