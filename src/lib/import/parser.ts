import * as XLSX from "xlsx";

export interface ParsedImport {
  meseRiferimento: string;
  sheetName: string;
  headers: string[];
  rows: Record<string, unknown>[];
  totalRows: number;
}

export interface ColumnMapping {
  header_amway: string;
  campo_interno: string;
  obbligatorio: boolean;
}

/**
 * Parsa il file Excel Amway e restituisce i dati strutturati.
 * - Legge il mese di riferimento da B2
 * - Legge gli header da riga 3
 * - Mappa le colonne automaticamente usando il mapping dal DB
 */
export function parseAmwayExcel(
  buffer: ArrayBuffer,
  columnMappings: ColumnMapping[]
): ParsedImport {
  const workbook = XLSX.read(buffer, { type: "array" });

  // Il foglio è il primo (nome = codice Amway partner)
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // Mese di riferimento da B2
  const meseRiferimento = String(sheet["B2"]?.v || "").trim();
  if (!meseRiferimento || !/^\d{6}$/.test(meseRiferimento)) {
    throw new Error(
      `Mese di riferimento non valido in B2: "${meseRiferimento}". Atteso formato YYYYMM.`
    );
  }

  // Leggi header da riga 3 (indice 2)
  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
  const headers: string[] = [];
  for (let col = range.s.c; col <= range.e.c; col++) {
    const cellAddress = XLSX.utils.encode_cell({ r: 2, c: col });
    const cell = sheet[cellAddress];
    headers.push(cell?.v ? String(cell.v).trim() : "");
  }

  // Costruisci mapping: posizione colonna -> campo interno
  const colToField = buildColumnMapping(headers, columnMappings);

  // Leggi dati da riga 4 in poi (indice 3)
  const rows: Record<string, unknown>[] = [];
  for (let row = 3; row <= range.e.r; row++) {
    const record: Record<string, unknown> = {};
    let hasData = false;

    for (let col = range.s.c; col <= range.e.c; col++) {
      const fieldName = colToField.get(col);
      if (!fieldName) continue;

      const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
      const cell = sheet[cellAddress];
      const value = cell?.v ?? null;

      if (value !== null && value !== "") hasData = true;
      record[fieldName] = value;
    }

    if (hasData) rows.push(record);
  }

  return {
    meseRiferimento,
    sheetName,
    headers,
    rows,
    totalRows: rows.length,
  };
}

/**
 * Costruisce il mapping colonna (indice) -> campo interno
 * Confronta gli header del file con i mapping salvati nel DB
 */
function buildColumnMapping(
  headers: string[],
  mappings: ColumnMapping[]
): Map<number, string> {
  const colToField = new Map<number, string>();
  const unmapped: string[] = [];

  // Crea lookup per nome header (case-insensitive, trimmed)
  const mappingLookup = new Map<string, string>();
  for (const m of mappings) {
    mappingLookup.set(m.header_amway.toLowerCase().trim(), m.campo_interno);
  }

  for (let i = 0; i < headers.length; i++) {
    const header = headers[i].toLowerCase().trim();
    if (!header) continue;

    const field = mappingLookup.get(header);
    if (field) {
      colToField.set(i, field);
    } else {
      unmapped.push(headers[i]);
    }
  }

  // Verifica che i campi obbligatori siano mappati
  const mappedFields = new Set(colToField.values());
  const missingRequired = mappings.filter(
    (m) => m.obbligatorio && !mappedFields.has(m.campo_interno)
  );

  if (missingRequired.length > 0) {
    throw new Error(
      `Colonne obbligatorie non trovate: ${missingRequired.map((m) => m.header_amway).join(", ")}. ` +
        `Header trovati nel file: ${headers.filter(Boolean).join(", ")}`
    );
  }

  return colToField;
}

/**
 * Converte un valore numerico che può essere in formato italiano (5.418,38)
 * o già un numero (5418.38) in un number valido.
 * Gestisce anche stringhe con % (es. "15%")
 */
export function parseNumericValue(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return value;

  let str = String(value).trim();

  // Rimuovi % se presente
  str = str.replace(/%/g, "").trim();

  if (str === "" || str === "-") return 0;

  // Formato italiano: 5.418,38 → rimuovi punti separatore migliaia, virgola → punto
  if (str.includes(",")) {
    str = str.replace(/\./g, "").replace(",", ".");
  }

  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

/**
 * Estrae il mese di riferimento dal nome del file
 * Formato atteso: DDMMYYYYxYYYYMM (dopo _ c'è anno+mese)
 */
export function extractMonthFromFilename(filename: string): string | null {
  const match = filename.match(/_(\d{6})/);
  return match ? match[1] : null;
}
