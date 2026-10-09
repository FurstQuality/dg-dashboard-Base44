/**
 * Read a picked file as text in a way that works on every browser we support.
 *
 * `File.text()` is missing on older mobile Safari/Android WebViews, and files
 * that arrive from an email attachment sometimes have no extension at all — so
 * we sniff the content instead of trusting the file name.
 */

/** Biggest export we'll accept, matched to the server's CSV limit. */
export const MAX_TEXT_FILE_BYTES = 2_000_000;

export type ReadTextFileResult =
  | { ok: true; text: string; name: string }
  | { ok: false; error: string; hint?: string };

function readWithFileReader(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsText(file);
  });
}

/** True when the content looks like binary (a PDF, spreadsheet, zip, image…). */
function looksBinary(text: string): boolean {
  const sample = text.slice(0, 2000);
  // NUL bytes never appear in a real CSV export.
  if (sample.includes("\u0000")) return true;
  if (/^%PDF-/.test(sample)) return true;
  if (/^PK\u0003\u0004/.test(sample)) return true;
  return false;
}

export async function readTextFile(file: File | null | undefined): Promise<ReadTextFileResult> {
  if (!file) return { ok: false, error: "No file was picked. Try choosing it again." };

  if (file.size === 0) {
    return {
      ok: false,
      error: "That file came through empty",
      hint: "If you saved it from an email, download the attachment first, then pick the saved copy.",
    };
  }
  if (file.size > MAX_TEXT_FILE_BYTES) {
    return {
      ok: false,
      error: "That file is too large to read in one go",
      hint: "Export a shorter date range from UDisc, or split the file and bring it in two parts.",
    };
  }

  let text: string;
  try {
    text = typeof file.text === "function" ? await file.text() : await readWithFileReader(file);
  } catch {
    try {
      text = await readWithFileReader(file);
    } catch {
      return {
        ok: false,
        error: "We couldn't read that file",
        hint: "Download it to this device first, then pick the downloaded copy.",
      };
    }
  }

  text = text.replace(/^\uFEFF/, "");

  if (!text.trim()) {
    return {
      ok: false,
      error: "That file has no text in it",
      hint: "Pick the .csv file from your UDisc export, not a screenshot or PDF.",
    };
  }
  if (looksBinary(text)) {
    return {
      ok: false,
      error: "That looks like a PDF or spreadsheet, not a UDisc export",
      hint: "In UDisc choose Export CSV, then pick the .csv file here.",
    };
  }
  if (!text.includes(",") && !text.includes("\t") && !text.includes(";")) {
    return {
      ok: false,
      error: "That file doesn't look like a scorecard export",
      hint: "The UDisc file is a .csv with a row per hole. Pick that one and we'll take it from here.",
    };
  }

  return { ok: true, text, name: file.name || "scorecards.csv" };
}
