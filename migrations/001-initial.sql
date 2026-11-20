CREATE TABLE IF NOT EXISTS records (
  collection TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT CHECK(data IS NULL OR json_valid(data)),
  revision INTEGER NOT NULL CHECK(revision > 0),
  PRIMARY KEY(collection, id)
);

CREATE TABLE IF NOT EXISTS mutations (
  id TEXT PRIMARY KEY,
  collection TEXT NOT NULL,
  record_id TEXT NOT NULL,
  data TEXT,
  base_revision INTEGER NOT NULL,
  applied INTEGER NOT NULL DEFAULT 0
);

CREATE TRIGGER IF NOT EXISTS apply_mutation
AFTER INSERT ON mutations
WHEN COALESCE((
  SELECT revision FROM records
  WHERE collection = NEW.collection AND id = NEW.record_id
), 0) = NEW.base_revision
BEGIN
  INSERT INTO records (collection, id, data, revision)
  VALUES (NEW.collection, NEW.record_id, NEW.data, NEW.base_revision + 1)
  ON CONFLICT(collection, id) DO UPDATE
  SET data = excluded.data, revision = excluded.revision;

  UPDATE mutations SET applied = 1 WHERE id = NEW.id;
END;

CREATE TABLE IF NOT EXISTS login_limits (
  key TEXT PRIMARY KEY,
  window INTEGER NOT NULL,
  attempts INTEGER NOT NULL
);
