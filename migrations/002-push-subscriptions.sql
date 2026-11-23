CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  member TEXT NOT NULL CHECK(member IN ('p1', 'p2')),
  subscription TEXT NOT NULL CHECK(json_valid(subscription)),
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS push_subscriptions_member ON push_subscriptions(member);
