import Database from "better-sqlite3";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = join(projectRoot, "data");
const cleanDir = join(dataDir, "clean");
const interimDir = join(dataDir, "interim");
const schemaPath = join(projectRoot, "src", "db", "schema.sql");

type CsvRow = Record<string, string>;
type CsvTable = { headers: string[]; rows: CsvRow[] };

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function readCsv(path: string): CsvTable {
  const [headerRow, ...dataRows] = parseCsv(
    readFileSync(path, "utf8").replace(/^\uFEFF/, ""),
  );
  if (!headerRow) {
    throw new Error(`Empty CSV file: ${path}`);
  }

  const headers = headerRow.map((header) => header.trim());
  const rows = dataRows
    .filter((row) => row.some((cell) => cell.trim() !== ""))
    .map((row) => {
      const record: CsvRow = {};
      headers.forEach((header, index) => {
        record[header] = row[index] ?? "";
      });
      return record;
    });

  return { headers, rows };
}

function numberOrNull(value: string | undefined): number | null {
  const text = (value ?? "").trim();
  if (text === "" || /^(na|n\/a|null|none)$/i.test(text)) {
    return null;
  }
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function textOrNull(value: string | undefined): string | null {
  const text = (value ?? "").trim();
  return text === "" ? null : text;
}

mkdirSync(dataDir, { recursive: true });

const db = new Database(join(dataDir, "app.sqlite"));
db.pragma("journal_mode = WAL");

for (const table of [
  "meal_log",
  "food_aliases",
  "portions",
  "recipes",
  "users",
  "foods",
]) {
  db.exec(`DROP TABLE IF EXISTS ${table}`);
}
db.exec(readFileSync(schemaPath, "utf8"));

const foodTable = readCsv(join(cleanDir, "foods.csv"));
const codeTable = readCsv(join(interimDir, "food_codes.csv"));
const sourceRefs = new Map(
  codeTable.rows.map((row) => [row["food_code"] ?? "", row["source_ref"] ?? ""]),
);

const insertFood = db.prepare(`
  INSERT INTO foods (
    food_id, group_no, name_en, kcal_per_100g, kj_per_100g, energy_flag, source_ref
  ) VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const insertFoods = db.transaction((rows: CsvRow[]) => {
  for (const row of rows) {
    const foodId = textOrNull(row["food_code"]);
    if (!foodId) continue;
    insertFood.run(
      foodId,
      null,
      row["name_en"] ?? "",
      numberOrNull(row["energy_kcal"]),
      numberOrNull(row["energy_kj"]),
      textOrNull(row["energy_flag"]),
      textOrNull(sourceRefs.get(foodId)),
    );
  }
});
insertFoods(foodTable.rows);

const aliasTable = readCsv(join(cleanDir, "food_aliases.csv"));
const insertAlias = db.prepare(`
  INSERT INTO food_aliases (food_id, alias, language, kind) VALUES (?, ?, ?, ?)
`);

const insertAliases = db.transaction((rows: CsvRow[]) => {
  for (const row of rows) {
    const foodId = textOrNull(row["food_code"]);
    const alias = textOrNull(row["alias"]);
    if (!foodId || !alias) continue;
    insertAlias.run(
      foodId,
      alias,
      textOrNull(row["language"]),
      textOrNull(row["kind"]),
    );
  }
});
insertAliases(aliasTable.rows);

let recipeCount = 0;
let recipeStatus = "not found";
const recipePath = join(interimDir, "recipe_ingredients.csv");
if (existsSync(recipePath)) {
  const recipeTable = readCsv(recipePath);
  const required = [
    "recipe_code",
    "ingredient_code",
    "grams_per_100g_recipe",
  ];
  const canMap = required.every((column) =>
    recipeTable.headers.includes(column),
  );
  if (canMap) {
    const insertRecipe = db.prepare(`
      INSERT INTO recipes (dish_id, ingredient_food_id, grams, yield_g)
      VALUES (?, ?, ?, ?)
    `);
    const insertRecipes = db.transaction((rows: CsvRow[]) => {
      for (const row of rows) {
        const dishId = textOrNull(row["recipe_code"]);
        const foodId = textOrNull(row["ingredient_code"]);
        const grams = numberOrNull(row["grams_per_100g_recipe"]);
        const yieldG = numberOrNull(row["yield_g"]);
        if (!dishId || !foodId || grams === null) continue;
        insertRecipe.run(dishId, foodId, grams, yieldG);
        recipeCount += 1;
      }
    });
    insertRecipes(recipeTable.rows);
    recipeStatus = "imported; yield_factor is not mapped to yield_g";
  } else {
    recipeStatus = `skipped; missing columns: ${required
      .filter((column) => !recipeTable.headers.includes(column))
      .join(", ")}`;
  }
}

let portionCount = 0;
let portionStatus = "not found; table left empty";
const portionsPath = join(cleanDir, "portions.csv");
if (existsSync(portionsPath)) {
  const portionTable = readCsv(portionsPath);
  const foodColumn = ["food_code", "food_id"].find((column) =>
    portionTable.headers.includes(column),
  );
  const canMap =
    foodColumn !== undefined &&
    portionTable.headers.includes("measure") &&
    portionTable.headers.includes("grams");
  if (canMap && foodColumn) {
    const insertPortion = db.prepare(`
      INSERT INTO portions (food_id, measure, grams) VALUES (?, ?, ?)
    `);
    const insertPortions = db.transaction((rows: CsvRow[]) => {
      for (const row of rows) {
        const foodId = textOrNull(row[foodColumn]);
        const measure = textOrNull(row["measure"]);
        const grams = numberOrNull(row["grams"]);
        if (!foodId || !measure || grams === null) continue;
        insertPortion.run(foodId, measure, grams);
        portionCount += 1;
      }
    });
    insertPortions(portionTable.rows);
    portionStatus = "imported";
  } else {
    portionStatus = "skipped; expected food_code/food_id, measure, grams";
  }
}

function countRows(table: string): number {
  const row = db
    .prepare(`SELECT COUNT(*) AS count FROM ${table}`)
    .get() as { count: number };
  return row.count;
}

console.log("row counts:");
for (const table of [
  "foods",
  "food_aliases",
  "portions",
  "recipes",
  "users",
  "meal_log",
]) {
  console.log(`  ${table}: ${countRows(table)}`);
}
console.log(`recipes source: ${recipeStatus}`);
console.log(`portions source: ${portionStatus}`);

const missingIngredients = db
  .prepare(
    `SELECT COUNT(*) AS count
     FROM recipes r
     LEFT JOIN foods f ON f.food_id = r.ingredient_food_id
     WHERE f.food_id IS NULL`,
  )
  .get() as { count: number };
console.log(`recipe ingredients missing from foods: ${missingIngredients.count}`);

type LookupRow = Record<string, unknown>;

function showLookup(title: string, rows: LookupRow[]): void {
  console.log(`\n${title}:`);
  if (rows.length === 0) {
    console.log("  (no rows)");
    return;
  }
  console.table(rows);
}

showLookup(
  "Chichewa alias exact match (case-insensitive): Zitumbuwa",
  db
    .prepare(
      `SELECT f.food_id, f.name_en, f.kcal_per_100g, a.alias
       FROM foods f
       JOIN food_aliases a ON a.food_id = f.food_id
       WHERE lower(a.alias) = lower(?)`,
    )
    .all("Zitumbuwa") as LookupRow[],
);

showLookup(
  "Alias/name prefix match: nsima",
  db
    .prepare(
      `SELECT DISTINCT f.food_id, f.name_en, f.kcal_per_100g, a.alias
       FROM foods f
       LEFT JOIN food_aliases a ON a.food_id = f.food_id
       WHERE lower(f.name_en) LIKE lower(?) OR lower(a.alias) LIKE lower(?)
       LIMIT 5`,
    )
    .all("nsima%", "nsima%") as LookupRow[],
);

showLookup(
  "Name substring match: bread",
  db
    .prepare(
      `SELECT DISTINCT f.food_id, f.name_en, f.kcal_per_100g
       FROM foods f
       WHERE lower(f.name_en) LIKE lower(?)
       LIMIT 5`,
    )
    .all("%bread%") as LookupRow[],
);

showLookup(
  "Foods with NULL energy",
  db
    .prepare(
      `SELECT food_id, name_en, kcal_per_100g, kj_per_100g, energy_flag
       FROM foods
       WHERE kcal_per_100g IS NULL OR kj_per_100g IS NULL
       LIMIT 5`,
    )
    .all() as LookupRow[],
);

showLookup(
  "Zero-energy food sample: water",
  db
    .prepare(
      `SELECT food_id, name_en, kcal_per_100g, kj_per_100g, energy_flag
       FROM foods WHERE food_id = ?`,
    )
    .all("MW08_0008") as LookupRow[],
);

db.close();
