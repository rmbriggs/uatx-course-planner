"""Author the 2026-2027 degree requirements and validate every code.

Transcribed from the UATX 2026-2027 Academic Catalog, Section 07
(pp. 56-77). Page references are recorded on each group so any number here can
be traced back to the catalog.

Requirement group shapes:
  slots  - an ordered list of named slots. Each slot lists `options`; an option
           is a SET of course codes that together fill that slot (so "LITR 103"
           or "INF 1103 + INF 1104"). `choose` says how many slots are needed
           (default: all of them).
  pick   - choose `choose` courses from a flat pool.
  oneOf  - choose `choose` courses from ONE of several named pools (CSAI's two
           subtopics), not mixed across them.
"""
import json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data"


def slot(label, *options):
    return {"label": label, "options": [list(o) if isinstance(o, (list, tuple)) else [o] for o in options]}


# ---------------------------------------------------------------- Intellectual Foundations (p. 57-58)
IF_GROUPS = [
    {
        "id": "if-humanities", "name": "Humanities and Fine Arts", "type": "slots", "page": 58,
        "slots": [
            slot("Epic and Tragedy", ["LITR 102"], ["INF 1102"]),
            slot("The Bible", ["LITR 103"], ["INF 1103", "INF 1104"]),
            slot("Plato and Aristotle", ["PHIL 120"]),
            slot("The Scientific Revolution", ["PHIL 130"]),
            slot("Writing and the English Language", ["WRIT 120"], ["INF 1210"]),
            slot("Ancient Greece", ["HIST 110"]),
            slot("Ancient Rome", ["HIST 115"]),
            slot("Rise of the West", ["HIST 130"]),
        ],
    },
    {
        "id": "if-science", "name": "Natural Sciences, Mathematics, and Technology",
        "type": "slots", "choose": 3, "page": 58,
        "note": "Choose three from among SCIM 101, 102, 110, and 210.",
        "slots": [
            slot("Quantitative Reasoning - Analysis", ["SCIM 101"], ["INF 1130"], ["MATH 101"]),
            slot("Quantitative Reasoning - Data", ["SCIM 102"], ["INF 1220"], ["MATH 220"]),
            slot("Introduction to Physics", ["SCIM 110"], ["INF 1330"]),
            slot("Life Sciences, Ethics, and Policy", ["SCIM 210"], ["INF 2110"]),
        ],
    },
    {
        "id": "if-econ", "name": "Applied Economics", "type": "slots", "page": 58,
        "note": "Take both.",
        "slots": [
            slot("Applied Issues and Perspectives in Economics I", ["ECON 101"], ["ECON 111"], ["INF 1320"]),
            slot("Applied Issues and Perspectives in Economics II", ["ECON 102"], ["ECON 112"]),
        ],
    },
    {
        "id": "if-social", "name": "Social and Behavioral Sciences", "type": "slots", "page": 58,
        "slots": [
            slot("The Enlightenment", ["HIST 210"]),
            slot("Making of the Modern World", ["HIST 131"]),
            slot("The American Century", ["AMCV 110"]),
            slot("The American Founding", ["AMCV 200"]),
            slot("American Frontiers", ["AMCV 201"]),
            slot("Ideological Experiments of the 20th Century", ["HIST 111"]),
        ],
    },
]

# The catalog's "Prerequisite: AMCV 200 or INF 2121" and "AMCV 201 or INF 2200"
# lines name an acceptable background course, not an equivalent: INF 2121 Early
# Modernity is Machiavelli and the Reformation, which is HIST 131's subject, not
# the American Founding. Proposed INF equivalences live in
# scripts/extract_equivalencies.py, where each carries its evidence.
INFERRED_IF_OPTIONS: dict[str, str] = {}


def conc(cid, name, center, kind, groups, prereqs=None, page=None):
    return {
        "id": cid, "name": name, "center": center, "kind": kind,
        "credits": 36, "lowerCredits": 18, "upperCredits": 18,
        "prerequisites": prereqs or [], "groups": groups, "page": page,
    }


def all_of(gid, name, codes, page):
    return {"id": gid, "name": name, "type": "slots", "page": page,
            "slots": [slot(None, [c]) for c in codes]}


def pick(gid, name, choose, pool, page):
    return {"id": gid, "name": name, "type": "pick", "choose": choose, "pool": pool, "page": page}


CONCENTRATIONS = [
    conc("philosophy", "Philosophy", "Arts", "concentration", page=62, groups=[
        all_of("phil-core", "Lower Division - complete all 5", ["PHIL 210", "PHIL 215", "PHIL 220", "PHIL 225", "PHIL 230"], 62),
        pick("phil-lower-choice", "Lower Division - complete 1 from", 1, ["LITR 220", "AMCV 225", "AMCV 230"], 62),
        pick("phil-upper", "Upper Division - complete 6 from", 6, [
            "PHIL 310", "PHIL 315", "PHIL 320", "PHIL 325", "PHIL 330", "PHIL 335", "PHIL 340",
            "PHIL 345", "PHIL 350", "PHIL 355", "PHIL 360", "PHIL 365", "PHIL 370", "PHIL 410",
            "PHIL 415", "PHIL 420", "PHIL 425", "PHIL 430", "PHIL 435",
            "HIST 310", "HIST 320", "HIST 335", "HIST 340", "HIST 345", "HIST 350", "HIST 355",
            "HIST 370", "HIST 375", "HIST 380",
            "LITR 335", "LITR 340", "LITR 341", "LITR 430",
            "AMCV 340", "AMCV 350", "AMCV 355", "AMCV 360", "AMCV 365", "AMCV 370", "AMCV 420"], 63),
    ]),
    conc("history", "History", "Arts", "concentration", page=64, groups=[
        all_of("hist-core", "Lower Division - complete all 3", ["HIST 211", "HIST 215", "HIST 220"], 64),
        pick("hist-lower-choice", "Lower Division - complete 3 from", 3, ["LITR 210", "LITR 220", "AMCV 210", "AMCV 225"], 65),
        pick("hist-upper", "Upper Division - complete 6 from", 6, [
            "HIST 310", "HIST 315", "HIST 320", "HIST 325", "HIST 330", "HIST 335", "HIST 340",
            "HIST 345", "HIST 350", "HIST 355", "HIST 360", "HIST 361", "HIST 365", "HIST 370",
            "HIST 375", "HIST 380", "HIST 410", "HIST 415", "HIST 420", "HIST 425", "HIST 430", "HIST 435",
            "LITR 340", "LITR 341", "LITR 345",
            "AMCV 310", "AMCV 325", "AMCV 330", "AMCV 340", "AMCV 345", "AMCV 370", "AMCV 375", "AMCV 415"], 65),
    ]),
    conc("literature", "Literature", "Arts", "concentration", page=66, groups=[
        all_of("litr-core", "Lower Division - complete all 5", ["LITR 210", "LITR 215", "LITR 220", "LITR 225", "LITR 230"], 66),
        pick("litr-lower-choice", "Lower Division - complete 1 from", 1, ["AMCV 215", "HIST 211", "HIST 215", "HIST 220"], 67),
        pick("litr-upper", "Upper Division - complete 6 from", 6, [
            "PHIL 335", "PHIL 340", "PHIL 350", "PHIL 370",
            "HIST 310", "HIST 320", "HIST 325", "HIST 330", "HIST 335", "HIST 360", "HIST 361",
            "HIST 380", "HIST 410", "HIST 415", "HIST 430",
            "LITR 310", "LITR 315", "LITR 320", "LITR 325", "LITR 330", "LITR 335", "LITR 340",
            "LITR 341", "LITR 345", "LITR 350", "LITR 355", "LITR 360", "LITR 365",
            "LITR 410", "LITR 415", "LITR 420", "LITR 425", "LITR 430",
            "WRIT 310", "WRIT 410",
            "AMCV 315", "AMCV 410", "AMCV 425", "AMCV 430", "AMCV 435"], 67),
    ]),
    conc("american-civilization", "American Civilization", "Arts", "concentration", page=68, groups=[
        all_of("amcv-core", "Lower Division - complete all 5", ["AMCV 210", "AMCV 215", "AMCV 220", "AMCV 225", "AMCV 230"], 68),
        pick("amcv-lower-choice", "Lower Division - complete 1 from", 1, ["HIST 215", "HIST 220", "LITR 225"], 69),
        pick("amcv-upper", "Upper Division - complete 6 from", 6, [
            "PHIL 325", "PHIL 330", "PHIL 335", "PHIL 370", "PHIL 430", "PHIL 435",
            "HIST 310", "HIST 315", "HIST 320", "HIST 325", "HIST 330", "HIST 335", "HIST 360",
            "HIST 365", "HIST 370", "HIST 375", "HIST 380",
            "LITR 345", "LITR 360", "LITR 365",
            "AMCV 310", "AMCV 315", "AMCV 320", "AMCV 325", "AMCV 330", "AMCV 340", "AMCV 345",
            "AMCV 350", "AMCV 355", "AMCV 360", "AMCV 365", "AMCV 370", "AMCV 375", "AMCV 410",
            "AMCV 415", "AMCV 420", "AMCV 425", "AMCV 430", "AMCV 435"], 69),
    ]),
    conc("mathematics", "Mathematics", "Sciences", "concentration", page=70,
         prereqs=[{"options": [["MATH 101"]], "label": "MATH 101 Single-Variable Calculus", "note": "Satisfies SCIM 101 in the Intellectual Foundations."}],
         groups=[
        all_of("math-core", "Lower Division - complete all 7",
               ["MATH 200", "MATH 210", "MATH 220", "MATH 230", "MATH 231", "MATH 240", "MATH 250"], 70),
        pick("math-upper", "Upper Division - complete 6 from", 6, [
            "MATH 310", "MATH 311", "MATH 320", "MATH 321", "MATH 325", "MATH 330", "MATH 335",
            "MATH 340", "MATH 360", "MATH 361", "MATH 365", "MATH 415", "MATH 420", "MATH 430",
            "MATH 435", "MATH 440", "MATH 460", "MATH 465", "MATH 470"], 71),
    ]),
    conc("csai", "Computer Science and Artificial Intelligence", "Sciences", "concentration", page=71,
         prereqs=[
             {"options": [["MATH 101"]], "label": "MATH 101 Single-Variable Calculus", "note": "Satisfies SCIM 101 in the Intellectual Foundations."},
             {"options": [["MATH 240"]], "label": "MATH 240 Applied Mathematical Methods"},
             {"options": [["CSAI 110"]], "label": "CSAI 110 Introduction to Programming"},
         ],
         groups=[
        all_of("csai-core", "Lower Division - complete all 7",
               ["MATH 210", "MATH 220", "MATH 230", "CSAI 210", "CSAI 220", "CSAI 230", "CSAI 235"], 72),
        all_of("csai-upper-core", "Upper Division - complete both", ["CSAI 300", "CSAI 350"], 72),
        {"id": "csai-subtopic", "name": "Upper Division - complete 4 from one subtopic",
         "type": "oneOf", "choose": 4, "page": 72, "pools": [
            {"name": "Computer Science and Systems",
             "pool": ["CSAI 310", "CSAI 320", "CSAI 330", "CSAI 340", "CSAI 400", "CSAI 410", "CSAI 420"]},
            {"name": "Machine Learning",
             "pool": ["CSAI 360", "CSAI 370", "CSAI 380", "CSAI 401", "CSAI 411", "CSAI 421"]},
         ]},
    ]),
    conc("economics", "Economics", "Sciences", "concentration", page=73,
         prereqs=[
             {"options": [["MATH 101"]], "label": "MATH 101 Single-Variable Calculus", "note": "Satisfies SCIM 101 in the Intellectual Foundations."},
             {"options": [["MATH 240"]], "label": "MATH 240 Applied Mathematical Methods"},
             {"options": [["ECON 111"], ["ECON 101"]], "label": "ECON 111 or ECON 101"},
             {"options": [["ECON 112"], ["ECON 102"]], "label": "ECON 112 or ECON 102"},
         ],
         groups=[
        all_of("econ-core", "Lower Division - complete all 7",
               ["ECON 201", "ECON 202", "ECON 203", "ECON 204", "MATH 220", "MATH 230", "ECON 230"], 73),
        pick("econ-upper", "Upper Division - complete 6 from", 6, [
            "ECON 300", "ECON 301", "ECON 302", "ECON 306", "ECON 332", "ECON 340", "ECON 351",
            "ECON 353", "ECON 360", "ECON 361", "ECON 362", "ECON 370", "ECON 371", "ECON 372",
            "ECON 373", "ECON 390", "ECON 391", "ECON 396", "ECON 405", "ECON 420", "ECON 421",
            "ECON 422", "ECON 423", "ECON 430", "ECON 431", "ECON 435", "ECON 440"], 74),
    ]),
    conc("business-innovation", "Business Innovation", "Sciences", "applied track", page=74, groups=[
        {"id": "busi-core", "name": "Lower Division - complete all 6", "type": "slots", "page": 75, "slots": [
            slot("Entrepreneurial Strategy", ["BUSI 210"], ["EPH 2900J"]),
            slot("Business Foundations for Builders", ["BUSI 215"], ["EPH 2900K"]),
            slot("Leading with Principles", ["BUSI 230"]),
            slot("Technology and AI for Builders", ["BUSI 235"]),
            slot("Law for Builders", ["BUSI 240"]),
            slot("Building & Product Design", ["BUSI 245"]),
        ]},
        pick("busi-upper", "Upper Division - complete 6 from", 6, [
            "BUSI 310", "BUSI 315", "BUSI 320", "BUSI 330", "BUSI 335", "BUSI 340", "BUSI 350",
            "BUSI 355", "BUSI 360", "BUSI 410", "BUSI 415", "BUSI 420", "BUSI 430", "BUSI 435",
            "BUSI 440", "BUSI 450", "BUSI 455", "BUSI 460", "BUSI 465"], 75),
    ]),
]

POLARIS = {
    "credits": 27, "page": 76,
    "required": [
        slot("Polaris Launch (first course)", ["POLR 110"]),
        slot("Polaris Gateway (final course)", ["POLR 490"]),
    ],
    "buildCredits": 21,
    "buildCourses": ["POLR 310", "POLR 311"],
    "buildEquivalents": ["POLR 210", "POLR 211", "POLR 212", "POLR 312", "POLR 313"],
    "buildEquivalentCap": 6,
    "note": ("A minimum of 21 credit hours of Polaris Build is required. Of those 21, up to 6 "
             "credits can be Build equivalents (Polaris courses, bootcamps, exams, or approved "
             "experiences such as internships and apprenticeships)."),
}

# UATX 2026-2027 Academic Catalog, pp. 19-20 (Grading System) and p. 38
# (Requirements for Graduation / Repetition of Work).
GRADING = {
    "page": 19,
    "scale": "Courses are scored 0-100. The Course Score Average (CSA) replaces a GPA.",
    "passingScore": 60,
    "minimumCsa": 73,
    "bands": [
        {"min": 90, "max": 100, "letters": ["A-", "A", "A+"], "descriptor": "Excellent"},
        {"min": 80, "max": 89, "letters": ["B-", "B", "B+"], "descriptor": "Above average, with some room to improve"},
        {"min": 73, "max": 79, "letters": ["C", "C+"], "descriptor": "Satisfactory, with significant room to improve"},
        {"min": 60, "max": 72, "letters": ["D-", "D", "D+", "C-"], "descriptor": "Poor, fails to meet basic standards"},
        {"min": 0, "max": 59, "letters": ["F"], "descriptor": "Unsatisfactory / Failing"},
    ],
    # Verified against the printed table on catalog p. 20.
    "notations": {
        "P": {"meaning": "Pass", "earnsCredit": True},
        "I": {"meaning": "Incomplete", "earnsCredit": False},
        "S": {"meaning": "Satisfactory", "earnsCredit": True},
        "U": {"meaning": "Unsatisfactory", "earnsCredit": False,
              "note": "Required courses marked Unsatisfactory must be retaken to earn credit."},
        "W": {"meaning": "Withdrawn", "earnsCredit": False},
        "AU": {"meaning": "Audit", "earnsCredit": False,
               "note": "Participated but did not earn credit or a grade."},
    },
    "retake": ("A student who scores below 60 may repeat that course once. If the course is "
               "required, it must be retaken to satisfy degree requirements. Only the higher "
               "of the two scores counts toward the CSA, and both appear on the transcript."),
    "withdrawalLimits": {"perYear": 2, "total": 8, "page": 38},
}

MAJOR = {
    "credits": 96, "page": 59,
    "rules": [
        {"id": "major-200", "label": "200-level coursework", "minCredits": 18, "levels": [200]},
        {"id": "major-300plus", "label": "300/400-level coursework", "minCredits": 45, "levels": [300, 400]},
    ],
    "note": "Remaining credits are electives selected in consultation with a Faculty Advisor.",
}


def main():
    courses = json.loads((OUT / "courses.json").read_text())
    known = {c["code"] for c in courses["courses"]} | {c["code"] for c in courses["legacyCourses"]}

    referenced = set()

    def note_codes(obj):
        if isinstance(obj, dict):
            if obj.get("type") == "pick":
                referenced.update(obj["pool"])
            if obj.get("type") == "oneOf":
                for p in obj["pools"]:
                    referenced.update(p["pool"])
            for k, v in obj.items():
                if k in ("slots", "prerequisites", "required"):
                    for s in v:
                        for opt in s["options"]:
                            referenced.update(opt)
                elif isinstance(v, (dict, list)):
                    note_codes(v)
        elif isinstance(obj, list):
            for i in obj:
                note_codes(i)

    payload = {
        "program": "2026-2027",
        "source": "UATX 2026-2027 Academic Catalog, Section 07 (pp. 56-77)",
        "totalCredits": 180,
        "pillars": [
            {"id": "if", "name": "Intellectual Foundations", "credits": 57},
            {"id": "major", "name": "Liberal Studies Major", "credits": 96},
            {"id": "polaris", "name": "Polaris", "credits": 27},
        ],
        "intellectualFoundations": {
            "credits": 57, "groups": IF_GROUPS,
            "inferredOptions": INFERRED_IF_OPTIONS,
            "legacyProvision": {
                "note": ("The equivalency document states the new Intellectual Foundations is "
                         "satisfied by the old Intellectual Foundations plus one course."),
                "legacyCourses": ["INF 1100", "INF 1110", "INF 1130", "INF 1200", "INF 1210",
                                  "INF 1220", "INF 1300", "INF 1320", "INF 1330", "INF 2100",
                                  "INF 2110", "INF 2120", "INF 2200", "INF 2210", "INF 2300"],
                "additionalCredits": 3,
            },
        },
        "grading": GRADING,
        "major": MAJOR,
        "polaris": POLARIS,
        "concentrations": CONCENTRATIONS,
    }

    note_codes(payload)
    referenced.update(POLARIS["buildCourses"])
    referenced.update(POLARIS["buildEquivalents"])
    referenced.update(payload["intellectualFoundations"]["legacyProvision"]["legacyCourses"])

    missing = sorted(c for c in referenced if c not in known)
    (OUT / "requirements.json").write_text(json.dumps(payload, indent=2) + "\n")

    print(f"referenced course codes: {len(referenced)}")
    print(f"concentrations: {len(payload['concentrations'])}")
    if missing:
        print(f"\nCODES NOT IN CATALOG ({len(missing)}): {missing}")
        return 1
    print("all referenced codes exist in the extracted catalog")
    return 0


if __name__ == "__main__":
    sys.exit(main())
