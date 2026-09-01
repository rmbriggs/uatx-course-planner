"""Turn the UATX equivalency tables (.docx) into machine-checkable rules.

Each rule says: holding every course in `from` grants the student one of the
alternatives in `grants` (each alternative is a set of new-catalog courses that
are all awarded together), or generic elective credit at a given level.

Anything the parser cannot resolve confidently is reported and must be added to
OVERRIDES by hand rather than guessed at.
"""
import json, re, sys
from pathlib import Path

import docx

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data"

CODE = re.compile(r"\b([A-Z]{3,4})\s?(\d{3})\b")
OLD_CODE = re.compile(r"^([A-Z]{3})\s?(\d{4}[A-Z]?)")

# Table index -> which former center the courses came from.
CENTER_BY_TABLE = {2: "Polaris", 3: "CAL", 4: "CEPH", 5: "STEM"}

# The equivalency document names two codes that do not exist in the 2026-2027
# catalog. Both are unambiguous and are corrected here, with the correction
# surfaced on the rule so a student can see it was interpreted.
CODE_CORRECTIONS = {
    # The doc says "HIST 380 Special Topic in History (1.5)". HIST 380 is
    # "Postmodernism and Postcolonialism" (3 cr); the 1.5 cr upper-division
    # special topic in History is HIST 379.
    "HIST 380 Special Topic in History": ("HIST 379", "Catalog lists HIST 380 as Postmodernism and Postcolonialism; the 1.5 cr Special Topic in History is HIST 379."),
    # The Law subject code is LAWS in the 2026-2027 catalog.
    "LAW 380": ("LAWS 380", "The Law subject code is LAWS in the 2026-2027 catalog."),
}

# Rows whose prose encodes conditional or multi-course logic. Keyed by
# (original code, original title) because ALT 4500 is reused for three courses.
OVERRIDES = {
    ("ALT 1100", "Faith, Reason, and Science I: Medieval and Early Modern (1.5)"):
        [{"from": ["ALT 1100", "ALT 1120"], "grants": [["PHIL 130"]], "kind": "satisfies"}],
    ("ALT 1120", "Faith, Reason, and Science II: Modern and Contemporary (1.5)"):
        [],  # same combined rule as ALT 1100, recorded once
    ("ALT 4510L", "Kant"): [
        {"from": ["ALT 4510L"], "grants": [["PHIL 410"]], "kind": "equals"},
        {"from": ["ALT 4510L", "ALT 4510B"], "grants": [["PHIL 225"]], "kind": "satisfies"},
        {"from": ["ALT 4510L", "ALT 4510M"], "grants": [["PHIL 225"]], "kind": "satisfies"},
    ],
    ("ALT 4510M", "Hegel"): [
        {"from": ["ALT 4510M"], "grants": [["PHIL 410"]], "kind": "equals"},
    ],
    ("STM 1001 & 1002", "Calculus I & II (4.5 each)"): [
        {"from": ["STM 1001", "STM 1002"], "grants": [["MATH 101"]], "kind": "satisfies"},
    ],
    ("STM 2102", "Statistics (4.5)"): [
        {"from": ["STM 2102"], "grants": [["MATH 230", "MATH 231"]], "kind": "equals"},
    ],
    ("STM 3910A", "Statistical Modeling"): [
        {"from": ["STM 3910A"], "grants": [["MATH 230", "MATH 231"]], "kind": "equals"},
    ],
    ("STM 3900A & B", "Artificial Intelligence I & II (1.5 each)"): [
        {"from": ["STM 3900A"], "grants": [["CSAI 379"]], "kind": "equals"},
        {"from": ["STM 3900B"], "grants": [["CSAI 379"]], "kind": "equals"},
        {"from": ["STM 3900A", "STM 3900B"], "grants": [["CSAI 385"]], "kind": "equals"},
    ],
    ("STM 3910B/C", "Intro/Accelerated Intro to Programming"): [
        {"from": ["STM 3910B"], "grants": [["CSAI 110"]], "kind": "equals"},
        {"from": ["STM 3910C"], "grants": [["CSAI 110"]], "kind": "equals"},
    ],
}


# Mappings the equivalency document does not state, but that the two catalogs
# imply strongly enough to be worth offering. Every one is labelled `inferred`
# so the site can show it as provisional and let a student switch it off; none
# is presented as settled policy.
# Where the official table sends an old special-topics course to a new *Special
# Topic* placeholder, even though the new catalog now carries a named course
# with exactly that title. The placeholder appears in no concentration list, so
# the credit lands somewhere no requirement can see it. These add the named
# course alongside the placeholder rather than replacing it: the official
# mapping stands, and this refines it.
#
# `title` must match the official rule's title exactly, which is checked below.
REFINEMENTS = [
    {
        "from": ["ALT 4500"], "title": "Political Theology (1.5)", "adds": ["AMCV 360"],
        "center": "CAL", "confidence": "strong",
        "reason": (
            "The table maps this to AMCV 380 Special Topic in American Civilization, but the "
            "2026-2027 catalog lists AMCV 360 Political Theology by name, in the Upper Division "
            "American Civilization list. The titles are identical, and the placeholder appears in "
            "no concentration requirement, so on the table's reading the course can close nothing."
        ),
    },
    {
        "from": ["ALT 4500"], "title": "Liberalism and Conservatism (1.5)", "adds": ["AMCV 355"],
        "center": "CAL", "confidence": "strong",
        "reason": (
            "Same case as Political Theology: mapped to the AMCV 380 placeholder, while the new "
            "catalog names AMCV 355 Liberalism and Conservatism in the Upper Division American "
            "Civilization list."
        ),
    },
    {
        "from": ["STM 3900C"], "title": "Statistical Learning (1.5)", "adds": ["MATH 470"],
        "center": "STEM", "confidence": "strong",
        "reason": (
            "Mapped to MATH 480 Special Topic in Mathematics, while the new catalog names MATH 470 "
            "Statistical Learning. Same title, and only the named course sits in a requirement list."
        ),
    },
]

INFERRED = [
    # --- Intellectual Foundations -------------------------------------------
    # The equivalency document has tables for CAL, CEPH, STEM and Polaris but
    # none for INF. Its only statement about Foundations is that the new one is
    # "satisfied by old IF plus one course", which says nothing course by
    # course. These fill that gap from the two catalogs' own descriptions.
    {
        "from": ["INF 1100"], "grants": [["LITR 102", "LITR 103"]], "kind": "satisfies", "center": "IF",
        "title": "Chaos and Civilization", "confidence": "strong",
        "reason": (
            "INF 1100 asks 'what roles do the heroes of Homer, Plato, the Greek tragedies, and the "
            "Bible play in the beginning of civilization?', and the catalog says INF 1102 Epic and "
            "Tragedy 'counts as an equivalent towards completion of INF 1100' - so the newer 3-credit "
            "course was carved out of this one. INF 1103/1104 Bible I and II cover its other half and "
            "are already accepted for LITR 103. Note 4.5 credits are being read as covering two "
            "3-credit courses, which is the registrar's call."
        ),
    },
    {
        "from": ["INF 2121"], "grants": [["HIST 131"]], "kind": "satisfies", "center": "IF",
        "title": "Early Modernity", "confidence": "strong",
        "reason": (
            "INF 2121 covers 'Machiavelli, the Protestant Reformation, the European Wars of Religion, "
            "and the English Civil War'. HIST 131 Making of the Modern World covers exactly that and "
            "reads Machiavelli's Prince. This replaces an earlier reading of the catalog's "
            "'Prerequisite: AMCV 200 or INF 2121' line, which names an acceptable background course "
            "rather than an equivalent."
        ),
    },
    {
        "from": ["INF 2120"], "grants": [["HIST 131"]], "kind": "satisfies", "center": "IF",
        "title": "Modernity and the West", "confidence": "strong",
        "reason": (
            "The catalog says INF 2121 Early Modernity 'counts towards the completion of INF 2120', "
            "so the larger seminar contains the material that matches HIST 131."
        ),
    },
    {
        "from": ["INF 1300"], "grants": [["HIST 130"]], "kind": "satisfies", "center": "IF",
        "title": "Christianity and Islam, Europe and the East", "confidence": "strong",
        "reason": (
            "INF 1300 asks how Christianity and Islam 'relate to the European identity'. HIST 130 Rise "
            "of the West covers late antiquity and medieval Europe, asking how 'Christianity, and the "
            "encounter with Islam shape British and European culture'."
        ),
    },
    {
        "from": ["INF 2300"], "grants": [["HIST 111"]], "kind": "satisfies", "center": "IF",
        "title": "Ideological Experiments of the 20th Century", "confidence": "strong",
        "reason": (
            "Same title, and both study the philosophical roots and practical consequences of Nazism "
            "and Soviet Communism."
        ),
    },
    {
        "from": ["INF 1200"], "grants": [["PHIL 120"]], "kind": "satisfies", "center": "IF",
        "title": "The Beginning of Politics", "confidence": "strong",
        "reason": (
            "INF 1200 asks 'are human beings political animals?', which is the question of Aristotle's "
            "Politics, and compares 'Greek and biblical understandings of politics and leadership'. "
            "PHIL 120 reads Plato's Republic and selections from Aristotle's Nicomachean Ethics and "
            "Politics. A student who took the course reports it covered Plato and the New Testament."
        ),
    },
    {
        "from": ["INF 1110"], "grants": [["PHIL 120"]], "kind": "satisfies", "center": "IF",
        "title": "Knowing, Doing, Making, Wisdom", "confidence": "strong",
        "reason": (
            "INF 1110 examines 'the relationship between knowledge and wisdom' and 'how knowledge is "
            "manifested in doing and making', which is Aristotle's distinction between praxis and "
            "poiesis. A student who took the course reports it covered both Plato and Aristotle."
        ),
    },
    # --- outside Intellectual Foundations ------------------------------------
    {
        "from": ["INF 2100"], "grants": [["PHIL 430"]], "kind": "satisfies", "center": "IF",
        "title": "The Uses and Abuses of Technology", "confidence": "moderate",
        "reason": (
            "PHIL 430 is titled 'Uses and Abuses of Technology' and asks the same questions. It is not "
            "an Intellectual Foundations course in the new curriculum, so this counts toward a "
            "concentration - and it would count 200-level work as 300-level, so confirm it."
        ),
    },
]


def norm(s: str) -> str:
    s = s.replace("’", "'").replace("–", "-").replace("—", "-")
    s = re.sub(r"\s+", " ", s).strip()
    # the doc frequently loses the space before a parenthesised credit value
    s = re.sub(r"([A-Za-z])\((\d)", r"\1 (\2", s)
    return s


def load_known_codes():
    data = json.loads((OUT / "courses.json").read_text())
    return {c["code"] for c in data["courses"]} | {c["code"] for c in data["legacyCourses"]}


def apply_corrections(text: str):
    notes = []
    for wrong, (right, why) in CODE_CORRECTIONS.items():
        if wrong in text:
            text = text.replace(wrong, right)
            notes.append(why)
    return text, notes


def parse_text(text: str):
    """Return (grants, electiveGrant, kind) or None when the prose is not routine."""
    t = norm(text)
    low = t.lower()

    m = re.search(r"satisfies (\d)00-level elective", low)
    if m:
        return None, {"level": int(m.group(1)) * 100}, "elective"

    if "combined with" in low or "if combined" in low or "(one only)" in low or "(both)" in low:
        return None  # conditional logic belongs in OVERRIDES

    kind = "equals" if t.lstrip().startswith("=") else (
        "replaced" if "replaced" in low else "satisfies")

    # split alternatives on "(or)" / " or " that sit between course codes
    parts = re.split(r"\s*\(or\)\s*|\s+or\s+", t)
    grants = []
    for part in parts:
        codes = [f"{a} {b}" for a, b in CODE.findall(part)]
        if codes:
            grants.append(codes)
    if not grants:
        return None
    return grants, None, kind


def main():
    known = load_known_codes()
    doc = docx.Document(RAW / "equivalency_tables.docx")
    rules, unresolved = [], []

    for ti, table in enumerate(doc.tables):
        center = CENTER_BY_TABLE.get(ti)
        if center is None:
            continue
        for row in table.rows:
            cells = [norm(c.text) for c in row.cells]
            if len(cells) < 3:
                continue
            code, title, text = cells[0], cells[1], cells[2]
            if not OLD_CODE.match(code) or not text:
                continue

            key = (code, title)
            if key in OVERRIDES:
                for spec in OVERRIDES[key]:
                    rules.append({**spec, "center": center, "title": title, "raw": text})
                continue

            text, notes = apply_corrections(text)
            parsed = parse_text(text)
            if parsed is None:
                unresolved.append((code, title, text))
                continue
            grants, elective, kind = parsed
            rule = {
                "from": [code],
                "kind": kind,
                "center": center,
                "title": title,
                "raw": text,
            }
            if elective:
                rule["electiveGrant"] = elective
                rule["grants"] = []
            else:
                rule["grants"] = grants
            if notes:
                rule["note"] = " ".join(notes)
            rules.append(rule)

    for spec in INFERRED:
        rules.append({**spec, "inferred": True, "raw": spec["reason"]})

    # Refinements name the official rule they extend, so that rule must exist.
    official = {"+".join(r["from"]) + "|" + r["title"] for r in rules if not r.get("inferred")}
    unmatched = []
    for spec in REFINEMENTS:
        key = "+".join(spec["from"]) + "|" + spec["title"]
        if key not in official:
            unmatched.append(key)
            continue
        rules.append({
            "from": spec["from"], "title": spec["title"], "center": spec["center"],
            "kind": "satisfies", "grants": [spec["adds"]], "refines": key,
            "inferred": True, "confidence": spec["confidence"],
            "reason": spec["reason"], "raw": spec["reason"],
        })
    if unmatched:
        print("REFINEMENTS NAME NO OFFICIAL RULE: " + "; ".join(unmatched))
        return 1

    # validate every referenced code
    bad_from, bad_to = set(), set()
    for r in rules:
        for c in r["from"]:
            if c not in known:
                bad_from.add(c)
        for alt in r.get("grants", []):
            for c in alt:
                if c not in known:
                    bad_to.add(c)

    (OUT / "equivalencies.json").write_text(
        json.dumps({"source": "UATX Equivalency document TABLES.docx", "rules": rules}, indent=2) + "\n"
    )

    print(f"rules: {len(rules)}")
    print(f"  inferred           : {sum(1 for r in rules if r.get('inferred'))}")
    print(f"  direct/alternative : {sum(1 for r in rules if r.get('grants'))}")
    print(f"  elective-only      : {sum(1 for r in rules if r.get('electiveGrant'))}")
    print(f"  multi-course 'from': {sum(1 for r in rules if len(r['from']) > 1)}")
    if unresolved:
        print(f"\nUNRESOLVED ({len(unresolved)}) - add to OVERRIDES:")
        for c, t, x in unresolved:
            print(f"  {c} | {t} | {x}")
    if bad_from:
        print(f"\nUNKNOWN legacy codes ({len(bad_from)}): {sorted(bad_from)}")
    if bad_to:
        print(f"\nUNKNOWN target codes ({len(bad_to)}): {sorted(bad_to)}")
    return 1 if (unresolved or bad_to) else 0


if __name__ == "__main__":
    sys.exit(main())
