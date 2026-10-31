import Database from "better-sqlite3";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(here, "../..");
const dataDir = join(projectRoot, "data");

mkdirSync(dataDir, { recursive: true });

export const db: Database.Database = new Database(join(dataDir, "app.sqlite"));
db.pragma("journal_mode = WAL");
db.exec(readFileSync(join(projectRoot, "src/db/schema.sql"), "utf8"));
