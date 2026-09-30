CREATE TABLE connected_accounts (
 id TEXT PRIMARY KEY, platform TEXT NOT NULL CHECK(platform IN ('twitch','youtube')),
 platform_account_id TEXT NOT NULL, username TEXT NOT NULL, display_name TEXT NOT NULL,
 avatar_url TEXT, created_at TEXT NOT NULL, last_login_at TEXT, enabled INTEGER NOT NULL DEFAULT 1,
 scopes_json TEXT NOT NULL DEFAULT '[]', last_validated_at TEXT,
 UNIQUE(platform, platform_account_id)
);
CREATE TABLE chat_users (
 id TEXT PRIMARY KEY, platform TEXT NOT NULL CHECK(platform IN ('twitch','youtube')),
 platform_user_id TEXT NOT NULL, username TEXT NOT NULL, display_name TEXT NOT NULL,
 avatar_url TEXT, first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL,
 message_count INTEGER NOT NULL DEFAULT 0, UNIQUE(platform, platform_user_id)
);
CREATE INDEX chat_users_last_seen ON chat_users(last_seen_at);
CREATE TABLE settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL);
