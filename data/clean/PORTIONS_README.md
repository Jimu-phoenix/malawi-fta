# Portions data

`data/clean/portions.csv` is imported into the `portions` table by `scripts/import_data.ts`.

The gram values are **rough placeholder defaults awaiting weighing by hand**. They are not sourced from the MAFOODS nutrient tables and should not be treated as authoritative. Each row associates one household measure (plate, spoon, cup, piece/slice) with a default gram weight for a food that clearly has such a measure.

Tools:
- `get_portion_grams(food_code, measure)` returns the default grams for one measure, or `found: false` when no portion data exists.
- `log_meal` and `calculate_calories` accept either `grams` or `measure` + `count`, resolving the measure through `get_portion_grams`.
