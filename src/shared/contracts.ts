import type {
  BackendEvent,
  ChatProfile,
  DemoScenario,
  ModerationRecord,
  ModerationRequest,
  Platform,
  PlatformAccount,
  Settings,
  Snapshot,
  StoredUser,
  StreamEvent,
  ChannelTarget,
  ChatUser,
  UserCard,
} from './models';
export interface PlatformAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getCurrentAccount(): Promise<PlatformAccount>;
  startChat(): Promise<void>;
  stopChat(): Promise<void>;
  sendMessage(message: string): Promise<void>;
  timeoutUser(userId: string, duration: number, reason?: string): Promise<void>;
  banUser(userId: string, reason?: string): Promise<void>;
  unbanUser(userId: string): Promise<void>;
  deleteMessage(messageId: string): Promise<void>;
  subscribe(listener: (event: StreamEvent) => void): () => void;
  restoreSession?(): Promise<void>;
  getUser?(userId: string): Promise<ChatUser | undefined>;
  listChannels?(): Promise<ChannelTarget[]>;
  selectChannel?(target: string): Promise<void>;
}
export interface ChatBackend {
  originalMessage(key: string): Promise<string>;
  addChannelLink(platform: Platform, url: string): Promise<void>;
  snapshot(): Promise<Snapshot>;
  subscribe(listener: (event: BackendEvent) => void): () => void;
  setRunning(running: boolean): Promise<void>;
  send(accountId: string, message: string): Promise<void>;
  moderate(request: ModerationRequest): Promise<void>;
  getUsers(): Promise<StoredUser[]>;
  getModerationHistory(): Promise<ModerationRecord[]>;
  saveSettings(settings: Settings): Promise<void>;
  saveProfile(profile: ChatProfile): Promise<void>;
  generate(platform: Platform, scenario: DemoScenario, count: number): Promise<void>;
  openLogs(): Promise<void>;
  authorize(platform: Platform, moderation: boolean): Promise<void>;
  cancelAuthorization(platform: Platform): Promise<void>;
  accountAction(id: string, action: 'connect' | 'disconnect' | 'logout'): Promise<void>;
  listChannels(id: string): Promise<ChannelTarget[]>;
  selectChannel(id: string, target: string): Promise<void>;
  getUserCard(message: { accountId: string; userId: string }): Promise<UserCard>;
  overlayUrl(profileId: string): Promise<string>;
  openOverlay(profileId: string): Promise<void>;
  resetOverlay(profileId: string): Promise<void>;
}
declare global {
  interface Window {
    streamchat: ChatBackend;
  }
}
