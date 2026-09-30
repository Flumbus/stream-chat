CREATE TABLE moderation_actions (
 id TEXT PRIMARY KEY, account_id TEXT NOT NULL, platform TEXT NOT NULL, channel_id TEXT NOT NULL,
 target_user_id TEXT NOT NULL, target_username TEXT NOT NULL, action TEXT NOT NULL,
 duration INTEGER, reason TEXT, created_at TEXT NOT NULL, success INTEGER NOT NULL,
 error TEXT, external_ban_id TEXT
);
CREATE INDEX moderation_target ON moderation_actions(platform,channel_id,target_user_id,created_at);
