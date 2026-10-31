CREATE TABLE IF NOT EXISTS foods (
  food_id TEXT PRIMARY KEY,
  group_no INTEGER,
  name_en TEXT NOT NULL,
  kcal_per_100g REAL,
  kj_per_100g REAL,
  energy_flag TEXT,
  source_ref TEXT,
  protein_g REAL,
  fat_g REAL,
  carbohydrate_total_g REAL,
  moisture_g REAL
);

CREATE TABLE IF NOT EXISTS food_aliases (
  food_id TEXT,
  alias TEXT NOT NULL,
  language TEXT,
  kind TEXT
);

CREATE INDEX IF NOT EXISTS idx_food_aliases_alias_lower
  ON food_aliases (lower(alias));

CREATE TABLE IF NOT EXISTS portions (
  food_id TEXT,
  measure TEXT NOT NULL,
  grams REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS recipes (
  dish_id TEXT,
  ingredient_food_id TEXT,
  grams REAL NOT NULL,
  yield_g REAL
);

CREATE TABLE IF NOT EXISTS components (
  component TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  unit TEXT NOT NULL,
  infoods_tag TEXT
);

CREATE TABLE IF NOT EXISTS food_values (
  food_code TEXT NOT NULL,
  component TEXT NOT NULL,
  value REAL,
  unit TEXT NOT NULL,
  flag TEXT,
  raw_text TEXT,
  PRIMARY KEY (food_code, component)
);

CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  daily_kcal_goal REAL,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS meal_log (
  id INTEGER PRIMARY KEY,
  meal_id TEXT,
  user_id TEXT,
  logged_at TEXT,
  food_id TEXT,
  grams REAL,
  kcal REAL,
  protein_g REAL,
  fat_g REAL,
  carbohydrate_g REAL
);
