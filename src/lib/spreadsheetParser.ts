/**
 * Spreadsheet parser supporting .xlsx, .xls and .csv files.
 * Processed 100% locally in the browser with SheetJS (XLSX).
 */
import * as XLSX from 'xlsx';
import { Product } from '../types';

export interface ParsedSpreadsheetRow {
  rawId: string;
  name: string;
  presentation: string;
  quantity: number;
  requestedQuantity?: number;
  batchCode: string;
  expirationDate: string;
  isDelivered: boolean;
  statusNote?: string;
}

/**
 * Format a Date object or Excel serial number or string into YYYY-MM-DD
 */
export function normalizeDateToYYYYMMDD(val: any): string {
  if (!val) {
    const oneYear = new Date();
    oneYear.setFullYear(oneYear.getFullYear() + 1);
    return oneYear.toISOString().split('T')[0];
  }

  // If it's already a Date
  if (val instanceof Date && !isNaN(val.getTime())) {
    const yyyy = val.getFullYear();
    const mm = String(val.getMonth() + 1).padStart(2, '0');
    const dd = String(val.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  // If it's an Excel serial date number (e.g. 45000)
  if (typeof val === 'number' && val > 20000 && val < 90000) {
    try {
      const utcDays = Math.floor(val - 25569);
      const utcValue = utcDays * 86400;
      const dateInfo = new Date(utcValue * 1000);
      // Adjust timezone offset
      const offsetMin = dateInfo.getTimezoneOffset();
      const realDate = new Date(dateInfo.getTime() + offsetMin * 60000);
      const yyyy = realDate.getFullYear();
      const mm = String(realDate.getMonth() + 1).padStart(2, '0');
      const dd = String(realDate.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    } catch {
      // fallback
    }
  }

  const str = String(val).trim();

  // Check DD/MM/YYYY or DD-MM-YYYY
  if (str.includes('/')) {
    const parts = str.split('/');
    if (parts.length === 3) {
      const p0 = parts[0].trim();
      const p1 = parts[1].trim();
      const p2 = parts[2].trim();
      if (p0.length === 4) { // YYYY/MM/DD
        return `${p0}-${p1.padStart(2, '0')}-${p2.padStart(2, '0')}`;
      } else if (p2.length === 4) { // DD/MM/YYYY
        return `${p2}-${p1.padStart(2, '0')}-${p0.padStart(2, '0')}`;
      } else if (p2.length === 2) { // DD/MM/YY
        const fullYear = parseInt(p2, 10) > 50 ? `19${p2}` : `20${p2}`;
        return `${fullYear}-${p1.padStart(2, '0')}-${p0.padStart(2, '0')}`;
      }
    }
  }

  if (str.includes('-')) {
    const parts = str.split('-');
    if (parts.length === 3) {
      const p0 = parts[0].trim();
      const p1 = parts[1].trim();
      const p2 = parts[2].trim();
      if (p2.length === 4) { // DD-MM-YYYY
        return `${p2}-${p1.padStart(2, '0')}-${p0.padStart(2, '0')}`;
      } else if (p0.length === 4) { // YYYY-MM-DD
        return `${p0}-${p1.padStart(2, '0')}-${p2.padStart(2, '0')}`;
      } else if (p2.length === 2) { // DD-MM-YY
        const fullYear = parseInt(p2, 10) > 50 ? `19${p2}` : `20${p2}`;
        return `${fullYear}-${p1.padStart(2, '0')}-${p0.padStart(2, '0')}`;
      }
    }
  }

  // Try standard parse
  const parsedTimestamp = Date.parse(str);
  if (!isNaN(parsedTimestamp)) {
    const d = new Date(parsedTimestamp);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  const oneYear = new Date();
  oneYear.setFullYear(oneYear.getFullYear() + 1);
  return oneYear.toISOString().split('T')[0];
}

/**
 * Accurately parse numerical quantities from spreadsheets, handling:
 * - Direct numbers
 * - Strings with European/Argentine comma decimals ("15,00" -> 15, "15,5" -> 16)
 * - Strings with dot decimals ("15.00" -> 15)
 * - Thousand separators ("1.000" -> 1000, "1,000" -> 1000)
 * - Text annotations ("25 u", "30 comp", "0", "-", "sin stock", "s/d")
 */
export function parseQuantityValue(val: any): number {
  if (val === undefined || val === null) return 0;
  if (typeof val === 'number') {
    return isNaN(val) ? 0 : Math.max(0, Math.round(val));
  }
  let str = String(val).trim().toLowerCase();
  if (!str || str === '-' || str === 'n/a' || str === 's/d' || str === 'sin stock' || str === 'falta' || str === 'no') {
    return 0;
  }

  // Filter out non-numeric characters except comma and dot
  str = str.replace(/[^0-9.,]/g, '');
  if (!str) return 0;

  // Handle Argentine / Spanish decimal comma e.g. "15,00" or "15,0"
  if (str.includes(',') && !str.includes('.')) {
    const parts = str.split(',');
    if (parts[1] && parts[1].length <= 2) {
      str = parts[0] + '.' + parts[1];
    } else {
      str = str.replace(/,/g, '');
    }
  } else if (str.includes('.') && !str.includes(',')) {
    const parts = str.split('.');
    if (parts[1] && parts[1].length === 3 && parseInt(parts[0], 10) < 1000) {
      // e.g. "1.000" thousand separator
      str = parts[0] + parts[1];
    }
  } else if (str.includes('.') && str.includes(',')) {
    // E.g. "1.250,00" or "1,250.00"
    if (str.indexOf('.') < str.indexOf(',')) {
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      str = str.replace(/,/g, '');
    }
  }

  const num = parseFloat(str);
  return isNaN(num) ? 0 : Math.max(0, Math.round(num));
}

/**
 * Intelligently separates medication name and pharmaceutical presentation
 * if they are combined in a single cell (e.g. "AMOXICILINA 500 MG X 16 COMP")
 */
export function splitNameAndPresentation(rawText: string, rawPres: string): { name: string; presentation: string } {
  if (rawPres && rawPres.trim()) {
    return { name: rawText.trim(), presentation: rawPres.trim() };
  }
  const text = rawText.trim();
  const presRegex = /(?:(\bcomp(?:rimidos)?\b|\bamp(?:ollas)?\b|\bfrasco\b|\bfco\b|\bgotas\b|\baerosol\b|\bcrema\b|\bgel\b|\bsobres?\b|\bparches?\b|\bovulos?\b|\bcaps(?:ulas)?\b|\btiras?\b|\btubos?\b|\bblister\b)\s*(?:x|\*)\s*\d+.*$)|(?:\bx\s*\d+\s*(?:comp|amp|fco|sobres?|unid|u\b|dosis|ml|g|caps).*$)|(?:\bx\s*\d+\s*$)/i;
  
  const match = text.match(presRegex);
  if (match && match.index && match.index > 3) {
    const cleanName = text.substring(0, match.index).trim().replace(/[,\-\/]+$/, '').trim();
    const cleanPres = text.substring(match.index).trim();
    if (cleanName.length >= 3) {
      return { name: cleanName, presentation: cleanPres };
    }
  }
  return { name: text, presentation: rawPres.trim() || 'Sin especificación' };
}

/**
 * Identifies if a row is a non-product footer, summary or signature line
 */
function isFooterOrNonProduct(name: string): boolean {
  const n = name.toLowerCase().trim();
  if (!n) return true;
  if (
    n === 'total' || 
    n.startsWith('total ') || 
    n.startsWith('totales') || 
    n.includes('total general') || 
    n.includes('total unidades') ||
    n.includes('total items') ||
    n.includes('suma total')
  ) return true;
  if (
    n.startsWith('firma') || 
    n.includes('firma y sello') || 
    n.startsWith('aclaracion') || 
    n.startsWith('recibio') || 
    n.startsWith('entrego') ||
    n.startsWith('entregado por') ||
    n.startsWith('recibido por')
  ) return true;
  if (
    n.startsWith('observaciones') || 
    n.startsWith('obs:') || 
    n.startsWith('nota:') || 
    n.startsWith('pagina ') ||
    n.includes('hoja 1 de')
  ) return true;
  return false;
}

/**
 * Parses any spreadsheet file (.xlsx, .xls, .csv, .tsv) into standardized row data.
 * Specifically handles municipal delivery sheets that contain both Requested (Pedido)
 * and Delivered (Remito) quantities, preventing phantom items and quantity mismatches.
 */
export async function parseSpreadsheetFile(file: File): Promise<ParsedSpreadsheetRow[]> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, {
    type: 'array',
    cellDates: true,
    cellNF: false,
    cellText: false,
  });

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('El archivo no contiene hojas de cálculo.');
  }

  // 1. SELECT THE BEST WORKSHEET
  // If workbook has multiple sheets, prioritize ones with relevant names or the most structured content
  let selectedSheetName = workbook.SheetNames[0];
  let maxSheetScore = -1;

  for (const sName of workbook.SheetNames) {
    let sheetScore = 0;
    const lowerName = sName.toLowerCase();
    if (lowerName.includes('remito') || lowerName.includes('entrega') || lowerName.includes('despacho')) {
      sheetScore += 10;
    }
    if (lowerName.includes('insumo') || lowerName.includes('medicamento') || lowerName.includes('farmacia') || lowerName.includes('stock')) {
      sheetScore += 8;
    }
    if (lowerName.includes('pedido') || lowerName.includes('muni')) {
      sheetScore += 5;
    }

    const testSheet = workbook.Sheets[sName];
    if (testSheet && testSheet['!ref']) {
      sheetScore += 2;
    }

    if (sheetScore > maxSheetScore) {
      maxSheetScore = sheetScore;
      selectedSheetName = sName;
    }
  }

  const worksheet = workbook.Sheets[selectedSheetName];

  // Convert to 2D array of rows
  const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
    raw: false,
    dateNF: 'yyyy-mm-dd'
  });

  if (!rawRows || rawRows.length === 0) {
    throw new Error('La planilla seleccionada está vacía.');
  }

  // 2. SEARCH FOR THE BEST HEADER ROW (scan up to first 45 rows)
  let bestHeaderRowIndex = -1;
  let bestHeaderScore = 0;
  let bestColMap = {
    colId: -1,
    colName: -1,
    colPres: -1,
    colDelivered: -1, // Cantidad Entregada / Remitida
    colRequested: -1, // Cantidad Pedida / Solicitada
    colGenericQty: -1, // Cantidad general
    colBatch: -1,
    colExpir: -1,
  };

  const maxScanRows = Math.min(rawRows.length, 45);

  for (let r = 0; r < maxScanRows; r++) {
    const row = rawRows[r];
    if (!Array.isArray(row) || row.length === 0) continue;

    const strCells = row.map(cell => 
      String(cell || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    );

    let rowScore = 0;
    let tempMap = {
      colId: -1,
      colName: -1,
      colPres: -1,
      colDelivered: -1,
      colRequested: -1,
      colGenericQty: -1,
      colBatch: -1,
      colExpir: -1,
    };

    strCells.forEach((cleanH, idx) => {
      if (!cleanH) return;

      // Check ID / Code
      if (
        cleanH === 'id' || 
        cleanH === 'codigo' || 
        cleanH.startsWith('cod') ||
        cleanH.includes('id_cata') || 
        cleanH.includes('cod_art') || 
        cleanH.includes('cod art') ||
        cleanH.includes('id_insumo') ||
        cleanH.includes('cod producto') ||
        cleanH.includes('codigo de barras')
      ) {
        if (tempMap.colId === -1) {
          tempMap.colId = idx;
          rowScore += 2;
        }
      }
      
      // Check Name / Medication / Supply
      else if (
        cleanH.includes('articulo') ||
        cleanH.includes('medicamento') ||
        cleanH.includes('droga') ||
        cleanH.includes('monodroga') ||
        cleanH.includes('farmaco') ||
        cleanH.includes('descripcion') ||
        cleanH.includes('detalle') ||
        cleanH.includes('denominacion') ||
        cleanH.includes('principio activo') ||
        cleanH.includes('insumo') ||
        cleanH.includes('producto') ||
        cleanH.includes('concepto') ||
        cleanH.includes('especificacion') ||
        (cleanH === 'nombre' || cleanH.startsWith('nombre ') || cleanH.endsWith(' nombre'))
      ) {
        if (tempMap.colName === -1) {
          tempMap.colName = idx;
          rowScore += 4;
        }
      }

      // Check Presentation
      else if (
        cleanH.includes('presenta') || 
        cleanH.includes('forma') || 
        cleanH.includes('envase') || 
        cleanH.includes('concentra') || 
        cleanH.includes('dosis') ||
        cleanH.includes('formato') ||
        cleanH.includes('udm') ||
        cleanH.includes('unidad de medida')
      ) {
        if (tempMap.colPres === -1) {
          tempMap.colPres = idx;
          rowScore += 2;
        }
      }

      // Check Delivered / Remitted quantity (ENTREGADA / REMITIDA)
      else if (
        cleanH.includes('entregad') || 
        cleanH.includes('remitid') || 
        cleanH.includes('remito') || 
        cleanH.includes('despachad') || 
        cleanH.includes('despacho') ||
        cleanH.includes('enviad') || 
        cleanH.includes('recibid') || 
        cleanH.includes('recepcion') ||
        cleanH.includes('ingreso') ||
        cleanH.includes('provist') ||
        cleanH.includes('suministrad') ||
        cleanH.includes('aprobado') ||
        cleanH.includes('cant. ent') ||
        cleanH.includes('cant ent') ||
        cleanH.includes('cant. rem') ||
        cleanH.includes('cant rem')
      ) {
        if (tempMap.colDelivered === -1) {
          tempMap.colDelivered = idx;
          rowScore += 4;
        }
      }

      // Check Requested / Ordered quantity (PEDIDA / SOLICITADA)
      else if (
        cleanH.includes('pedid') || 
        cleanH.includes('solicitad') || 
        cleanH.includes('solicitud') || 
        cleanH.includes('requerid') ||
        cleanH.includes('cant. ped') ||
        cleanH.includes('cant ped') ||
        cleanH.includes('cant. sol') ||
        cleanH.includes('cant sol')
      ) {
        if (tempMap.colRequested === -1) {
          tempMap.colRequested = idx;
          rowScore += 3;
        }
      }

      // Check Generic Quantity (if neither delivered nor requested explicitly)
      else if (
        cleanH.includes('cant') || 
        cleanH.includes('qty') || 
        cleanH === 'unidades' || 
        cleanH === 'unidad' || 
        cleanH === 'unid' ||
        cleanH === 'u.' ||
        cleanH === 'u'
      ) {
        if (tempMap.colGenericQty === -1) {
          tempMap.colGenericQty = idx;
          rowScore += 2;
        }
      }

      // Check Batch Code
      else if (
        cleanH === 'lote' || 
        cleanH.includes('lote') || 
        cleanH === 'batch' || 
        cleanH.includes('partida') || 
        cleanH.includes('nro lote') ||
        cleanH.includes('n° lote') ||
        cleanH.includes('serie')
      ) {
        if (tempMap.colBatch === -1) {
          tempMap.colBatch = idx;
          rowScore += 3;
        }
      }

      // Check Expiration Date
      else if (
        cleanH === 'vto' || 
        cleanH.includes('vto') || 
        cleanH.includes('venc') || 
        cleanH.includes('caduc') || 
        cleanH.includes('exp') || 
        cleanH.includes('fecha vto') ||
        cleanH.includes('f. vto') ||
        cleanH.includes('f.vto')
      ) {
        if (tempMap.colExpir === -1) {
          tempMap.colExpir = idx;
          rowScore += 3;
        }
      }
    });

    // A valid table header row must have at least a Name or Code column AND at least one Quantity or Batch/Date column
    const hasNameOrId = tempMap.colName !== -1 || tempMap.colId !== -1;
    const hasDataCol = tempMap.colDelivered !== -1 || tempMap.colRequested !== -1 || tempMap.colGenericQty !== -1 || tempMap.colBatch !== -1 || tempMap.colExpir !== -1;

    if (hasNameOrId && hasDataCol && rowScore > bestHeaderScore) {
      bestHeaderScore = rowScore;
      bestHeaderRowIndex = r;
      bestColMap = tempMap;
    }
  }

  // 3. FALLBACK DEFAULTS IF NO STRUCTURED HEADER WAS FOUND
  let startRow = 0;
  if (bestHeaderRowIndex !== -1) {
    startRow = bestHeaderRowIndex + 1;
  } else {
    // If no header found, assume standard 0: ID, 1: Nombre, 2: Presentación, 3: Cantidad, 4: Lote, 5: Vencimiento
    bestColMap.colId = 0;
    bestColMap.colName = 1;
    bestColMap.colPres = 2;
    bestColMap.colGenericQty = 3;
    bestColMap.colBatch = 4;
    bestColMap.colExpir = 5;
    startRow = 0;
  }

  const { colId, colName, colPres, colDelivered, colRequested, colGenericQty, colBatch, colExpir } = bestColMap;

  // Decide which quantity column to use as the PRIMARY incoming delivery quantity
  // Priority: colDelivered > colGenericQty > colRequested
  const effectiveDeliveredCol = colDelivered !== -1 
    ? colDelivered 
    : (colGenericQty !== -1 ? colGenericQty : colRequested);

  const effectiveRequestedCol = colRequested !== -1 ? colRequested : -1;

  const results: ParsedSpreadsheetRow[] = [];

  // 4. PARSE DATA ROWS
  for (let r = startRow; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!Array.isArray(row) || row.length === 0) continue;

    const rawId = colId !== -1 && colId < row.length ? String(row[colId] || '').trim() : '';
    const rawNameCell = colName !== -1 && colName < row.length ? String(row[colName] || '').trim() : '';
    const rawPresCell = colPres !== -1 && colPres < row.length ? String(row[colPres] || '').trim() : '';
    const rawBatchCell = colBatch !== -1 && colBatch < row.length ? String(row[colBatch] || '').trim() : '';
    const rawExpirCell = colExpir !== -1 && colExpir < row.length ? row[colExpir] : '';

    // If completely empty row, skip
    if (!rawId && !rawNameCell && !rawPresCell && !rawBatchCell) continue;

    // Check if this row is a summary footer (e.g. "TOTAL GENERAL", "FIRMA Y SELLO")
    if (isFooterOrNonProduct(rawNameCell)) continue;

    // Parse Delivered Quantity
    let deliveredQty = 0;
    if (effectiveDeliveredCol !== -1 && effectiveDeliveredCol < row.length) {
      deliveredQty = parseQuantityValue(row[effectiveDeliveredCol]);
    } else {
      deliveredQty = 1;
    }

    // Parse Requested Quantity (if present in the municipal document)
    let requestedQty: number | undefined = undefined;
    if (effectiveRequestedCol !== -1 && effectiveRequestedCol < row.length) {
      requestedQty = parseQuantityValue(row[effectiveRequestedCol]);
    }

    // Determine delivery status
    // If the sheet explicitly has a "Cant. Entregada" column and it is 0:
    // This item was in the Municipal Order (Pedido), but WAS NOT DELIVERED in this Remito!
    const isDelivered = colDelivered !== -1 
      ? deliveredQty > 0 
      : (deliveredQty > 0 || (requestedQty !== undefined && requestedQty > 0));

    let statusNote: string | undefined = undefined;
    if (colDelivered !== -1 && deliveredQty === 0 && requestedQty && requestedQty > 0) {
      statusNote = `No entregado en este remito (0 u) • Pedido municipal: ${requestedQty} u`;
    } else if (requestedQty !== undefined && requestedQty > deliveredQty && deliveredQty > 0) {
      statusNote = `Entrega parcial: ${deliveredQty} u de ${requestedQty} u pedidas (Faltante: ${requestedQty - deliveredQty} u)`;
    }

    // Separate clean name and presentation if combined in a single cell
    const { name: cleanName, presentation: cleanPres } = splitNameAndPresentation(
      rawNameCell || rawId || 'Insumo sin nombre', 
      rawPresCell
    );

    const batchCode = (rawBatchCell || 'L-MANUAL').toUpperCase();
    const expirationDate = normalizeDateToYYYYMMDD(rawExpirCell);

    results.push({
      rawId,
      name: cleanName,
      presentation: cleanPres,
      quantity: deliveredQty,
      requestedQuantity: requestedQty,
      batchCode,
      expirationDate,
      isDelivered,
      statusNote,
    });
  }

  return results;
}

/**
 * Download standard Remito template as .xlsx (Excel) or .csv
 */
export function downloadRemitoTemplate(origin: 'Muni' | 'MB', format: 'xlsx' | 'csv') {
  const isMB = origin === 'MB';
  const headers = ['ID_CATALOGO (Opcional)', 'MEDICAMENTO_O_INSUMO', 'PRESENTACION', 'CANTIDAD', 'LOTE', 'FECHA_VENCIMIENTO'];

  const rows = isMB ? [
    ['', 'Amoxicilina 500mg', 'Comprimidos x 16', 50, 'MB-2401-A', '2026-11-30'],
    ['', 'Ibuprofeno 400mg', 'Comprimidos x 20', 80, 'MB-2408-B', '2027-04-15'],
    ['', 'Paracetamol 500mg', 'Comprimidos x 10', 100, 'MB-2412-C', '2027-08-20'],
    ['', 'Salbutamol Aerosol', '100 mcg x 200 dosis', 30, 'MB-2405-D', '2026-09-30'],
    ['', 'Losartán 50mg', 'Comprimidos x 30', 60, 'MB-2403-E', '2027-01-31'],
  ] : [
    ['', 'Dexametasona 4mg/ml', 'Ampolla x 2ml', 40, 'MUNI-2024-X', '2026-12-31'],
    ['', 'Diclofenac 75mg/3ml', 'Ampolla inyectable', 60, 'MUNI-2024-Y', '2027-03-15'],
    ['', 'Jeringa 5ml con aguja', 'Unidad estéril descartable', 200, 'J-2401', '2028-06-30'],
    ['', 'Guantes de Látex Talle M', 'Caja x 100 unidades', 10, 'GL-992', '2027-09-30'],
    ['', 'Gasas estériles 10x10', 'Sobre x 5 unidades', 150, 'GE-441', '2028-01-15'],
  ];

  const fileName = `plantilla_remito_${isMB ? 'MB_Medicamentos_Bonaerenses' : 'Municipal'}.${format}`;

  if (format === 'xlsx') {
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = [
      { wch: 22 },
      { wch: 30 },
      { wch: 26 },
      { wch: 12 },
      { wch: 16 },
      { wch: 18 }
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, isMB ? 'Remito MB' : 'Remito Muni');
    XLSX.writeFile(wb, fileName);
  } else {
    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.map(c => `"${c}"`).join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

/**
 * Export workbook or download sample XLSX
 */
export function downloadWorkbookAsXLSX(data: any[][], fileName: string) {
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Datos');
  XLSX.writeFile(wb, fileName);
}

/**
 * Robustly matches an incoming remito item against the pharmacy catalog.
 * Avoids false positives by enforcing exact code/name matches or high token similarity
 * with mandatory dosage/number consistency.
 * 
 * IMPORTANT: Calling code MUST NEVER overwrite the uploaded remito item name
 * with the catalog product name; this function is strictly for setting productId.
 */
export function matchCatalogProduct(
  rawId: string, 
  rawName: string, 
  rawPres: string, 
  catalog: Product[]
): Product | undefined {
  // 1. Exact ID / Catalog Code match
  if (rawId && rawId.trim()) {
    const byId = catalog.find(p => p.id.toLowerCase() === rawId.toLowerCase().trim());
    if (byId) return byId;
  }

  if (!rawName || !rawName.trim()) return undefined;

  const normName = rawName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const normPres = rawPres ? rawPres.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim() : '';

  // 2. Exact match on both name and presentation
  const exactBoth = catalog.find(p => {
    const pName = p.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const pPres = p.presentation.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    return pName === normName && (!normPres || pPres === normPres);
  });
  if (exactBoth) return exactBoth;

  // 3. Exact match on name
  const exactName = catalog.find(p => {
    const pName = p.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    return pName === normName;
  });
  if (exactName) return exactName;

  // 4. Token & number similarity (high threshold >= 0.70, must match dosage numbers)
  const rawWords = normName.split(/[\s,/\-()]+/g).filter(w => w.length > 1);
  const rawNumbers: string[] = normName.match(/\d+/g) || [];

  let bestMatch: Product | undefined = undefined;
  let maxScore = 0;

  for (const p of catalog) {
    const pName = p.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const pWords = pName.split(/[\s,/\-()]+/g).filter(w => w.length > 1);
    const pNumbers: string[] = pName.match(/\d+/g) || [];

    // If numbers (dosages like 500, 400, 20) are present in either, they MUST overlap
    if (rawNumbers.length > 0 && pNumbers.length > 0) {
      const numbersOverlap = rawNumbers.some(n => pNumbers.indexOf(n) !== -1);
      if (!numbersOverlap) continue; // Skip if dosage does not match!
    }

    let shared = 0;
    for (const rw of rawWords) {
      if (pWords.some(pw => pw === rw || (pw.length > 3 && rw.length > 3 && (pw.includes(rw) || rw.includes(pw))))) {
        shared++;
      }
    }

    const score = shared / Math.max(rawWords.length, pWords.length);
    if (score > maxScore && score >= 0.70) {
      maxScore = score;
      bestMatch = p;
    }
  }

  return bestMatch;
}

