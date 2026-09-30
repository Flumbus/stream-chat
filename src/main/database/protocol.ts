import type {
  ChatMessage,
  ChatProfile,
  ModerationRecord,
  Settings,
  StoredUser,
  PlatformAccount,
} from '../../shared/models';
import type { BanRecord } from './accounts';
export interface DatabaseMethods {
  init: { input: undefined; output: { settings: Settings; profiles: ChatProfile[] } };
  settings: { input: Settings; output: void };
  profile: { input: ChatProfile; output: void };
  messages: { input: ChatMessage[]; output: void };
  users: { input: undefined; output: StoredUser[] };
  moderation: { input: ModerationRecord; output: void };
  history: { input: undefined; output: ModerationRecord[] };
  close: { input: undefined; output: void };
  accounts: { input: undefined; output: PlatformAccount[] };
  saveAccount: { input: PlatformAccount; output: void };
  deleteAccount: { input: string; output: void };
  credential: { input: string; output: string | undefined };
  saveCredential: { input: { id: string; payload?: string }; output: void };
  ban: { input: Omit<BanRecord, 'banId' | 'expiresAt'>; output: BanRecord | undefined };
  saveBan: { input: BanRecord; output: void };
  deleteBan: { input: Omit<BanRecord, 'banId' | 'expiresAt'>; output: void };
  overlayKey: { input: string; output: string | undefined };
  saveOverlayKey: { input: { id: string; secret: string }; output: void };
}
