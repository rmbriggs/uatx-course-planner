"""Author the 2024-2025 degree requirements and validate every code.

Transcribed from the UATX 2024-2025 Academic Catalog, pp. 30-42. That program
requires students to elect one Academic Center and complete its Foundations and
Core; a concentration within the Center is optional.

The old catalog is internally inconsistent in a few places: its requirement
lists name courses by numbers its own description section does not use. Those
are corrected here by matching titles, and each correction is recorded.
"""
import json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data"

# Requirement lists name these; the course description section calls them
# something else. Matched by title, and surfaced on the group that uses them.
CODE_CORRECTIONS = {
    "EPH 1610": ("EPH 3040", "Listed as EPH 1610 in the Center for Arts and Letters requirements; the description section numbers 'Introduction to World Economic and Political History' as EPH 3040."),
    "EPH 1810": ("EPH 1500", "Listed as EPH 1810 in the Center for Arts and Letters requirements; the description section numbers 'History, Historiography and the Philosophy of History' as EPH 1500."),
    "POL 3150": ("POL 3110", "Listed as POL 3150 in the Polaris curriculum; the description section numbers Polaris Build as POL 3110."),
    # The CEPH Core lists "EPH 3110 Advanced Topics in American Economic
    # History", but EPH 3110 is American *Political* History and appears again
    # in the concentration list. American Economic History is EPH 3160.
    "EPH 3110/core": ("EPH 3160", "The Core lists EPH 3110 'Advanced Topics in American Economic History', but that title belongs to EPH 3160; EPH 3110 is American Political History and appears in the concentration list."),
}


def fix(code):
    return CODE_CORRECTIONS.get(code, (code, None))[0]


def slot(label, *options):
    return {"label": label, "options": [list(o) if isinstance(o, (list, tuple)) else [o] for o in options]}


def all_of(gid, name, codes, note=None):
    g = {"id": gid, "name": name, "type": "slots", "slots": [slot(None, [fix(c)]) for c in codes]}
    if note:
        g["note"] = note
    return g


def pick(gid, name, choose, pool, note=None):
    g = {"id": gid, "name": name, "type": "pick", "choose": choose, "pool": [fix(c) for c in pool]}
    if note:
        g["note"] = note
    return g


def by_credits(gid, name, min_credits, pool, note=None):
    g = {"id": gid, "name": name, "type": "credits", "minCredits": min_credits, "pool": [fix(c) for c in pool]}
    if note:
        g["note"] = note
    return g


IF_COURSES = [
    ("Humanities and Fine Arts", ["INF 1100", "INF 1200", "INF 1210", "INF 1300", "INF 2210"]),
    ("Natural Sciences, Mathematics and Technology", ["INF 1110", "INF 1130", "INF 1220", "INF 1330", "INF 2100", "INF 2110"]),
    ("Social and Behavioral Sciences", ["INF 1320", "INF 2120", "INF 2200", "INF 2300"]),
]

LCW_PRE_1800 = ["ALT 3160", "ALT 3200", "ALT 3310", "ALT 3315", "ALT 3320", "ALT 3340",
                "ALT 3360", "ALT 3400", "ALT 4100", "ALT 4110", "ALT 4300", "ALT 4310"]
LCW_POST_1800 = ["ALT 3500", "ALT 3720", "ALT 3740", "ALT 3760", "ALT 3780", "ALT 3900",
                 "ALT 4200", "ALT 4210", "ALT 4400", "ALT 4410"]

CEPH_FLEX = ["EPH 1300", "EPH 1400", "EPH 2000", "EPH 2200", "EPH 3010"]
CEPH_CONC = ["EPH 2600", "EPH 3090", "EPH 3100", "EPH 3110", "EPH 3120", "EPH 3130",
             "EPH 3140", "EPH 3150", "EPH 3170", "EPH 3180", "EPH 3190", "EPH 3200",
             "EPH 3210", "EPH 3220", "EPH 3240", "EPH 3250"]
STEM_ELECTIVES = ["STM 3304", "STM 4101", "STM 4102", "STM 4301", "STM 4302"]


def conc(cid, name, center, credits, groups, page):
    return {"id": cid, "name": name, "center": center, "kind": "concentration",
            "credits": credits, "prerequisites": [], "groups": groups, "page": page}


CONCENTRATIONS = [
    conc("lit-creative-writing", "Literature and Creative Writing", "Arts and Letters", 81, page=32, groups=[
        all_of("lcw-foundations", "Center Foundations (18 credits)",
               ["ALT 1010", "ALT 1020", "ALT 1030", "ALT 1040", "ALT 1050", "ALT 1160", "ALT 1180"]),
        all_of("lcw-core", "Center Core (36 credits)",
               ["ALT 1060", "ALT 1200", "ALT 1220", "ALT 1240", "ALT 1260", "ALT 1300", "ALT 1400",
                "ALT 1500", "ALT 1600", "ALT 1800", "ALT 1900", "ALT 1950", "ALT 3300", "ALT 3330"]),
        by_credits("lcw-writing-studio", "Writing Studio (at least 6 credits)", 6, ["ALT 4000"],
                   "Available to juniors and seniors in 3-credit increments and repeatable. Up to 18 credits may be taken, of which up to 12 count toward the concentration."),
        by_credits("lcw-pre-1800", "At least 6 credits from before 1800", 6, LCW_PRE_1800,
                   "These credits are part of the 15-21 chosen below, not additional to them."),
        by_credits("lcw-choice", "15-21 further credits from the concentration lists", 15,
                   LCW_PRE_1800 + LCW_POST_1800,
                   "Writing Studio plus these come to 27 concentration credits."),
    ]),
    conc("ethics-politics", "Ethics and Politics", "Arts and Letters", 81, page=35, groups=[
        all_of("ep-foundations", "Center Foundations (18 credits)",
               ["ALT 1010", "ALT 1020", "ALT 1100", "ALT 1120", "ALT 3000", "EPH 1610", "EPH 1810"]),
        all_of("ep-core", "Center Core (36 credits)",
               ["ALT 1030", "ALT 1040", "ALT 1050", "ALT 1060", "ALT 2000", "ALT 2020", "ALT 2100",
                "ALT 2200", "ALT 2300", "ALT 2600", "ALT 2700", "ALT 3220", "ALT 3340", "ALT 3360"]),
        all_of("ep-concentration", "Concentration (27 credits)",
               ["ALT 1220", "ALT 1260", "ALT 2400", "ALT 2500", "ALT 3200", "ALT 3600", "ALT 3620",
                "ALT 3700", "ALT 3720", "ALT 3760", "ALT 3780", "ALT 3800", "ALT 3850"]),
    ]),
    conc("econ-politics-history", "Economics, Politics, and History", "Economics, Politics, and History", 81, page=37, groups=[
        all_of("eph-foundations-core", "Center Foundations - required", ["EPH 1100", "EPH 3040"]),
        pick("eph-foundations-choice", "Center Foundations - choose 3 of 5 (9 credits)", 3, CEPH_FLEX),
        all_of("eph-core", "Center Core (37.5 credits)",
               ["EPH 1500", "EPH 2010", "EPH 2300", "EPH 2400", "EPH 3020", "EPH 3030", "EPH 3050",
                "EPH 3060", "EPH 3110/core", "EPH 3230"]),
        pick("eph-core-remainder", "Center Core - the two not taken in Foundations", 2, CEPH_FLEX,
             "Whichever of the five are not used for Foundations must be taken here."),
        pick("eph-conc-methods", "Concentration - choose 1", 1, ["EPH 3070", "EPH 3080"]),
        pick("eph-conc-topics", "Concentration - choose 8 (24 credits)", 8, CEPH_CONC),
    ]),
    conc("computing-data-science", "Computing and Data Science", "Science, Technology, Engineering, and Mathematics", 81, page=39, groups=[
        all_of("cds-foundations", "Center Foundations (18 credits)",
               ["STM 1001", "STM 1002", "STM 1004", "STM 1005"]),
        all_of("cds-core", "Center Core (36 credits)",
               ["STM 2101", "STM 2102", "STM 2103", "STM 2104", "STM 2300", "STM 2301", "STM 2501", "STM 2502"]),
        all_of("cds-concentration", "Concentration - required (18 credits)",
               ["STM 2302", "STM 3301", "STM 3302", "STM 3303"]),
        by_credits("cds-concentration-electives", "Concentration - 9 further credits", 9, STEM_ELECTIVES,
                   "The catalog lists 18 credits of required concentration courses against a 27-credit concentration, so 9 credits come from the courses it lists as electives. Confirm with your advisor."),
    ]),
]

POLARIS = {
    "credits": 21, "page": 41,
    "required": [
        slot("Polaris Ideas (year 1)", ["POL 1110"]),
        slot("Polaris Inspirations (year 2)", ["POL 2100"]),
        slot("Polaris Frame (year 2)", ["POL 2110"]),
        slot("Polaris Pitch (year 3)", ["POL 3100"]),
        slot("Polaris Launch (year 4)", ["POL 4150"]),
    ],
    "buildCredits": 6,
    "buildCourses": [fix("POL 3150")],
    "buildEquivalents": [],
    "buildEquivalentCap": 0,
    "note": ("All Polaris courses total 21 credits. A Polaris Retreat in year 1 carries no credit. "
             "Polaris Build is repeatable across years 3 and 4."),
}


def group_credits(g, credit):
    if g["type"] == "slots":
        return sum(credit[s["options"][0][0]] for s in g["slots"])
    if g["type"] == "pick":
        return sum(sorted(credit[x] for x in g["pool"])[: g["choose"]])
    return g["minCredits"]


def slug(name):
    return "".join(ch if ch.isalnum() else "-" for ch in name.lower()).strip("-").replace("--", "-")


def center_blocks(concs, credit):
    """The Foundations and Core of each Center, lifted out of the concentrations.

    Graduation requires the Foundations and Core of one Center; the
    concentration inside it is optional. Deriving these from the concentration
    definitions rather than restating them keeps the two from drifting apart.

    The catalog prints a Center's Foundations and Core under each Area of
    Concentration, and for Arts and Letters the two printings do not agree, so
    a Center can end up with more than one published listing.
    """
    blocks = []
    for c in concs:
        groups = [g for g in c["groups"] if g["name"].startswith("Center ")]
        assert groups, f"{c['id']} names no Center groups"
        content = json.dumps([{k: v for k, v in g.items() if k != "id"} for g in groups], sort_keys=True)
        match = next((b for b in blocks if b["name"] == c["center"] and b["content"] == content), None)
        if match:
            match["publishedUnder"].append(c["name"])
            continue
        blocks.append({"name": c["center"], "groups": groups, "content": content,
                       "publishedUnder": [c["name"]], "page": c["page"]})

    out = []
    for b in blocks:
        same = [x for x in blocks if x["name"] == b["name"]]
        base = "center-" + slug(b["name"])
        entry = {
            "id": base if len(same) == 1 else f"{base}-{slug(b['publishedUnder'][0])}",
            "name": b["name"],
            "credits": sum(group_credits(g, credit) for g in b["groups"]),
            "groups": b["groups"],
            "publishedUnder": b["publishedUnder"],
            "page": b["page"],
        }
        if len(same) > 1:
            entry["note"] = (
                "The catalog prints this Center's Foundations and Core under each Area of "
                f"Concentration, and the listings differ. This is the one printed under "
                f"{b['publishedUnder'][0]}."
            )
        out.append(entry)
    return out


def main():
    courses = json.loads((OUT / "courses.json").read_text())
    known = {c["code"] for c in courses["courses"]} | {c["code"] for c in courses["legacyCourses"]}
    credit = {c["code"]: c["credits"] for c in courses["courses"] + courses["legacyCourses"]}

    payload = {
        "program": "2024-2025",
        "label": "2024-2025 catalog",
        "source": "UATX 2024-2025 Academic Catalog, pp. 30-42",
        "totalCredits": 180,
        "corrections": {k: {"code": v[0], "note": v[1]} for k, v in CODE_CORRECTIONS.items()},
        "pillars": [
            {"id": "if", "name": "Intellectual Foundations", "credits": 54},
            {"id": "major", "name": "Center Foundations, Core, Concentration, Electives", "credits": 105},
            {"id": "polaris", "name": "Polaris", "credits": 21},
        ],
        "intellectualFoundations": {
            "credits": 54,
            "groups": [
                {"id": f"if-{i}", "name": name, "type": "slots",
                 "slots": [slot(None, [c]) for c in codes]}
                for i, (name, codes) in enumerate(IF_COURSES)
            ],
            "inferredOptions": {},
            "legacyProvision": {"note": "", "legacyCourses": [], "additionalCredits": 0},
        },
        "major": {
            "credits": 105, "page": 30, "rules": [],
            "note": ("Center Foundations, Core and Concentration come to 81 credits, with 24 elective "
                     "credits alongside. A student who does not complete a concentration takes 51 "
                     "elective credits instead."),
        },
        "polaris": POLARIS,
        "centers": center_blocks(CONCENTRATIONS, credit),
        "concentrations": CONCENTRATIONS,
        "electives": {"credits": 24, "note": "To be discussed with your academic advisor."},
    }

    referenced = set()

    def walk(node):
        if isinstance(node, list):
            for n in node:
                walk(n)
            return
        if not isinstance(node, dict):
            return
        if node.get("type") == "pick":
            referenced.update(node["pool"])
        if node.get("type") == "credits":
            referenced.update(node["pool"])
        for key, value in node.items():
            if key in ("slots", "prerequisites", "required"):
                for s in value:
                    for opt in s["options"]:
                        referenced.update(opt)
            elif isinstance(value, (dict, list)):
                walk(value)

    walk(payload)
    referenced.update(POLARIS["buildCourses"])

    (OUT / "requirements-2024.json").write_text(json.dumps(payload, indent=2) + "\n")

    missing = sorted(c for c in referenced if c not in known)
    print(f"referenced course codes: {len(referenced)}")
    print(f"concentrations: {len(payload['concentrations'])}")
    print(f"Intellectual Foundations: {sum(credit[c] for _, codes in IF_COURSES for c in codes)} credits")
    for c in CONCENTRATIONS:
        parts = []
        for g in c["groups"]:
            if g["type"] == "slots":
                parts.append(sum(credit[s["options"][0][0]] for s in g["slots"]))
            elif g["type"] == "pick":
                vals = sorted(credit[x] for x in g["pool"])
                parts.append(sum(vals[: g["choose"]]))
            else:
                parts.append(g["minCredits"])
        print(f"  {c['name']:34} {parts} -> {sum(parts)} (declared {c['credits']})")
    print(f"centers: {len(payload['centers'])}")
    bad = []
    for b in payload["centers"]:
        parts = [group_credits(g, credit) for g in b["groups"]]
        under = ", ".join(b["publishedUnder"])
        print(f"  {b['name'][:38]:38} {parts} -> {b['credits']} (as printed under {under})")
        # Foundations plus Core is 54 credits in every Center the catalog lists.
        if b["credits"] != 54:
            bad.append(f"{b['id']} totals {b['credits']}, expected 54")
    if bad:
        print("\nCENTER CREDITS DO NOT RECONCILE: " + "; ".join(bad))
        return 1
    if missing:
        print(f"\nCODES NOT IN CATALOG ({len(missing)}): {missing}")
        return 1
    print("all referenced codes exist in the extracted catalog")
    return 0


if __name__ == "__main__":
    sys.exit(main())
