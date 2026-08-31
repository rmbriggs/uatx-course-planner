export interface PdfItem {
  text: string;
  x: number;
  y: number;
  /** Rendered width, used to tell a real gap from two halves of one word. */
  w?: number;
}

/** A money-or-credits figure: 3.00, 1.50, 4,971.00 */
const FIGURE = /^\d{1,3}(?:,\d{3})*\.\d{2}$/;
/** A grade cell: 92, IP, A-, P */
const GRADE = /^(?:\d{1,3}|IP|[A-DFP][+-]?|W|NC)$/i;

/**
 * Lines that must never be folded into a course row: term headers, column
 * headings, and page furniture. They carry meaning of their own, and merging
 * them into a neighbouring row would corrupt a course title.
 */
const STANDALONE =
  /^\s*(?:\d{4}\s*-\s*\d{4}\s*:|Course\b|Name\b|Attempted|Earned|Grade\b|Points\b|Credits\b|Totals\b|Term GPA|Cumulative|Program Summary|Produced by|RECIPIENT|Student\b|Birthdate|Enrolled|Degrees|B\.A\.|Major:|Concentration:|University of Austin|Unofficial|Page \d|Undergraduate Program)/i;

const isFigureRow = (row: PdfItem[]) => row.filter((i) => FIGURE.test(i.text)).length >= 2;

function rowText(row: PdfItem[]): string {
  return row
    .slice()
    .sort((a, b) => a.x - b.x)
    .map((i) => i.text)
    .join(" ");
}

/** Lay a row out by x, approximating its original columns. */
function layoutRow(row: PdfItem[]): string {
  const sorted = row.slice().sort((a, b) => a.x - b.x);
  let out = "";
  let prevEnd: number | null = null;
  for (const cell of sorted) {
    const col = Math.round(cell.x / 5.2);
    if (out.length < col) {
      out += " ".repeat(col - out.length);
    } else if (out) {
      // pdf.js often splits one word across items ("2" + "025-2026:"); only
      // separate them when the glyphs really are apart on the page.
      const touching = prevEnd !== null && cell.x - prevEnd < 1.2;
      if (!touching) out += " ";
    }
    out += cell.text;
    prevEnd = cell.x + (cell.w ?? 0);
  }
  return out.trimEnd();
}

/**
 * Rebuild transcript table rows from positioned text.
 *
 * A Populi transcript wraps long cells, and the credit figures are centred
 * against the whole row, so one logical course can arrive as three separate
 * bands of text:
 *
 *     STM      Special Topics: Accelerated Introduction to
 *                                              3.00  3.00  95  285.00
 *     3910C    Programming
 *
 * Rows carrying the credit figures anchor a record; nearby bands that are not
 * themselves records get folded in, then the pieces are put back in column
 * order so the course code reads "STM 3910C" again.
 */
export function reconstructLines(items: PdfItem[], pageWidth = 612): string[] {
  const sorted = items.slice().sort((a, b) => b.y - a.y || a.x - b.x);

  const rows: PdfItem[][] = [];
  for (const item of sorted) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(last[0].y - item.y) < 3) last.push(item);
    else rows.push([item]);
  }

  const anchors = rows.map(isFigureRow);
  const standalone = rows.map((r) => STANDALONE.test(rowText(r)));
  const ownerOf = new Array<number>(rows.length).fill(-1);

  const anchorIndexes = rows.map((_, i) => i).filter((i) => anchors[i]);
  anchorIndexes.forEach((i) => (ownerOf[i] = i));

  // A wrapped cell puts the figures between the two halves of the row, so a
  // stray band belongs to whichever figures row it sits closest to — not
  // simply to the record above it.
  rows.forEach((row, i) => {
    if (anchors[i] || standalone[i]) return;
    let best = -1;
    let bestGap = Infinity;
    for (const a of anchorIndexes) {
      const gap = Math.abs(rows[a][0].y - row[0].y);
      if (gap < bestGap) {
        bestGap = gap;
        best = a;
      }
    }
    if (best !== -1 && bestGap <= 12) ownerOf[i] = best;
  });

  const lines: string[] = [];
  rows.forEach((row, i) => {
    if (ownerOf[i] !== -1 && ownerOf[i] !== i) return; // folded into its record
    if (ownerOf[i] === -1) {
      lines.push(layoutRow(row));
      return;
    }

    const group = rows.filter((_, k) => ownerOf[k] === i).flat();
    const leftEdge = Math.min(...group.map((it) => it.x));

    // The course-code column is the leftmost band; a wrapped code contributes
    // its subject and its number on different lines, so read it top-down.
    const code = group
      .filter((it) => it.x <= leftEdge + 30 && !FIGURE.test(it.text))
      .sort((a, b) => b.y - a.y || a.x - b.x)
      .map((it) => it.text.trim())
      .join(" ");

    const figures = group
      .filter((it) => it.x > pageWidth * 0.45 && (FIGURE.test(it.text) || GRADE.test(it.text)))
      .sort((a, b) => a.x - b.x)
      .map((it) => it.text.trim());

    const used = new Set([...code.split(" "), ...figures]);
    const name = group
      .filter((it) => it.x > leftEdge + 30)
      .filter((it) => !(it.x > pageWidth * 0.45 && (FIGURE.test(it.text) || GRADE.test(it.text))))
      .sort((a, b) => b.y - a.y || a.x - b.x)
      .map((it) => it.text.trim())
      .filter(Boolean)
      .join(" ");

    void used;
    lines.push(`${code}  ${name}  ${figures.join(" ")}`.replace(/\s+$/, ""));
  });

  return lines;
}

/**
 * Read the text out of a transcript PDF in the browser. Populi transcripts
 * carry a real text layer, so no OCR is needed; the work is putting the table
 * back together, because the parser relies on column structure.
 */
export async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const pages: string[] = [];

  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    const width = page.view[2] - page.view[0];

    const items: PdfItem[] = [];
    for (const raw of content.items) {
      const item = raw as { str?: string; transform?: number[]; width?: number };
      if (!item.str?.trim() || !item.transform) continue;
      items.push({ text: item.str, x: item.transform[4], y: item.transform[5], w: item.width });
    }

    pages.push(reconstructLines(items, width).join("\n"));
    page.cleanup();
  }

  return pages.join("\n");
}
