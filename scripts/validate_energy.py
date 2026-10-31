from pathlib import Path
import math

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
FOODS_PATH = ROOT / "data" / "clean" / "foods.csv"
REVIEW_PATH = ROOT / "data" / "interim" / "energy_review.csv"

KJ_PER_KCAL = 4.184
MISMATCH_THRESHOLD = 0.05


def parse_energy(value: object) -> float | None:
    text = str(value).strip()
    if text == "" or text.lower() in {"na", "n/a", "null", "none"}:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def format_number(value: float | None) -> str:
    if value is None:
        return ""
    return f"{value:.6g}"


def main() -> None:
    foods = pd.read_csv(FOODS_PATH, dtype=str, keep_default_na=False)

    flags: list[str] = []
    expected_values: list[str] = []
    relative_diffs: list[float | None] = []

    for row in foods.to_dict(orient="records"):
        kcal = parse_energy(row["energy_kcal"])
        kj = parse_energy(row["energy_kj"])
        expected = None if kj is None else kj / KJ_PER_KCAL
        relative_diff = None

        if kcal is None and kj is None:
            flag = "both_missing"
        elif kcal is None:
            flag = "kcal_missing"
        elif kj is None:
            flag = "kj_missing"
        else:
            if expected == 0:
                relative_diff = 0.0 if kcal == 0 else math.inf
            else:
                relative_diff = abs(kcal - expected) / abs(expected)
            flag = "mismatch" if relative_diff > MISMATCH_THRESHOLD else "ok"

        flags.append(flag)
        expected_values.append(format_number(expected))
        relative_diffs.append(relative_diff)

    foods["energy_flag"] = flags
    foods.to_csv(FOODS_PATH, index=False, encoding="utf-8", lineterminator="\n")

    review = pd.DataFrame(
        {
            "food_code": foods["food_code"],
            "name": foods["name_en"],
            "kcal": foods["energy_kcal"],
            "kj": foods["energy_kj"],
            "expected_kcal": expected_values,
            "flag": flags,
            "_relative_diff": relative_diffs,
        }
    )
    review = review[review["flag"] != "ok"].copy()
    review = review.sort_values(
        ["_relative_diff", "food_code"], ascending=[False, True], na_position="last"
    )
    review = review.drop(columns=["_relative_diff"])
    review.to_csv(REVIEW_PATH, index=False, encoding="utf-8", lineterminator="\n")

    counts = foods["energy_flag"].value_counts()
    print("energy flags:")
    for flag in ["ok", "kcal_missing", "kj_missing", "both_missing", "mismatch"]:
        print(f"  {flag}: {int(counts.get(flag, 0))}")

    mismatches = pd.DataFrame(
        {
            "food_code": foods["food_code"],
            "name": foods["name_en"],
            "kcal": foods["energy_kcal"],
            "kj": foods["energy_kj"],
            "expected_kcal": expected_values,
            "relative_diff_pct": [
                None if diff is None or math.isinf(diff) else diff * 100
                for diff in relative_diffs
            ],
            "flag": flags,
        }
    )
    mismatches = mismatches[mismatches["flag"] == "mismatch"].sort_values(
        "relative_diff_pct", ascending=False
    )
    print("\n15 largest mismatches:")
    print(mismatches.head(15).to_string(index=False))


if __name__ == "__main__":
    main()
