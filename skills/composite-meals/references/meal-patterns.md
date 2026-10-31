# Malawian meal patterns

A typical logged meal is a plate with a staple, a relish, possible cooking oil, and extras. Split each into loggable components and look each one up with search_food before logging.

- Staple (nsima, rice, bread, cassava, potatoes, porridge): log as its own item.
  Example: "nsima with beef stew" → staple = nsima; relish = beef stew.
- Relish / ndiwo (beans, greens or vegetables, fish such as usipa or kapenta, meat, eggs): log as its own item.
  Example: "rice and beans" → rice + beans.
- Cooking oil: if the relish or item was cooked or fried, add oil as its own item; do not add oil to boiled, raw, or plain foods, and not when a matched table entry already includes it.
  Example: "fried mandasi" → mandasi + cooking oil.
- Extras (tea with sugar, milk, a snack, a drink): log only what was mentioned.
  Example: "tea with sugar and a mandasi" → tea + sugar + mandasi.

Worked examples:
- "nsima with usipa" → staple (nsima) + relish (usipa); usipa is dried fish so typically no extra oil is assumed.
- "rice and beans cooked in oil" → rice + beans + cooking oil (assumed).
- "tea with sugar and milk" → tea + sugar + milk; no staple or relish present.
- "two zitumbuwa" → zitumbuwa (fried snack); add cooking oil only if not already covered by a matched table entry.

When a prepared-dish entry matches the whole dish, log it once and add nothing for its ingredients or oil to avoid double counting.
