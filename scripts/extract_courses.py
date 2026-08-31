"""Parse OCR'd catalog text into structured course records.

Sources (committed under data/raw/):
  new_catalog_ocr.txt  UATX 2026-2027 Academic Catalog, 265 pages
                       p078-p160 = 2026-2027 courses, p161-p191 = legacy courses
  old_catalog_ocr.txt  UATX 2024-2025 Academic Catalog, 70 pages
                       p44-p64  = course descriptions
Both PDFs were image-only; text came from Apple Vision OCR (see scripts/ocr.swift).
"""
import json, re, sys, unicodedata
from pathlib import Path

import docx

RAW = Path(__file__).resolve().parent.parent / "data" / "raw"
OUT = Path(__file__).resolve().parent.parent / "data"

PAGE_RE = re.compile(r"^#{10} p-0*(\d+)\.jpg #{10}$")

# "AMCV 201 American Frontiers                     3 cr"   (new catalog)
NEW_RE = re.compile(
    r"^\s*(?P<subj>[A-Z]{3,4})\s?(?P<num>\d{3,4}[A-Z]?)\s+"
    r"(?P<title>\S.*?)\s{2,}(?P<cr>\d+(?:[.,]\d+)?)\s*cr[a-zA-Z]{0,2}(?:\s|$)",
    re.UNICODE,
)
# "ALT 1050   Romanticism and Realism              3 credit hours"  (old catalog)
OLD_RE = re.compile(
    r"^\s*(?P<subj>[A-Z]{3})\s?(?P<num>\d{4}[A-Z]?)\s+"
    r"(?P<title>\S.*?)\s{2,}(?P<cr>\d+(?:[.,]\d+)?)\s*credit\s*hours",
    re.UNICODE,
)
# a code+title with no credits on the line (title wrapped in OCR)
BARE_RE = re.compile(r"^\s*(?P<subj>[A-Z]{3,4})\s?(?P<num>\d{3,4}[A-Z]?)\s+(?P<title>\S.*?)\s*$")
PREREQ_RE = re.compile(r"^\s*Prerequisites?:\s*(?P<p>.+?)\s*$")

NOISE = re.compile(r"THE UNIVERSITY OF AUSTIN|ACADEMIC CATALOG|SECTION \d")

# Vision OCR occasionally emits Cyrillic homoglyphs inside all-caps subject codes.
CYRILLIC = str.maketrans({
    "А": "A", "В": "B", "Е": "E", "К": "K", "М": "M", "Н": "H", "О": "O",
    "Р": "P", "С": "C", "Т": "T", "Х": "X", "У": "Y", "І": "I", "Ј": "J",
})

# Codes the OCR reliably mangles, verified against the catalogs by hand.
CODE_FIXES = {
    "BUS 350": "BUSI 350",   # p88, requirement list says BUSI 350
    "EHP 3050": "EPH 3050",  # old catalog p56, Public Choice
}


def clean(s: str) -> str:
    s = unicodedata.normalize("NFKC", s)
    s = s.replace("’", "'").replace("‘", "'")
    s = s.replace("“", '"').replace("”", '"')
    s = s.replace("–", "-").replace("—", "-")
    # OCR routinely reads a trailing capital I as a lowercase l or a pipe
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(r"\|", "I", s)
    return s.strip(" .,-")


def fix_title(t: str) -> str:
    t = clean(t)
    # "Quantitative Reasoning I|" / "Bible I|" -> II ; "Al" -> AI when standalone
    t = re.sub(r"\bIl\b", "II", t)
    t = re.sub(r"(?<=[a-zA-Z0-9]) ([lI|]{1,3})$", lambda m: " " + "I" * len(m.group(1)), t)
    t = re.sub(r"(?<=[a-z]) ([lI|]{2,3})(?=[ :,])", lambda m: " " + "I" * len(m.group(1)), t)
    t = re.sub(r"\bAl\b", "AI", t)
    t = re.sub(r"\bAl-(?=[A-Z])", "AI-", t)
    return t


def pages(path: Path):
    """Yield (page_number, [lines]) for each OCR page block."""
    cur, buf = None, []
    for line in path.read_text(encoding="utf-8").splitlines():
        m = PAGE_RE.match(line.strip())
        if m:
            if cur is not None:
                yield cur, buf
            cur, buf = int(m.group(1)), []
        elif cur is not None:
            buf.append(line)
    if cur is not None:
        yield cur, buf


def credits(raw: str) -> float:
    return float(raw.replace(",", "."))


def plausible_title_fragment(s: str) -> bool:
    """True when a bare line looks like the first half of a wrapped course title."""
    if not s or len(s) > 80 or s[0].islower():
        return False
    if s.endswith((".", "?", "!", ":", ";")):
        return False
    if re.search(r"\d+(?:\.\d+)?\s*(?:cr|credit)", s):
        return False
    if BARE_RE.match(" " + s):        # starts with its own course code
        return False
    return True


def scan(path: Path, lo: int, hi: int, rx, catalog: str, records: dict, wrapped_titles: bool = False):
    """Collect course records from pages [lo, hi] of one OCR file.

    wrapped_titles: the 2024-2025 catalog puts a tall wrapped title row *above*
    its own code row, so the leading fragment must be stitched back on. The
    2026-2027 catalog never does this, and enabling it there corrupts titles.
    """
    for pageno, lines in pages(path):
        if not (lo <= pageno <= hi):
            continue
        last = None
        pending_title = None  # title line OCR'd above its own code line
        for line in lines:
            if NOISE.search(line):
                continue
            m = rx.match(line)
            if m:
                code = f"{m.group('subj')} {m.group('num')}".translate(CYRILLIC)
                code = CODE_FIXES.get(code, code)
                subject, number = code.split(" ", 1)
                title = fix_title(m.group("title"))
                if (
                    wrapped_titles
                    and pending_title
                    and len(title.split()) <= 3
                    and plausible_title_fragment(pending_title)
                ):
                    title = fix_title(pending_title + " " + title)
                rec = {
                    "code": code,
                    "subject": subject,
                    "number": number,
                    "title": title,
                    "credits": credits(m.group("cr")),
                    "catalog": catalog,
                    "page": pageno,
                }
                # first occurrence wins; later pages repeat cross-listings
                records.setdefault(code, rec)
                last = code
                pending_title = None
                continue
            pm = PREREQ_RE.match(line)
            if pm and last:
                records[last].setdefault("prerequisite", clean(pm.group("p")))
                continue
            # a long line with no code and no credits, directly before a code line,
            # is a wrapped title (the OCR puts the tall title row above the code row)
            if wrapped_titles:
                stripped = clean(line)
                pending_title = stripped if plausible_title_fragment(stripped) else None


# Courses that appear only inside a requirement list, never as their own
# description block. Credits and titles are taken from that requirement line.
EXTRA_COURSES = [
    {
        "code": "INF 1104", "subject": "INF", "number": "1104", "title": "Bible II",
        "credits": 1.5, "catalog": "legacy", "page": 58,
        "note": "Listed only in the 2026-2027 Intellectual Foundations requirements (p. 58).",
    },
]


# Codes written as a combined row in the equivalency tables.
COMBINED_CODE = re.compile(r"^([A-Z]{3})\s?(\d{4})([A-Z]?)\s*(?:&|/)\s*(\d{4}[A-Z]?|[A-Z])$")


def split_combined(code: str):
    """'STM 1001 & 1002' -> [STM 1001, STM 1002]; 'STM 3910B/C' -> [STM 3910B, STM 3910C]."""
    m = COMBINED_CODE.match(code)
    if not m:
        return [code]
    subj, num, suffix, tail = m.groups()
    first = f"{subj} {num}{suffix}"
    second = f"{subj} {num}{tail}" if tail.isalpha() else f"{subj} {tail}"
    return [first, second]


def scan_equivalency_doc(records: dict):
    """The equivalency tables name lettered special-topic courses (EPH 2900J,
    STM 3910B, ALT 4510L ...) that were really offered but never given their own
    description block in either catalog. They are legitimate legacy courses, so
    the document itself is treated as a course source for them."""
    path = RAW / "equivalency_tables.docx"
    if not path.exists():
        return 0
    added = 0
    centers = {3: "CAL", 4: "CEPH", 5: "STEM", 2: "Polaris"}
    for ti, table in enumerate(docx.Document(path).tables):
        if ti not in centers:
            continue
        for row in table.rows:
            cells = [clean(c.text) for c in row.cells]
            if len(cells) < 2:
                continue
            raw_code, title = cells[0], cells[1]
            if not re.match(r"^[A-Z]{3}\s?\d{4}", raw_code):
                continue
            cr = 3.0
            cm = re.search(r"\((\d+(?:\.\d+)?)(?:\s*each)?\)", title)
            if cm:
                cr = float(cm.group(1))
            name = fix_title(re.sub(r"\s*\([^)]*\)\s*$", "", title))
            for code in split_combined(raw_code):
                if code in records:
                    continue
                subject, number = code.split(" ", 1)
                records[code] = {
                    "code": code, "subject": subject, "number": number,
                    "title": name, "credits": cr, "catalog": "legacy",
                    "source": "equivalency document",
                }
                added += 1
    return added


def main():
    new_src = RAW / "new_catalog_ocr.txt"
    old_src = RAW / "old_catalog_ocr.txt"

    current: dict = {}
    scan(new_src, 78, 160, NEW_RE, "2026-2027", current)

    legacy: dict = {}
    scan(new_src, 161, 191, NEW_RE, "legacy", legacy)
    scan(old_src, 44, 64, OLD_RE, "legacy", legacy, wrapped_titles=True)

    # A legacy code that also exists in the current catalog is a real current course.
    for code in list(legacy):
        if code in current:
            legacy.pop(code)

    from_doc = scan_equivalency_doc(legacy)

    for extra in EXTRA_COURSES:
        target = current if extra["catalog"] == "2026-2027" else legacy
        target.setdefault(extra["code"], extra)

    courses = sorted(current.values(), key=lambda r: (r["subject"], r["number"]))
    legacy_courses = sorted(legacy.values(), key=lambda r: (r["subject"], r["number"]))

    payload = {
        "source": {
            "current": "UATX 2026-2027 Academic Catalog (pp. 78-160)",
            "legacy": "UATX 2026-2027 Academic Catalog (pp. 161-191) + UATX 2024-2025 Academic Catalog (pp. 44-64)",
        },
        "courses": courses,
        "legacyCourses": legacy_courses,
    }
    (OUT / "courses.json").write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

    print(f"from equivalency doc: {from_doc} additional legacy courses")
    print(f"current: {len(courses)} courses")
    print(f"legacy : {len(legacy_courses)} courses")
    from collections import Counter
    print("current subjects:", dict(sorted(Counter(c['subject'] for c in courses).items())))
    print("legacy subjects :", dict(sorted(Counter(c['subject'] for c in legacy_courses).items())))


if __name__ == "__main__":
    main()
