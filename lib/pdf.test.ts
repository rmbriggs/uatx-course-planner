import { describe, expect, it } from "vitest";
import { reconstructLines, type PdfItem } from "./pdf";
import { parseTranscript } from "./transcript";

/**
 * Positions copied from the geometry a real Populi transcript produces. The
 * awkward case is a wrapped course row: the code splits across two bands and
 * the credit figures sit on their own band between them, closer to their own
 * row than to the course above.
 */
const item = (text: string, x: number, y: number, w = text.length * 4.6): PdfItem => ({ text, x, y, w });

const FIGURES = (y: number, a: string, b: string, g: string, p: string) => [
  item(a, 350, y),
  item(b, 410, y),
  item(g, 470, y),
  item(p, 530, y),
];

const PAGE: PdfItem[] = [
  item("2025-2026: Fall 2025 - 09/08/2025 - 11/21/2025", 46, 591.8),
  item("Course", 46, 572.3),
  item("Name", 100, 572.3),
  item("Grade", 470, 572.3),
  item("Points", 530, 572.3),

  // an ordinary single-line row
  item("INF 1220", 46, 510),
  item("Quantitative Reasoning II", 100, 510),
  ...FIGURES(510, "3.00", "3.00", "95", "285.00"),

  // a wrapped row: code halves at 495.8 and 483.8, figures between them
  item("STM", 46, 495.8),
  item("Special Topics: Accelerated Introduction to", 100, 495.8),
  ...FIGURES(489.8, "3.00", "3.00", "95", "285.00"),
  item("3910C", 46, 483.8),
  item("Programming", 100, 483.8),

  // a wrapped row where only the number wrapped
  item("ALT", 46, 469),
  item("The Rise and Fall of Ancient Rome", 100, 463),
  ...FIGURES(463, "3.00", "3.00", "92", "276.00"),
  item("1010", 46, 457),

  // an in-progress row
  item("INF 1320", 46, 440),
  item("Intellectual Foundations of Economics", 100, 440),
  ...FIGURES(440, "3.00", "0.00", "IP", "0.00"),

  item("Resident", 46, 400),
  ...FIGURES(400, "12.00", "9.00", "92", "828.00"),
];

describe("reconstructLines", () => {
  const lines = reconstructLines(PAGE);
  const find = (needle: string) => lines.find((l) => l.includes(needle));

  it("puts a wrapped course code back together", () => {
    expect(find("Accelerated")).toMatch(/^STM 3910C\s/);
    expect(find("Accelerated")).toContain("Special Topics: Accelerated Introduction to Programming");
  });

  it("keeps a stray band with its own row rather than the one above", () => {
    // The bug this guards: "STM" sat 14pt below INF 1220 but only 6pt from its
    // own figures, and was being folded into INF 1220's title.
    expect(find("Quantitative Reasoning II")).not.toContain("STM");
    expect(find("Quantitative Reasoning II")).not.toContain("Accelerated");
  });

  it("handles a row where only the course number wrapped", () => {
    expect(find("Ancient Rome")).toMatch(/^ALT 1010\s/);
  });

  it("leaves term headers and totals on their own lines", () => {
    expect(lines.some((l) => l.trim().startsWith("2025-2026: Fall 2025"))).toBe(true);
    expect(find("Resident")).toMatch(/Resident\s+12\.00\s+9\.00/);
  });

  it("does not split a word that pdf.js reported in pieces", () => {
    const split = reconstructLines([
      item("2", 46, 500, 5),
      item("025-2026: Spring 2026", 51, 500, 90),
      item("x", 300, 500, 5),
    ]);
    expect(split[0]).toContain("2025-2026: Spring 2026");
  });
});

describe("the reconstructed page parses", () => {
  const parsed = parseTranscript(reconstructLines(PAGE).join("\n"));

  it("finds every course, in progress included", () => {
    expect(parsed.rows.map((r) => r.code)).toEqual(["INF 1220", "STM 3910C", "ALT 1010", "INF 1320"]);
    expect(parsed.rows.find((r) => r.code === "INF 1320")?.status).toBe("in-progress");
  });

  it("agrees with the total the page reports", () => {
    const earned = parsed.rows.filter((r) => r.status === "completed").reduce((n, r) => n + (r.credits ?? 0), 0);
    expect(earned).toBe(9);
    expect(parsed.reportedEarnedCredits).toBe(9);
    expect(parsed.warnings).toHaveLength(0);
  });
});
