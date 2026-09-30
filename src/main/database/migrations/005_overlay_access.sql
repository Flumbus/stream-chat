CREATE TABLE overlay_access (
 profile_id TEXT PRIMARY KEY REFERENCES chat_profiles(id) ON DELETE CASCADE,
 secret TEXT NOT NULL, updated_at TEXT NOT NULL
);
