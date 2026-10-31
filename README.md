# Malawi Food Tracker

A terminal (Ink) agent that looks up Malawian foods and shows the calories and nutrients in a meal, with daily totals, household-measure portions, undo, and a nutrient extraction pipeline for the MAFOODS tables.

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start the Ink TUI. Requires `GROQ_API_KEY` and `GROQ_MODEL` in `.env` (copy from `.env.example`). |
| `npm run setup-data` | Run name splitting, energy validation, and data import. |
| `npm run import-data` | Rebuild `data/app.sqlite` from `data/clean/*.csv` via `scripts/import_data.ts`. |
| `npm run typecheck` | TypeScript check (`tsc --noEmit`). |
| `npm run build` | Compile TypeScript to `dist/`. |
| `npm run agent-test` | Run scenario checks against the agent loop (needs a working Groq API key). |

## Data flow

- `data/clean/foods.csv` — foods with per-100 g moisture, energy, protein, fat, carbohydrate.
- `data/clean/food_aliases.csv` — name aliases used by `search_food`.
- `data/clean/portions.csv` — household measures (plate, spoon, cup, piece/slice) with gram defaults. See `data/clean/PORTIONS_README.md` (rough placeholder estimates awaiting weighing by hand).
- `scripts/import_data.ts` — rebuilds `data/app.sqlite`, including `foods`, `food_values`, `components`, `portions`, `meal_log`.
- `data/raw/` — expected to hold the MAFOODS nutrient PDF (pages 18-76 cover Groups 1-8). No PDF is present yet; see below.

## Notes

- Every nutrient/calorie number comes from the database, never from the LLM. A missing value is `NULL`, never `0`; totals that depend on a missing value say so.
- Relative imports use `.js` extensions. Never print or commit API keys. Do not modify original CSVs in `data/interim`; write new files.

## Still needed

- The MAFOODS source PDF in `data/raw/` (nutrient tables on pages 18-76; Group 1 Staples 18-32, Group 2 Legumes 33-37, Group 3 Animal Foods 38-49, Group 4 Vegetables 50-56, Group 5 Fruits 57-61, Group 6 Fats and Oils 62-63, Group 7 Baby Foods 64-74, Group 8 Miscellaneous 75-76). Once present, write `scripts/extract_nutrients.py` (pdfplumber, in `.venv`) to extract fibre, calcium, iron, magnesium, zinc, potassium, sodium, vitamin A (RAE), vitamin C, folate, vitamin B12, vitamin D, starting with Group 1.
