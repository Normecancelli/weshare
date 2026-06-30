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

// Detect if this is the "clean" simplified format:
// Row 2 has headers: Categoria, Sottocategoria, Codice, Descrizione prodotto...
// Data starts from row 5, 11 columns (A:K).
function isCleanFormat(sheet: XLSX.WorkSheet): boolean {
  const cell = sheet[XLSX.utils.encode_cell({ r: 1, c: 2 })]?.v; // R2, col C
  return typeof cell === "string" && cell.trim().toLowerCase() === "codice";
}

function parseCleanFormat(sheet: XLSX.WorkSheet): ParsedPriceList {
  const range = XLSX.utils.decode_range(sheet["!ref"]!);
  const products: ParsedProduct[] = [];
  const categoriesSet = new Set<string>();

  // A=0 Categoria, B=1 Sottocategoria, C=2 Codice, D=3 Descrizione,
  // E=4 Contenuto, F=5 Prezzo Cliente, G=6 Provvigione, H=7 Prezzo Partner,
  // I=8 Prezzo/unità, J=9 Punti VP, K=10 Volume VV
  for (let rowIdx = 4; rowIdx <= range.e.r; rowIdx++) {
    const read = (col: number) => sheet[XLSX.utils.encode_cell({ r: rowIdx, c: col })]?.v;

    const codice = readCode(sheet, rowIdx, 2);
    if (!codice) continue;

    const descrizione = read(3);
    if (!descrizione) continue;

    const categoria = String(read(0) ?? "").trim();
    if (categoria) categoriesSet.add(categoria);

    products.push({
      codice_amway: codice,
      descrizione: String(descrizione).trim(),
      categoria,
      contenuto: read(4) != null ? String(read(4)).trim() : null,
      prezzo_cliente: parseNumericValue(read(5)),
      provvigione: parseNumericValue(read(6)),
      prezzo_partner: parseNumericValue(read(7)),
      prezzo_unita: read(8) != null ? String(read(8)).trim() : null,
      punti_vp: parseNumericValue(read(9)),
      volume_vv: parseNumericValue(read(10)),
    });
  }

  return { products, totalProducts: products.length, categories: Array.from(categoriesSet) };
}

function parseOriginalFormat(sheet: XLSX.WorkSheet): ParsedPriceList {
  const range = XLSX.utils.decode_range(sheet["!ref"]!);
  const products: ParsedProduct[] = [];
  const categoriesSet = new Set<string>();
  let currentCategory = "";

  for (let rowIdx = 56; rowIdx <= range.e.r; rowIdx++) {
    const layout = detectLayout(sheet, rowIdx);

    if (!layout) {
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

  return { products, totalProducts: products.length, categories: Array.from(categoriesSet) };
}

export function parsePriceListExcel(buffer: ArrayBuffer): ParsedPriceList {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  if (!sheet["!ref"]) {
    throw new Error("Foglio vuoto nel file Excel");
  }

  const result = isCleanFormat(sheet)
    ? parseCleanFormat(sheet)
    : parseOriginalFormat(sheet);

  if (result.products.length === 0) {
    throw new Error(
      "Nessun prodotto trovato nel file. Verifica che sia un listino prezzi Amway."
    );
  }

  return result;
}
