import type { ChatCompletionTool } from "groq-sdk/resources/chat/completions.js";
import { z } from "zod";
import { db } from "../db/index.js";

const DEFAULT_USER_ID = "local";

const searchFoodSchema = z.object({
  query: z.string().trim().min(1, "query is required"),
});

const mealItemSchema = z.object({
  food_code: z.string().trim().min(1, "food_code is required"),
  grams: z.number().positive("grams must be greater than 0"),
});

const calculateCaloriesSchema = z.object({
  items: z.array(mealItemSchema).min(1, "at least one item is required"),
});

const logMealSchema = z.object({
  user_id: z.string().trim().min(1).optional(),
  items: z.array(mealItemSchema).min(1, "at least one item is required"),
});

const getDailyTotalSchema = z.object({
  user_id: z.string().trim().min(1).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date must use YYYY-MM-DD")
    .optional(),
});

const setDailyGoalSchema = z.object({
  user_id: z.string().trim().min(1).optional(),
  kcal: z.number().refine(Number.isFinite, "kcal must be a finite number"),
});

type SearchFoodInput = z.infer<typeof searchFoodSchema>;
type CalculateCaloriesInput = z.infer<typeof calculateCaloriesSchema>;
type LogMealInput = z.infer<typeof logMealSchema>;
type GetDailyTotalInput = z.infer<typeof getDailyTotalSchema>;
type SetDailyGoalInput = z.infer<typeof setDailyGoalSchema>;

type FoodRow = {
  food_code: string;
  name_en: string;
  kcal_per_100g: number | null;
  alias: string | null;
};

type CalculatedItem = {
  food_code: string;
  name_en: string | null;
  grams: number;
  kcal_per_100g: number | null;
  kcal: number | null;
  available: boolean;
  reason?: string;
};

type MealLogRow = {
  user_id: string;
  logged_at: string;
  food_id: string;
  grams: number;
  kcal: number;
};

function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function toParameters(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  delete json["$schema"];
  return json;
}

function parseArgs<T>(schema: z.ZodType<T>, args: unknown): T {
  const parsed = schema.safeParse(args);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "arguments"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid arguments: ${details}`);
  }
  return parsed.data;
}

function matchScore(value: string, query: string): number | null {
  const haystack = value.toLowerCase();
  const needle = query.toLowerCase();
  if (haystack === needle) return 0;
  if (haystack.startsWith(needle)) return 1;
  if (haystack.includes(needle)) return 2;
  return null;
}

function searchFood(input: SearchFoodInput): unknown {
  const query = input.query.trim();
  const rows = db
    .prepare(
      `SELECT
         f.food_id AS food_code,
         f.name_en,
         f.kcal_per_100g,
         a.alias
       FROM foods f
       LEFT JOIN food_aliases a ON a.food_id = f.food_id
       WHERE lower(f.name_en) LIKE lower(?) OR lower(a.alias) LIKE lower(?)`,
    )
    .all(`%${query}%`, `%${query}%`) as FoodRow[];

  const candidates = new Map<
    string,
    {
      food_code: string;
      name_en: string;
      kcal_per_100g: number | null;
      matched_alias: string | null;
      rank: number;
    }
  >();

  for (const row of rows) {
    const nameRank = matchScore(row.name_en, query);
    const aliasRank = row.alias === null ? null : matchScore(row.alias, query);
    const ranks = [nameRank, aliasRank].filter(
      (rank): rank is number => rank !== null,
    );
    if (ranks.length === 0) continue;

    const rank = Math.min(...ranks);
    const existing = candidates.get(row.food_code);
    const matchedAlias = aliasRank === null ? null : row.alias;
    if (
      existing === undefined ||
      rank < existing.rank ||
      (rank === existing.rank && existing.matched_alias === null)
    ) {
      candidates.set(row.food_code, {
        food_code: row.food_code,
        name_en: row.name_en,
        kcal_per_100g: row.kcal_per_100g,
        matched_alias: matchedAlias,
        rank,
      });
    }
  }

  const results = [...candidates.values()]
    .sort(
      (left, right) =>
        left.rank - right.rank ||
        left.name_en.localeCompare(right.name_en),
    )
    .slice(0, 5)
    .map(({ rank: _rank, ...candidate }) => candidate);

  return {
    query,
    candidates: results,
    message:
      results.length === 0
        ? "No matching food found in the table."
        : undefined,
  };
}

const getFoodByCode = db.prepare(`
  SELECT food_id AS food_code, name_en, kcal_per_100g
  FROM foods
  WHERE lower(food_id) = lower(?)
`);

function calculateItems(items: CalculateCaloriesInput["items"]): {
  items: CalculatedItem[];
  total_kcal: number;
  unavailable_count: number;
} {
  const calculated: CalculatedItem[] = [];

  for (const item of items) {
    const food = getFoodByCode.get(item.food_code) as
      | { food_code: string; name_en: string; kcal_per_100g: number | null }
      | undefined;

    if (food === undefined) {
      calculated.push({
        food_code: item.food_code,
        name_en: null,
        grams: item.grams,
        kcal_per_100g: null,
        kcal: null,
        available: false,
        reason: "food not found",
      });
      continue;
    }

    if (food.kcal_per_100g === null) {
      calculated.push({
        food_code: food.food_code,
        name_en: food.name_en,
        grams: item.grams,
        kcal_per_100g: null,
        kcal: null,
        available: false,
        reason: "no energy value in the table",
      });
      continue;
    }

    calculated.push({
      food_code: food.food_code,
      name_en: food.name_en,
      grams: item.grams,
      kcal_per_100g: food.kcal_per_100g,
      kcal: round((food.kcal_per_100g * item.grams) / 100),
      available: true,
    });
  }

  const total = calculated.reduce(
    (sum, item) => sum + (item.available ? (item.kcal ?? 0) : 0),
    0,
  );

  return {
    items: calculated,
    total_kcal: round(total),
    unavailable_count: calculated.filter((item) => !item.available).length,
  };
}

function calculateCalories(input: CalculateCaloriesInput): unknown {
  return calculateItems(input.items);
}

const insertMeal = db.prepare(`
  INSERT INTO meal_log (user_id, logged_at, food_id, grams, kcal)
  VALUES (?, ?, ?, ?, ?)
`);

const insertMeals = db.transaction((rows: MealLogRow[]) => {
  for (const row of rows) {
    insertMeal.run(
      row.user_id,
      row.logged_at,
      row.food_id,
      row.grams,
      row.kcal,
    );
  }
});

function logMeal(input: LogMealInput): unknown {
  const userId = input.user_id ?? DEFAULT_USER_ID;
  const calculated = calculateItems(input.items);
  const loggedAt = new Date().toISOString();
  const available = calculated.items.filter(
    (item): item is CalculatedItem & { kcal: number } =>
      item.available && item.kcal !== null,
  );

  insertMeals(
    available.map((item) => ({
      user_id: userId,
      logged_at: loggedAt,
      food_id: item.food_code,
      grams: item.grams,
      kcal: item.kcal,
    })),
  );

  return {
    user_id: userId,
    logged_at: loggedAt,
    items: available,
    unavailable: calculated.items.filter((item) => !item.available),
    total_kcal: round(
      available.reduce((sum, item) => sum + item.kcal, 0),
    ),
  };
}

function getDailyTotal(input: GetDailyTotalInput): unknown {
  const userId = input.user_id ?? DEFAULT_USER_ID;
  const date = input.date ?? new Date().toISOString().slice(0, 10);
  const totals = db
    .prepare(
      `SELECT
         COALESCE(SUM(kcal), 0) AS total_kcal,
         COUNT(*) AS meal_count
       FROM meal_log
       WHERE user_id = ? AND substr(logged_at, 1, 10) = ?`,
    )
    .get(userId, date) as { total_kcal: number; meal_count: number };
  const user = db
    .prepare(`SELECT daily_kcal_goal FROM users WHERE user_id = ?`)
    .get(userId) as { daily_kcal_goal: number | null } | undefined;

  return {
    user_id: userId,
    date,
    total_kcal: round(totals.total_kcal),
    meal_count: totals.meal_count,
    daily_goal: user?.daily_kcal_goal ?? null,
  };
}

const upsertGoal = db.prepare(`
  INSERT INTO users (user_id, daily_kcal_goal, created_at)
  VALUES (?, ?, ?)
  ON CONFLICT(user_id) DO UPDATE SET daily_kcal_goal = excluded.daily_kcal_goal
`);

function setDailyGoal(input: SetDailyGoalInput): unknown {
  const userId = input.user_id ?? DEFAULT_USER_ID;
  if (input.kcal < 1200 || input.kcal > 5000) {
    throw new Error(
      "Daily goal must be between 1200 and 5000 kcal. " +
        "These bounds are placeholders and need dietitian review.",
    );
  }

  upsertGoal.run(userId, input.kcal, new Date().toISOString());
  return {
    user_id: userId,
    daily_kcal_goal: input.kcal,
  };
}

export const toolDefinitions: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_food",
      description:
        "Search the local MAFOODS table by English name or alias. Returns up to 5 candidates with food_code, name_en, kcal_per_100g, and matched_alias.",
      parameters: toParameters(searchFoodSchema),
    },
  },
  {
    type: "function",
    function: {
      name: "calculate_calories",
      description:
        "Calculate calories for foods and gram amounts using only database values. Foods with no energy value are unavailable and excluded from the total.",
      parameters: toParameters(calculateCaloriesSchema),
    },
  },
  {
    type: "function",
    function: {
      name: "log_meal",
      description:
        "Log foods and gram amounts to meal_log using database calories. Only call after the user confirms the calculated result.",
      parameters: toParameters(logMealSchema),
    },
  },
  {
    type: "function",
    function: {
      name: "get_daily_total",
      description:
        "Return the logged calorie total for a user and date (defaults to today), plus the daily goal if set.",
      parameters: toParameters(getDailyTotalSchema),
    },
  },
  {
    type: "function",
    function: {
      name: "set_daily_goal",
      description:
        "Set or update a user's daily calorie goal. Rejects values below 1200 or above 5000 kcal.",
      parameters: toParameters(setDailyGoalSchema),
    },
  },
];

export async function executeTool(
  name: string,
  rawArguments: string,
): Promise<string> {
  let args: unknown;
  try {
    args = JSON.parse(rawArguments.trim() === "" ? "{}" : rawArguments);
  } catch {
    throw new Error("Invalid JSON arguments.");
  }

  switch (name) {
    case "search_food":
      return JSON.stringify(searchFood(parseArgs(searchFoodSchema, args)));
    case "calculate_calories":
      return JSON.stringify(
        calculateCalories(parseArgs(calculateCaloriesSchema, args)),
      );
    case "log_meal":
      return JSON.stringify(logMeal(parseArgs(logMealSchema, args)));
    case "get_daily_total":
      return JSON.stringify(
        getDailyTotal(parseArgs(getDailyTotalSchema, args)),
      );
    case "set_daily_goal":
      return JSON.stringify(setDailyGoal(parseArgs(setDailyGoalSchema, args)));
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
