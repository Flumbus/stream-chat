import { DatabaseSync } from 'node:sqlite';
import initial from './migrations/001_initial.sql?raw';
import moderation from './migrations/002_moderation_history.sql?raw';
import profiles from './migrations/003_overlay_profiles.sql?raw';
import accounts from './migrations/004_accounts_sessions.sql?raw';
import overlayAccess from './migrations/005_overlay_access.sql?raw';
import { AccountRepository } from './accounts';
import type {
  ChatMessage,
  ChatProfile,
  ModerationRecord,
  Settings,
  StoredUser,
} from '../../shared/models';
import { defaultSettings, themes } from '../../shared/themes';
import { profileSchema, settingsSchema } from '../../shared/validation';

export const migrations = [initial, moderation, profiles, accounts, overlayAccess];
export function migrate(db: DatabaseSync, scripts = migrations) {
  const version = Number(db.prepare('PRAGMA user_version').get()?.user_version);
  if (version > scripts.length)
    throw new Error('Database was created by a newer StreamChat version');
  for (let i = version; i < scripts.length; i++) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(scripts[i]);
      db.exec(`PRAGMA user_version = ${i + 1}`);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}
export class Store {
  readonly db: DatabaseSync;
  readonly accounts: AccountRepository;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    migrate(this.db);
    this.accounts = new AccountRepository(this.db);
  }
  getSettings(): Settings {
    const row = this.db.prepare('SELECT value_json FROM settings WHERE key=?').get('app');
    return row ? settingsSchema.parse(JSON.parse(String(row.value_json))) : { ...defaultSettings };
  }
  saveSettings(settings: Settings) {
    this.db
      .prepare(
        'INSERT INTO settings(key,value_json) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json',
      )
      .run('app', JSON.stringify(settingsSchema.parse(settings)));
  }
  getProfiles(): ChatProfile[] {
    return this.db
      .prepare('SELECT * FROM chat_profiles ORDER BY created_at')
      .all()
      .map((r) =>
        profileSchema.parse({ id: r.id, name: r.name, theme: JSON.parse(String(r.theme_json)) }),
      );
  }
  saveProfile(profile: ChatProfile) {
    const p = profileSchema.parse(profile);
    const now = new Date().toISOString();
    this.db
      .prepare(
        'INSERT INTO chat_profiles(id,name,theme_json,created_at,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,theme_json=excluded.theme_json,updated_at=excluded.updated_at',
      )
      .run(p.id, p.name, JSON.stringify(p.theme), now, now);
  }
  seedProfiles() {
    if (!this.getProfiles().length)
      this.saveProfile({ id: 'default', name: 'Default', theme: themes[0] });
  }
  recordMessages(messages: ChatMessage[]) {
    const statement = this.db
      .prepare(`INSERT INTO chat_users(id,platform,platform_user_id,username,display_name,avatar_url,first_seen_at,last_seen_at,message_count)
      VALUES(?,?,?,?,?,?,?,?,1) ON CONFLICT(platform,platform_user_id) DO UPDATE SET
      username=excluded.username,display_name=excluded.display_name,avatar_url=excluded.avatar_url,
      last_seen_at=MAX(chat_users.last_seen_at,excluded.last_seen_at),message_count=chat_users.message_count+1`);
    this.db.exec('BEGIN');
    try {
      for (const m of messages)
        statement.run(
          `${m.platform}:${m.user.platformUserId}`,
          m.platform,
          m.user.platformUserId,
          m.user.username,
          m.user.displayName,
          m.user.avatarUrl ?? null,
          m.createdAt,
          m.createdAt,
        );
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  getUsers(): StoredUser[] {
    return this.db
      .prepare('SELECT * FROM chat_users ORDER BY last_seen_at DESC LIMIT 1000')
      .all() as unknown as StoredUser[];
  }
  recordModeration(r: ModerationRecord) {
    this.db
      .prepare(
        'INSERT INTO moderation_actions(id,account_id,platform,channel_id,target_user_id,target_username,action,duration,reason,created_at,success,error,external_ban_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
      )
      .run(
        r.id,
        r.accountId,
        r.platform,
        r.channelId,
        r.targetUserId,
        r.targetUsername,
        r.action,
        r.duration ?? null,
        r.reason ?? null,
        r.createdAt,
        Number(r.success),
        r.error ?? null,
        r.externalBanId ?? null,
      );
  }
  history(): ModerationRecord[] {
    return this.db
      .prepare('SELECT * FROM moderation_actions ORDER BY created_at DESC LIMIT 200')
      .all()
      .map((r) => ({
        id: String(r.id),
        accountId: String(r.account_id),
        platform: r.platform as ModerationRecord['platform'],
        channelId: String(r.channel_id),
        targetUserId: String(r.target_user_id),
        targetUsername: String(r.target_username),
        action: r.action as ModerationRecord['action'],
        duration: r.duration == null ? undefined : Number(r.duration),
        reason: r.reason == null ? undefined : String(r.reason),
        createdAt: String(r.created_at),
        success: Boolean(r.success),
        error: r.error == null ? undefined : String(r.error),
        externalBanId: r.external_ban_id == null ? undefined : String(r.external_ban_id),
      }));
  }
  close() {
    this.db.close();
  }
}
