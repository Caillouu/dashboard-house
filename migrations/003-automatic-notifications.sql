CREATE TABLE IF NOT EXISTS notification_deliveries (
  kind TEXT NOT NULL,
  period TEXT NOT NULL,
  member TEXT NOT NULL CHECK(member IN ('p1', 'p2')),
  PRIMARY KEY(kind, period, member)
);
