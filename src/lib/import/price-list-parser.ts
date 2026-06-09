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

/**
 * Parse the Amway price list Excel file.
 *
 * The file has a non-standard layout:
 * - Rows 1-55: title page and index (ignored)
 * - Row 56: column headers
 * - Row 57+: mix of category rows (text in A, no code in B) and product rows (code in B)
 *
 * Column mapping (1-indexed Excel columns):
 *   B (col 2)  -> codice_amway
 *   F (col 6)  -> descrizione
 *   N (col 14) -> contenuto
 *   Q (col 17) -> prezzo_cliente
 *   T (col 20) -> provvigione
 *   X (col 24) -> prezzo_partner
 *   AA (col 27) -> prezzo_unita
 *   AD (col 30) -> punti_vp
 *   AG (col 33) -> volume_vv
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

  // Start from row 57 (index 56, 0-based) — after the header row at index 55
  for (let rowIdx = 56; rowIdx <= range.e.r; rowIdx++) {
    const cellA = sheet[XLSX.utils.encode_cell({ r: rowIdx, c: 0 })]?.v;
    const cellB = sheet[XLSX.utils.encode_cell({ r: rowIdx, c: 1 })]?.v;

    // Category row: text in A, no numeric code in B
    if (cellA && typeof cellA === "string" && cellA.trim().length > 2) {
      if (!cellB || !String(cellB).trim().match(/^\d+$/)) {
        currentCategory = cellA.trim();
        categoriesSet.add(currentCategory);
        continue;
      }
    }

    // Product row: numeric code in B
    if (!cellB) continue;
    const codeStr = String(cellB).trim();
    if (!codeStr.match(/^\d+$/)) continue;

    const cellF = sheet[XLSX.utils.encode_cell({ r: rowIdx, c: 5 })]?.v;
    if (!cellF) continue; // Skip rows with code but no description

    const cellN = sheet[XLSX.utils.encode_cell({ r: rowIdx, c: 13 })]?.v;
    const cellQ = sheet[XLSX.utils.encode_cell({ r: rowIdx, c: 16 })]?.v;
    const cellT = sheet[XLSX.utils.encode_cell({ r: rowIdx, c: 19 })]?.v;
    const cellX = sheet[XLSX.utils.encode_cell({ r: rowIdx, c: 23 })]?.v;
    const cellAA = sheet[XLSX.utils.encode_cell({ r: rowIdx, c: 26 })]?.v;
    const cellAD = sheet[XLSX.utils.encode_cell({ r: rowIdx, c: 29 })]?.v;
    const cellAG = sheet[XLSX.utils.encode_cell({ r: rowIdx, c: 32 })]?.v;

    products.push({
      codice_amway: codeStr,
      descrizione: String(cellF).trim(),
      categoria: currentCategory,
      contenuto: cellN ? String(cellN).trim() : null,
      prezzo_cliente: parseNumericValue(cellQ),
      prezzo_partner: parseNumericValue(cellX),
      provvigione: parseNumericValue(cellT),
      prezzo_unita: cellAA ? String(cellAA).trim() : null,
      punti_vp: parseNumericValue(cellAD),
      volume_vv: parseNumericValue(cellAG),
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
