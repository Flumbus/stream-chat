ALTER TABLE connected_accounts ADD COLUMN account_json TEXT NOT NULL DEFAULT '{}';
CREATE TABLE encrypted_credentials (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE account_sessions (
 account_id TEXT PRIMARY KEY REFERENCES connected_accounts(id) ON DELETE CASCADE,
 connection_state TEXT NOT NULL, last_error_code TEXT, last_reconnect_at TEXT, updated_at TEXT NOT NULL
);
CREATE TABLE youtube_bans (
 account_id TEXT NOT NULL REFERENCES connected_accounts(id) ON DELETE CASCADE,
 live_chat_id TEXT NOT NULL, target_user_id TEXT NOT NULL, ban_id TEXT NOT NULL,
 expires_at TEXT, created_at TEXT NOT NULL,
 PRIMARY KEY(account_id, live_chat_id, target_user_id)
);
