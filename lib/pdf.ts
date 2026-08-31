/**
 * Read the text out of a transcript PDF in the browser. Populi transcripts
 * carry a real text layer, so no OCR is needed; the work is putting the text
 * items back into rows, because the parser relies on column layout.
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

    type Item = { text: string; x: number; y: number };
    const items: Item[] = [];
    for (const raw of content.items) {
      const item = raw as { str?: string; transform?: number[] };
      if (!item.str?.trim() || !item.transform) continue;
      items.push({ text: item.str, x: item.transform[4], y: item.transform[5] });
    }

    // Group into visual rows, then lay each row out with spacing that
    // approximates the original columns.
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    const rows: Item[][] = [];
    for (const item of items) {
      const last = rows[rows.length - 1];
      if (last && Math.abs(last[0].y - item.y) < 3) last.push(item);
      else rows.push([item]);
    }

    const lines = rows.map((row) => {
      row.sort((a, b) => a.x - b.x);
      let out = "";
      for (const cell of row) {
        const col = Math.round(cell.x / 5.2);
        if (out.length < col) out += " ".repeat(col - out.length);
        else if (out) out += " ";
        out += cell.text;
      }
      return out.trimEnd();
    });

    pages.push(lines.join("\n"));
    page.cleanup();
  }

  return pages.join("\n");
}
