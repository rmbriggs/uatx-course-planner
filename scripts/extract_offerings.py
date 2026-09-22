"""Parse a term's course-description dump into the offerings file.

Source (committed under data/raw/):
  offerings_winter_dterm_2627.txt   Winter and D-Term 26/27 Course Descriptions

The PDF has a real text layer, unlike both catalogs, so the dump is made with
    pdftotext -layout "<pdf>" data/raw/offerings_winter_dterm_2627.txt
which is a manual step: this script reads the dump, never the PDF.
"""
# Keeps the annotations below working on the 3.9 a mac ships with, as well
# as the 3.12 CI installs.
from __future__ import annotations

import json, re, sys
from pathlib import Path

RAW = Path(__file__).resolve().parent.parent / "data" / "raw"
OUT = Path(__file__).resolve().parent.parent / "data"
SOURCE = "offerings_winter_dterm_2627.txt"
LABEL = "Winter and D-Term 26/27 Course Descriptions, retrieved 2026-09-21"

# "AMCV 200: The American Founding", always at column 0.
CODE_RE = re.compile(r"^(?P<subj>[A-Z]{2,5}) (?P<num>\d{3}[A-Z]?): (?P<title>\S.*?)\s*$")

# "(3 Credits; Faculty: Wolf, Reznick, Hoffpauir)" and its three variants in
# this dump: lowercase "credits", a colon where the semicolon belongs
# (HIST 385B), and no "Faculty:" label at all (LEAD 380A).
CREDITS_RE = re.compile(
    r"^\(\s*(?P<cr>\d+(?:\.\d+)?)\s*credits?\s*[;:,]\s*"
    r"(?:Faculty\s*[:;]\s*)?(?P<fac>[^)]*?)\s*\)\s*$",
    re.IGNORECASE,
)

TERMS = [
    {"id": "winter-2627", "name": "Winter 26/27", "order": 1, "heading": "winter"},
    {"id": "dterm-2627", "name": "D-Term 26/27", "order": 2, "heading": "d-term"},
]
BY_HEADING = {t["heading"]: t for t in TERMS}

# Centered lines that are page furniture rather than a department.
FURNITURE = {"course descriptions"}

# Offerings whose code the 2026-2027 catalog does not list. They stay in the
# file and stay plannable, but they fill no named requirement, and the note
# says so. A new code appearing here fails the build until someone decides
# which of the two it is.
UNCATALOGUED = {
    "LEAD 380A": "The catalog lists no LEAD subject, so this cannot be matched to a "
                 "requirement. It still counts toward the term's credits.",
    "POLR 380A": "The catalog's POLR numbering stops at 313 before Polaris Gateway "
                 "(490), so this cannot be matched to a requirement. It still counts "
                 "toward the term's credits.",
}

# Courses the catalog gives a nominal weight but a term runs at whatever the
# topic is worth, verified against the dump. A divergence that is NOT listed
# here is far more likely to be a misread credits line than a real change, so
# it fails the build.
VARIABLE_CREDIT = {
    "PHIL 410": "The catalog gives Great Philosophers 3 credits; this term runs "
                "Introduction to Leo Strauss at 1.5.",
}

# A lettered special topic is delivered under its base code's requirement:
# PHIL 380A is a PHIL 380. This mirrors getCourse()'s own fallback in lib.
LETTERED = re.compile(r"^([A-Z]{2,5} \d{3})[A-Z]$")


def catalog() -> dict[str, dict]:
    data = json.loads((OUT / "courses.json").read_text())
    out = {c["code"]: c for c in data["courses"]}
    for c in data["legacyCourses"]:
        out.setdefault(c["code"], c)
    return out


def resolve(code: str, known: set[str]) -> str | None:
    """The catalog code this offering delivers, or None if there is not one."""
    if code in known:
        return code
    m = LETTERED.match(code)
    if m and m.group(1) in known:
        return m.group(1)
    if code in UNCATALOGUED:
        return None
    raise SystemExit(
        f"{code} is offered but is not in the catalog and is not listed in "
        f"UNCATALOGUED in {Path(__file__).name}. Confirm it against the catalog, "
        f"or add it there with a note saying why it fills no requirement."
    )


def parse(text: str) -> list[dict]:
    term = None
    dept = None
    cur = None
    out: list[dict] = []

    for raw in text.split("\n"):
        s = raw.strip()
        if not s:
            continue

        # A centered term heading switches terms and clears the department.
        if s.lower() in BY_HEADING and raw.startswith(" " * 20):
            term = BY_HEADING[s.lower()]["id"]
            dept = None
            cur = None
            continue

        m = CODE_RE.match(raw)
        if m:
            if term is None:
                raise SystemExit(f"{m['subj']} {m['num']} appears before any term heading.")
            if dept is None:
                raise SystemExit(f"{m['subj']} {m['num']} appears before any department heading.")
            cur = {
                "term": term,
                "code": f"{m['subj']} {m['num']}",
                "catalogCode": None,
                "title": m["title"],
                "credits": None,
                "faculty": [],
                "department": dept,
                "note": None,
                "sections": [],
            }
            out.append(cur)
            continue

        c = CREDITS_RE.match(s)
        if c and cur is not None and cur["credits"] is None:
            cur["credits"] = float(c["cr"])
            fac = c["fac"].strip()
            cur["faculty"] = (
                [] if fac.upper() in ("TBD", "") else [f.strip() for f in fac.split(",") if f.strip()]
            )
            continue

        # A centered line that is not a course and not furniture names the
        # department the courses under it belong to.
        if raw.startswith(" " * 20) and s.lower() not in FURNITURE and "26/27" not in s:
            if cur is None or cur["credits"] is not None:
                dept = s
                cur = None
                continue

        # Inside a description, an indented line is a restriction or a note
        # about who the course is for. The prose itself sits at column 0.
        if cur is not None and cur["credits"] is not None and raw.startswith(" " * 7):
            if s == "Course Description:":
                continue
            cur["note"] = f"{cur['note']} {s}" if cur["note"] else s

    return out


def main() -> None:
    text = (RAW / SOURCE).read_text()
    rows = parse(text)
    catalogued = catalog()
    known = set(catalogued)

    for r in rows:
        if r["credits"] is None:
            raise SystemExit(f"{r['code']} has no credits line; the dump format changed.")
        r["catalogCode"] = resolve(r["code"], known)
        if r["catalogCode"] is None:
            reason = UNCATALOGUED[r["code"]]
            r["note"] = f"{r['note']} {reason}" if r["note"] else reason
            continue

        entry = catalogued[r["catalogCode"]]
        if r["credits"] == entry["credits"]:
            continue
        # A special topic runs at whatever weight the term gives it, so its
        # code carries no fixed value to disagree with.
        if "special topic" in entry["title"].lower():
            continue
        reason = VARIABLE_CREDIT.get(r["catalogCode"])
        if reason is None:
            raise SystemExit(
                f"{r['code']} runs at {r['credits']} credits but the catalog gives "
                f"{r['catalogCode']} {entry['credits']}. If the dump really says so, "
                f"add it to VARIABLE_CREDIT in {Path(__file__).name} with the reason; "
                f"otherwise the credits line was misread."
            )
        r["note"] = f"{r['note']} {reason}" if r["note"] else reason

    seen = set()
    for r in rows:
        key = (r["term"], r["code"])
        if key in seen:
            raise SystemExit(f"{r['code']} is listed twice under {r['term']}.")
        seen.add(key)

    payload = {
        "source": LABEL,
        "terms": [{k: t[k] for k in ("id", "name", "order")} for t in TERMS],
        "offerings": rows,
    }
    (OUT / "offerings.json").write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    counts = {t["id"]: sum(1 for r in rows if r["term"] == t["id"]) for t in TERMS}
    print(f"offerings.json: {len(rows)} offerings {counts}", file=sys.stderr)


if __name__ == "__main__":
    main()
