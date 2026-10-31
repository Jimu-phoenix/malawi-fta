import { db } from "./index.js";

export type NutrientValue = {
  food_code: string;
  component: string;
  value: number | null;
  unit: string;
  flag: string | null;
  raw_text: string | null;
};

/**
 * Single nutrient read path. The rest of the code does not need to know how
 * values are stored; it asks for a (food_code, component) pair and gets back
 * the value (null when genuinely missing) plus its unit and any flag.
 */
export function getNutrient(
  foodCode: string,
  component: string,
): NutrientValue | null {
  const row = db
    .prepare(
      `SELECT food_code, component, value, unit, flag, raw_text
       FROM food_values
       WHERE lower(food_code) = lower(?) AND lower(component) = lower(?)`,
    )
    .get(foodCode, component) as NutrientValue | undefined;

  return row ?? null;
}

/**
 * All stored nutrient values for one food. Missing components are simply
 * absent (not zero).
 */
export function getFoodNutrients(foodCode: string): NutrientValue[] {
  return db
    .prepare(
      `SELECT food_code, component, value, unit, flag, raw_text
       FROM food_values
       WHERE lower(food_code) = lower(?)
       ORDER BY component`,
    )
    .all(foodCode) as NutrientValue[];
}
