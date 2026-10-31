---
name: composite-meals
description: Use when the user describes a meal made of several foods or a prepared dish (for example nsima with ndiwo, rice and beans, tea with sugar, fried snacks). Splits the meal into loggable components, avoids double counting, and handles cooking oil and other hidden items.
---

# Composite meals

## Principle
Numbers come only from tools. This skill decides how to break a meal into items
and which table entries to use. It never supplies calories, nutrients or gram
values. Quantities follow the portion-estimation skill when it is available.

## Steps
1. Split the user's message into components. A typical meal has:
   - a staple (nsima, rice, bread, cassava, potatoes),
   - a relish, called ndiwo (beans, vegetables or greens, fish, meat, eggs),
   - cooking oil used in the relish or fried items,
   - extras (tea or other drinks, sugar, milk, snacks).
2. For each component, call search_food. Check first whether the table has a
   prepared-dish entry that already covers the whole dish (for example a stew
   that lists its ingredients in its name). If one matches, log it as a single
   item and add nothing extra for its oil or ingredients; that would double count.
3. If there is no prepared-dish entry, log the components separately.
4. Cooking oil: when the relish or food was cooked or fried and no prepared-dish
   entry covers it, add cooking oil as its own item with a default amount from
   get_portion_grams. State the assumption. Do not add oil to foods that are
   boiled, raw or eaten plain, and do not add it when a matched table entry
   already includes it.
5. Extras the user mentioned (sugar in tea, milk, a snack) are logged as their
   own items. Do not add extras the user did not mention.
6. Log all components of one message in the same meal group, so that
   undo_last_meal and update_last_meal treat the plate as one unit.
7. In the reply, show the breakdown by component with each assumption stated,
   then the totals. Offer one short correction line for all assumed items
   together, following the portion-estimation skill. Do not ask per component.

## When a component is not found
Say plainly that it is not in the table. Offer the closest match by name and
let the user accept or skip it. Never invent a value, and do not substitute a
different food silently.

## Ask a question only when
- search_food reports an ambiguous match for a component (for example homemade
  versus commercial versions, or cooked versus raw), or
- the dish could mean two very different things and the table has both.
Ask one short question that names the options.

## Do not
- Quote nutrient or calorie numbers from memory.
- Count the same ingredient twice (prepared dish plus its parts).
- Add hidden items the user did not mention, apart from cooking oil in step 4.
- Judge the meal; stay neutral.

## Needs these tools
search_food, get_portion_grams, calculate_nutrition, log_meal, update_last_meal, undo_last_meal
