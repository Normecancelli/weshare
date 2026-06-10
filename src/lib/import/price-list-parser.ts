import * as XLSX from "xlsx";
import { parseNumericValue } from "./parser";

export interface ParsedProduct {
  codice_amway: string;
  descrizione: string;
  categoria: string;
  contenuto: string | null;
  prezzo_cliente: number;
  prezzo_partner: number;
  provvigione: number;
  prezzo_unita: string | null;
  punti_vp: number;
  volume_vv: number;
}

export interface ParsedPriceList {
  products: ParsedProduct[];
  totalProducts: number;
  categories: string[];
}

// Column offsets per layout. Some rows have the code in B (standard),
// others have it in A (shifted -1). All other fields shift accordingly.
type Layout = {
  codice: number;
  descrizione: number;
  contenuto: number;
  prezzo_cliente: number;
  provvigione: number;
  prezzo_partner: number;
  prezzo_unita: number;
  punti_vp: number;
  volume_vv: number;
};

const LAYOUT_STANDARD: Layout = {
  codice: 1,         // B
  descrizione: 5,    // F
  contenuto: 13,     // N
  prezzo_cliente: 16, // Q
  provvigione: 19,   // T
  prezzo_partner: 23, // X
  prezzo_unita: 26,  // AA
  punti_vp: 29,      // AD
  volume_vv: 32,     // AG
};

const LAYOUT_SHIFTED: Layout = {
  codice: 0,         // A
  descrizione: 4,    // E
  contenuto: 12,     // M
  prezzo_cliente: 15, // P
  provvigione: 18,   // S
  prezzo_partner: 22, // W
  prezzo_unita: 25,  // Z
  punti_vp: 28,      // AC
  volume_vv: 31,     // AF
};

// Read a code cell preserving zero-padding from the cell's number format.
// E.g. value=1, format='0000' → "0001" (historic Amway codes like L.O.C.).
function readCode(sheet: XLSX.WorkSheet, rowIdx: number, colIdx: number): string | null {
  const cell = sheet[XLSX.utils.encode_cell({ r: rowIdx, c: colIdx })];
  if (!cell || cell.v == null) return null;
  const raw = String(cell.v).trim();
  if (!/^\d+$/.test(raw)) return null;
  const formatted = typeof cell.w === "string" ? cell.w.trim() : "";
  return formatted && /^\d+$/.test(formatted) ? formatted : raw;
}

function detectLayout(sheet: XLSX.WorkSheet, rowIdx: number): Layout | null {
  if (readCode(sheet, rowIdx, LAYOUT_STANDARD.codice)) return LAYOUT_STANDARD;
  if (readCode(sheet, rowIdx, LAYOUT_SHIFTED.codice)) return LAYOUT_SHIFTED;
  return null;
}

/**
 * Parse the Amway price list Excel file.
 *
 * The file has a non-standard layout:
 * - Rows 1-55: title page and index (ignored)
 * - Row 56: column headers
 * - Row 57+: mix of category rows (text in A, no code) and product rows
 *   with TWO possible layouts: standard (code in B) and shifted (code in A,
 *   all other fields shifted -1 column).
 */
export function parsePriceListExcel(buffer: ArrayBuffer): ParsedPriceList {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  if (!sheet["!ref"]) {
    throw new Error("Foglio vuoto nel file Excel");
  }

  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const products: ParsedProduct[] = [];
  const categoriesSet = new Set<string>();
  let currentCategory = "";

  for (let rowIdx = 56; rowIdx <= range.e.r; rowIdx++) {
    const layout = detectLayout(sheet, rowIdx);

    if (!layout) {
      // Category row: text in A, no numeric code anywhere
      const cellA = sheet[XLSX.utils.encode_cell({ r: rowIdx, c: 0 })]?.v;
      if (typeof cellA === "string" && cellA.trim().length > 2) {
        currentCategory = cellA.trim();
        categoriesSet.add(currentCategory);
      }
      continue;
    }

    const codice = readCode(sheet, rowIdx, layout.codice);
    if (!codice) continue;

    const descrCell = sheet[XLSX.utils.encode_cell({ r: rowIdx, c: layout.descrizione })]?.v;
    if (!descrCell) continue;

    const read = (col: number) => sheet[XLSX.utils.encode_cell({ r: rowIdx, c: col })]?.v;

    products.push({
      codice_amway: codice,
      descrizione: String(descrCell).trim(),
      categoria: currentCategory,
      contenuto: read(layout.contenuto) != null ? String(read(layout.contenuto)).trim() : null,
      prezzo_cliente: parseNumericValue(read(layout.prezzo_cliente)),
      prezzo_partner: parseNumericValue(read(layout.prezzo_partner)),
      provvigione: parseNumericValue(read(layout.provvigione)),
      prezzo_unita: read(layout.prezzo_unita) != null ? String(read(layout.prezzo_unita)).trim() : null,
      punti_vp: parseNumericValue(read(layout.punti_vp)),
      volume_vv: parseNumericValue(read(layout.volume_vv)),
    });
  }

  if (products.length === 0) {
    throw new Error(
      "Nessun prodotto trovato nel file. Verifica che sia un listino prezzi Amway."
    );
  }

  return {
    products,
    totalProducts: products.length,
    categories: Array.from(categoriesSet),
  };
}
