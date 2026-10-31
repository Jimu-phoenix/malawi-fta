from pathlib import Path
import re

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
INTERIM = ROOT / "data" / "interim"
CLEAN = ROOT / "data" / "clean"

NUTRIENTS_PATH = INTERIM / "nutrients_core_per_100g.csv"
FOODS_OUT = CLEAN / "foods.csv"
ALIASES_OUT = CLEAN / "food_aliases.csv"
REVIEW_OUT = INTERIM / "names_review.csv"

GROUP_RE = re.compile(r"\(([^()]*)\)")
UNIT_RE = re.compile(r"\b(?:g|kg|mg|ml|l|cm|mm|%|kcal|kj)\b", re.IGNORECASE)
UNUSUAL_RE = re.compile(r"[&+:#@%=?!()\[\]{}<>\"“”]")
WORD_RE = re.compile(r"[A-Za-z\u00c0-\u024f']+")

ENGLISH_QUALIFIERS = {
    "raw",
    "cooked",
    "boiled",
    "dry",
    "wet",
    "fresh",
    "ripe",
    "unripe",
    "green",
    "red",
    "white",
    "yellow",
    "whole",
    "peeled",
    "unpeeled",
    "mashed",
    "powder",
    "flour",
    "oil",
    "sauce",
    "soup",
    "juice",
    "tea",
    "coffee",
    "milk",
    "water",
    "salt",
    "sugar",
    "with",
    "without",
    "and",
    "or",
    "approx",
    "about",
    "small",
    "medium",
    "large",
    "young",
    "mature",
    "soft",
    "hard",
    "local",
    "commercial",
    "homemade",
    "mixed",
    "fried",
    "roasted",
    "baked",
    "steamed",
    "fermented",
    "sweet",
    "sour",
    "bitter",
}


def clean_name(value: str) -> str:
    name = GROUP_RE.sub("", value)
    name = re.sub(r"\s+", " ", name).strip()
    name = re.sub(r"\s+,", ",", name)
    name = re.sub(r",\s*,+", ",", name)
    return name.strip().strip(",").strip()


def classify_bracket(content: str, group_count: int) -> list[str]:
    reasons: list[str] = []
    text = content.strip()
    if not text:
        reasons.append("empty bracket")
    if group_count > 1:
        reasons.append("multiple bracket groups")
    if "(" in content or ")" in content:
        reasons.append("nested brackets")
    if re.search(r"\d", content):
        reasons.append("number")
    if UNIT_RE.search(content):
        reasons.append("unit")
    if UNUSUAL_RE.search(content):
        reasons.append("unusual character")
    words = WORD_RE.findall(text)
    if text.isupper() and len(text.replace(" ", "")) >= 2 and any(c.isalpha() for c in text):
        reasons.append("abbreviation")
    if len(words) == 1 and len(words[0]) <= 3:
        reasons.append("short ambiguous token")
    qualifiers = sorted({word.lower() for word in words} & ENGLISH_QUALIFIERS)
    if qualifiers:
        reasons.append("English qualifier: " + ", ".join(qualifiers))
    return reasons


def split_local_names(content: str) -> list[str]:
    names: list[str] = []
    for part in re.split(r"[/;]", content):
        alias = re.sub(r"\s+", " ", part).strip()
        if alias:
            names.append(alias)
    return names


def main() -> None:
    CLEAN.mkdir(parents=True, exist_ok=True)
    source = pd.read_csv(NUTRIENTS_PATH, dtype=str, keep_default_na=False)

    foods: list[dict[str, str]] = []
    aliases: list[dict[str, str]] = []
    review: list[dict[str, str]] = []

    for row in source.to_dict(orient="records"):
        food_code = row["food_code"].strip()
        original = row["food_name"]
        name_en = clean_name(original)
        groups = GROUP_RE.findall(original)
        issues: list[str] = []
        local_names: list[str] = []

        if len(groups) > 1:
            quoted = ", ".join(f"'{group.strip()}'" for group in groups)
            issues.append(f"multiple bracket groups: {quoted}")
        elif len(groups) == 1:
            content = groups[0]
            reasons = classify_bracket(content, len(groups))
            if reasons:
                issues.append(f"unclear bracket '{content.strip()}': " + ", ".join(reasons))
            else:
                local_names = split_local_names(content)
        elif "(" in original or ")" in original:
            issues.append("unmatched or nested bracket")

        foods.append(
            {
                "food_code": food_code,
                "name_en": name_en,
                "name_original": original,
                "moisture_g": row["moisture_g"],
                "energy_kcal": row["energy_kcal"],
                "energy_kj": row["energy_kj"],
                "protein_g": row["protein_g"],
                "fat_g": row["fat_g"],
                "carbohydrate_total_g": row["carbohydrate_total_g"],
            }
        )

        seen_aliases: set[str] = set()
        if name_en:
            aliases.append(
                {
                    "food_code": food_code,
                    "alias": name_en,
                    "language": "english",
                    "kind": "primary_en",
                }
            )
            seen_aliases.add(name_en)
        for alias in local_names:
            if alias not in seen_aliases:
                aliases.append(
                    {
                        "food_code": food_code,
                        "alias": alias,
                        "language": "chichewa",
                        "kind": "local",
                    }
                )
                seen_aliases.add(alias)

        if issues:
            review.append(
                {
                    "food_code": food_code,
                    "name_original": original,
                    "issue": "; ".join(issues),
                }
            )

    foods_df = pd.DataFrame(foods).sort_values("food_code").reset_index(drop=True)
    aliases_df = pd.DataFrame(
        aliases, columns=["food_code", "alias", "language", "kind"]
    ).sort_values(["food_code", "kind", "alias"], kind="stable").reset_index(drop=True)
    review_df = pd.DataFrame(
        review, columns=["food_code", "name_original", "issue"]
    ).sort_values("food_code").reset_index(drop=True)

    foods_df.to_csv(FOODS_OUT, index=False, encoding="utf-8", lineterminator="\n")
    aliases_df.to_csv(ALIASES_OUT, index=False, encoding="utf-8", lineterminator="\n")
    review_df.to_csv(REVIEW_OUT, index=False, encoding="utf-8", lineterminator="\n")

    print(f"rows: {len(foods_df)}")
    print(f"duplicate food_code: {foods_df['food_code'].duplicated().sum()}")
    print(f"empty name_en: {(foods_df['name_en'].str.strip() == '').sum()}")
    print(
        "name_en containing parentheses: "
        f"{foods_df['name_en'].str.contains(r'[()]', regex=True).sum()}"
    )
    print(
        "alias food_codes missing from foods: "
        f"{(~aliases_df['food_code'].isin(foods_df['food_code'])).sum()}"
    )
    print(
        "duplicate (food_code, alias): "
        f"{aliases_df.duplicated(['food_code', 'alias']).sum()}"
    )
    print(f"aliases: {len(aliases_df)}")
    print(f"review rows: {len(review_df)}")


if __name__ == "__main__":
    main()
