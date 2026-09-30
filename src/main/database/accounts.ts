import type { DatabaseSync } from 'node:sqlite';
import type { PlatformAccount } from '../../shared/models';
export interface BanRecord {
  accountId: string;
  liveChatId: string;
  userId: string;
  banId: string;
  expiresAt?: string;
}
export class AccountRepository {
  constructor(private db: DatabaseSync) {}
  accounts(): PlatformAccount[] {
    return this.db
      .prepare('SELECT account_json FROM connected_accounts')
      .all()
      .map((r) => JSON.parse(String(r.account_json)) as PlatformAccount)
      .filter((a) => a.id);
  }
  save(a: PlatformAccount) {
    const now = new Date().toISOString();
    this.db.exec('BEGIN');
    try {
      this.db
        .prepare(
          `INSERT INTO connected_accounts(id,platform,platform_account_id,username,display_name,avatar_url,created_at,last_login_at,enabled,scopes_json,last_validated_at,account_json)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET username=excluded.username,display_name=excluded.display_name,avatar_url=excluded.avatar_url,last_login_at=excluded.last_login_at,enabled=excluded.enabled,scopes_json=excluded.scopes_json,last_validated_at=excluded.last_validated_at,account_json=excluded.account_json`,
        )
        .run(
          a.id,
          a.platform,
          a.platformAccountId,
          a.username,
          a.displayName,
          a.avatarUrl ?? null,
          now,
          now,
          Number(a.enabled ?? true),
          JSON.stringify(a.scopes),
          a.lastValidatedAt ?? null,
          JSON.stringify(a),
        );
      this.db
        .prepare(
          `INSERT INTO account_sessions VALUES(?,?,?,?,?) ON CONFLICT(account_id) DO UPDATE SET connection_state=excluded.connection_state,last_error_code=excluded.last_error_code,last_reconnect_at=excluded.last_reconnect_at,updated_at=excluded.updated_at`,
        )
        .run(a.id, a.connectionStatus, a.errorCode ?? null, a.lastReconnectAt ?? null, now);
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  remove(id: string) {
    this.db.prepare('DELETE FROM connected_accounts WHERE id=?').run(id);
    this.db.prepare('DELETE FROM encrypted_credentials WHERE id=?').run(id);
  }
  credential(id: string) {
    return this.db.prepare('SELECT payload FROM encrypted_credentials WHERE id=?').get(id)
      ?.payload as string | undefined;
  }
  setCredential(id: string, payload?: string) {
    if (payload === undefined)
      this.db.prepare('DELETE FROM encrypted_credentials WHERE id=?').run(id);
    else
      this.db
        .prepare(
          'INSERT INTO encrypted_credentials VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at',
        )
        .run(id, payload, new Date().toISOString());
  }
  ban(key: Omit<BanRecord, 'banId' | 'expiresAt'>): BanRecord | undefined {
    const r = this.db
      .prepare(
        'SELECT * FROM youtube_bans WHERE account_id=? AND live_chat_id=? AND target_user_id=?',
      )
      .get(key.accountId, key.liveChatId, key.userId);
    if (!r || (r.expires_at && Date.parse(String(r.expires_at)) <= Date.now())) return;
    return {
      ...key,
      banId: String(r.ban_id),
      expiresAt: r.expires_at ? String(r.expires_at) : undefined,
    };
  }
  saveBan(b: BanRecord) {
    this.db
      .prepare(
        'INSERT INTO youtube_bans VALUES(?,?,?,?,?,?) ON CONFLICT(account_id,live_chat_id,target_user_id) DO UPDATE SET ban_id=excluded.ban_id,expires_at=excluded.expires_at,created_at=excluded.created_at',
      )
      .run(
        b.accountId,
        b.liveChatId,
        b.userId,
        b.banId,
        b.expiresAt ?? null,
        new Date().toISOString(),
      );
  }
  deleteBan(key: Omit<BanRecord, 'banId' | 'expiresAt'>) {
    this.db
      .prepare(
        'DELETE FROM youtube_bans WHERE account_id=? AND live_chat_id=? AND target_user_id=?',
      )
      .run(key.accountId, key.liveChatId, key.userId);
  }
  overlayKey(id: string) {
    return this.db.prepare('SELECT secret FROM overlay_access WHERE profile_id=?').get(id)
      ?.secret as string | undefined;
  }
  setOverlayKey(id: string, secret: string) {
    this.db
      .prepare(
        'INSERT INTO overlay_access VALUES(?,?,?) ON CONFLICT(profile_id) DO UPDATE SET secret=excluded.secret,updated_at=excluded.updated_at',
      )
      .run(id, secret, new Date().toISOString());
  }
}
