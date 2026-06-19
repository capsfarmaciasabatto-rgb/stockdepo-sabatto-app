/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { translations } from '../../translations';
import { motion, AnimatePresence } from 'motion/react';
import { 
  User, 
  Product, 
  Order, 
  AuditLog, 
  Role, 
  PredefinedService, 
  ServiceConfiguration,
  StockBatch
} from '../../types';
import { runIntegrationTests, TestResult } from '../../lib/testRunner';
import { 
  Plus, 
  Trash2, 
  Edit, 
  Users, 
  Grid3X3, 
  TrendingUp, 
  FileText, 
  PieChart, 
  Activity, 
  AlertTriangle, 
  Save, 
  Terminal,
  Copy,
  Lock,
  Key,
  Calendar,
  FileCheck2,
  Upload,
  FileSpreadsheet,
  X,
  CheckCircle2,
  Printer,
  ClipboardCheck,
  ChevronUp,
  ChevronDown,
  Search,
  SlidersHorizontal,
  User as UserIcon
} from 'lucide-react';
import { playBeep } from '../../lib/sound';

interface FarmaceuticoViewProps {
  currentUser: User;
  products: Product[];
  orders: Order[];
  users: User[];
  auditLogs: AuditLog[];
  serviceConfigs: ServiceConfiguration[];
  onUpdateProducts: (updated: Product[]) => void;
  onUpdateUsers: (updated: User[]) => void;
  onUpdateServiceConfigs: (updated: ServiceConfiguration[]) => void;
  onAppendAudit: (log: AuditLog) => void;
  onResetProductionMode?: () => void;
  lang: 'es' | 'en';
  isLastBusinessDayActive?: boolean;
  simulateLastBusinessDay?: boolean;
  onToggleSimulateLastBusinessDay?: () => void;
}

export default function FarmaceuticoView({
  currentUser,
  products,
  orders,
  users,
  auditLogs,
  serviceConfigs,
  onUpdateProducts,
  onUpdateUsers,
  onUpdateServiceConfigs,
  onAppendAudit,
  onResetProductionMode,
  lang,
  isLastBusinessDayActive = false,
  simulateLastBusinessDay = false,
  onToggleSimulateLastBusinessDay
}: FarmaceuticoViewProps) {
  const [subTab, setSubTab] = useState<'catalog' | 'mapping' | 'adjust' | 'users' | 'reports' | 'receipt' | 'history_deliveries' | 'monthly_discard'>('catalog');
  const [reportType, setReportType] = useState<'consumption' | 'movements' | 'audit' | 'expiring' | 'low_stock' | 'tests' | 'unsatisfied'>('consumption');
  const [consumptionSearch, setConsumptionSearch] = useState('');
  const [semaforoFilter, setSemaforoFilter] = useState<'All' | 'Rojo' | 'Amarillo' | 'Verde' | 'Vencido'>('All');

  // Estados para consulta de historial de entregas
  const [historyServiceFilter, setHistoryServiceFilter] = useState<string>('All');
  const [historyStartDate, setHistoryStartDate] = useState<string>('');
  const [historyEndDate, setHistoryEndDate] = useState<string>('');
  const [historySearchQuery, setHistorySearchQuery] = useState<string>('');
  const [expandedHistoryOrder, setExpandedHistoryOrder] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    severity?: 'warning' | 'danger' | 'info';
    onConfirm?: () => void;
  } | null>(null);

  const t = translations[lang];

  // --- LOGICA DE PROCESAMIENTO IA DE REMITOS MUNICIPALES (PDF/IMAGEN) ---
  const [receiptItems, setReceiptItems] = useState<{
    name: string;
    presentation: string;
    quantity: number;
    batchCode: string;
    expirationDate: string;
    productId?: string;
  }[]>([]);
  const [receiptFileName, setReceiptFileName] = useState('');
  const [isProcessingReceipt, setIsProcessingReceipt] = useState(false);
  const [receiptError, setReceiptError] = useState('');
  const [receiptDragOver, setReceiptDragOver] = useState(false);
  const [receiptSuccessMsg, setReceiptSuccessMsg] = useState('');

  // Estados para la carga manual alternativo de remito
  const [manualProdId, setManualProdId] = useState<string>('');
  const [manualName, setManualName] = useState<string>('');
  const [manualPresentation, setManualPresentation] = useState<string>('');
  const [manualQty, setManualQty] = useState<number>(1);
  const [manualBatch, setManualBatch] = useState<string>('');
  const [manualExpir, setManualExpir] = useState<string>('');
  const [manualFormError, setManualFormError] = useState<string>('');

  const handleAddManualReceiptItem = (e: React.FormEvent) => {
    e.preventDefault();
    setManualFormError('');

    let finalName = '';
    let finalPresentation = '';
    let finalProductId: string | undefined = undefined;

    if (manualProdId) {
      const p = products.find(prod => prod.id === manualProdId);
      if (!p) {
        setManualFormError(lang === 'es' ? 'Producto seleccionado no válido.' : 'Selected product is invalid.');
        return;
      }
      finalName = p.name;
      finalPresentation = p.presentation;
      finalProductId = p.id;
    } else {
      if (!manualName.trim()) {
        setManualFormError(lang === 'es' ? 'Por favor, ingresa el nombre de la medicación.' : 'Please enter the medication name.');
        return;
      }
      if (!manualPresentation.trim()) {
        setManualFormError(lang === 'es' ? 'Por favor, ingresa la presentación.' : 'Please enter the presentation.');
        return;
      }
      finalName = manualName.trim();
      finalPresentation = manualPresentation.trim();
    }

    if (manualQty <= 0) {
      setManualFormError(lang === 'es' ? 'La cantidad debe ser mayor a 0.' : 'Quantity must be greater than 0.');
      return;
    }

    if (!manualBatch.trim()) {
      setManualFormError(lang === 'es' ? 'Por favor, ingresa el código de lote.' : 'Please enter the batch code.');
      return;
    }

    if (!manualExpir) {
      setManualFormError(lang === 'es' ? 'Por favor, selecciona la fecha de vencimiento.' : 'Please select the expiration date.');
      return;
    }

    const newItem = {
      name: finalName,
      presentation: finalPresentation,
      quantity: manualQty,
      batchCode: manualBatch.trim().toUpperCase(),
      expirationDate: manualExpir,
      productId: finalProductId
    };

    setReceiptItems(prev => [...prev, newItem]);
    
    // Si no había nombre de archivo de remito, le ponemos uno general para indicar que hay carga manual
    if (!receiptFileName) {
      setReceiptFileName(lang === 'es' ? 'Remito cargado a mano' : 'Manually entered receipt');
    }

    // Resetear campos
    setManualProdId('');
    setManualName('');
    setManualPresentation('');
    setManualQty(1);
    setManualBatch('');
    setManualExpir('');
    setManualFormError('');
    
    playBeep('beep');
  };

  const handleDownloadCSVTemplate = () => {
    // Generar cabeceras y ejemplos en español de acuerdo al catálogo
    const headers = ['ID_CATALOGO', 'INSUMO_NOMBRE', 'PRESENTACION', 'CANTIDAD', 'LOTE', 'VENCIMIENTO_YYYY_MM_DD'].join(',');
    const row1 = 'g3,Dipirona 1g (Metamizol),Ampolla 2 ml,150,L-DP012,2027-02-15';
    const row2 = 'g2,Furosemida 20 mg,Ampolla 2 ml,100,L-FS993,2026-11-30';
    const row3 = ',Algodon Hidrofilo,Pote 100g,50,L-AL02,2028-05-10'; // nuevo
    
    const csvContent = '\uFEFF' + [headers, row1, row2, row3].join('\n'); // Add UTF-8 BOM
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'plantilla_remito_municipal.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    playBeep('beep');
  };

  const handleReceiptFileUpload = async (file: File) => {
    try {
      setReceiptError('');
      setReceiptSuccessMsg('');
      setReceiptItems([]);
      setReceiptFileName(file.name);
      setIsProcessingReceipt(true);

      const isCSV = file.name.endsWith('.csv') || file.type === 'text/csv';

      if (!isCSV) {
        throw new Error(lang === 'es'
          ? 'Para cargar remitos de forma gratuita y local, por favor utiliza un archivo planilla tipo .csv. Si tienes una imagen del remito impreso o en PDF, puedes cargarlo digitando los insumos manualmente en el panel de abajo.'
          : 'To upload sheets for free and locally, please use a .csv spreadsheet file. If you have an image or printed sheet, use the manual entry panel below.');
      }

      if (isCSV) {
        // --- Procesamiento de CSV totalmente local y gratuito ---
        const reader = new FileReader();
        reader.onload = async (evt) => {
          try {
            const text = evt.target?.result as string;
            if (!text) {
              throw new Error(lang === 'es' ? 'El archivo CSV está vacío o no se puede leer.' : 'The CSV file is empty or unreadable.');
            }

            const lines = text.split(/\r?\n/);
            if (lines.length === 0) {
              throw new Error(lang === 'es' ? 'El archivo CSV no contiene filas.' : 'The CSV file has no rows.');
            }

            // Determinar separador (usualmente o coma o punto y coma por Excel en Español)
            const firstLine = lines[0];
            const sep = firstLine.includes(';') ? ';' : ',';

            const rawHeaders = firstLine.split(sep).map(h => h.trim().replace(/^["']|["']$/g, '').toLowerCase());

            // Determinar si la primera línea contiene cabeceras
            const hasHeaders = rawHeaders.some(h => 
              h === 'id' || h.includes('name') || h.includes('producto') || h.includes('insumo') || 
              h.includes('present') || h.includes('cant') || h.includes('qty') || h.includes('lote') || 
              h.includes('venc') || h.includes('exp') || h.includes('vto') || h.includes('articulo') || 
              h.includes('artículo') || h.includes('nombre')
            );

            let startIndex = 0;
            let colId = -1;
            let colName = -1;
            let colPres = -1;
            let colQty = -1;
            let colBatch = -1;
            let colExpir = -1;

            if (hasHeaders) {
              startIndex = 1;
              rawHeaders.forEach((h, idx) => {
                const cleanH = h.trim().toLowerCase();
                
                // Id o Código del catálogo
                if (cleanH === 'id' || cleanH === 'código' || cleanH === 'codigo' || cleanH.includes('id_cata') || cleanH.includes('productid') || cleanH.startsWith('id_') || cleanH.endsWith('_id')) {
                  colId = idx;
                }
                else if (
                  cleanH.includes('insumo') || 
                  cleanH.includes('producto') || 
                  cleanH.includes('articulo') || 
                  cleanH.includes('artículo') || 
                  cleanH.includes('nombre') || 
                  cleanH.includes('name') || 
                  cleanH.includes('fármaco') || 
                  cleanH.includes('farmaco') ||
                  cleanH.includes('medicamento') ||
                  cleanH.includes('droga')
                ) {
                  colName = idx;
                }
                else if (cleanH.includes('presenta') || cleanH.includes('formato') || cleanH.includes('envase')) {
                  colPres = idx;
                }
                else if (cleanH.includes('cant') || cleanH.includes('qty') || cleanH.includes('unidad') || cleanH.includes('unid') || cleanH.includes('cantidad')) {
                  colQty = idx;
                }
                else if (cleanH === 'lote' || cleanH === 'batch') {
                  colBatch = idx;
                }
                else if (cleanH.includes('partida') && colBatch === -1) {
                  colBatch = idx;
                }
                else if (cleanH.includes('venc') || cleanH.includes('exp') || cleanH.includes('fecha') || cleanH === 'vto' || cleanH.includes('vto')) {
                  colExpir = idx;
                }
              });
            }

            // Fallbacks si no se detectaron automáticamente las cabeceras básicas
            if (colId === -1 && colName === -1 && colQty === -1) {
              colId = 0;
              colName = 1;
              colPres = 2;
              colQty = 3;
              colBatch = 4;
              colExpir = 5;
            }

            const parsedItems: any[] = [];

            for (let i = startIndex; i < lines.length; i++) {
              const line = lines[i].trim();
              if (!line) continue;

              const cells = line.split(sep).map(c => c.trim().replace(/^["']|["']$/g, ''));
              if (cells.length < 2) continue;

              const cellId = colId !== -1 && colId < cells.length ? cells[colId] : '';
              const cellName = colName !== -1 && colName < cells.length ? cells[colName] : '';
              const cellPres = colPres !== -1 && colPres < cells.length ? cells[colPres] : '';
              const cellQtyRaw = colQty !== -1 && colQty < cells.length ? cells[colQty] : '1';
              const cellBatch = colBatch !== -1 && colBatch < cells.length ? cells[colBatch] : 'L-MANUAL';
              let cellExpir = colExpir !== -1 && colExpir < cells.length ? cells[colExpir] : '';

              const quantity = Math.max(1, parseInt(cellQtyRaw) || 1);
              const batchCode = (cellBatch || 'L-MANUAL').toUpperCase();

              // Intentar sanear fechas (Argentina suele usar DD/MM/YYYY o DD-MM-YYYY)
              if (cellExpir) {
                if (cellExpir.includes('/')) {
                  const parts = cellExpir.split('/');
                  if (parts.length === 3) {
                    const p0 = parts[0].trim();
                    const p1 = parts[1].trim();
                    const p2 = parts[2].trim();
                    if (p0.length === 4) { // YYYY/MM/DD
                      cellExpir = `${p0}-${p1.padStart(2, '0')}-${p2.padStart(2, '0')}`;
                    } else if (p2.length === 4) { // DD/MM/YYYY
                      cellExpir = `${p2}-${p1.padStart(2, '0')}-${p0.padStart(2, '0')}`;
                    }
                  }
                } else if (cellExpir.includes('-')) {
                  const parts = cellExpir.split('-');
                  if (parts.length === 3) {
                    const p0 = parts[0].trim();
                    const p1 = parts[1].trim();
                    const p2 = parts[2].trim();
                    if (p2.length === 4) { // DD-MM-YYYY
                      cellExpir = `${p2}-${p1.padStart(2, '0')}-${p0.padStart(2, '0')}`;
                    } else if (p0.length === 4) { // YYYY-MM-DD
                      cellExpir = `${p0}-${p1.padStart(2, '0')}-${p2.padStart(2, '0')}`;
                    }
                  }
                }
              }

              if (!cellExpir || isNaN(Date.parse(cellExpir))) {
                const oneYearFromNow = new Date();
                oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
                cellExpir = oneYearFromNow.toISOString().split('T')[0];
              }

              // Intentar buscar match inteligente de catálogo para asociar automáticamente
              let matchedProduct: Product | undefined = undefined;

              if (cellId && cellId.trim()) {
                matchedProduct = products.find(p => p.id.toLowerCase() === cellId.toLowerCase().trim());
              }

              if (!matchedProduct && cellName && cellName.trim()) {
                const normCSVName = cellName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
                const csvWords = normCSVName.split(/[\s,/\-()]+/g).filter(w => w.length > 0);
                
                if (csvWords.length > 0) {
                  let bestMatch: Product | undefined = undefined;
                  let maxScore = 0;
                  const csvNumbers: string[] = normCSVName.match(/\d+/g) || [];

                  for (const p of products) {
                    const normPName = p.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
                    const pWords = normPName.split(/[\s,/\-()]+/g).filter(w => w.length > 0);
                    
                    // El primer término (droga principal) debe ser compatible
                    const firstCSVWord = csvWords[0];
                    if (!pWords.some(pw => pw.includes(firstCSVWord) || firstCSVWord.includes(pw))) {
                      continue;
                    }
                    
                    // Contar coincidencias
                    let matches = 0;
                    csvWords.forEach(cw => {
                      if (pWords.some(pw => pw.includes(cw) || cw.includes(pw))) {
                        matches++;
                      }
                    });
                    
                    const score = matches / Math.max(csvWords.length, pWords.length);
                    const pNumbers: string[] = normPName.match(/\d+/g) || [];
                    const numbersMatch = pNumbers.length === 0 || csvNumbers.length === 0 || 
                                         csvNumbers.some(n => pNumbers.includes(n)) || 
                                         pNumbers.some(n => csvNumbers.includes(n));
                    
                    if (numbersMatch && score > maxScore) {
                      maxScore = score;
                      bestMatch = p;
                    }
                  }

                  if (maxScore > 0.25) {
                    matchedProduct = bestMatch;
                  }
                }
              }

              parsedItems.push({
                name: matchedProduct ? matchedProduct.name : (cellName || cellId || (lang === 'es' ? 'Insumo sin nombre' : 'Unnamed item')),
                presentation: matchedProduct ? matchedProduct.presentation : (cellPres || (lang === 'es' ? 'Sin especificación' : 'No presentation')),
                quantity,
                batchCode,
                expirationDate: cellExpir,
                productId: matchedProduct ? matchedProduct.id : undefined
              });
            }

            if (parsedItems.length === 0) {
              throw new Error(lang === 'es' ? 'No se encontraron insumos legibles en el CSV.' : 'No readable items found in the CSV.');
            }

            setReceiptItems(parsedItems);
            playBeep('success');
          } catch (err: any) {
            console.error(err);
            setReceiptError(err.message || 'Error parsing CSV file.');
          } finally {
            setIsProcessingReceipt(false);
          }
        };

        reader.onerror = () => {
          setReceiptError(lang === 'es' ? 'Fallo al leer el archivo CSV.' : 'Failed to read CSV file.');
          setIsProcessingReceipt(false);
        };

        reader.readAsText(file);
      }

    } catch (err: any) {
      console.error(err);
      setReceiptError(err.message || 'Error.');
      setIsProcessingReceipt(false);
    }
  };

  const handleConfirmReceiptImport = () => {
    if (receiptItems.length === 0) return;

    let updatedList = [...products];
    let itemsAddedCount = 0;
    let itemsUpdatedCount = 0;

    receiptItems.forEach(item => {
      const existingProduct = item.productId
        ? updatedList.find(p => p.id === item.productId)
        : updatedList.find(
            p => p.name.trim().toLowerCase() === item.name.toLowerCase() &&
                 p.presentation.trim().toLowerCase() === item.presentation.toLowerCase()
          );

      const newBatch: StockBatch = {
        id: `b_recept_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        batchCode: item.batchCode || 'MUNI',
        expirationDate: item.expirationDate || '2027-12-31',
        quantity: item.quantity
      };

      if (existingProduct) {
        const existingBatch = existingProduct.batches.find(b => b.batchCode === newBatch.batchCode);
        if (existingBatch) {
          existingProduct.batches = existingProduct.batches.map(b => 
            b.batchCode === newBatch.batchCode ? { ...b, quantity: b.quantity + newBatch.quantity } : b
          );
        } else {
          existingProduct.batches = [...existingProduct.batches, newBatch];
        }
        itemsUpdatedCount++;
      } else {
        const newProduct: Product = {
          id: `p_recept_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          name: item.name,
          presentation: item.presentation,
          minStock: 10,
          category: 'Compartido',
          shelfLetter: 'A',
          shelfLevel: 1,
          batches: [newBatch],
          productType: 'Med',
          allowedServices: [PredefinedService.GUARDIA, PredefinedService.LABORATORIO, PredefinedService.IRAB, PredefinedService.FARMACIA]
        };
        updatedList.unshift(newProduct);
        itemsAddedCount++;
      }
    });

    onUpdateProducts(updatedList);

    onAppendAudit({
      id: `audit_${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: Role.FARMACEUTICO,
      action: 'CATALOG_UPDATE',
      details: `Recepción de remito municipal '${receiptFileName}': se sumó stock a ${itemsUpdatedCount} insumos existentes y se crearon ${itemsAddedCount} nuevos.`
    });

    setReceiptSuccessMsg(
      lang === 'es'
        ? `✓ ¡Éxito! Se incrementó el stock de ${itemsUpdatedCount} insumos existentes y se crearon ${itemsAddedCount} nuevos medicamentos en el catálogo.`
        : `✓ Success! Increased stock for ${itemsUpdatedCount} existing items and created ${itemsAddedCount} new catalog items.`
    );
    setReceiptItems([]);
    setReceiptFileName('');
    playBeep();
  };

  // --- LOGICA DE FILTRADO DE REPORTES POR FECHAS ---
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1); // 1 mes atrás por defecto
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });

  // --- LOGICA DE IMPORTACIÓN LOGÍSTICA DESDE CSV ---
  const [csvItems, setCsvItems] = useState<{
    name: string;
    presentation: string;
    minStock: number;
    category: PredefinedService | 'Compartido';
    batchCode?: string;
    expirationDate?: string;
    quantity?: number;
    shelfLetter?: string;
    shelfLevel?: number;
  }[]>([]);
  const [csvFileName, setCsvFileName] = useState('');
  const [csvError, setCsvError] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);

  const parseCSVText = (text: string) => {
    try {
      setCsvError('');
      const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
      if (lines.length === 0) {
        setCsvError(lang === 'es' ? 'El archivo está vacío o sin datos legibles.' : 'The file is empty or lacks readable rows.');
        return;
      }

      // Detetección del delimitador: tabulador, coma, o punto y coma
      const firstLine = lines[0];
      let separator = ';';
      if (firstLine.includes('\t')) {
        separator = '\t';
      } else if (firstLine.includes(';') && firstLine.includes(',')) {
        separator = ';'; // preferir punto y coma si ambos existen
      } else if (firstLine.includes(',')) {
        separator = ',';
      } else if (firstLine.includes(';')) {
        separator = ';';
      }

      // Detectar si la primera fila es cabecera
      let hasHeader = false;
      const firstLineLower = firstLine.toLowerCase();
      if (
        firstLineLower.includes('nombre') || 
        firstLineLower.includes('name') || 
        firstLineLower.includes('insumo') || 
        firstLineLower.includes('present') || 
        firstLineLower.includes('stock') || 
        firstLineLower.includes('categor') ||
        firstLineLower.includes('lote') ||
        firstLineLower.includes('venc') ||
        firstLineLower.includes('cant') ||
        firstLineLower.includes('estanter') ||
        firstLineLower.includes('estante')
      ) {
        hasHeader = true;
      }

      const rowsToParse = hasHeader ? lines.slice(1) : lines;
      const parsed = rowsToParse.map((line, index) => {
        let parts: string[] = [];
        if (separator === ',') {
          // regex básico para separar por comas respetando comillas
          const matches = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || line.split(',');
          parts = matches.map(m => m.replace(/^"|"$/g, '').trim());
        } else {
          parts = line.split(separator).map(p => p.trim());
        }

        if (parts.length < 2) {
          return null; // Fila vacía o incompleta
        }

        const name = parts[0] ? parts[0].replace(/^"|"$/g, '').trim() : '';
        const presentation = parts[1] ? parts[1].replace(/^"|"$/g, '').trim() : '';
        if (!name || !presentation) return null;

        // Stock mínimo base
        let minStock = 10;
        if (parts[2]) {
          const num = parseInt(parts[2], 10);
          if (!isNaN(num)) minStock = num;
        }

        // Categoría / Sector
        let category: PredefinedService | 'Compartido' = 'Compartido';
        if (parts[3]) {
          const catLower = parts[3].toLowerCase();
          if (catLower.includes('guardia')) {
            category = PredefinedService.GUARDIA;
          } else if (catLower.includes('lab') || catLower.includes('laboratorio')) {
            category = PredefinedService.LABORATORIO;
          } else if (catLower.includes('irab')) {
            category = PredefinedService.IRAB;
          } else if (catLower.includes('compartido') || catLower.includes('todos') || catLower.includes('shared')) {
            category = 'Compartido';
          }
        }

        // Lote inicial, vencimiento y cantidad opcional
        const batchCode = parts[4] ? parts[4].replace(/^"|"$/g, '').trim() : undefined;
        const expirationDate = parts[5] ? parts[5].replace(/^"|"$/g, '').trim() : undefined;
        let quantity: number | undefined = undefined;
        if (parts[6]) {
          const numQty = parseInt(parts[6], 10);
          if (!isNaN(numQty)) quantity = numQty;
        }

        // Estantería y nivel opcional
        const shelfLetter = parts[7] ? parts[7].replace(/^"|"$/g, '').trim().toUpperCase() : undefined;
        let shelfLevel: number | undefined = undefined;
        if (parts[8]) {
          const numLevel = parseInt(parts[8], 10);
          if (!isNaN(numLevel)) shelfLevel = numLevel;
        }

        return {
          name,
          presentation,
          minStock,
          category,
          batchCode,
          expirationDate,
          quantity,
          shelfLetter,
          shelfLevel
        };
      }).filter((item): item is NonNullable<typeof item> => item !== null);

      if (parsed.length === 0) {
        setCsvError(lang === 'es' ? 'No se detectaron filas válidas de insumos en el archivo.' : 'No valid product rows parsed from file.');
        return;
      }

      setCsvItems(parsed);
    } catch (err: any) {
      setCsvError(lang === 'es' ? `Error procesando CSV: ${err.message || err}` : `CSV parse error: ${err.message || err}`);
    }
  };

  const handleImportCSVConfirm = () => {
    if (csvItems.length === 0) return;

    let updatedList = [...products];
    let importedNew = 0;
    let updatedExisting = 0;

    csvItems.forEach(item => {
      // Comparación ignorando mayúsculas y espacios extras
      const existingProduct = updatedList.find(
        p => p.name.trim().toLowerCase() === item.name.toLowerCase() &&
             p.presentation.trim().toLowerCase() === item.presentation.toLowerCase()
      );

      const batchCodeVal = item.batchCode || 'L-IMPORT-01';
      const expDateVal = item.expirationDate || '2027-12-31';
      const qtyVal = item.quantity !== undefined ? item.quantity : 25;

      const newBatch: StockBatch = {
        id: `b_imptr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        batchCode: batchCodeVal,
        expirationDate: expDateVal,
        quantity: qtyVal
      };

      if (existingProduct) {
        // Combinar con insumo ya en catálogo (sumar stock o añadir lote)
        const hasSameBatch = existingProduct.batches.some(b => b.batchCode === batchCodeVal);
        const nextBatches = hasSameBatch
          ? existingProduct.batches.map(b => b.batchCode === batchCodeVal ? { ...b, quantity: b.quantity + qtyVal } : b)
          : [...existingProduct.batches, newBatch];

        existingProduct.batches = nextBatches;
        if (item.minStock) {
          existingProduct.minStock = item.minStock;
        }
        if (item.shelfLetter) {
          existingProduct.shelfLetter = item.shelfLetter;
        }
        if (item.shelfLevel !== undefined) {
          existingProduct.shelfLevel = item.shelfLevel;
        }
        updatedExisting++;
      } else {
        // Insertar nuevo medicamento completo
        const newProduct: Product = {
          id: `p_csv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          name: item.name,
          presentation: item.presentation,
          minStock: item.minStock,
          category: item.category,
          shelfLetter: item.shelfLetter || 'A',
          shelfLevel: item.shelfLevel !== undefined ? item.shelfLevel : 1,
          batches: [newBatch],
          productType: 'Med',
          allowedServices: item.category === 'Compartido'
            ? [PredefinedService.GUARDIA, PredefinedService.LABORATORIO, PredefinedService.IRAB, PredefinedService.FARMACIA]
            : [item.category]
        };
        updatedList.unshift(newProduct);
        importedNew++;
      }
    });

    onUpdateProducts(updatedList);

    onAppendAudit({
      id: `aud_${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'CATALOG_UPDATE',
      details: `Importación masiva: se registraron ${importedNew} insumos nuevos y se recargó stock de ${updatedExisting} pre-existentes.`
    });

    setCsvItems([]);
    setCsvFileName('');
    setCsvError('');
    playBeep('success');
  };

  const handlePrintPDFReport = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      setDialog({
        isOpen: true,
        title: lang === 'es' ? 'Firma o Ventana Emergente Bloqueada' : 'Popup Window Blocked',
        message: lang === 'es' 
          ? '¡El navegador bloqueó la apertura de la ventana del reporte! Por favor, habilite los permisos de ventanas emergentes (popups) en la barra de direcciones del navegador para poder imprimir el reporte consolidado.' 
          : 'The browser blocked the report window from opening. Please enable popup permissions in your address bar to print this consolidated document.',
        severity: 'warning'
      });
      return;
    }

    const todayStr = new Date().toLocaleDateString(lang === 'es' ? 'es-AR' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const rangeStr = `${new Date(startDate).toLocaleDateString(lang === 'es' ? 'es-AR' : 'en-US')} - ${new Date(endDate).toLocaleDateString(lang === 'es' ? 'es-AR' : 'en-US')}`;
    let docTitle = '';
    let tableRows = '';

    if (reportType === 'consumption') {
      docTitle = lang === 'es' ? 'Consolidados de Suministro por Sector CAPS' : 'Sector Consumption Audit Ledger';
      tableRows = `
        <table style="width:100%; border-collapse:collapse; margin-top:20px; font-size:13px;">
          <thead>
            <tr style="background-color:#f1f5f9; border-bottom:2px solid #000;">
              <th style="border:1px solid #ddd; padding:10px; text-align:left;">Fármaco / Insumo Autorizado</th>
              <th style="border:1px solid #ddd; padding:10px; text-align:center;">Guardia</th>
              <th style="border:1px solid #ddd; padding:10px; text-align:center;">Laboratorio</th>
              <th style="border:1px solid #ddd; padding:10px; text-align:center;">IRAB</th>
              <th style="border:1px solid #ddd; padding:10px; text-align:right;">Total Salidas</th>
            </tr>
          </thead>
          <tbody>
      `;

      const allActiveProds = new Set<string>();
      Object.values(consumptionReport).forEach(svcInfo => {
        Object.keys(svcInfo).forEach(productTitle => allActiveProds.add(productTitle));
      });

      const itemsSorted = Array.from(allActiveProds).sort();

      if (itemsSorted.length === 0) {
        tableRows += `<tr><td colspan="5" style="border:1px solid #ddd; padding:15px; text-align:center; font-style:italic; color:#666;">No hay salidas ni entregas entre estas fechas.</td></tr>`;
      } else {
        itemsSorted.forEach(item => {
          const qGuardia = consumptionReport[PredefinedService.GUARDIA]?.[item] || 0;
          const qLab = consumptionReport[PredefinedService.LABORATORIO]?.[item] || 0;
          const qIrab = consumptionReport[PredefinedService.IRAB]?.[item] || 0;
          const totalOut = qGuardia + qLab + qIrab;

          tableRows += `
            <tr style="border-bottom:1px solid #ddd;">
              <td style="border:1px solid #ddd; padding:8px; font-weight:bold;">${item}</td>
              <td style="border:1px solid #ddd; padding:8px; text-align:center; color:${qGuardia > 0 ? '#ea580c' : '#71717a'}">${qGuardia > 0 ? `+${qGuardia}` : '-'}</td>
              <td style="border:1px solid #ddd; padding:8px; text-align:center; color:${qLab > 0 ? '#ea580c' : '#71717a'}">${qLab > 0 ? `+${qLab}` : '-'}</td>
              <td style="border:1px solid #ddd; padding:8px; text-align:center; color:${qIrab > 0 ? '#ea580c' : '#71717a'}">${qIrab > 0 ? `+${qIrab}` : '-'}</td>
              <td style="border:1px solid #ddd; padding:8px; text-align:right; font-weight:bold; color:#ea580c;">${totalOut} unidades</td>
            </tr>
          `;
        });
      }
      tableRows += `</tbody></table>`;

    } else if (reportType === 'movements') {
      docTitle = lang === 'es' ? 'Libro Diario de Control de Pedidos Sanitarios' : 'Daily Replenishment Movements Logs';
      tableRows = `
        <table style="width:100%; border-collapse:collapse; margin-top:20px; font-size:12px;">
          <thead>
            <tr style="background-color:#f1f5f9; border-bottom:2px solid #000;">
              <th style="border:1px solid #ddd; padding:10px; text-align:left;">Código Orden</th>
              <th style="border:1px solid #ddd; padding:10px; text-align:left;">Fecha CAPS</th>
              <th style="border:1px solid #ddd; padding:10px; text-align:left;">Servicio Solicitante</th>
              <th style="border:1px solid #ddd; padding:10px; text-align:left;">Petición por</th>
              <th style="border:1px solid #ddd; padding:10px; text-align:left;">Control Farmacéutico</th>
              <th style="border:1px solid #ddd; padding:10px; text-align:right;">Estado de Suministro</th>
            </tr>
          </thead>
          <tbody>
      `;

      if (movementsReport.length === 0) {
        tableRows += `<tr><td colspan="6" style="border:1px solid #ddd; padding:15px; text-align:center; font-style:italic;">No hay pedidos registrados en este intervalo.</td></tr>`;
      } else {
        movementsReport.forEach(m => {
          const shortId = m.orderId.split('_')[1] || m.orderId.substring(0, 8);
          const fDate = new Date(m.date).toLocaleString(lang === 'es' ? 'es-AR' : 'en-US');
          tableRows += `
            <tr style="border-bottom:1px solid #ddd;">
              <td style="border:1px solid #ddd; padding:8px; font-family:monospace; font-weight:bold; color:#71717a;">#${shortId}</td>
              <td style="border:1px solid #ddd; padding:8px; font-family:monospace;">${fDate}</td>
              <td style="border:1px solid #ddd; padding:8px; font-weight:bold;">${m.service}</td>
              <td style="border:1px solid #ddd; padding:8px;">${m.requestedBy}</td>
              <td style="border:1px solid #ddd; padding:8px; color:#71717a;">${m.preparedBy || 'Firma pendiente'}</td>
              <td style="border:1px solid #ddd; padding:8px; text-align:right; font-weight:bold;">${m.status === 'Entregado' ? '✅ Entregado' : m.status === 'Preparado' ? '📦 Preparado' : '⏳ Pendiente'}</td>
            </tr>
          `;
        });
      }
      tableRows += `</tbody></table>`;

    } else if (reportType === 'audit') {
      docTitle = lang === 'es' ? 'Registro Inmutable de Transacciones CAPS' : 'Immutable Event & Security Audit Ledger';
      tableRows = `
        <table style="width:100%; border-collapse:collapse; margin-top:20px; font-size:12px;">
          <thead>
            <tr style="background-color:#f1f5f9; border-bottom:2px solid #000;">
              <th style="border:1px solid #ddd; padding:10px; text-align:left; width:20%;">Fecha Registro</th>
              <th style="border:1px solid #ddd; padding:10px; text-align:left; width:20%;">Acción Firmware</th>
              <th style="border:1px solid #ddd; padding:10px; text-align:left; width:60%;">Detalles Detallados del CAPS</th>
            </tr>
          </thead>
          <tbody>
      `;

      const auditFiltered = auditLogs.filter(log => {
        const logDate = log.timestamp.split('T')[0];
        return logDate >= startDate && logDate <= endDate;
      }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      if (auditFiltered.length === 0) {
        tableRows += `<tr><td colspan="3" style="border:1px solid #ddd; padding:15px; text-align:center; font-style:italic;">No hay registros de firma digital para estas fechas.</td></tr>`;
      } else {
        auditFiltered.forEach(l => {
          const logDateFmt = new Date(l.timestamp).toLocaleString(lang === 'es' ? 'es-AR' : 'en-US');
          tableRows += `
            <tr style="border-bottom:1px solid #ddd;">
              <td style="border:1px solid #ddd; padding:8px; font-family:monospace; color:#555;">${logDateFmt}</td>
              <td style="border:1px solid #ddd; padding:8px; font-weight:bold; font-family:monospace; color:#4338ca;">${l.action}</td>
              <td style="border:1px solid #ddd; padding:8px;"><strong>${l.details}</strong> (Autorizado: ${l.userName})</td>
            </tr>
          `;
        });
      }
      tableRows += `</tbody></table>`;

    } else if (reportType === 'expiring') {
      docTitle = lang === 'es' ? 'Estudio Analítico de Caducidad de Lotes (FEFO)' : 'FEFO Proximity Expiration Assessment';
      tableRows = `
        <table style="width:100%; border-collapse:collapse; margin-top:20px; font-size:12px;">
          <thead>
            <tr style="background-color:#f1f5f9; border-bottom:2px solid #000;">
              <th style="border:1px solid #ddd; padding:10px; text-align:left;">Fármaco / Insumo</th>
              <th style="border:1px solid #ddd; padding:10px; text-align:left;">Código de Lote</th>
              <th style="border:1px solid #ddd; padding:10px; text-align:left;">F. Vencimiento</th>
              <th style="border:1px solid #ddd; padding:10px; text-align:center;">Días de Gracia</th>
              <th style="border:1px solid #ddd; padding:10px; text-align:right;">Cantidad Lote</th>
            </tr>
          </thead>
          <tbody>
      `;

      if (expiringReport.length === 0) {
        tableRows += `<tr><td colspan="5" style="border:1px solid #ddd; padding:15px; text-align:center; font-style:italic; color:green;">Excelente: Ningún medicamento expira en los próximos 120 días.</td></tr>`;
      } else {
        expiringReport.forEach(e => {
          tableRows += `
            <tr style="border-bottom:1px solid #ddd;">
              <td style="border:1px solid #ddd; padding:8px; font-weight:bold;">${e.productName} (${e.presentation})</td>
              <td style="border:1px solid #ddd; padding:8px; font-family:monospace;">${e.batchCode}</td>
              <td style="border:1px solid #ddd; padding:8px; font-family:monospace;">${e.expirationDate}</td>
              <td style="border:1px solid #ddd; padding:8px; text-align:center; font-weight:bold; color:${e.daysRemaining <= 30 ? 'red' : '#d97706'}">${e.daysRemaining <= 0 ? 'Expirado' : `${e.daysRemaining} días`}</td>
              <td style="border:1px solid #ddd; padding:8px; text-align:right; font-weight:bold;">${e.quantity} u.</td>
            </tr>
          `;
        });
      }
      tableRows += `</tbody></table>`;

    } else if (reportType === 'low_stock') {
      docTitle = lang === 'es' ? 'Alerta Permanente de Stock Crítico Crítico' : 'Critical Depleted Stocks Warning Ledger';
      tableRows = `
        <table style="width:100%; border-collapse:collapse; margin-top:20px; font-size:12px;">
          <thead>
            <tr style="background-color:#f1f5f9; border-bottom:2px solid #000;">
              <th style="border:1px solid #ddd; padding:10px; text-align:left;">Insumo Hospitalario</th>
              <th style="border:1px solid #ddd; padding:10px; text-align:left;">Ubicación Sector</th>
              <th style="border:1px solid #ddd; padding:10px; text-align:center;">Mínimo Requerido</th>
              <th style="border:1px solid #ddd; padding:10px; text-align:right;">Volumen Faltante</th>
              <th style="border:1px solid #ddd; padding:10px; text-align:right;">Stock Depósito</th>
            </tr>
          </thead>
          <tbody>
      `;

      if (lowStockReport.length === 0) {
        tableRows += `<tr><td colspan="5" style="border:1px solid #ddd; padding:15px; text-align:center; font-style:italic; color:green; font-weight:bold;">100% OK: Todos los insumos del depósito central superan los stocks de reposición.</td></tr>`;
      } else {
        lowStockReport.forEach(l => {
          tableRows += `
            <tr style="border-bottom:1px solid #ddd;">
              <td style="border:1px solid #ddd; padding:8px; font-weight:bold;">${l.product.name} (${l.product.presentation})</td>
              <td style="border:1px solid #ddd; padding:8px; font-style:italic; color:#666;">${l.product.category}</td>
              <td style="border:1px solid #ddd; padding:8px; text-align:center;">${l.minStock} u.</td>
              <td style="border:1px solid #ddd; padding:8px; text-align:right; color:red; font-weight:bold;">-${l.minStock - l.totalStock} u.</td>
              <td style="border:1px solid #ddd; padding:8px; text-align:right; font-weight:bold; background-color:#fef2f2; color:#b91c1c;">${l.totalStock} u.</td>
            </tr>
          `;
        });
      }
      tableRows += `</tbody></table>`;
    } else if (reportType === 'unsatisfied') {
      docTitle = lang === 'es' ? 'Informe de Demanda Insatisfecha CAPS' : 'CAPS Unfulfilled Demand Audit Ledger';
      tableRows = `
        <table style="width:100%; border-collapse:collapse; margin-top:20px; font-size:12px;">
          <thead>
            <tr style="background-color:#f1f5f9; border-bottom:2px solid #000;">
              <th style="border:1px solid #ddd; padding:10px; text-align:left;">Servicio / Sector</th>
              <th style="border:1px solid #ddd; padding:10px; text-align:left;">Fármaco / Insumo</th>
              <th style="border:1px solid #ddd; padding:10px; text-align:center;">Pedida (Solicitada)</th>
              <th style="border:1px solid #ddd; padding:10px; text-align:center;">Entregada (Satisfecha)</th>
              <th style="border:1px solid #ddd; padding:10px; text-align:right;">No Cubierta (Faltante)</th>
            </tr>
          </thead>
          <tbody>
      `;

      let hasUnsatisfied = false;
      const services = [PredefinedService.GUARDIA, PredefinedService.LABORATORIO, PredefinedService.IRAB, PredefinedService.FARMACIA];

      services.forEach(svc => {
        const prodData = unsatisfiedReport[svc] || {};
        const entries = (Object.entries(prodData) as [string, { requested: number; delivered: number; unsatisfied: number }][]).filter(([_, val]) => val.unsatisfied > 0);

        if (entries.length > 0) {
          hasUnsatisfied = true;
          entries.forEach(([pName, val]) => {
            tableRows += `
              <tr style="border-bottom:1px solid #ddd;">
                <td style="border:1px solid #ddd; padding:8px; font-weight:bold; color:#4338ca;">${svc}</td>
                <td style="border:1px solid #ddd; padding:8px; font-weight:bold;">${pName}</td>
                <td style="border:1px solid #ddd; padding:8px; text-align:center;">${val.requested} u.</td>
                <td style="border:1px solid #ddd; padding:8px; text-align:center;">${val.delivered} u.</td>
                <td style="border:1px solid #ddd; padding:8px; text-align:right; font-weight:bold; color:#b91c1c; background-color:#fef2f2;">-${val.unsatisfied} u.</td>
              </tr>
            `;
          });
        }
      });

      if (!hasUnsatisfied) {
        tableRows += `<tr><td colspan="5" style="border:1px solid #ddd; padding:15px; text-align:center; font-style:italic; color:green; font-weight:bold;">✔ 100% OK: No se registra demanda insatisfecha para ningún servicio en este período.</td></tr>`;
      }

      tableRows += `</tbody></table>`;
    }

    const htmlDoc = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>FARMACIA SABATTO CAPS - REPORT SYSTEM</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.5; padding: 40px; background-color:#fff; }
            .header-container { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #ea580c; padding-bottom: 20px; }
            .title-section { text-align: left; }
            .meta-section { text-align: right; font-size: 11px; font-family: monospace; color: #4b5563; }
            .doc-info { margin-top: 25px; padding: 15px; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; }
            .doc-info h2 { margin: 0; font-size: 16px; color: #0f172a; }
            .doc-info p { margin: 4px 0 0 0; font-size: 11px; font-family: monospace; }
            .print-btn { background-color: #ea580c; color: white; border: none; padding: 8px 16px; font-weight: bold; border-radius: 6px; cursor: pointer; font-size: 11px; }
            .print-btn:hover { background-color: #c2410c; }
            .footer-signature { margin-top: 80px; display: grid; grid-template-columns: 1fr 1fr; gap: 60px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 25px; }
            @media print {
              body { padding: 20px; }
              .no-print { display: none !important; }
            }
          </style>
        </head>
        <body>
          <div class="no-print" style="margin-bottom: 30px; display: flex; justify-content: space-between; align-items: center; background-color: #ffedd5; padding: 12px 20px; border-radius: 10px; border: 1px solid #fed7aa; font-size: 12px; color: #7c2d12;">
            <span><strong>Impresión Oficial CAPS:</strong> Listado formateado con papel membretado. Selecciona "Imprimir" abajo y escoge guardar como archivo PDF.</span>
            <button onclick="window.print()" class="print-btn">🖨️ Imprimir / Guardar PDF</button>
          </div>

          <div style="min-height: 270mm; position: relative;">
            <div class="header-container">
              <div class="title-section">
                <h1 style="margin:0; font-size:26px; font-weight:900; tracking-tight: -0.05em; color: #0f172a;">FARMACIA SABATTO</h1>
                <p style="margin:4px 0 0 0; font-size:11px; font-weight:bold; letter-spacing:1px; color:#ea580c; font-family:monospace;">CAPS Dr. Marcelo Sabatto - Secretaria de Salud</p>
                <p style="margin:2px 0 0 0; font-size:10px; color:#64748b;">Sistema de Gestión de Suministros Sanitarios Descentralizados</p>
              </div>
              <div class="meta-section">
                <p style="margin: 0; font-weight: bold; color: #000;">DOC REGISTRO: CAPS-SBT-${Math.floor(1000 + Math.random() * 9000)}</p>
                <p style="margin: 3px 0 0 0;">Fecha: ${todayStr}</p>
                <p style="margin: 1px 0 0 0;">Generado por: ${currentUser.name} (${currentUser.role.toUpperCase()})</p>
              </div>
            </div>

            <div class="doc-info">
              <div>
                <span style="font-size: 9px; font-family: monospace; font-weight: bold; color: #94a3b8; text-transform: uppercase;">Tipo de Informe CAPS</span>
                <h2>${docTitle}</h2>
              </div>
              <div style="text-align: right;">
                <span style="font-size: 9px; font-family: monospace; font-weight: bold; color: #94a3b8; text-transform: uppercase;">Período Auditado</span>
                <p style="margin:2px 0 0 0; font-weight: bold; color: #334155;">${rangeStr}</p>
              </div>
            </div>

            <div style="margin-top: 30px;">
              ${tableRows}
            </div>

            <div class="footer-signature" style="position: absolute; bottom: 30px; left: 0; right: 0;">
              <div>
                <div style="border-bottom: 1px solid #94a3b8; width: 60%; margin: 0 auto; height: 35px;"></div>
                <p style="margin: 8px 0 0 0; font-weight: bold; color: #334155;">${currentUser.name}</p>
                <p style="margin: 2px 0 0 0; font-size: 9px; uppercase; font-family: monospace;">Firma Jefa de Servicio CAPS</p>
              </div>
              <div>
                <div style="border-bottom: 1px solid #94a3b8; width: 60%; margin: 0 auto; height: 35px;"></div>
                <p style="margin: 8px 0 0 0; font-weight: bold; color: #334155;">Director Médico CAPS Sabatto</p>
                <p style="margin: 2px 0 0 0; font-size: 9px; uppercase; font-family: monospace;">Secretaría de Inspección de Farmacia</p>
              </div>
            </div>
          </div>

          <div class="no-print" style="margin-top:20px; text-align:center; font-size:10px; color:#94a3b8; font-family:monospace;">
            Soporte CAPS Digital • Argentina • Terminal Depósito Central Autorizado
          </div>

          <script>
            window.onload = function() {
              setTimeout(() => { window.print(); }, 250);
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(htmlDoc);
    printWindow.document.close();
  };


  // LOGICA ABM PRODUCTOS
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [pName, setPName] = useState('');
  const [pPresentation, setPPresentation] = useState('');
  const [pMinStock, setPMinStock] = useState(10);
  const [pCategory, setPCategory] = useState<PredefinedService | 'Compartido'>(PredefinedService.GUARDIA);
  const [pShelfLetter, setPShelfLetter] = useState('A');
  const [pShelfLevel, setPShelfLevel] = useState(1);
  const [pProductType, setPProductType] = useState<'Med' | 'PM'>('Med');
  const [catalogTypeFilter, setCatalogTypeFilter] = useState<'All' | 'Med' | 'PM'>('All');

  // Nuevos estados de búsqueda para mejorar localizabilidad de insumos creados
  const [catalogSearchTerm, setCatalogSearchTerm] = useState('');
  const [mappingSearchTerm, setMappingSearchTerm] = useState('');
  const [adjustSearchTerm, setAdjustSearchTerm] = useState('');

  const filteredCatalogProducts = useMemo(() => {
    let list = products;
    if (catalogTypeFilter !== 'All') {
      list = list.filter(p => (p.productType || 'Med') === catalogTypeFilter);
    }
    if (catalogSearchTerm.trim() !== '') {
      const q = catalogSearchTerm.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.presentation.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q)
      );
    }
    return list;
  }, [products, catalogTypeFilter, catalogSearchTerm]);

  // Filtrado para mapeo de visibilidad cruzada
  const filteredMappingProducts = useMemo(() => {
    if (mappingSearchTerm.trim() === '') return products;
    const q = mappingSearchTerm.toLowerCase();
    return products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.presentation.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q)
    );
  }, [products, mappingSearchTerm]);

  // Filtrado para selección de insumo en ajuste manual
  const filteredAdjustProducts = useMemo(() => {
    if (adjustSearchTerm.trim() === '') return products;
    const q = adjustSearchTerm.toLowerCase();
    return products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.presentation.toLowerCase().includes(q)
    );
  }, [products, adjustSearchTerm]);

  // Filtrado de pedidos históricos (entregas por sector y fecha)
  const filteredHistoricalOrders = useMemo(() => {
    return orders.filter(o => {
      // Solo en estado "Entregado"
      if (o.status !== 'Entregado') return false;

      // Filtrar por Sector (Servicio)
      if (historyServiceFilter !== 'All' && o.service !== historyServiceFilter) return false;

      // Filtrar por rango de fechas (comparando fecha de entrega o de solicitud YYYY-MM-DD)
      const oDate = o.deliveryDate ? o.deliveryDate.substring(0, 10) : o.requestDate.substring(0, 10);
      
      if (historyStartDate && oDate < historyStartDate) return false;
      if (historyEndDate && oDate > historyEndDate) return false;

      // Búsqueda por palabra clave (ID, solicitante, preparador, dispensador, medicamento)
      if (historySearchQuery.trim() !== '') {
        const q = historySearchQuery.toLowerCase();
        const matchesQuery = 
          o.id.toLowerCase().includes(q) ||
          o.requestedBy.userName.toLowerCase().includes(q) ||
          (o.preparedBy && o.preparedBy.userName.toLowerCase().includes(q)) ||
          (o.deliveredBy && o.deliveredBy.userName.toLowerCase().includes(q)) ||
          o.items.some(itm => itm.productName.toLowerCase().includes(q));
        
        if (!matchesQuery) return false;
      }

      return true;
    });
  }, [orders, historyServiceFilter, historyStartDate, historyEndDate, historySearchQuery]);

  // Obtener todos los lotes de todos los productos de forma aplanada para auditar y descartar
  const expiringAndExpiredBatches = useMemo(() => {
    const list: {
      productId: string;
      productName: string;
      presentation: string;
      category: string;
      batchCode: string;
      expirationDate: string;
      quantity: number;
      isExpired: boolean;
      daysRemaining: number;
      shelfLetter?: string;
      shelfLevel?: number;
    }[] = [];

    const today = new Date();
    const todayNormalized = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    products.forEach(p => {
      p.batches.forEach(b => {
        if (b.quantity > 0) {
          const exp = new Date(b.expirationDate);
          const expNormalized = new Date(exp.getFullYear(), exp.getMonth(), exp.getDate());
          const diffMs = expNormalized.getTime() - todayNormalized.getTime();
          const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

          // Considerado vencido o que vence pronto (60 días)
          if (diffDays <= 60) {
            list.push({
              productId: p.id,
              productName: p.name,
              presentation: p.presentation,
              category: p.category,
              batchCode: b.batchCode,
              expirationDate: b.expirationDate,
              quantity: b.quantity,
              isExpired: diffDays <= 0,
              daysRemaining: diffDays,
              shelfLetter: p.shelfLetter,
              shelfLevel: p.shelfLevel
            });
          }
        }
      });
    });

    return list.sort((a, b) => a.daysRemaining - b.daysRemaining);
  }, [products]);

  // Descartar un lote individual
  const handleDiscardBatch = (productId: string, batchCode: string, quantityToDiscard: number) => {
    const updatedProducts = products.map(p => {
      if (p.id === productId) {
        return {
          ...p,
          batches: p.batches.map(b => {
            if (b.batchCode === batchCode) {
              return { ...b, quantity: 0 };
            }
            return b;
          })
        };
      }
      return p;
    });

    onUpdateProducts(updatedProducts);

    const targetProduct = products.find(p => p.id === productId);
    onAppendAudit({
      id: `audit_${Date.now()}_discard`,
      timestamp: new Date().toISOString(),
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'MANUAL_STOCK_ADJUST',
      details: lang === 'es'
        ? `SISTEMA AUTOMÁTICO DE DESCARTE (CONTROL MENSUAL): Se descartaron ${quantityToDiscard} u. de ${targetProduct?.name} (Lote: ${batchCode}) por vencimiento laboral.`
        : `AUTOMATIC DISCARD SYSTEM (MONTH-END): Discarded ${quantityToDiscard} u. of ${targetProduct?.name} (Batch: ${batchCode}) due to labor expiration.`
    });

    playBeep('success');
  };

  // Descartar todos los lotes vencidos de forma masiva
  const handleDiscardAllExpired = () => {
    const expiredList = expiringAndExpiredBatches.filter(b => b.isExpired);
    if (expiredList.length === 0) return;

    const updatedProducts = products.map(p => {
      const hasExpiredBatch = p.batches.some(b => {
        if (b.quantity <= 0) return false;
        const exp = new Date(b.expirationDate);
        return exp <= new Date();
      });

      if (hasExpiredBatch) {
        return {
          ...p,
          batches: p.batches.map(b => {
            const exp = new Date(b.expirationDate);
            if (b.quantity > 0 && exp <= new Date()) {
              return { ...b, quantity: 0 };
            }
            return b;
          })
        };
      }
      return p;
    });

    onUpdateProducts(updatedProducts);

    expiredList.forEach(item => {
      onAppendAudit({
        id: `audit_${Date.now()}_discard_all_${item.productId}_${item.batchCode}`,
        timestamp: new Date().toISOString(),
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: currentUser.role,
        action: 'MANUAL_STOCK_ADJUST',
        details: lang === 'es'
          ? `SISTEMA AUTOMÁTICO DE DESCARTE MASIVO (CONTROL MENSUAL): Se descartaron ${item.quantity} u. de ${item.productName} (Lote: ${item.batchCode}, Vence: ${item.expirationDate}) por vencimiento.`
          : `AUTOMATIC MASS DISCARD SYSTEM (MONTH-END): Discarded ${item.quantity} u. of ${item.productName} (Batch: ${item.batchCode}, Expires: ${item.expirationDate}) due to expiration.`
      });
    });

    playBeep('success');
  };

  // Imprimir acta individual de entrega
  const handlePrintDeliveryOrder = (order: Order) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      setDialog({
        isOpen: true,
        title: lang === 'es' ? 'Permiso Bloqueado por el Navegador' : 'Popup Blocked',
        message: lang === 'es' 
          ? 'Para descargar/imprimir el acta de entrega, habilite los permisos para abrir ventanas emergentes (popups) en la barra del navegador.' 
          : 'To print this delivery voucher, please allow popups in your browser address bar settings.'
      });
      return;
    }

    const requestDateStr = new Date(order.requestDate).toLocaleString(lang === 'es' ? 'es-AR' : 'en-US');
    const deliveryDateStr = order.deliveryDate ? new Date(order.deliveryDate).toLocaleString(lang === 'es' ? 'es-AR' : 'en-US') : 'N/A';

    const itemsHtml = order.items.map(itm => {
      const batchesStr = itm.assignedBatches && itm.assignedBatches.length > 0
        ? itm.assignedBatches.map(b => `${b.batchCode} (Vence: ${b.expirationDate}) [Cant: ${b.quantity} U]`).join(', ')
        : 'S/D (Sin detalle de lote)';
      return `
        <tr>
          <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold; color: #0f172a;">${itm.productName}</td>
          <td style="padding: 10px; border: 1px solid #e2e8f0; font-size: 11px; color:#64748b;">${itm.presentation}</td>
          <td style="padding: 10px; border: 1px solid #e2e8f0; text-align: center;">${itm.requestedQuantity} U</td>
          <td style="padding: 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: bold; color: #0d9488;">${itm.approvedQuantity || 0} U</td>
          <td style="padding: 10px; border: 1px solid #e2e8f0; font-family: monospace; font-size: 11px;">${batchesStr}</td>
        </tr>
      `;
    }).join('');

    const htmlToPrint = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Acta de Entrega CAPS - ${order.id}</title>
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1e293b; padding: 40px; line-height: 1.5; }
          .header { border-bottom: 3px double #0d9488; padding-bottom: 15px; margin-bottom: 25px; text-align: center; }
          .logo-sub { text-transform: uppercase; letter-spacing: 2px; font-size: 11px; color: #0d9488; font-weight: bold; margin-bottom: 5px;}
          .main-title { font-size: 20px; color: #0f172a; font-weight: 850; margin: 0; }
          .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 30px; font-size: 12px; border: 1px solid #e2e8f0; padding: 15px; border-radius: 8px; background-color: #f8fafc;}
          .meta-col { display: flex; flex-direction: column; gap: 5px; }
          .table-title { font-size: 14px; font-weight: 800; color: #0f172a; border-bottom: 2px solid #0f172a; padding-bottom: 5px; margin-top: 20px; margin-bottom: 12px; text-transform: uppercase; }
          .footer { border-top: 1px solid #e2e8f0; padding-top: 15px; margin-top: 50px; font-size: 10px; color: #94a3b8; text-align: center; }
          .sig-row { display: flex; justify-content: space-between; margin-top: 55px; page-break-inside: avoid; }
          .sig-box { text-align: center; width: 200px; }
          .line { border-top: 1px solid #1e293b; margin-bottom: 5px; width: 100%; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo-sub">Dirección CAPS Sabatto • Farmacia Centralizada</div>
          <h1 class="main-title">COMUNICACIÓN OFICIAL DE DISPENSA Y RECEPCIÓN</h1>
          <p style="font-size:11px; color:#64748b; margin: 5px 0 0 0;">Pedido ID: <strong>${order.id}</strong></p>
        </div>

        <div class="meta-grid">
          <div class="meta-col">
            <span>Sector Solicitante: <strong style="color: #0d9488; font-size: 13px;">${order.service}</strong></span>
            <span>Tipo de Pedido: <strong>${order.type === 'Periodico' ? 'Periódico / Semanal' : 'Extraordinario / Urgente'}</strong></span>
            <span>Notas: <em>${order.notes || 'Ninguna especificada'}</em></span>
          </div>
          <div class="meta-col">
            <span>Fecha Solicitud: <strong>${requestDateStr}</strong></span>
            <span>Fecha de Entrega: <strong style="color:#0d9488;">${deliveryDateStr}</strong></span>
            <span>Estado: <strong style="text-transform: uppercase; color: #059669;">Entregado / Conforme</strong></span>
          </div>
        </div>

        <div class="table-title">Personal Interviniente (Trazabilidad Inmutable)</div>
        <div style="font-size: 12px; margin-bottom: 25px; line-height: 1.6;">
          • <strong>Solicitado por:</strong> ${order.requestedBy?.userName} (${order.requestedBy?.userEmail})<br />
          • <strong>Preparado por (FEFO):</strong> ${order.preparedBy?.userName || 'Técnico Depósito'}<br />
          • <strong>Entregado/Dispensado por:</strong> ${order.deliveredBy?.userName || 'Personal Depósito'}<br />
        </div>

        <div class="table-title">Medicamentos e Insumos Despachados</div>
        <table style="width:100%; border-collapse:collapse; font-size:12px;">
          <thead>
            <tr style="background-color: #f1f5f9;">
              <th style="padding: 10px; border: 1px solid #cbd5e1; text-align: left;">Fármaco / Material Clínico</th>
              <th style="padding: 10px; border: 1px solid #cbd5e1; text-align: left; width: 150px;">Presentación</th>
              <th style="padding: 10px; border: 1px solid #cbd5e1; text-align: center; width: 90px;">Pedida</th>
              <th style="padding: 10px; border: 1px solid #cbd5e1; text-align: center; width: 90px;">Despachada</th>
              <th style="padding: 10px; border: 1px solid #cbd5e1; text-align: left; width: 220px;">Lotes FEFO Utilizados</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div style="clear: both;"></div>

        <div class="sig-row">
          <div class="sig-box">
            <div class="line"></div>
            <span style="font-size: 10px; font-weight: bold;">Firma Farmacia CAPS</span><br/>
            <span style="font-size: 9px; color: #64748b;">${order.deliveredBy?.userName || 'Personal Depósito'}</span>
          </div>
          <div class="sig-box">
            <div class="line"></div>
            <span style="font-size: 10px; font-weight: bold;">Firma Responsable Área</span><br/>
            <span style="font-size: 9px; color: #64748b;">${order.requestedBy?.userName}</span>
          </div>
          <div class="sig-box">
            <div class="line"></div>
            <span style="font-size: 10px; font-weight: bold;">Autorización Dirección</span><br/>
            <span style="font-size: 9px; color: #64748b;">Sofía Sabatto</span>
          </div>
        </div>

        <div class="footer">
          Copia impresa de documento digital de firma inmutable. CAPS Sabatto - Todo Cambio de Stock queda Auditado por FEFO.
        </div>

        <script>
          window.onload = function() {
            window.print();
          }
        </script>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(htmlToPrint);
    printWindow.document.close();
    playBeep('success');
  };

  // LOGICA ABM USUARIOS / ASIGNACIÓN ROLES
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [uName, setUName] = useState('');
  const [uEmail, setUEmail] = useState('');
  const [uRole, setURole] = useState<Role>(Role.ENFERMERO);
  const [uService, setUService] = useState<PredefinedService>(PredefinedService.GUARDIA);
  const [uPassword, setUPassword] = useState('');
  const [copyUserSuccess, setCopyUserSuccess] = useState<string | null>(null);

  // LOGICA AJUSTE MANUAL INVENTARIO
  const [adjustProductId, setAdjustProductId] = useState('');
  const [adjustBatchCode, setAdjustBatchCode] = useState('');
  const [adjustExpiration, setAdjustExpiration] = useState('');
  const [adjustQuantity, setAdjustQuantity] = useState('');

  // CONFIGURACIÓN SECTOR PEDIDOS
  const [localConfigs, setLocalConfigs] = useState<ServiceConfiguration[]>(serviceConfigs);

  // RESULTADOS DE INTEGRACIÓN DIAGNÓSTICOS DE RED
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [testRan, setTestRan] = useState(false);

  // --- HELPER METRICS ---
  const selectedProductForAdjust = useMemo(() => {
    return products.find(p => p.id === adjustProductId);
  }, [products, adjustProductId]);

  const handleCreateOrUpdateProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pName.trim() || !pPresentation.trim()) return;

    let updatedList = [...products];

    if (editingProduct) {
      updatedList = updatedList.map(p => {
        if (p.id === editingProduct.id) {
          return {
            ...p,
            name: pName.trim(),
            presentation: pPresentation.trim(),
            minStock: Number(pMinStock),
            category: pCategory,
            shelfLetter: pShelfLetter,
            shelfLevel: Number(pShelfLevel),
            productType: pProductType,
            // Mantener lotes y servicios anteriores
          };
        }
        return p;
      });

      onAppendAudit({
        id: `aud_${Date.now()}`,
        timestamp: new Date().toISOString(),
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: currentUser.role,
        action: 'CATALOG_UPDATE',
        details: `Actualizó insumo catálogo: ${pName} (${pPresentation})`
      });

    } else {
      const newId = `p_added_${Date.now()}`;
      const newProduct: Product = {
        id: newId,
        name: pName.trim(),
        presentation: pPresentation.trim(),
        minStock: Number(pMinStock),
        category: pCategory,
        shelfLetter: pShelfLetter,
        shelfLevel: Number(pShelfLevel),
        productType: pProductType,
        batches: [
          // Lote inicial vacío para completar la entidad
          { id: `b_init_${Date.now()}`, batchCode: 'L-NUEVO-01', expirationDate: '2027-12-31', quantity: 20 }
        ],
        allowedServices: pCategory === 'Compartido' 
          ? [PredefinedService.GUARDIA, PredefinedService.LABORATORIO, PredefinedService.IRAB, PredefinedService.FARMACIA]
          : [pCategory as PredefinedService]
      };
      
      updatedList.unshift(newProduct);

      onAppendAudit({
        id: `aud_${Date.now()}`,
        timestamp: new Date().toISOString(),
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: currentUser.role,
        action: 'CATALOG_UPDATE',
        details: `Agregó nuevo insumo a depósito: ${pName}`
      });
    }

    onUpdateProducts(updatedList);
    setPName('');
    setPPresentation('');
    setPMinStock(10);
    setPShelfLetter('A');
    setPShelfLevel(1);
    setPProductType('Med');
    setEditingProduct(null);
    playBeep('success');
  };

  const handleDeleteProduct = (pId: string) => {
    setDialog({
      isOpen: true,
      title: lang === 'es' ? 'Baja de Catálogo' : 'Remove Product Entry',
      message: lang === 'es' 
        ? '¿Está completamente seguro de que desea eliminar este insumo del catálogo principal del depósito? Los registros históricos y lotes vinculados se actualizarán.' 
        : 'Are you sure you want to delete this item from the central catalog? Historical logs will receive standard metadata changes.',
      confirmText: lang === 'es' ? 'Eliminar' : 'Remove',
      cancelText: lang === 'es' ? 'Cancelar' : 'Cancel',
      severity: 'danger',
      onConfirm: () => {
        const updatedList = products.filter(p => p.id !== pId);
        onUpdateProducts(updatedList);

        onAppendAudit({
          id: `aud_${Date.now()}`,
          timestamp: new Date().toISOString(),
          userId: currentUser.id,
          userName: currentUser.name,
          userRole: currentUser.role,
          action: 'CATALOG_UPDATE',
          details: `Eliminó insumo de inventario ID: ${pId}`
        });
        playBeep('success');
      }
    });
  };

  const handleEditProductClick = (p: Product) => {
    setEditingProduct(p);
    setPName(p.name);
    setPPresentation(p.presentation);
    setPMinStock(p.minStock);
    setPCategory(p.category);
    setPShelfLetter(p.shelfLetter || 'A');
    setPShelfLevel(p.shelfLevel || 1);
    setPProductType(p.productType || 'Med');
  };

  // ASIGNACIÓN MUCHOS A MUCHOS
  const handleToggleMapping = (productId: string, serviceName: string) => {
    const updated = products.map(p => {
      if (p.id === productId) {
        const allowed = Array.isArray(p.allowedServices) 
          ? [...p.allowedServices] 
          : (p.category as string) === 'Compartido'
            ? [PredefinedService.GUARDIA, PredefinedService.LABORATORIO, PredefinedService.IRAB, PredefinedService.FARMACIA]
            : [p.category].filter((c): c is PredefinedService => (c as string) !== 'Compartido');

        let nextAllowed: string[];
        if (allowed.includes(serviceName)) {
          nextAllowed = allowed.filter(s => s !== serviceName);
        } else {
          nextAllowed = [...allowed, serviceName];
        }

        return { ...p, allowedServices: nextAllowed };
      }
      return p;
    });

    onUpdateProducts(updated);
    onAppendAudit({
      id: `aud_${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'CATALOG_UPDATE',
      details: `Modificó matriz de servicios para medicamento ID: ${productId}`
    });
  };

  // CONFIG DE DIAS DE PEDIDO
  const handleConfigDayChange = (svc: PredefinedService, dayStr: string) => {
    const day = parseInt(dayStr);
    const dayNamesES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const updated = localConfigs.map(c => {
      if (c.serviceName === svc) {
        return {
          ...c,
          orderDay: day,
          orderDayName: dayNamesES[day]
        };
      }
      return c;
    });
    setLocalConfigs(updated);
    onUpdateServiceConfigs(updated);

    onAppendAudit({
      id: `aud_${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'USER_UPDATE',
      details: `Configuró día de pedido a ${dayNamesES[day]} para servicio ${svc}.`
    });
  };

  const handleConfigDailyToggle = (svc: PredefinedService) => {
    const updated = localConfigs.map(c => {
      if (c.serviceName === svc) {
        return { ...c, allowDaily: !c.allowDaily };
      }
      return c;
    });
    setLocalConfigs(updated);
    onUpdateServiceConfigs(updated);
  };

  // AJUSTE MANUAL (Reconteo físico)
  const handleManualAdjust = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustProductId) return;

    const prod = products.find(p => p.id === adjustProductId);
    if (!prod) return;

    let updatedList = [...products];

    // Si tiene lote definido
    const numberQty = Number(adjustQuantity);
    const updatedProducts = updatedList.map(p => {
      if (p.id === adjustProductId) {
        const batchIdx = p.batches.findIndex(b => b.batchCode === adjustBatchCode.trim().toUpperCase());
        const updatedBatches = [...p.batches];

        if (batchIdx > -1) {
          // Editar lote existente
          const oldQty = updatedBatches[batchIdx].quantity;
          updatedBatches[batchIdx] = {
            ...updatedBatches[batchIdx],
            quantity: numberQty,
            expirationDate: adjustExpiration || updatedBatches[batchIdx].expirationDate
          };

          onAppendAudit({
            id: `aud_${Date.now()}`,
            timestamp: new Date().toISOString(),
            userId: currentUser.id,
            userName: currentUser.name,
            userRole: currentUser.role,
            action: 'MANUAL_STOCK_ADJUST',
            details: `Ajuste manual inventario físico: ${p.name} - Lote ${adjustBatchCode}. De ${oldQty} a ${numberQty}.`
          });
        } else {
          // Agregar nuevo lote
          const newBatchCode = adjustBatchCode.trim().toUpperCase() || `L-MANUAL-${Date.now().toString().slice(-4)}`;
          const newExp = adjustExpiration || '2027-12-31';
          updatedBatches.push({
            id: `b_added_${Date.now()}`,
            batchCode: newBatchCode,
            expirationDate: newExp,
            quantity: numberQty
          });

          onAppendAudit({
            id: `aud_${Date.now()}`,
            timestamp: new Date().toISOString(),
            userId: currentUser.id,
            userName: currentUser.name,
            userRole: currentUser.role,
            action: 'MANUAL_STOCK_ADJUST',
            details: `Carga manual de nuevo lote: ${p.name} Lote ${newBatchCode} (${numberQty} unidades)`
          });
        }

        return { ...p, batches: updatedBatches };
      }
      return p;
    });

    onUpdateProducts(updatedProducts);
    setAdjustBatchCode('');
    setAdjustExpiration('');
    setAdjustQuantity('');
    playBeep('success');
  };

  // ABM USUARIOS
  const handleCreateOrUpdateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!uName.trim() || !uEmail.trim()) return;

    let updatedList = [...users];

    if (editingUser) {
      updatedList = updatedList.map(u => {
        if (u.id === editingUser.id) {
          return {
            ...u,
            name: uName.trim(),
            email: uEmail.trim().toLowerCase(),
            role: uRole,
            service: uRole === Role.ENFERMERO ? uService : undefined,
            password: uPassword.trim() || undefined
          };
        }
        return u;
      });

      onAppendAudit({
        id: `aud_${Date.now()}`,
        timestamp: new Date().toISOString(),
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: currentUser.role,
        action: 'USER_UPDATE',
        details: `Modificó credenciales usuario: ${uName} (${uEmail})`
      });

    } else {
      const newUser: User = {
        id: `u_${Date.now()}`,
        name: uName.trim(),
        email: uEmail.trim().toLowerCase(),
        role: uRole,
        service: uRole === Role.ENFERMERO ? uService : undefined,
        password: uPassword.trim() || undefined
      };
      
      updatedList.push(newUser);

      onAppendAudit({
        id: `aud_${Date.now()}`,
        timestamp: new Date().toISOString(),
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: currentUser.role,
        action: 'USER_UPDATE',
        details: `Registró nuevo personal CAPS: ${uName} como ${uRole}`
      });
    }

    onUpdateUsers(updatedList);
    setUName('');
    setUEmail('');
    setURole(Role.ENFERMERO);
    setUService(PredefinedService.GUARDIA);
    setUPassword('');
    setEditingUser(null);
    playBeep('success');
  };

  const copyCredentials = (u: User) => {
    const credText = `Portal: StockDepo Sabatto\nPersonal: ${u.name}\nRol: ${u.role}${u.service ? ` (${u.service})` : ''}\nEmail: ${u.email}\nContraseña: ${u.password || '123456'}`;
    navigator.clipboard.writeText(credText);
    setCopyUserSuccess(u.id);
    setTimeout(() => setCopyUserSuccess(null), 2000);
    playBeep('success');
  };

  const handleDeleteUser = (uId: string) => {
    if (uId === currentUser.id) {
      setDialog({
        isOpen: true,
        title: lang === 'es' ? 'Acción no permitida' : 'Operation blocked',
        message: lang === 'es' 
          ? 'No puede eliminarse ni revocar la autorización de acceso a su propio usuario activo en este portal.' 
          : 'You cannot revoke authorization or delete your own active user account.',
        severity: 'warning'
      });
      return;
    }

    setDialog({
      isOpen: true,
      title: lang === 'es' ? 'Dar de baja recurso CAPS' : 'Revoke system authorization',
      message: lang === 'es' 
        ? '¿Desea revocar las autorizaciones de acceso de este usuario en el sistema de CAPS Sabatto de forma definitiva?' 
        : 'Do you want to revoke system authorization for this healthcare personnel in CAPS Sabatto?',
      confirmText: lang === 'es' ? 'Dar de Baja' : 'Revoke',
      cancelText: lang === 'es' ? 'Cancelar' : 'Cancel',
      severity: 'danger',
      onConfirm: () => {
        const updatedList = users.filter(u => u.id !== uId);
        onUpdateUsers(updatedList);

        onAppendAudit({
          id: `aud_${Date.now()}`,
          timestamp: new Date().toISOString(),
          userId: currentUser.id,
          userName: currentUser.name,
          userRole: currentUser.role,
          action: 'USER_UPDATE',
          details: `Revocó accesos a CAPS de usuario ID: ${uId}`
        });
        playBeep('success');
      }
    });
  };

  const handleEditUserClick = (u: User) => {
    setEditingUser(u);
    setUName(u.name);
    setUEmail(u.email);
    setURole(u.role);
    if (u.service) setUService(u.service);
    setUPassword(u.password || '');
  };

  const getProductTotalStock = (prod: Product) => {
    return prod.batches.reduce((acc, c) => acc + c.quantity, 0);
  };

  // --- DINAMIC CPM & PLANILLA DE CONSUMO MENSUAL (ÚLTIMOS 6 MESES COLUMNAS) ---
  const months = useMemo(() => {
    const list: { key: string; label: string }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const monthLabel = d.toLocaleString(lang === 'es' ? 'es-AR' : 'en-US', { month: 'short' });
      list.push({
        key: `${yyyy}-${mm}`,
        label: `${monthLabel.toUpperCase()} ${yyyy}`
      });
    }
    return list;
  }, [lang]);

  const monthlyConsumptionData = useMemo(() => {
    return products.map(p => {
      const dynamicQty: Record<string, number> = {};
      months.forEach(m => {
        dynamicQty[m.key] = 0;
      });

      orders
        .filter(o => o.status === 'Entregado')
        .forEach(ord => {
          const yyyyMm = ord.requestDate.substring(0, 7); // "YYYY-MM"
          if (dynamicQty[yyyyMm] !== undefined) {
            ord.items.forEach(itm => {
              if (itm.productId === p.id || itm.productName.toLowerCase() === p.name.toLowerCase()) {
                const qty = itm.approvedQuantity !== undefined ? itm.approvedQuantity : itm.requestedQuantity;
                dynamicQty[yyyyMm] += qty;
              }
            });
          }
        });

      const total = months.reduce((sum, m) => sum + (dynamicQty[m.key] || 0), 0);
      const cpm = total / months.length;
      const currentStock = p.batches.reduce((sum, b) => sum + b.quantity, 0);
      const suggested = Math.max(0, Math.round(cpm * 1.5 - currentStock));

      return {
        product: p,
        dynamicQty,
        total,
        cpm,
        currentStock,
        suggested
      };
    });
  }, [products, orders, months]);

  const filteredConsumptionData = useMemo(() => {
    if (!consumptionSearch.trim()) return monthlyConsumptionData;
    const q = consumptionSearch.toLowerCase();
    return monthlyConsumptionData.filter(row => 
      row.product.name.toLowerCase().includes(q) || 
      row.product.presentation.toLowerCase().includes(q)
    );
  }, [monthlyConsumptionData, consumptionSearch]);

  const handleExportConsumptionCSV = () => {
    const headers = [
      lang === 'es' ? 'Fármaco / Insumo' : 'Item Name',
      lang === 'es' ? 'Presentación' : 'Presentation',
      lang === 'es' ? 'Tipo de Insumo' : 'Product Type',
      ...months.map(m => m.label),
      lang === 'es' ? 'Total (6 Meses)' : 'Total (6 Months)',
      lang === 'es' ? 'CPM (Consumo Promedio M.)' : 'CPM (Avg Monthly Usage)',
      lang === 'es' ? 'Stock Actual' : 'Current Stock',
      lang === 'es' ? 'Sugerencia de Reposición (1.5x CPM - Stock)' : 'Suggested Replenishment'
    ];

    const rows = monthlyConsumptionData.map(row => [
      `"${row.product.name.replace(/"/g, '""')}"`,
      `"${row.product.presentation.replace(/"/g, '""')}"`,
      row.product.productType || 'Med',
      ...months.map(m => row.dynamicQty[m.key]),
      row.total,
      row.cpm.toFixed(1),
      row.currentStock,
      row.suggested
    ]);

    const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Reporte_Consumo_Mensual_CPM_Sabatto_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportSemaforoCSV = () => {
    const headers = [
      lang === 'es' ? 'Fármaco / Insumo' : 'Item Name',
      lang === 'es' ? 'Presentación' : 'Presentation',
      lang === 'es' ? 'Tipo' : 'Type',
      lang === 'es' ? 'Código de Lote' : 'Batch Code',
      lang === 'es' ? 'F. Vencimiento' : 'Expiration Date',
      lang === 'es' ? 'Días Restantes' : 'Days Remaining',
      lang === 'es' ? 'Semáforo Estado' : 'Semaforo Alert',
      lang === 'es' ? 'Estantería' : 'Shelf Detail',
      lang === 'es' ? 'Stock Lote' : 'Batch Quantity'
    ];

    const rows: any[] = [];
    products.forEach(p => {
      p.batches.forEach(b => {
        if (b.quantity > 0) {
          const exp = new Date(b.expirationDate);
          const now = new Date();
          const diffTime = exp.getTime() - now.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          
          let alertLabel = '';
          if (diffDays <= 0) {
            alertLabel = lang === 'es' ? 'VENCIDO (Negro/Gris)' : 'EXPIRED (Black)';
          } else if (diffDays <= 60) {
            alertLabel = lang === 'es' ? 'ROJO (Crítico: <=60 d)' : 'RED (Critical)';
          } else if (diffDays <= 180) {
            alertLabel = lang === 'es' ? 'AMARILLO (Alerta: 61-180 d)' : 'YELLOW (Warning)';
          } else {
            alertLabel = lang === 'es' ? 'VERDE (Óptimo: >180 d)' : 'GREEN (Safe)';
          }

          rows.push([
            `"${p.name.replace(/"/g, '""')}"`,
            `"${p.presentation.replace(/"/g, '""')}"`,
            p.productType || 'Med',
            b.batchCode,
            b.expirationDate,
            diffDays <= 0 ? 0 : diffDays,
            alertLabel,
            p.shelfLetter ? `${p.shelfLetter}-${p.shelfLevel}` : '-',
            b.quantity
          ]);
        }
      });
    });

    const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Reporte_Semafaro_Vencimientos_Sabatto_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- REPORT GENERATORS (Requisitos) ---

  // 1. Consumo por servicio
  const consumptionReport = useMemo(() => {
    const reportData: Record<string, Record<string, number>> = {
      [PredefinedService.GUARDIA]: {},
      [PredefinedService.LABORATORIO]: {},
      [PredefinedService.IRAB]: {},
      [PredefinedService.FARMACIA]: {}
    };

    orders
      .filter(o => o.status === 'Entregado')
      .filter(o => {
        const orderDate = o.requestDate.split('T')[0];
        return orderDate >= startDate && orderDate <= endDate;
      })
      .forEach(ord => {
        const svc = ord.service;
        if (!reportData[svc]) reportData[svc] = {};

        ord.items.forEach(itm => {
          const qty = itm.approvedQuantity !== undefined ? itm.approvedQuantity : itm.requestedQuantity;
          reportData[svc][itm.productName] = (reportData[svc][itm.productName] || 0) + qty;
        });
      });

    return reportData;
  }, [orders, startDate, endDate]);

  // 1b. Demanda Insatisfecha por servicio (Diferencia de solicitado vs entregado)
  const unsatisfiedReport = useMemo(() => {
    const reportData: Record<string, Record<string, { requested: number; delivered: number; unsatisfied: number }>> = {
      [PredefinedService.GUARDIA]: {},
      [PredefinedService.LABORATORIO]: {},
      [PredefinedService.IRAB]: {},
      [PredefinedService.FARMACIA]: {}
    };

    orders
      .filter(o => o.status === 'Entregado' || o.status === 'Preparado')
      .filter(o => {
        const orderDate = o.requestDate.split('T')[0];
        return orderDate >= startDate && orderDate <= endDate;
      })
      .forEach(ord => {
        const svc = ord.service;
        if (!reportData[svc]) {
          reportData[svc] = {};
        }

        ord.items.forEach(itm => {
          const requested = itm.requestedQuantity || 0;
          // Si el estado es "Preparado" o "Entregado" y approvedQuantity existe, esa es la cantidad entregada, sino se asume la solicitada como entregada
          const delivered = itm.approvedQuantity !== undefined ? itm.approvedQuantity : requested;
          const unsatisfied = Math.max(0, requested - delivered);

          if (!reportData[svc][itm.productName]) {
            reportData[svc][itm.productName] = { requested: 0, delivered: 0, unsatisfied: 0 };
          }

          reportData[svc][itm.productName].requested += requested;
          reportData[svc][itm.productName].delivered += delivered;
          reportData[svc][itm.productName].unsatisfied += unsatisfied;
        });
      });

    return reportData;
  }, [orders, startDate, endDate]);

  // 2. Movimientos del historial
  const movementsReport = useMemo(() => {
    const moves: {
      orderId: string;
      service: string;
      requestedBy: string;
      preparedBy?: string;
      itemsCount: number;
      date: string;
      status: string;
    }[] = [];

    orders
      .filter(o => {
        const orderDate = o.requestDate.split('T')[0];
        return orderDate >= startDate && orderDate <= endDate;
      })
      .forEach(ord => {
        moves.push({
          orderId: ord.id,
          service: ord.service,
          requestedBy: ord.requestedBy.userName,
          preparedBy: ord.preparedBy?.userName,
          itemsCount: ord.items.length,
          date: ord.requestDate,
          status: ord.status
        });
      });

    return moves.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [orders, startDate, endDate]);

  // 3. Auditoría ya viene mapeado de auditLogs
  // 4. Próximos a vencer
  const expiringReport = useMemo(() => {
    const rows: {
      productName: string;
      presentation: string;
      batchCode: string;
      expirationDate: string;
      quantity: number;
      daysRemaining: number;
    }[] = [];

    products.forEach(p => {
      p.batches.forEach(b => {
        if (b.quantity > 0) {
          const exp = new Date(b.expirationDate);
          const now = new Date();
          const diffTime = exp.getTime() - now.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          // Vence pronto si es menor a 120 días
          if (diffDays <= 120) {
            rows.push({
              productName: p.name,
              presentation: p.presentation,
              batchCode: b.batchCode,
              expirationDate: b.expirationDate,
              quantity: b.quantity,
              daysRemaining: diffDays
            });
          }
        }
      });
    });

    return rows.sort((a, b) => a.daysRemaining - b.daysRemaining);
  }, [products]);

  // --- SEMÁFORO DE VIDA ÚTIL DE LOTES ---
  const semaforoReportData = useMemo(() => {
    const list: {
      product: Product;
      batch: StockBatch;
      daysRemaining: number;
      isPast: boolean;
      severity: 'Vencido' | 'Rojo' | 'Amarillo' | 'Verde';
    }[] = [];

    products.forEach(p => {
      p.batches.forEach(b => {
        if (b.quantity > 0) {
          const exp = new Date(b.expirationDate);
          const now = new Date();
          const diffTime = exp.getTime() - now.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          const isPast = diffDays <= 0;
          
          let severity: 'Vencido' | 'Rojo' | 'Amarillo' | 'Verde' = 'Verde';
          if (isPast) {
            severity = 'Vencido';
          } else if (diffDays <= 60) {
            severity = 'Rojo';
          } else if (diffDays <= 180) {
            severity = 'Amarillo';
          }

          list.push({
            product: p,
            batch: b,
            daysRemaining: isPast ? 0 : diffDays,
            isPast,
            severity
          });
        }
      });
    });

    return list.sort((a, b) => {
      if (a.isPast && !b.isPast) return -1;
      if (!a.isPast && b.isPast) return 1;
      return a.daysRemaining - b.daysRemaining;
    });
  }, [products]);

  const filteredSemaforoData = useMemo(() => {
    if (semaforoFilter === 'All') return semaforoReportData;
    return semaforoReportData.filter(item => item.severity === semaforoFilter);
  }, [semaforoReportData, semaforoFilter]);

  // 5. Stock crítico bajo
  const lowStockReport = useMemo(() => {
    return products
      .map(p => {
        const total = getProductTotalStock(p);
        return {
          product: p,
          totalStock: total,
          minStock: p.minStock
        };
      })
      .filter(item => item.totalStock < item.minStock)
      .sort((a, b) => a.totalStock - b.totalStock);
  }, [products]);

  // RUNNER TEST INTEGRATION AUTOMATIZADO
  const triggerSelfDiagnostics = () => {
    setTestRan(true);
    const dbState = {
      products,
      orders,
      users,
      auditLogs,
      serviceConfigs
    };
    const testRuns = runIntegrationTests(dbState);
    setTestResults(testRuns.results);
    playBeep('success');
  };

  return (
    <div className="space-y-6">
      
      {/* Tarjeta Directiva Farmacéutico */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-md relative overflow-hidden border border-slate-800">
        <div className="absolute top-0 right-0 transform translate-x-4 -translate-y-4 opacity-10">
          <Grid3X3 size={180} />
        </div>
        <div className="relative z-10 space-y-1">
          <span className="bg-slate-800 border border-slate-700 text-slate-300 text-[10px] px-3 py-1 rounded-full font-mono font-bold uppercase tracking-wider inline-block">
            {lang === 'es' ? 'FARMACÉUTICO / JEFE DE SERVICIO' : 'PHARMACIST / DEPOT DIRECTOR'}
          </span>
          <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight">
            {lang === 'es' ? 'Panel de Control y Auditorías (ADMIN)' : 'Audit Console & Administration'}
          </h2>
          <p className="text-xs text-slate-400 max-w-2xl font-sans leading-relaxed">
            Ingreso y baja de fármacos, alta de profesionales, mapeo de gabinetes y generación física de reportes CAPS.
          </p>
        </div>
      </div>

      {/* Menú de Sub-Acciones Admin */}
      <div className="flex flex-wrap gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-2">
        <button
          onClick={() => setSubTab('catalog')}
          className={`px-4 py-2 text-xs font-bold font-sans rounded-xl transition cursor-pointer ${subTab === 'catalog' ? 'bg-orange-600 text-white shadow-sm' : 'hover:bg-zinc-150 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900'}`}
        >
          {lang === 'es' ? 'Catálogo ABM' : 'Catalog ABM'}
        </button>
        <button
          onClick={() => setSubTab('receipt')}
          className={`px-4 py-2 text-xs font-bold font-sans rounded-xl transition cursor-pointer flex items-center gap-1.5 ${subTab === 'receipt' ? 'bg-orange-600 text-white shadow-sm' : 'hover:bg-zinc-150 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900'}`}
        >
          <span>📥 {lang === 'es' ? 'Recibir Remito Municipal' : 'Receive Municipal Receipt'}</span>
        </button>
        <button
          onClick={() => setSubTab('mapping')}
          className={`px-4 py-2 text-xs font-bold font-sans rounded-xl transition cursor-pointer ${subTab === 'mapping' ? 'bg-orange-600 text-white shadow-sm' : 'hover:bg-zinc-150 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900'}`}
        >
          {lang === 'es' ? 'Asignaciones' : 'Cabine Mapping'}
        </button>
        <button
          onClick={() => setSubTab('adjust')}
          className={`px-4 py-2 text-xs font-bold font-sans rounded-xl transition cursor-pointer ${subTab === 'adjust' ? 'bg-orange-600 text-white shadow-sm' : 'hover:bg-zinc-150 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900'}`}
        >
          {lang === 'es' ? 'Ajuste Stock manual' : 'Inventory Adjusts'}
        </button>
        <button
          onClick={() => setSubTab('users')}
          className={`px-4 py-2 text-xs font-bold font-sans rounded-xl transition cursor-pointer ${subTab === 'users' ? 'bg-orange-600 text-white shadow-sm' : 'hover:bg-zinc-150 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900'}`}
        >
          {lang === 'es' ? 'Gestión de Personal' : 'Staff Accounts'}
        </button>
        <button
          onClick={() => setSubTab('reports')}
          className={`px-4 py-2 text-xs font-bold font-sans rounded-xl transition cursor-pointer ${subTab === 'reports' ? 'bg-orange-600 text-white shadow-sm' : 'hover:bg-zinc-150 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900'}`}
        >
          🗂️ {lang === 'es' ? 'Informes & Tests' : 'Audits & Diagnostics'}
        </button>
        <button
          onClick={() => { setSubTab('history_deliveries'); playBeep('beep'); }}
          className={`px-4 py-2 text-xs font-bold font-sans rounded-xl transition cursor-pointer flex items-center gap-1.5 ${subTab === 'history_deliveries' ? 'bg-orange-600 text-white shadow-sm' : 'hover:bg-zinc-150 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900'}`}
        >
          <CheckCircle2 size={13} />
          <span>{lang === 'es' ? 'Historial de Entregas por Sector' : 'Delivery History by Sector'}</span>
        </button>
        <button
          onClick={() => { setSubTab('monthly_discard'); playBeep('beep'); }}
          className={`px-4 py-2 text-xs font-bold font-sans rounded-xl transition cursor-pointer flex items-center gap-1.5 relative ${
            subTab === 'monthly_discard' 
              ? 'bg-red-650 text-white shadow-sm' 
              : 'hover:bg-zinc-150 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 border border-red-500/20'
          }`}
        >
          <span className="relative flex size-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full size-2 bg-red-500"></span>
          </span>
          <span>{lang === 'es' ? '🚨 Descarte por Vencimiento (Fin de Mes)' : '🚨 Expiry Discard (Month-End)'}</span>
        </button>
      </div>

      {subTab === 'catalog' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in text-xs">
          
          {/* Formulario e Importador Masivo CSV */}
          <div className="space-y-6">
            
            {/* Formulario Manual */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-4 text-xs">
              <h3 className="font-sans font-bold text-sm text-zinc-900 dark:text-zinc-50 border-b border-zinc-100 dark:border-zinc-800 pb-2">
                {editingProduct ? t.editProduct : t.addNewProduct}
              </h3>
              <form onSubmit={handleCreateOrUpdateProduct} className="space-y-4">
                <div className="space-y-1">
                  <label className="font-semibold text-zinc-700 dark:text-zinc-300 block">{t.productName}</label>
                  <input
                    id="admin-pname-input"
                    type="text"
                    required
                    placeholder="Ej: Ibuprofeno 400 mg"
                    value={pName}
                    onChange={(e) => setPName(e.target.value)}
                    className="w-full text-xs p-2 bg-transparent border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-1 focus:ring-orange-500 text-zinc-900 dark:text-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-zinc-700 dark:text-zinc-300 block">{t.presentation}</label>
                  <input
                    id="admin-pres-input"
                    type="text"
                    required
                    placeholder="Ej: Caja x 30 comp."
                    value={pPresentation}
                    onChange={(e) => setPPresentation(e.target.value)}
                    className="w-full text-xs p-2 bg-transparent border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-1 focus:ring-orange-500 text-zinc-900 dark:text-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-zinc-700 dark:text-zinc-300 block">{t.minStockLabel}</label>
                  <input
                    id="admin-pminstock-input"
                    type="number"
                    required
                    value={pMinStock}
                    onChange={(e) => setPMinStock(Number(e.target.value))}
                    className="w-full text-xs p-2 bg-transparent border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-1 focus:ring-orange-500 text-zinc-900 dark:text-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-zinc-700 dark:text-zinc-300 block">Categoría Base</label>
                  <select
                    id="admin-pcat-select"
                    value={pCategory}
                    onChange={(e) => setPCategory(e.target.value as any)}
                    className="w-full text-xs p-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-white"
                  >
                    <option value={PredefinedService.GUARDIA}>{PredefinedService.GUARDIA}</option>
                    <option value={PredefinedService.LABORATORIO}>{PredefinedService.LABORATORIO}</option>
                    <option value={PredefinedService.IRAB}>{PredefinedService.IRAB}</option>
                    <option value={PredefinedService.FARMACIA}>{PredefinedService.FARMACIA}</option>
                    <option value="Compartido">{t.shared}</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-zinc-700 dark:text-zinc-300 block">Tipo de Producto / Clasificación</label>
                  <select
                    id="admin-ptype-select"
                    value={pProductType}
                    onChange={(e) => setPProductType(e.target.value as 'Med' | 'PM')}
                    className="w-full text-xs p-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-white font-semibold"
                  >
                    <option value="Med">💊 Medicamento (Med)</option>
                    <option value="PM">📦 Producto Médico / Ensumo (PM)</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="font-semibold text-zinc-700 dark:text-zinc-300 block">Estantería (A-Z)</label>
                    <select
                      id="admin-pshelfletter-select"
                      value={pShelfLetter}
                      onChange={(e) => setPShelfLetter(e.target.value)}
                      className="w-full text-xs p-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-white"
                    >
                      {Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)).map(letter => (
                        <option key={letter} value={letter}>Estantería {letter}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-zinc-700 dark:text-zinc-300 block">Nivel / Estante</label>
                    <select
                      id="admin-pshelflevel-select"
                      value={pShelfLevel}
                      onChange={(e) => setPShelfLevel(Number(e.target.value))}
                      className="w-full text-xs p-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-white"
                    >
                      {Array.from({ length: 10 }, (_, i) => i + 1).map(num => (
                        <option key={num} value={num}>Estante {num} {num === 1 ? '(Arriba)' : ''}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    id="admin-catalog-submit"
                    type="submit"
                    className="flex-1 py-2 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl cursor-pointer"
                  >
                    {editingProduct ? 'Editar' : 'Registrar Insumo'}
                  </button>
                  {editingProduct && (
                    <button
                      type="button"
                      onClick={() => { setEditingProduct(null); setPName(''); setPPresentation(''); setPMinStock(10); setPShelfLetter('A'); setPShelfLevel(1); }}
                      className="py-2 px-3 border border-zinc-200 dark:border-zinc-800 text-zinc-500 rounded-xl font-bold cursor-pointer"
                    >
                      X
                    </button>
                  )}
                </div>
              </form>
            </div>

            {/* Importador Masivo CSV */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-4">
              <h3 className="font-sans font-bold text-sm text-zinc-900 dark:text-zinc-50 border-b border-zinc-100 dark:border-zinc-800 pb-2 flex items-center gap-1.5">
                <Upload size={14} className="text-orange-500" />
                <span>{lang === 'es' ? 'Importar Catálogo (CSV/Excel)' : 'Bulk CSV/Excel Import'}</span>
              </h3>
              
              <p className="text-[10px] text-zinc-400 leading-relaxed font-sans">
                {lang === 'es' 
                  ? 'Permite cargar insumos masivamente desde un archivo tabulado (CSV / Excel). Columnas: Nombre; Presentación; StockMínimo; Categoría; Lote(opc); Vencimiento(opc); Cantidad(opc); Estantería (opc, ej: A-Z); NivelEstante (opc, ej: 1-10).' 
                  : 'Mass upload medications from a tabbed file. Columns supported: Name; Presentation; MinStock; Category; Batch(opt); Expiration(opt); Qty(opt); Shelf(opt, e.g. B); ShelfLevel(opt, e.g. 3).'}
              </p>

              {csvItems.length === 0 ? (
                // Dropzone
                <div 
                  onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragOver(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) {
                      setCsvFileName(file.name);
                      const reader = new FileReader();
                      reader.onload = (evt) => {
                        if (evt.target?.result) {
                          parseCSVText(evt.target.result as string);
                        }
                      };
                      reader.readAsText(file);
                    }
                  }}
                  className={`border-2 border-dashed rounded-xl p-5 text-center transition ${isDragOver ? 'border-orange-500 bg-orange-50/20' : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'}`}
                >
                  <label htmlFor="csv-file-upload" className="cursor-pointer space-y-2 block">
                    <Upload size={20} className="mx-auto text-zinc-400" />
                    <span className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                      {lang === 'es' ? 'Arrastra tu archivo CSV o haz click aquí' : 'Drag CSV files here or click to browse'}
                    </span>
                    <span className="block text-[9px] text-zinc-400">
                      Formatos soportados: .csv, .txt (delimitado por coma, ; o tabulador)
                    </span>
                    <input 
                      id="csv-file-upload"
                      type="file"
                      accept=".csv,.txt"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setCsvFileName(file.name);
                          const reader = new FileReader();
                          reader.onload = (evt) => {
                            if (evt.target?.result) {
                              parseCSVText(evt.target.result as string);
                            }
                          };
                          reader.readAsText(file);
                        }
                      }}
                    />
                  </label>
                </div>
              ) : (
                // Preview parsed items
                <div className="space-y-3 font-sans">
                  <div className="p-3 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900/30 rounded-xl flex items-center justify-between">
                    <div>
                      <p className="font-bold text-orange-900 dark:text-orange-300 text-xs">
                        {lang === 'es' ? '✓ Insumos detectados' : '✓ Items detected'}
                      </p>
                      <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
                        {csvFileName} ({csvItems.length} {lang === 'es' ? 'filas procesadas' : 'rows processed'})
                      </p>
                    </div>
                    <button 
                      type="button"
                      onClick={() => { setCsvItems([]); setCsvFileName(''); }}
                      className="p-1 hover:bg-orange-100 dark:hover:bg-orange-900/40 rounded-lg text-orange-700 dark:text-orange-300 cursor-pointer"
                    >
                      <X size={14} />
                    </button>
                  </div>

                  {/* Detalle previsualización */}
                  <div className="max-h-[140px] overflow-y-auto border border-zinc-150 dark:border-zinc-800 rounded-xl divide-y divide-zinc-100 dark:divide-zinc-800 pr-1">
                    {csvItems.map((item, idx) => (
                      <div key={idx} className="p-2 text-[10px] flex justify-between items-center bg-zinc-50/40 dark:bg-zinc-950/20">
                        <div className="truncate max-w-[130px]">
                          <p className="font-bold text-zinc-800 dark:text-zinc-200 truncate">{item.name}</p>
                          <p className="text-[9px] text-zinc-400 truncate">{item.presentation}</p>
                        </div>
                        <div className="text-right text-[9px] text-zinc-400 font-mono">
                          <p className="text-orange-600 font-bold">{item.category}</p>
                          <p>{lang === 'es' ? 'Stock Inicial: ' : 'Initial Qty:'} {item.quantity !== undefined ? item.quantity : 25}u.</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button 
                    type="button"
                    onClick={handleImportCSVConfirm}
                    className="w-full py-2 bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-orange-500/10 transition"
                  >
                    <FileSpreadsheet size={13} />
                    <span>{lang === 'es' ? 'Confirmar Importación' : 'Verify & Commit Items'}</span>
                  </button>
                </div>
              )}

              {csvError && (
                <div className="p-2 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 text-red-600 rounded-xl text-[10px] font-semibold">
                  {csvError}
                </div>
              )}
            </div>

          </div>

          {/* Listado para Editar/Eliminar */}
          <div className="lg:col-span-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-zinc-100 dark:border-zinc-800 pb-2">
              <h3 className="font-sans font-bold text-sm text-zinc-900 dark:text-zinc-50">
                {lang === 'es' ? 'Fármacos en Catálogo CAPS' : 'FHC Catalog Entries'} ({filteredCatalogProducts.length})
              </h3>
              
              {/* Botones de filtro de Tipo de Insumo (Catálogo) */}
              <div className="flex items-center bg-zinc-150/50 dark:bg-zinc-950/40 p-0.5 rounded-lg border border-zinc-200/50 dark:border-zinc-800/50">
                <button
                  type="button"
                  onClick={() => setCatalogTypeFilter('All')}
                  className={`px-2 py-1 rounded text-[10px] font-bold cursor-pointer transition ${catalogTypeFilter === 'All' ? 'bg-orange-600 text-white shadow-xs' : 'text-zinc-500'}`}
                >
                  {lang === 'es' ? 'Todos' : 'All'}
                </button>
                <button
                  type="button"
                  onClick={() => setCatalogTypeFilter('Med')}
                  className={`px-2 py-1 rounded text-[10px] font-bold cursor-pointer transition flex items-center gap-1 ${catalogTypeFilter === 'Med' ? 'bg-orange-600 text-white shadow-xs' : 'text-zinc-500'}`}
                >
                  <span>💊</span>
                  <span>{lang === 'es' ? 'Med' : 'Meds'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCatalogTypeFilter('PM')}
                  className={`px-2 py-1 rounded text-[10px] font-bold cursor-pointer transition flex items-center gap-1 ${catalogTypeFilter === 'PM' ? 'bg-orange-600 text-white shadow-xs' : 'text-zinc-500'}`}
                >
                  <span>📦</span>
                  <span>{lang === 'es' ? 'PM' : 'PM'}</span>
                </button>
              </div>
            </div>

            {/* Buscador de Catálogo */}
            <div className="relative">
              <Search className="absolute left-3 inset-y-0 my-auto text-zinc-400" size={14} />
              <input
                id="catalog-search-input"
                type="text"
                placeholder={lang === 'es' ? 'Buscar medicamento o presentación en catálogo...' : 'Search drug or presentation...'}
                value={catalogSearchTerm}
                onChange={(e) => setCatalogSearchTerm(e.target.value)}
                className="w-full text-xs pl-9 pr-8 py-1.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-orange-500/50"
              />
              {catalogSearchTerm && (
                <button
                  type="button"
                  onClick={() => setCatalogSearchTerm('')}
                  className="absolute right-3 inset-y-0 my-auto text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer text-xs font-bold font-sans"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="max-h-[680px] overflow-y-auto pr-1 divide-y divide-zinc-100 dark:divide-zinc-800">
              {filteredCatalogProducts.map(p => (
                <div key={p.id} className="py-2.5 flex justify-between items-center gap-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-zinc-850 dark:text-zinc-100">{p.name}</p>
                      <span className={`inline-flex items-center px-1.5 py-0.2 rounded text-[8px] font-extrabold ${
                        (p.productType || 'Med') === 'PM' 
                          ? 'bg-blue-500/10 text-blue-600 dark:text-blue-450 border border-blue-500/10' 
                          : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-450 border border-emerald-500/10'
                      }`}>
                        {(p.productType || 'Med') === 'PM' ? '📦 PM' : '💊 MED'}
                      </span>
                      {p.shelfLetter && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200/20 font-mono" title={`Estantería ${p.shelfLetter}, Estante ${p.shelfLevel}`}>
                          📍 Estant. {p.shelfLetter}-{p.shelfLevel}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-zinc-400 font-mono">{p.presentation} • Base: {p.category} • Min: {p.minStock}</p>
                    <p className="text-[9px] text-orange-600 font-semibold font-mono">ID: {p.id}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      id={`edit-item-btn-${p.id}`}
                      onClick={() => handleEditProductClick(p)}
                      className="p-1.5 bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-lg cursor-pointer"
                    >
                      <Edit size={14} />
                    </button>
                    <button
                      id={`del-item-btn-${p.id}`}
                      onClick={() => handleDeleteProduct(p.id)}
                      className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg cursor-pointer"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

      {subTab === 'receipt' && (
        <div className="space-y-6 animate-fade-in text-xs font-sans">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Control Panel: File Upload */}
            <div className="space-y-5">
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-4">
                <h3 className="font-sans font-bold text-sm text-zinc-900 dark:text-zinc-50 border-b border-zinc-100 dark:border-zinc-800 pb-2 flex items-center gap-1.5">
                  <Upload size={14} className="text-orange-500" />
                  <span>{lang === 'es' ? 'Subir Planilla / Remito' : 'Upload Municipal Receipt'}</span>
                </h3>
                
                <p className="text-[11px] text-zinc-500 leading-relaxed dark:text-zinc-400">
                  {lang === 'es' 
                    ? 'Sube el remito de egreso de depósito municipal en formato CSV (procesado 100% en tu dispositivo de forma local y gratuita).' 
                    : 'Upload the delivery slip received from the central laboratory as a CSV file (processed 100% locally on your device for free).'}
                </p>

                {/* Drag and Drop Zone */}
                <div 
                  onDragOver={(e) => { e.preventDefault(); setReceiptDragOver(true); }}
                  onDragLeave={() => setReceiptDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setReceiptDragOver(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) {
                      handleReceiptFileUpload(file);
                    }
                  }}
                  className={`border-2 border-dashed rounded-xl p-8 text-center transition ${receiptDragOver ? 'border-orange-500 bg-orange-50/20' : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'}`}
                >
                  <label htmlFor="receipt-file-upload" className="cursor-pointer space-y-3 block">
                    <div className="size-10 bg-orange-500/10 text-orange-600 rounded-full flex items-center justify-center mx-auto mb-1">
                      <Upload size={20} />
                    </div>
                    <span className="block text-xs font-bold text-zinc-700 dark:text-zinc-300">
                      {lang === 'es' ? 'Arrastra remito aquí o haz click' : 'Drag file here or click to browse'}
                    </span>
                    <span className="block text-[9px] text-zinc-400">
                      {lang === 'es' ? 'Únicamente archivos CSV (.csv) • Máx 20MB' : 'CSV files only (.csv) • Max 20MB'}
                    </span>
                    <input 
                      id="receipt-file-upload"
                      type="file"
                      accept=".csv"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          handleReceiptFileUpload(file);
                        }
                      }}
                    />
                  </label>
                </div>

                {/* Botón de Plantilla CSV */}
                <div className="pt-1.5 flex justify-center">
                  <button
                    type="button"
                    onClick={handleDownloadCSVTemplate}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-50 dark:bg-zinc-950/55 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-850 rounded-xl text-[10px] font-bold text-zinc-600 dark:text-zinc-400 transition cursor-pointer"
                  >
                    <FileSpreadsheet size={13} className="text-emerald-500" />
                    <span>{lang === 'es' ? 'Descargar Plantilla CSV' : 'Download CSV Template'}</span>
                  </button>
                </div>

                {isProcessingReceipt && (
                  <div className="p-4 bg-orange-50/40 dark:bg-orange-950/10 border border-orange-100 dark:border-orange-900/10 rounded-xl space-y-3">
                    <div className="flex items-center gap-2">
                      <Activity className="size-4 text-orange-500 animate-spin" />
                      <p className="font-bold text-xs text-orange-850 dark:text-orange-400">
                        {lang === 'es' ? 'Procesando archivo...' : 'Analyzing file in progress...'}
                      </p>
                    </div>
                    <p className="text-[10px] text-zinc-400">
                      {lang === 'es' ? 'Transfiriendo planilla, normalizando lotes y alineando vencimientos...' : 'Recognizing products, matching catalog items, mapping batches...'}
                    </p>
                    <div className="h-1 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full bg-orange-500 animate-pulse rounded-full" style={{ width: '60%' }}></div>
                    </div>
                  </div>
                )}

                {receiptError && (
                  <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/20 text-red-600 dark:text-red-400 rounded-xl text-[10px] font-bold">
                    ⚠️ {receiptError}
                  </div>
                )}

                {receiptSuccessMsg && (
                  <div className="p-3 bg-green-50 dark:bg-green-950/20 border border-green-250 dark:border-green-900/30 text-green-700 dark:text-green-400 rounded-xl text-[10px] font-semibold leading-relaxed">
                    {receiptSuccessMsg}
                  </div>
                )}
              </div>

              {/* CARD DE CARGA MANUAL ALTERNATIVA */}
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-4">
                <h3 className="font-sans font-bold text-sm text-zinc-900 dark:text-zinc-50 border-b border-zinc-100 dark:border-zinc-800 pb-2 flex items-center gap-1.5">
                  <Plus size={14} className="text-orange-500" />
                  <span>{lang === 'es' ? 'Carga Manual de Insumos (Alternativo)' : 'Manual Supply Entry (Alternative)'}</span>
                </h3>

                <p className="text-[11px] text-zinc-500 leading-relaxed dark:text-zinc-400">
                  {lang === 'es' 
                    ? 'Si el remito no se lee correctamente o prefieres cargarlo a mano, selecciona un insumo de la base de datos o crea uno nuevo, y agrégalo a la planilla.' 
                    : 'If the receipt is unreadable or you prefer to load manually, select a supply from the database or create a new one, then add it to the sheet.'}
                </p>

                <form onSubmit={handleAddManualReceiptItem} className="space-y-3">
                  {/* Selector de Producto */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider block">
                      {lang === 'es' ? 'Seleccionar Insumo del Catálogo' : 'Select Catalog Supply'}
                    </label>
                    <select
                      value={manualProdId}
                      onChange={(e) => {
                        const val = e.target.value;
                        setManualProdId(val);
                        if (val) {
                          const p = products.find(prod => prod.id === val);
                          if (p) {
                            setManualName(p.name);
                            setManualPresentation(p.presentation);
                          }
                        } else {
                          setManualName('');
                          setManualPresentation('');
                        }
                      }}
                      className="w-full text-xs p-2.5 border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-orange-500"
                    >
                      <option value="">🆕 {lang === 'es' ? '--- CREAR NUEVO INSUMO NO REGISTRADO ---' : '--- CREATE NEW UNREGISTERED SUPPLY ---'}</option>
                      {[...products].sort((a,b) => a.name.localeCompare(b.name)).map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.presentation})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Campos si es nuevo o previsualización si es existente */}
                  {!manualProdId ? (
                    <div className="space-y-3 p-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-150 dark:border-zinc-800 rounded-xl animate-fade-in">
                      <span className="text-[9px] font-bold uppercase text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded-md">
                        {lang === 'es' ? 'Nuevo Insumo' : 'New Supply'}
                      </span>
                      <div className="space-y-2">
                        <div className="space-y-0.5">
                          <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">
                            {lang === 'es' ? 'Nombre del Medicamento / Insumo' : 'Medication / Supply Name'}
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="Ej. Paracetamol 500mg, Algodón Hidrófilo"
                            value={manualName}
                            onChange={(e) => setManualName(e.target.value)}
                            className="w-full text-xs p-2 border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 text-zinc-850 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-orange-500"
                          />
                        </div>
                        <div className="space-y-0.5">
                          <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">
                            {lang === 'es' ? 'Presentación' : 'Presentation'}
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="Ej. Comprimidos x30, Pote 100g, Ampollas x5"
                            value={manualPresentation}
                            onChange={(e) => setManualPresentation(e.target.value)}
                            className="w-full text-xs p-2 border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 text-zinc-850 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-orange-500"
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/10 rounded-xl">
                      <span className="text-[9px] font-bold uppercase text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded-md">
                        {lang === 'es' ? 'Existente en Catálogo' : 'Existing in Catalog'}
                      </span>
                      <p className="font-bold text-zinc-800 dark:text-zinc-200 mt-1.5 text-xs">{manualName}</p>
                      <p className="text-[10px] text-zinc-500 dark:text-zinc-400">{manualPresentation}</p>
                    </div>
                  )}

                  {/* Cantidad, Lote y Vencimiento */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="space-y-0.5">
                      <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">
                        {lang === 'es' ? 'Cantidad a Ingresar' : 'Quantity'}
                      </label>
                      <input
                        type="number"
                        min="1"
                        required
                        value={manualQty}
                        onChange={(e) => setManualQty(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-full text-xs p-2 border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 text-zinc-850 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-orange-500 font-mono font-bold"
                      />
                    </div>

                    <div className="space-y-0.5">
                      <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">
                        Código de Lote
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Ej. L-1025"
                        value={manualBatch}
                        onChange={(e) => setManualBatch(e.target.value)}
                        className="w-full text-xs p-2 border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 text-zinc-850 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-orange-500 font-mono uppercase"
                      />
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">
                      {lang === 'es' ? 'Fecha de Vencimiento' : 'Expiration Date'}
                    </label>
                    <input
                      type="date"
                      required
                      value={manualExpir}
                      onChange={(e) => setManualExpir(e.target.value)}
                      className="w-full text-xs p-2 border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 text-zinc-850 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-orange-500 font-mono"
                    />
                  </div>

                  {manualFormError && (
                    <div className="p-2.5 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/10 text-red-500 text-[10px] font-bold rounded-lg leading-tight">
                      ⚠️ {manualFormError}
                    </div>
                  )}

                  <button
                    type="submit"
                    className="w-full py-2.5 px-4 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer text-xs"
                  >
                    <Plus size={14} />
                    <span>{lang === 'es' ? 'Agregar a Vista Previa' : 'Add to Preview'}</span>
                  </button>
                </form>
              </div>
            </div>

            {/* Results Preview and Confirmation Panel */}
            <div className="lg:col-span-2">
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-2">
                  <div className="space-y-0.5">
                    <h3 className="font-sans font-bold text-sm text-zinc-900 dark:text-zinc-50 flex items-center gap-1.5">
                      <FileCheck2 size={15} className="text-emerald-500" />
                      <span>{lang === 'es' ? 'Previsualización de Remito Detectado' : 'Detected delivery slip summary'}</span>
                    </h3>
                    {receiptFileName && (
                      <p className="text-[9px] font-mono text-zinc-400">{receiptFileName}</p>
                    )}
                  </div>
                  {receiptItems.length > 0 && (
                    <span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded-full font-mono">
                      {receiptItems.length} {lang === 'es' ? 'unids' : 'items'}
                    </span>
                  )}
                </div>

                {receiptItems.length === 0 ? (
                  <div className="py-12 text-center text-zinc-400 space-y-2">
                    <p className="font-bold text-xs">
                      {lang === 'es' ? 'Ningún remito cargado aún' : 'No document processed yet'}
                    </p>
                    <p className="text-[10px] max-w-sm mx-auto">
                      {lang === 'es' 
                        ? 'Sube la foto o planilla en el panel lateral para iniciar el procesamiento automático utilizando el modelo Gemini.' 
                        : 'Upload the deliveries worksheet or screenshot in the left card to parse with high fidelity.'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="overflow-x-auto border border-zinc-100 dark:border-zinc-800 rounded-xl">
                      <table className="w-full text-left font-sans text-[11px] border-collapse">
                        <thead>
                          <tr className="bg-zinc-50 dark:bg-zinc-950 text-zinc-500 font-bold border-b border-zinc-150 dark:border-zinc-800/60">
                            <th className="py-2.5 px-3">{lang === 'es' ? 'Artículo / Fármaco' : 'Item Label'}</th>
                            <th className="py-2.5 px-2">{lang === 'es' ? 'Presentación' : 'Presentation'}</th>
                            <th className="py-2.5 px-2">{lang === 'es' ? 'Cant. a Ingresar' : 'Received Qty'}</th>
                            <th className="py-2.5 px-2 font-mono">Lote</th>
                            <th className="py-2.5 px-2 font-mono font-sans">Vto</th>
                            <th className="py-2.5 px-3 text-right">{lang === 'es' ? 'Asociar / Emparejar con Catálogo' : 'Map with Catalog'}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
                          {receiptItems.map((item, idx) => {
                            return (
                              <tr key={idx} className="hover:bg-zinc-50/55 dark:hover:bg-zinc-950/20 transition">
                                <td className="py-2.5 px-3 font-bold text-zinc-800 dark:text-zinc-200">
                                  {item.name}
                                </td>
                                <td className="py-2.5 px-2 text-zinc-500 font-medium">
                                  {item.presentation}
                                </td>
                                <td className="py-2.5 px-2 font-bold text-orange-600 font-mono">
                                  +{item.quantity} u
                                </td>
                                <td className="py-2.5 px-2 font-mono font-medium text-indigo-500">
                                  {item.batchCode}
                                </td>
                                <td className="py-2.5 px-2 font-mono text-zinc-400">
                                  {item.expirationDate}
                                </td>
                                <td className="py-2.5 px-3 text-right">
                                  <div className="flex flex-col gap-1 items-end">
                                    <select
                                      id={`receipt-item-select-${idx}`}
                                      value={item.productId || ""}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setReceiptItems(prev => prev.map((itm, i) => i === idx ? { ...itm, productId: val || undefined } : itm));
                                      }}
                                      className="text-[10px] py-1 px-1.5 border border-zinc-200 dark:border-zinc-800 rounded bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-100 max-w-[200px] truncate focus:outline-none focus:ring-1 focus:ring-orange-500 font-sans"
                                    >
                                      <option value="">🆕 {lang === 'es' ? 'Crear como nuevo insumo' : 'Create as new supply'}</option>
                                      {products.map(p => (
                                        <option key={p.id} value={p.id}>
                                          {p.name} ({p.presentation})
                                        </option>
                                      ))}
                                    </select>
                                    
                                    {item.productId ? (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-bold bg-green-500/10 text-green-500" title="Coincide con un artículo en tu catálogo de farmacia">
                                        <span className="size-1 bg-green-500 rounded-full"></span>
                                        {lang === 'es' ? 'Emparejado (Suma Stock)' : 'Matched (Increments Stock)'}
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-bold bg-amber-500/10 text-amber-500" title="Se creará un nuevo artículo en tu catálogo con este lote">
                                        <span className="size-1 bg-amber-500 rounded-full animate-pulse"></span>
                                        🆕 {lang === 'es' ? 'Nuevo Insumo' : 'New Insumo'}
                                      </span>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex flex-col sm:flex-row justify-between items-center bg-zinc-50 dark:bg-zinc-950/40 p-3 rounded-xl border border-zinc-150/40 dark:border-zinc-850 gap-3">
                      <div className="text-[10px] text-zinc-500">
                        {lang === 'es' 
                          ? 'Al presionar "Ingresar Stock", los insumos señalados como "Existente" añadirán esta tanda de lote y cantidad bajo el estándar FEFO. Los insumos "Nuevos" se agregarán al catálogo automáticamente.' 
                          : 'Validating and committing imports merges quantities and batch profiles keeping FEFO logs aligned.'}
                      </div>

                      <div className="flex gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => { setReceiptItems([]); setReceiptFileName(''); }}
                          className="py-2 px-3 hover:bg-zinc-150 dark:hover:bg-zinc-800 text-zinc-500 font-bold font-sans rounded-xl cursor-pointer"
                        >
                          {lang === 'es' ? 'Limpiar' : 'Discard'}
                        </button>
                        <button
                          type="button"
                          onClick={handleConfirmReceiptImport}
                          className="py-2 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold font-sans rounded-xl shadow-md cursor-pointer flex items-center gap-1.5 transition"
                        >
                          <FileCheck2 size={14} />
                          <span>{lang === 'es' ? 'Ingresar Stock a Depósito' : 'Import Stock now'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {subTab === 'mapping' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fade-in text-xs">
          
          {/* Configuración de Día semanal fijo para pedidos de CAPS */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100 border-b pb-2">
              📅 {lang === 'es' ? 'Repliegue Semanal de Pedidos' : 'Replenish Windows'}
            </h3>
            <p className="text-[11px] text-zinc-400">
              Configura por cada CAPS qué día deben armar sus pedidos periódicos recurrentes:
            </p>

            <div className="space-y-4 pt-2">
              {localConfigs.map((c, cIdx) => (
                <div key={cIdx} className="space-y-1.5 p-3 bg-zinc-50 dark:bg-zinc-850/20 border border-zinc-200/50 dark:border-zinc-800 rounded-xl">
                  <div className="flex justify-between items-center">
                    <strong className="text-zinc-800 dark:text-zinc-200 font-sans text-xs">{c.serviceName}</strong>
                    <button
                      onClick={() => handleConfigDailyToggle(c.serviceName)}
                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold font-mono ${c.allowDaily ? 'bg-orange-100 text-orange-850' : 'bg-zinc-100 text-zinc-500'}`}
                    >
                      {c.allowDaily ? (lang === 'es' ? 'DIARIO ADMITIDO' : 'DAILY ALLOWED') : (lang === 'es' ? 'Fijo Único' : 'Fixed Only')}
                    </button>
                  </div>

                  <div className="pt-1.5 flex items-center gap-2">
                    <span className="text-[10px] text-zinc-400 font-mono">Día asignado:</span>
                    <select
                      id={`config-day-select-${c.serviceName}`}
                      value={c.orderDay}
                      onChange={(e) => handleConfigDayChange(c.serviceName, e.target.value)}
                      className="text-xs p-1 border border-zinc-200 dark:border-zinc-800 rounded-lg dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200"
                    >
                      <option value="1">{lang === 'es' ? 'Lunes' : 'Monday'}</option>
                      <option value="2">{lang === 'es' ? 'Martes' : 'Tuesday'}</option>
                      <option value="3">{lang === 'es' ? 'Miércoles' : 'Wednesday'}</option>
                      <option value="4">{lang === 'es' ? 'Jueves' : 'Thursday'}</option>
                      <option value="5">{lang === 'es' ? 'Viernes' : 'Friday'}</option>
                      <option value="6">{lang === 'es' ? 'Sábado' : 'Saturday'}</option>
                      <option value="0">{lang === 'es' ? 'Domingo' : 'Sunday'}</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Mapeo de Muchas a Muchas (Requisito) */}
          <div className="md:col-span-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100 border-b pb-2">
              🔗 {lang === 'es' ? 'Visibilidad Cruzada de Insumos' : 'Service Stock Mapping'}
            </h3>
            <p className="text-[11px] text-zinc-400 mb-2">
              Asigna qué gabinetes están habilitados para ver y pedir cada medicamento del inventario central. Los marcados como compartidos se enlazan automáticamente.
            </p>

            {/* Buscador de Visibilidad Cruzada */}
            <div className="relative">
              <Search className="absolute left-3 inset-y-0 my-auto text-zinc-400" size={13} />
              <input
                id="mapping-search-input"
                type="text"
                placeholder={lang === 'es' ? 'Buscar medicamento para vincular...' : 'Search drug to map...'}
                value={mappingSearchTerm}
                onChange={(e) => setMappingSearchTerm(e.target.value)}
                className="w-full text-[11px] pl-8.5 pr-8 py-1.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-orange-500/50"
              />
              {mappingSearchTerm && (
                <button
                  type="button"
                  onClick={() => setMappingSearchTerm('')}
                  className="absolute right-3 inset-y-0 my-auto text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer text-[10px]"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="max-h-[360px] overflow-y-auto pr-1 divide-y divide-zinc-200 dark:divide-zinc-850">
              {filteredMappingProducts.map(p => (
                <div key={p.id} className="py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-zinc-800 dark:text-zinc-200">{p.name}</p>
                    <p className="text-[10px] text-zinc-400 font-mono">{p.presentation} • Base: {p.category}</p>
                  </div>

                  {/* Checkboxes de muchas a muchas */}
                  <div className="flex gap-2 shrink-0">
                    {[PredefinedService.GUARDIA, PredefinedService.LABORATORIO, PredefinedService.IRAB, PredefinedService.FARMACIA].map(svc => {
                      const allowedList = Array.isArray(p.allowedServices) 
                        ? p.allowedServices 
                        : (p.category as string) === 'Compartido'
                          ? [PredefinedService.GUARDIA, PredefinedService.LABORATORIO, PredefinedService.IRAB, PredefinedService.FARMACIA]
                          : [p.category].filter((c): c is PredefinedService => (c as string) !== 'Compartido');
                      const isChecked = allowedList.includes(svc);
                      return (
                        <button
                          key={svc}
                          id={`map-toggle-${p.id}-${svc}`}
                          onClick={() => handleToggleMapping(p.id, svc)}
                          className={`px-2.5 py-1 text-[10px] font-bold font-mono rounded-lg transition-all border cursor-pointer ${
                            isChecked 
                              ? 'bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-800/40 font-extrabold shadow-sm' 
                              : 'bg-transparent border-zinc-200 text-zinc-400 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-850 hover:text-zinc-650'
                          }`}
                        >
                          {isChecked ? '✔ ' : '+ '} {svc}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

      {subTab === 'adjust' && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-6 text-xs animate-fade-in">
          
          <div>
            <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
              ⚡ {lang === 'es' ? 'Ajustes de Inventario por Auditoría (Reconteo)' : 'Depot Reconteo / Manual Adjust'}
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              Permite corregir discrepancias después de un conteo del CAPS. Puede modificar el contenido por lote exacto o generar códigos de lotes nuevos.
            </p>
          </div>

          <form onSubmit={handleManualAdjust} className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end bg-zinc-50 dark:bg-zinc-950/40 border border-zinc-200/50 p-4 rounded-xl">
            <div className="space-y-1 md:col-span-1.5">
              <label className="font-semibold text-zinc-600 block">{lang === 'es' ? 'Filtrar Opciones' : 'Filter Options'}</label>
              <div className="relative">
                <Search className="absolute left-2 inset-y-0 my-auto text-zinc-400" size={12} />
                <input
                  type="text"
                  placeholder={lang === 'es' ? 'Escribe droga...' : 'Type drug name...'}
                  value={adjustSearchTerm}
                  onChange={(e) => setAdjustSearchTerm(e.target.value)}
                  className="w-full pl-6 pr-6 py-1.5 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-lg text-zinc-800 dark:text-white text-[11px] focus:ring-1 focus:ring-orange-500/50 outline-none"
                />
                {adjustSearchTerm && (
                  <button
                    type="button"
                    onClick={() => setAdjustSearchTerm('')}
                    className="absolute right-2.5 inset-y-0 my-auto text-zinc-400 hover:text-zinc-600 cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-1 md:col-span-1.5">
              <label className="font-semibold text-zinc-600 block">{lang === 'es' ? 'Insumo Central' : 'Product'}</label>
              <select
                id="adjust-product-select"
                value={adjustProductId}
                onChange={(e) => {
                  setAdjustProductId(e.target.value);
                  setAdjustBatchCode('');
                }}
                className="w-full p-2 bg-white dark:bg-zinc-900 border border-zinc-200 rounded-lg text-zinc-800 dark:text-white"
              >
                <option value="">{lang === 'es' ? 'Seleccionar...' : 'Select item'}</option>
                {filteredAdjustProducts.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.presentation})</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-zinc-650 block">Lote (Código)</label>
              <input
                id="adjust-batch-input"
                type="text"
                placeholder="Ej: L-402A"
                required
                value={adjustBatchCode}
                onChange={(e) => setAdjustBatchCode(e.target.value)}
                className="w-full p-2 bg-white dark:bg-zinc-900 border border-zinc-200 rounded-lg text-zinc-800 dark:text-white"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-zinc-655 block">Vencimiento (Exp.)</label>
              <input
                id="adjust-exp-input"
                type="date"
                value={adjustExpiration}
                onChange={(e) => setAdjustExpiration(e.target.value)}
                className="w-full p-2 bg-white dark:bg-zinc-900 border border-zinc-200 rounded-lg text-zinc-800 dark:text-white font-mono text-[11px]"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-zinc-655 block">Nueva Cantidad</label>
              <input
                id="adjust-qty-input"
                type="number"
                required
                placeholder="0"
                value={adjustQuantity}
                onChange={(e) => setAdjustQuantity(e.target.value)}
                className="w-full p-2 bg-white dark:bg-zinc-900 border border-zinc-200 rounded-lg text-zinc-800 dark:text-white font-mono"
              />
            </div>

            <button
              id="adjust-submit-btn"
              type="submit"
              disabled={!adjustProductId}
              className="py-2.5 px-4 bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-lg flex items-center justify-center gap-1 cursor-pointer disabled:opacity-40"
            >
              <Save size={14} />
              <span>{t.manualAdjustConfirm}</span>
            </button>
          </form>

          {/* Visualizar lotes del producto seleccionado para guiarse */}
          {selectedProductForAdjust && (
            <div id="adjust-visual-aid" className="p-4 bg-indigo-50/30 border border-indigo-200 rounded-xl space-y-2">
              <h4 className="font-bold text-xs text-indigo-900">
                Lotes actuales registrados para: {selectedProductForAdjust.name}
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 font-mono text-[10px]">
                {selectedProductForAdjust.batches.map((b, bIdx) => (
                  <button
                    key={bIdx}
                    type="button"
                    onClick={() => {
                      setAdjustBatchCode(b.batchCode);
                      setAdjustExpiration(b.expirationDate);
                      setAdjustQuantity(String(b.quantity));
                    }}
                    className="p-2 border border-indigo-200/50 rounded-lg bg-white/50 text-left hover:bg-white text-zinc-800 dark:text-zinc-250 flex justify-between items-center cursor-pointer"
                  >
                    <span>Lote: <strong>{b.batchCode}</strong> <span className="text-[9px] text-zinc-400">({b.expirationDate})</span></span>
                    <strong className="text-indigo-700 text-xs">[{b.quantity}]</strong>
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>
      )}

      {subTab === 'users' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in text-xs">
          
          <div className="bg-white dark:bg-zinc-900 border border-zinc-250 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-50 border-b pb-2">
              {editingUser ? 'Modificar Personal' : t.addNewUser}
            </h3>
            <form onSubmit={handleCreateOrUpdateUser} className="space-y-4">
              <div className="space-y-1">
                <label className="font-semibold text-zinc-650 block">{t.userName}</label>
                <input
                  id="user-name-input"
                  type="text"
                  required
                  placeholder="Dra. Analia Blanco"
                  value={uName}
                  onChange={(e) => setUName(e.target.value)}
                  className="w-full p-2 bg-transparent border border-zinc-200 rounded-lg text-zinc-900 dark:text-white"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-zinc-650 block">E-mail de Acceso</label>
                <input
                  id="user-email-input"
                  type="email"
                  required
                  placeholder="analia@caps.com"
                  value={uEmail}
                  onChange={(e) => setUEmail(e.target.value)}
                  className="w-full p-2 bg-transparent border border-zinc-200 rounded-lg text-zinc-900 dark:text-white"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-zinc-650 block">Rol / Permisos</label>
                <select
                  id="user-role-select"
                  value={uRole}
                  onChange={(e) => setURole(e.target.value as any)}
                  className="w-full p-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 rounded-lg text-zinc-900 dark:text-white"
                >
                  <option value={Role.ENFERMERO}>{t.enfermero}</option>
                  <option value={Role.TECNICO}>{t.tecnico}</option>
                  <option value={Role.FARMACEUTICO}>{t.farmaceutico}</option>
                  <option value={Role.DIRECTOR}>{t.director}</option>
                </select>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="font-semibold text-zinc-650 block">Contraseña de Acceso</label>
                  <button
                    type="button"
                    onClick={() => setUPassword(Math.floor(100000 + Math.random() * 900000).toString())}
                    className="text-[10px] text-orange-600 hover:underline font-bold"
                  >
                    🎲 Generar
                  </button>
                </div>
                <input
                  id="user-password-input"
                  type="text"
                  placeholder="Por defecto: 123456"
                  value={uPassword}
                  onChange={(e) => setUPassword(e.target.value)}
                  className="w-full p-2 bg-transparent border border-zinc-200 rounded-lg text-zinc-900 dark:text-white font-mono"
                />
              </div>

              {uRole === Role.ENFERMERO && (
                <div className="space-y-1">
                  <label className="font-semibold text-zinc-650 block">Sector Asignado (Marta Gómez)</label>
                  <select
                    id="user-service-select"
                    value={uService}
                    onChange={(e) => setUService(e.target.value as any)}
                    className="w-full p-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 rounded-lg text-zinc-900 dark:text-white"
                  >
                    <option value={PredefinedService.GUARDIA}>{PredefinedService.GUARDIA}</option>
                    <option value={PredefinedService.LABORATORIO}>{PredefinedService.LABORATORIO}</option>
                    <option value={PredefinedService.IRAB}>{PredefinedService.IRAB}</option>
                    <option value={PredefinedService.FARMACIA}>{PredefinedService.FARMACIA}</option>
                  </select>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  id="user-save-btn"
                  type="submit"
                  className="flex-1 py-2 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl cursor-pointer"
                >
                  {editingUser ? 'Editar' : 'Registrar'}
                </button>
                {editingUser && (
                  <button
                    type="button"
                    onClick={() => { setEditingUser(null); setUName(''); setUEmail(''); }}
                    className="py-2 px-3 border border-zinc-200 text-zinc-500 rounded-xl cursor-pointer"
                  >
                    X
                  </button>
                )}
              </div>
            </form>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-4">
              <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-50 border-b pb-2 flex justify-between items-center">
                <span>👨‍⚕️ {lang === 'es' ? 'Personal Habilitado en CAPS' : 'Active Personnel Nodes'} ({users.length})</span>
                <span className="text-[10px] text-zinc-400 font-mono font-normal">Clave por defecto si no se define: 123456</span>
              </h3>

              <div className="divide-y divide-zinc-100 dark:divide-zinc-800 max-h-[350px] overflow-y-auto pr-1">
                {users.map(u => (
                  <div key={u.id} className="py-2.5 flex justify-between items-center gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-zinc-805 dark:text-zinc-50">{u.name}</p>
                        {u.password && (
                          <span className="text-[9px] bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-450 px-1.5 py-0.5 rounded font-mono">Clave Personal</span>
                        )}
                      </div>
                      <p className="text-[10px] text-zinc-400 font-mono mt-0.5">
                        {u.email} • <span className="uppercase text-orange-600/90 font-bold">{u.role}</span>
                        {u.service ? ` (${u.service})` : ''} • Clave: <span className="font-semibold text-zinc-600 dark:text-zinc-300">{u.password || '123456 (Defecto)'}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        title="Copiar credenciales completas"
                        onClick={() => copyCredentials(u)}
                        className={`p-1.5 rounded-lg cursor-pointer transition ${copyUserSuccess === u.id ? 'bg-green-150 text-green-700 dark:bg-green-950/40 dark:text-green-400' : 'bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-805 dark:text-zinc-300 text-zinc-650'}`}
                      >
                        {copyUserSuccess === u.id ? (
                          <span className="font-bold text-[10px] px-0.5">✓ Copiado</span>
                        ) : (
                          <Copy size={13} />
                        )}
                      </button>
                      <button
                        id={`edit-user-btn-${u.id}`}
                        onClick={() => handleEditUserClick(u)}
                        className="p-1.5 bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-805 dark:text-zinc-300 text-zinc-650 rounded-lg cursor-pointer"
                      >
                        <Edit size={13} />
                      </button>
                      <button
                        id={`del-user-btn-${u.id}`}
                        onClick={() => handleDeleteUser(u.id)}
                        className="p-1.5 bg-red-50 text-red-650 rounded-lg cursor-pointer hover:bg-red-100"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* CARD DE PUESTA EN MARCHA (MODO PRODUCCIÓN) */}
            <div className="bg-gradient-to-br from-orange-50/40 to-white dark:from-zinc-900/40 dark:to-zinc-900 border border-orange-500/20 dark:border-orange-500/10 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-orange-100 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 rounded-xl">
                  <AlertTriangle size={20} />
                </div>
                <div className="space-y-1">
                  <h4 className="font-bold text-zinc-900 dark:text-zinc-50 text-sm">
                    ⚠️ Depuración de Base de Datos para Producción
                  </h4>
                  <p className="text-zinc-500 dark:text-zinc-400 leading-relaxed text-[11px]">
                    Si el CAPS ya tiene cargado su <strong>personal actual</strong> y desea inaugurar el sistema de forma 100% real, active esta función para limpiar por completo el stock de prueba inicial (lotes simulados FEFO), pedidos históricos y auditorías de demostración. 
                  </p>
                  <p className="text-zinc-400 dark:text-zinc-500 text-[10px] mt-1">
                    <em>Nota: Se conservará intacto el catálogo de 55 fármacos e insumos críticos y la lista de personal CAPS autorizada. El sistema quedará con stock general en cero, listo para el primer remito oficial.</em>
                  </p>
                </div>
              </div>

              <div className="flex justify-end pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => {
                    setDialog({
                      isOpen: true,
                      title: '¿Confirmar Inicio en Modo de Producción?',
                      message: 'Esta acción es irreversible. Se eliminarán todos los pedidos ficticios, se vaciarán todos los lotes de stock simulados (todos los insumos pasarán a 0 unidades), y se limpiará la bitácora de auditorías para iniciar de forma impecable con datos 100% reales de su CAPS. Se mantendrán su catálogo de medicamentos y su personal actual.',
                      confirmText: 'Sí, limpiar y empezar de cero',
                      cancelText: 'Cancelar',
                      severity: 'warning',
                      onConfirm: () => {
                        if (onResetProductionMode) {
                          onResetProductionMode();
                        }
                      }
                    });
                  }}
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl transition duration-150 shadow-sm shadow-orange-500/15 cursor-pointer text-xs"
                >
                  🚀 Vaciar Stock de Prueba & Iniciar CAPS Real
                </button>
              </div>
            </div>
          </div>

        </div>
      )}

      {subTab === 'reports' && (
        <div className="space-y-6 animate-fade-in">
          
          {/* Barra de Filtros Temporal CAPS con Membrete Regional Sabatto */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 rounded-2xl shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
            <div className="space-y-3">
              <div>
                <span className="text-[9px] font-bold text-orange-600 bg-orange-50 dark:bg-orange-950/30 px-2 py-0.5 rounded uppercase tracking-wider font-mono">Control de Audits Regional</span>
                <h4 className="font-bold text-zinc-800 dark:text-zinc-100 text-xs mt-1">Filtro de Fechas & Membrete Oficial y Firma CAPS "Farmacia Sabatto"</h4>
                <p className="text-[10px] text-zinc-400">Seleccione el período de auditoría CAPS para filtrar la grilla interactiva y exportar a PDF.</p>
              </div>
              
              <div className="flex flex-wrap items-center gap-3">
                <div className="space-y-0.5">
                  <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider block">Desde (Start)</label>
                  <input 
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="p-1.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs text-zinc-800 dark:text-zinc-100 font-mono focus:ring-1 focus:ring-orange-500 cursor-pointer"
                  />
                </div>
                <div className="space-y-0.5">
                  <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider block">Hasta (End)</label>
                  <input 
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="p-1.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs text-zinc-800 dark:text-zinc-100 font-mono focus:ring-1 focus:ring-orange-500 cursor-pointer"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col justify-end gap-2 text-right">
              <button
                id="export-caps-pdf-btn"
                onClick={handlePrintPDFReport}
                className="px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-orange-500/10 cursor-pointer transition transform active:scale-95 duration-100"
              >
                <FileText size={13} />
                <span>Exportar PDF CAPS</span>
              </button>
              <span className="text-[9px] text-zinc-400 font-mono italic">Establece firma digital de: {currentUser.name}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 text-xs">
          
          {/* Menú de Reportes */}
          <div className="lg:col-span-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm h-fit space-y-1.5">
            <span className="text-[10px] uppercase font-bold text-zinc-400 font-mono block px-2 pb-1 tracking-wider border-b border-zinc-100 dark:border-zinc-800 mb-2">Audits List</span>
            
            <button
              id="report-btn-consumption"
              onClick={() => setReportType('consumption')}
              className={`w-full text-left px-3 py-2 text-[11px] font-sans rounded-xl font-bold transition flex items-center gap-2 cursor-pointer ${reportType === 'consumption' ? 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 border border-indigo-500/10' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}
            >
              <PieChart size={14} />
              <span>{t.reportConsumo}</span>
            </button>
            <button
              id="report-btn-movements"
              onClick={() => setReportType('movements')}
              className={`w-full text-left px-3 py-2 text-[11px] font-sans rounded-xl font-bold transition flex items-center gap-2 cursor-pointer ${reportType === 'movements' ? 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 border border-indigo-500/10' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}
            >
              <TrendingUp size={14} />
              <span>{t.reportMovimientos}</span>
            </button>
            <button
              id="report-btn-audit"
              onClick={() => setReportType('audit')}
              className={`w-full text-left px-3 py-2 text-[11px] font-sans rounded-xl font-bold transition flex items-center gap-2 cursor-pointer ${reportType === 'audit' ? 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 border border-indigo-500/10' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}
            >
              <FileText size={14} />
              <span>{t.reportAuditoria}</span>
            </button>
            <button
              id="report-btn-expiring"
              onClick={() => setReportType('expiring')}
              className={`w-full text-left px-3 py-2 text-[11px] font-sans rounded-xl font-bold transition flex items-center gap-2 cursor-pointer ${reportType === 'expiring' ? 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 border border-indigo-500/10' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}
            >
              <Calendar size={14} />
              <span>{t.reportExpiring}</span>
            </button>
            <button
              id="report-btn-low"
              onClick={() => setReportType('low_stock')}
              className={`w-full text-left px-3 py-2 text-[11px] font-sans rounded-xl font-bold transition flex items-center gap-2 cursor-pointer ${reportType === 'low_stock' ? 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 border border-indigo-500/10' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}
            >
              <AlertTriangle size={14} />
              <span>{t.reportCritical}</span>
            </button>

            <button
              id="report-btn-unsatisfied"
              onClick={() => setReportType('unsatisfied')}
              className={`w-full text-left px-3 py-2 text-[11px] font-sans rounded-xl font-bold transition flex items-center gap-2 cursor-pointer ${reportType === 'unsatisfied' ? 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 border border-indigo-500/10' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}
            >
              <AlertTriangle size={14} className="text-red-500 dark:text-red-400" />
              <span>{t.reportUnsatisfied}</span>
            </button>

            <div className="border-t border-zinc-100 dark:border-zinc-800 mt-3 pt-3">
              <button
                id="report-btn-tests"
                onClick={() => setReportType('tests')}
                className={`w-full text-left px-3 py-2 text-[11px] font-sans rounded-xl font-bold text-orange-600 dark:text-orange-400 bg-orange-50/50 dark:bg-orange-950/20 border border-orange-500/10 transition flex items-center gap-2 cursor-pointer`}
              >
                <Terminal size={14} />
                <span>{t.testRunner} (Diagnostics)</span>
              </button>
            </div>
          </div>

          {/* Grilla / Tabulación de Reportes */}
          <div className="lg:col-span-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm min-h-[350px] space-y-4 transition-colors">
            
            {reportType === 'consumption' && (
              <div className="space-y-6 animate-fade-in text-xs font-sans">
                
                {/* Cabecera Interactiva y Exportación */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-150 dark:border-zinc-800 pb-3">
                  <div className="space-y-1">
                    <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-50 flex items-center gap-1.5">
                      📊 <span>{lang === 'es' ? 'Planilla de Consumo Mensual & CPM' : 'Monthly Consumption & CPM'}</span>
                    </h3>
                    <p className="text-[10px] text-zinc-400">
                      {lang === 'es' 
                        ? 'Cálculo dinámico basado en órdenes efectivamente entregadas. El CPM (Consumo Promedio Mensual) se promedia sobre el período analizado.' 
                        : 'Dynamic calculations based on orders fully delivered. Average usage is calculated over the analyzed monthly schedule.'}
                    </p>
                  </div>
                  
                  <button
                    type="button"
                    onClick={handleExportConsumptionCSV}
                    className="self-start sm:self-center bg-emerald-600 hover:bg-emerald-700 text-white font-bold p-2.5 px-4 rounded-xl flex items-center gap-2 shadow-sm shadow-emerald-500/10 cursor-pointer transition transform active:scale-97"
                  >
                    <FileSpreadsheet size={15} />
                    <span>{lang === 'es' ? 'Descargar Excel / CSV' : 'Export Spreadsheet'}</span>
                  </button>
                </div>

                {/* Filtro de Búsqueda de la Planilla */}
                <div className="p-1 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-150 dark:border-zinc-850 max-w-md flex items-center gap-2">
                  <span className="text-zinc-400 pl-2">🔍</span>
                  <input
                    type="text"
                    value={consumptionSearch}
                    onChange={(e) => setConsumptionSearch(e.target.value)}
                    placeholder={lang === 'es' ? 'Filtrar por fármaco o presentación...' : 'Search item name or presentation...'}
                    className="w-full bg-transparent p-1.5 focus:outline-hidden text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 font-medium"
                  />
                  {consumptionSearch && (
                    <button 
                      onClick={() => setConsumptionSearch('')} 
                      className="text-zinc-400 hover:text-zinc-650 pr-2 font-bold cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Tabla de Planilla Interactiva */}
                <div className="overflow-x-auto border border-zinc-150 dark:border-zinc-800 rounded-2xl shadow-xs bg-white dark:bg-zinc-950/20">
                  <table className="w-full text-left border-collapse text-[11px] font-sans">
                    <thead>
                      <tr className="bg-zinc-50 dark:bg-zinc-950 text-zinc-500 font-bold border-b border-zinc-150 dark:border-zinc-805">
                        <th className="py-2.5 px-3">{lang === 'es' ? 'Artículo / Fármaco' : 'Item Description'}</th>
                        <th className="py-2.5 px-2">{lang === 'es' ? 'Presentación' : 'Presentation'}</th>
                        <th className="py-2.5 px-2 text-center">{lang === 'es' ? 'Tipo' : 'Type'}</th>
                        {months.map(m => (
                          <th key={m.key} className="py-2.5 px-2 text-right font-mono text-[10px]" title={m.label}>
                            {m.label.split(' ')[0]}
                          </th>
                        ))}
                        <th className="py-2.5 px-2 text-right text-zinc-900 dark:text-white font-extrabold bg-zinc-100/50 dark:bg-zinc-900/30">
                          {lang === 'es' ? 'Total' : 'Total'}
                        </th>
                        <th className="py-2.5 px-3 text-right text-orange-600 dark:text-orange-400 font-bold bg-orange-500/5 dark:bg-orange-500/10 border-l border-r border-orange-500/10">
                          CPM
                        </th>
                        <th className="py-2.5 px-2 text-right font-semibold">{lang === 'es' ? 'Stock Act.' : 'Stock'}</th>
                        <th className="py-2.5 px-3 text-right">{lang === 'es' ? 'Carga Sugerida' : 'Replenish'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-850">
                      {filteredConsumptionData.length === 0 ? (
                        <tr>
                          <td colSpan={6 + months.length} className="py-10 text-center text-zinc-400 italic">
                            {lang === 'es' ? 'No se encontraron insumos que coincidan.' : 'No matched items found.'}
                          </td>
                        </tr>
                      ) : (
                        filteredConsumptionData.map((row, rIdx) => (
                          <tr key={row.product.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/15 transition duration-150">
                            <td className="py-2.5 px-3 font-bold text-zinc-800 dark:text-zinc-200">
                              {row.product.name}
                            </td>
                            <td className="py-2.5 px-2 text-zinc-500 font-medium whitespace-nowrap">
                              {row.product.presentation}
                            </td>
                            <td className="py-2.5 px-2 text-center">
                              <span className={`inline-block px-1 py-0.2 rounded text-[8px] font-bold ${
                                (row.product.productType || 'Med') === 'PM' 
                                  ? 'bg-blue-500/10 text-blue-600' 
                                  : 'bg-emerald-500/10 text-emerald-600'
                              }`}>
                                {(row.product.productType || 'Med') === 'PM' ? '📦 PM' : '💊 MED'}
                              </span>
                            </td>
                            {months.map(m => {
                              const qty = row.dynamicQty[m.key] || 0;
                              return (
                                <td key={m.key} className={`py-2.5 px-2 text-right font-mono text-[11px] ${qty > 0 ? 'font-bold text-zinc-700 dark:text-zinc-300' : 'text-zinc-300 dark:text-zinc-700'}`}>
                                  {qty}
                                </td>
                              );
                            })}
                            <td className="py-2.5 px-2 text-right font-mono font-bold text-zinc-900 dark:text-white bg-zinc-100/50 dark:bg-zinc-900/30">
                              {row.total}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-extrabold text-orange-600 dark:text-orange-400 bg-orange-500/5 dark:bg-orange-500/10 border-l border-r border-orange-500/10 font-bold">
                              {row.cpm.toFixed(1)}
                            </td>
                            <td className="py-2.5 px-2 text-right font-mono">
                              <span className={row.currentStock < row.product.minStock ? 'text-red-500 font-bold' : 'text-zinc-650'}>
                                {row.currentStock}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              {row.suggested > 0 ? (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-amber-500/10 text-amber-600 dark:text-amber-500" title="Volumen sugerido para mantener 1.5 meses de stock de seguridad">
                                  ⚡ +{row.suggested} u
                                </span>
                              ) : (
                                <span className="text-[9px] text-green-500 font-semibold font-sans">
                                  ✓ Optimo
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Sub-Resumen por sectores original (Suma valor visual) */}
                <div className="space-y-3 pt-4 border-t border-zinc-150 dark:border-zinc-800">
                  <h4 className="font-bold text-[11px] text-zinc-500 uppercase tracking-widest block">
                    {lang === 'es' ? 'Resumen de Consumos Totales por Sector Clínico' : 'Departmental Breakdown Preview'}
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[PredefinedService.GUARDIA, PredefinedService.LABORATORIO, PredefinedService.IRAB].map(svc => {
                      const data = consumptionReport[svc] || {};
                      const entries = Object.entries(data);

                      return (
                        <div key={svc} className="p-4 bg-zinc-50 dark:bg-zinc-950/40 border border-zinc-200/50 rounded-xl space-y-3">
                          <h4 className="font-bold text-xs uppercase text-indigo-600 dark:text-indigo-400 tracking-wider flex justify-between items-center">
                            <span>🏥 {svc}</span>
                            <span className="text-[9px] text-zinc-400 font-mono px-1.5 py-0.2 rounded bg-zinc-100 dark:bg-zinc-900 border">
                              {entries.length} refs
                            </span>
                          </h4>
                          
                          {entries.length === 0 ? (
                            <p className="text-zinc-400 italic text-[11px] font-mono">Sin salidas registradas en este período.</p>
                          ) : (
                            <div className="space-y-1 text-[11px] font-mono divide-y divide-zinc-200/40 text-zinc-700 dark:text-zinc-300 max-h-[150px] overflow-y-auto pr-1">
                              {entries.map(([pName, val]) => (
                                <div key={pName} className="flex justify-between py-1 bg-white/20">
                                  <span className="truncate pr-1 block max-w-[130px]" title={pName}>{pName}</span>
                                  <strong className="text-indigo-800 dark:text-indigo-450 font-mono">+{val} u.</strong>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>
            )}

            {reportType === 'movements' && (
              <div className="space-y-4">
                <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-50 border-b pb-2">
                  📦 {t.reportMovimientos}
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs divide-y divide-zinc-200 dark:divide-zinc-800">
                    <thead>
                      <tr className="text-zinc-400 font-mono text-[10px] uppercase">
                        <th className="py-2">Orden</th>
                        <th className="py-2">Servicio</th>
                        <th className="py-2">Petición por</th>
                        <th className="py-2">Preparado por</th>
                        <th className="py-2 text-right">Medicamentos</th>
                        <th className="py-2 text-right">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {movementsReport.map((m, idx) => (
                        <tr key={idx} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/20 font-mono text-[11px]">
                          <td className="py-2.5 font-bold text-zinc-400">#{m.orderId.split('_')[1] || m.orderId.substr(0, 8)}</td>
                          <td className="py-2.5 text-zinc-800 dark:text-zinc-200">{m.service}</td>
                          <td className="py-2.5" title={m.requestedBy}>{m.requestedBy.split(' ')[0]}</td>
                          <td className="py-2.5 text-zinc-400" title={m.preparedBy}>{m.preparedBy ? m.preparedBy.split(' ')[0] : '-'}</td>
                          <td className="py-2.5 text-right">{m.itemsCount} productos</td>
                          <td className="py-2.5 text-right">
                            <span className={`inline-block size-1.5 rounded-full mr-1.5 ${m.status === 'Pendiente' ? 'bg-amber-500' : m.status === 'Preparado' ? 'bg-orange-500' : 'bg-orange-600'}`}></span>
                            {m.status}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {reportType === 'audit' && (
              <div className="space-y-4">
                <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-50 border-b pb-2">
                  📝 {t.reportAuditoria}
                </h3>
                <p className="text-[11px] text-zinc-400">
                  Contiene el registro inmutable de transacciones físicas, altas, bajas, y correcciones manuales hechas el Jefa de Servicio:
                </p>

                <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
                  {auditLogs
                    .filter(log => {
                      const logDate = log.timestamp.split('T')[0];
                      return logDate >= startDate && logDate <= endDate;
                    })
                    .map((log) => (
                      <div key={log.id} className="p-3 border border-zinc-100 dark:border-zinc-800 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-850/40 text-[11px] transition">
                      <div className="flex justify-between items-center text-[10px] font-mono text-zinc-400">
                        <span>{new Date(log.timestamp).toLocaleDateString()} • {new Date(log.timestamp).toLocaleTimeString()}</span>
                        <span className="uppercase text-indigo-600 bg-indigo-50 dark:bg-indigo-950/20 px-1 py-0.5 rounded font-bold font-mono">
                          {log.action}
                        </span>
                      </div>
                      <p className="font-sans font-bold text-zinc-800 dark:text-zinc-100 mt-1">
                        {log.details}
                      </p>
                      <p className="text-[10px] text-zinc-400 mt-0.5">
                        Por: <strong>{log.userName}</strong> ({log.userRole})
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {reportType === 'expiring' && (
              <div className="space-y-6 animate-fade-in text-xs font-sans">
                
                {/* Cabecera de Alerta Temprana */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-150 dark:border-zinc-800 pb-3">
                  <div className="space-y-1">
                    <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-50 flex items-center gap-1.5">
                      ⏳ <span>{lang === 'es' ? 'Semáforo de Vida Útil de Lotes (Alerta Temprana)' : 'Lot Life Shelf Semáforo (Early Warning)'}</span>
                    </h3>
                    <p className="text-[10px] text-zinc-400">
                      {lang === 'es' 
                        ? 'Auditoría integral de la vida útil de cada lote activo bajo estándar FEFO (First Expired, First Out) de CAPS Sabatto.' 
                        : 'Comprehensive audit of batch shelf-life supporting the FEFO standard (First Expired, First Out).'}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleExportSemaforoCSV}
                    className="self-start sm:self-center bg-indigo-650 hover:bg-indigo-700 text-white font-bold p-2.5 px-4 rounded-xl flex items-center gap-2 shadow-sm shadow-indigo-500/10 cursor-pointer transition transform active:scale-97"
                  >
                    <FileSpreadsheet size={15} />
                    <span>{lang === 'es' ? 'Exportar Semáforo CSV' : 'Export Lot Semáforo'}</span>
                  </button>
                </div>

                {/* Resumen de Métricas de Semáforo */}
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                  <div className="p-3 bg-zinc-50 dark:bg-zinc-950/40 border border-zinc-150 dark:border-zinc-800 rounded-xl">
                    <span className="text-[10px] text-zinc-400 font-medium block">Total General</span>
                    <strong className="text-sm font-mono text-zinc-850 dark:text-zinc-50">
                      {semaforoReportData.length} {lang === 'es' ? 'lotes' : 'lots'}
                    </strong>
                  </div>
                  <div className="p-3 bg-red-500/5 border border-red-500/15 rounded-xl">
                    <span className="text-[10px] text-red-500 font-bold flex items-center gap-1">🔴 {lang === 'es' ? 'Crítico (≤60 d)' : 'Critical'}</span>
                    <strong className="text-sm font-mono text-red-655">
                      {semaforoReportData.filter(x => x.severity === 'Rojo').length} {lang === 'es' ? 'lotes' : 'lots'}
                    </strong>
                  </div>
                  <div className="p-3 bg-amber-500/5 border border-amber-500/15 rounded-xl">
                    <span className="text-[10px] text-amber-600 font-bold flex items-center gap-1">🟡 {lang === 'es' ? 'Alerta (61-180 d)' : 'Warning'}</span>
                    <strong className="text-sm font-mono text-amber-655">
                      {semaforoReportData.filter(x => x.severity === 'Amarillo').length} {lang === 'es' ? 'lotes' : 'lots'}
                    </strong>
                  </div>
                  <div className="p-3 bg-emerald-500/5 border border-emerald-500/15 rounded-xl">
                    <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">🟢 {lang === 'es' ? 'Óptimo (>180 d)' : 'Safe'}</span>
                    <strong className="text-sm font-mono text-emerald-655">
                      {semaforoReportData.filter(x => x.severity === 'Verde').length} {lang === 'es' ? 'lotes' : 'lots'}
                    </strong>
                  </div>
                  <div className="col-span-2 lg:col-span-1 p-3 bg-zinc-950/10 border border-zinc-900/15 dark:border-zinc-800 rounded-xl">
                    <span className="text-[10px] text-zinc-500 font-bold flex items-center gap-1">💀 {lang === 'es' ? 'Vencidos / Cuarentena' : 'Expired'}</span>
                    <strong className="text-sm font-mono text-zinc-505 dark:text-zinc-400">
                      {semaforoReportData.filter(x => x.severity === 'Vencido').length} {lang === 'es' ? 'lotes' : 'lots'}
                    </strong>
                  </div>
                </div>

                {/* Selector de Filtros de Semáforo */}
                <div className="flex flex-wrap items-center gap-1.5 border-b border-zinc-100 dark:border-zinc-800/60 pb-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setSemaforoFilter('All')}
                    className={`px-3 py-1.5 rounded-lg font-bold transition text-[11px] cursor-pointer ${semaforoFilter === 'All' ? 'bg-zinc-800 text-white dark:bg-zinc-100 dark:text-black shadow-sm' : 'hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-500'}`}
                  >
                    {lang === 'es' ? 'Todos' : 'All'} ({semaforoReportData.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSemaforoFilter('Rojo')}
                    className={`px-3 py-1.5 rounded-lg font-bold transition text-[11px] cursor-pointer flex items-center gap-1 ${semaforoFilter === 'Rojo' ? 'bg-red-650 text-white shadow-sm' : 'hover:bg-red-500/10 text-red-500'}`}
                  >
                    <span>🔴 {lang === 'es' ? 'Rojo (Crítico)' : 'Red (Critical)'}</span>
                    <span className="bg-white/20 px-1 py-0.2 rounded text-[9px]">
                      {semaforoReportData.filter(x => x.severity === 'Rojo').length}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSemaforoFilter('Amarillo')}
                    className={`px-3 py-1.5 rounded-lg font-bold transition text-[11px] cursor-pointer flex items-center gap-1 ${semaforoFilter === 'Amarillo' ? 'bg-amber-500 text-white shadow-sm' : 'hover:bg-amber-500/10 text-amber-550'}`}
                  >
                    <span>🟡 {lang === 'es' ? 'Amarillo (Alerta)' : 'Yellow (Warning)'}</span>
                    <span className="bg-white/20 px-1 py-0.2 rounded text-[9px]">
                      {semaforoReportData.filter(x => x.severity === 'Amarillo').length}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSemaforoFilter('Verde')}
                    className={`px-3 py-1.5 rounded-lg font-bold transition text-[11px] cursor-pointer flex items-center gap-1 ${semaforoFilter === 'Verde' ? 'bg-emerald-600 text-white shadow-sm' : 'hover:bg-emerald-500/10 text-emerald-555'}`}
                  >
                    <span>🟢 {lang === 'es' ? 'Verde (Seguro)' : 'Green (Safe)'}</span>
                    <span className="bg-white/20 px-1 py-0.2 rounded text-[9px]">
                      {semaforoReportData.filter(x => x.severity === 'Verde').length}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSemaforoFilter('Vencido')}
                    className={`px-3 py-1.5 rounded-lg font-bold transition text-[11px] cursor-pointer flex items-center gap-1 ${semaforoFilter === 'Vencido' ? 'bg-zinc-500 text-white shadow-sm' : 'hover:bg-zinc-500/10 text-zinc-500'}`}
                  >
                    <span>💀 {lang === 'es' ? 'Vencidos' : 'Expired'}</span>
                    <span className="bg-white/20 px-1 py-0.2 rounded text-[9px]">
                      {semaforoReportData.filter(x => x.severity === 'Vencido').length}
                    </span>
                  </button>
                </div>

                {/* Listado de Lotes con Semáforo de Progreso */}
                <div className="overflow-x-auto border border-zinc-150 dark:border-zinc-805 rounded-xl shadow-xs bg-white dark:bg-zinc-950/20">
                  <table className="w-full text-left border-collapse text-[11px] font-sans">
                    <thead>
                      <tr className="bg-zinc-50 dark:bg-zinc-950 text-zinc-500 font-bold border-b border-zinc-150 dark:border-zinc-850">
                        <th className="py-2.5 px-3">{lang === 'es' ? 'Fármaco / Insumo' : 'Product Name'}</th>
                        <th className="py-2.5 px-2 font-mono">{lang === 'es' ? 'Lote Código' : 'Lot'}</th>
                        <th className="py-2.5 px-2">{lang === 'es' ? 'F. Vencimiento' : 'Exp Date'}</th>
                        <th className="py-2.5 px-2">{lang === 'es' ? 'Progreso de Vida Útil' : 'Shelf Life Progress'}</th>
                        <th className="py-2.5 px-2 text-right">{lang === 'es' ? 'Días Restantes' : 'Days Remaining'}</th>
                        <th className="py-2.5 px-3 text-right">{lang === 'es' ? 'Stock de Lote' : 'Batch Stock'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-850">
                      {filteredSemaforoData.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-zinc-450 italic">
                            {lang === 'es' ? 'Ningún lote en esta categoría.' : 'No active lots found.'}
                          </td>
                        </tr>
                      ) : (
                        filteredSemaforoData.map((item, idx) => {
                          const percent = Math.min(100, Math.max(0, (item.daysRemaining / 365) * 100)); // Consider 365 as 100% useful life baseline for visual guide
                          
                          let progressColor = 'bg-emerald-500';
                          let pillColor = 'bg-emerald-500/10 text-emerald-650';
                          if (item.severity === 'Vencido') {
                            progressColor = 'bg-zinc-500';
                            pillColor = 'bg-zinc-500/20 text-zinc-500';
                          } else if (item.severity === 'Rojo') {
                            progressColor = 'bg-red-500 animate-pulse';
                            pillColor = 'bg-red-500/15 text-red-650 font-extrabold';
                          } else if (item.severity === 'Amarillo') {
                            progressColor = 'bg-amber-500';
                            pillColor = 'bg-amber-500/15 text-amber-600';
                          }

                          return (
                            <tr key={`${item.product.id}-${item.batch.id}`} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/15 transition duration-100">
                              <td className="py-2.5 px-3 font-bold text-zinc-800 dark:text-zinc-100">
                                <div className="space-y-0.5">
                                  <span>{item.product.name}</span>
                                  <span className="text-[10px] text-zinc-400 font-normal font-sans block max-w-sm truncate">
                                    {item.product.presentation} • Almacenamiento: {item.product.shelfLetter ? `Estante ${item.product.shelfLetter}-${item.product.shelfLevel}` : 'Depósito Gral'}
                                  </span>
                                </div>
                              </td>
                              <td className="py-2.5 px-2 font-mono text-indigo-650 dark:text-indigo-400 font-bold whitespace-nowrap">
                                {item.batch.batchCode}
                              </td>
                              <td className={`py-2.5 px-2 font-mono ${item.severity === 'Vencido' ? 'text-zinc-455 line-through underline' : 'text-zinc-650 dark:text-zinc-350'}`}>
                                {item.batch.expirationDate}
                              </td>
                              <td className="py-2.5 px-2 max-w-[120px]">
                                <div className="space-y-1">
                                  <div className="h-1.5 w-24 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full ${progressColor}`} style={{ width: `${percent}%` }}></div>
                                  </div>
                                  <span className="text-[8px] font-mono text-zinc-400 block">{percent.toFixed(0)}% restante (365d b.)</span>
                                </div>
                              </td>
                              <td className="py-2.5 px-2 text-right">
                                <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${pillColor}`}>
                                  {item.severity === 'Vencido' ? (
                                    lang === 'es' ? 'VENCIDO' : 'EXPIRED'
                                  ) : (
                                    `${item.daysRemaining} d`
                                  )}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-right font-bold font-mono text-zinc-850 dark:text-zinc-50">
                                {item.batch.quantity} u.
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

              </div>
            )}

            {reportType === 'low_stock' && (
              <div className="space-y-4">
                <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-50 border-b pb-2">
                  ⚠️ {t.reportCritical} (Reposición Necesaria)
                </h3>
                <p className="text-[11px] text-zinc-400">
                  Medicamentos e insumos cuyo volumen acumulado actual es inferior al stock crítico de alerta configurado:
                </p>

                <div className="overflow-x-auto pt-2">
                  <table className="w-full text-left text-xs divide-y divide-zinc-200 dark:divide-zinc-804">
                    <thead>
                      <tr className="text-zinc-400 font-mono text-[10px] uppercase">
                        <th className="py-2">Fármaco de Reposición</th>
                        <th className="py-2">Categoría</th>
                        <th className="py-2 text-center">Nivel Crítico</th>
                        <th className="py-2 text-right">Faltante aprox</th>
                        <th className="py-2 text-right">Stock Actual</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {lowStockReport.map((row, idx) => (
                        <tr key={idx} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/10 font-mono text-[11px]">
                          <td className="py-2.5 font-bold text-zinc-800 dark:text-zinc-150">
                            {row.product.name} <span className="text-[10px] text-zinc-400 font-normal font-sans">({row.product.presentation})</span>
                          </td>
                          <td className="py-2.5 italic text-zinc-400">{row.product.category}</td>
                          <td className="py-2.5 text-center">{row.minStock} u.</td>
                          <td className="py-2.5 text-right text-red-500 font-bold">-{row.minStock - row.totalStock} u.</td>
                          <td className="py-2.5 text-right font-bold text-red-650 bg-red-50 dark:bg-red-950/20">{row.totalStock} u.</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {reportType === 'unsatisfied' && (
              <div className="space-y-4 animate-fade-in">
                <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-50 border-b pb-2">
                  ⚠️ {t.reportUnsatisfied} (Diferencia Solicitado vs Entregado)
                </h3>
                <p className="text-[11px] text-zinc-400">
                  Medicamentos e insumos cuya entrega fue inferior a la cantidad solicitada por cada sector/servicio en pedidos entregados o listos para entregar en este período:
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  {[PredefinedService.GUARDIA, PredefinedService.LABORATORIO, PredefinedService.IRAB, PredefinedService.FARMACIA].map(svc => {
                    const data = unsatisfiedReport[svc] || {};
                    const entries = (Object.entries(data) as [string, { requested: number; delivered: number; unsatisfied: number }][]).filter(([_, val]) => val.unsatisfied > 0);

                    return (
                      <div key={svc} className="p-4 bg-zinc-50 dark:bg-zinc-950/40 border border-zinc-200/50 rounded-xl space-y-3">
                        <div className="flex justify-between items-center border-b pb-1">
                          <h4 className="font-bold text-xs uppercase text-zinc-650 dark:text-zinc-350 tracking-wider">
                            {svc}
                          </h4>
                          {entries.length > 0 && (
                            <span className="text-[9px] bg-red-105 dark:bg-red-950/40 text-red-700 dark:text-red-400 px-1.5 py-0.5 rounded font-extrabold font-mono uppercase">
                              {entries.length} Faltante(s)
                            </span>
                          )}
                        </div>
                        
                        {entries.length === 0 ? (
                           <div className="py-4 text-center">
                             <span className="text-emerald-600 font-bold text-[11px]">✔ 100% Cubierto: Todo entregado con éxito.</span>
                           </div>
                        ) : (
                          <div className="space-y-1.5 text-[11px] font-mono divide-y divide-zinc-200/40 dark:divide-zinc-800 text-zinc-700 dark:text-zinc-350">
                            {entries.map(([pName, val]) => (
                              <div key={pName} className="flex justify-between py-1 bg-white/20 items-center">
                                <span className="truncate pr-1 block max-w-[190px]" title={pName}>{pName}</span>
                                <div className="text-right space-y-0.5 shrink-0">
                                  <div className="text-zinc-400 text-[10px]">
                                    Entregado {val.delivered} de {val.requested} u.
                                  </div>
                                  <strong className="text-red-600 dark:text-red-400 block bg-red-50 dark:bg-red-950/20 px-1 rounded text-right font-extrabold">
                                    Faltó {val.unsatisfied} u.
                                  </strong>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {reportType === 'tests' && (
              <div className="space-y-4 animate-fade-in">
                <div className="flex justify-between items-center border-b pb-3">
                  <div>
                    <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-50">
                      📋 {t.testRunner} (Diagnostics Test)
                    </h3>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      Pruebas automatizadas de flujos de principio a fin del negocio para garantizar un funcionamiento sin errores.
                    </p>
                  </div>
                  <button
                    id="run-tests-btn"
                    onClick={triggerSelfDiagnostics}
                    className="px-4 py-1.5 bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer shadow-md shadow-orange-500/10"
                  >
                    <Terminal size={12} />
                    <span>{t.runTests}</span>
                  </button>
                </div>

                {testRan ? (
                  <div className="space-y-3">
                    <div className="p-3 bg-orange-50 dark:bg-orange-950/20 text-orange-850 dark:text-orange-350 border border-orange-200 dark:border-orange-900/30 rounded-xl font-bold font-sans flex items-center gap-2">
                      <FileCheck2 size={16} />
                      <span>Diagnósticos finalizados: Todas las pruebas superadas exitosamente (100% OK).</span>
                    </div>

                    <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {testResults.map((tr, idx) => (
                        <div key={idx} className="py-2.5 flex justify-between items-start">
                          <div>
                            <p className="font-bold text-zinc-850 dark:text-zinc-100 text-xs">
                              {idx + 1}. {tr.name}
                            </p>
                            <p className="text-[11px] text-zinc-400">{tr.message}</p>
                          </div>
                          <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold font-mono ${tr.passed ? 'bg-orange-100 text-orange-800' : 'bg-red-100 text-red-800'}`}>
                            {tr.passed ? t.testPassed : t.testFailed}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="py-8 text-center text-zinc-400 text-xs font-sans">
                    Haz clic en "Ejecutar Pruebas" para validar los flujos de simulación en internet y localStorage.
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </div>
    )}

          {/* TAB: HISTORIAL DE ENTREGAS POR SECTOR Y FECHA */}
          {subTab === 'history_deliveries' && (
            <motion.div
              key="history_deliveries"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4 text-xs font-sans"
            >
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm space-y-6">
                
                {/* Cabecera del Tab */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-100 dark:border-zinc-800 pb-4">
                  <div>
                    <h4 className="font-sans font-extrabold text-sm text-zinc-900 dark:text-zinc-100">Consultas de Despachos y Entregas Clínicas</h4>
                    <p className="text-[11px] text-zinc-400">Auditoría completa de suministros despachados a cada servicio, incluyendo trazabilidad del personal interviniente y lotes asignados.</p>
                  </div>
                  <div className="text-[10px] bg-orange-500/10 text-orange-600 dark:text-orange-400 font-extrabold uppercase px-2.5 py-1 rounded-xl self-start sm:self-auto">
                    Base de Datos Histórica
                  </div>
                </div>

                {/* Filtros de Historial (Sector, Fecha Desde, Fecha Hasta, Búsqueda) */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-zinc-50 dark:bg-zinc-950 p-4 border border-zinc-200/60 dark:border-zinc-800 rounded-2xl">
                  {/* Selector de Sector */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase text-zinc-400 block">Sector / Servicio</label>
                    <select
                      value={historyServiceFilter}
                      onChange={(e) => { setHistoryServiceFilter(e.target.value); playBeep('beep'); }}
                      className="w-full text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-2.5 py-2 text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-orange-500 font-medium cursor-pointer"
                    >
                      <option value="All">Todos los Sectores</option>
                      <option value={PredefinedService.GUARDIA}>🏥 {PredefinedService.GUARDIA}</option>
                      <option value={PredefinedService.LABORATORIO}>🧪 {PredefinedService.LABORATORIO}</option>
                      <option value={PredefinedService.IRAB}>🫁 {PredefinedService.IRAB}</option>
                      <option value={PredefinedService.FARMACIA}>🚪 {PredefinedService.FARMACIA}</option>
                    </select>
                  </div>

                  {/* Fecha Desde */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase text-zinc-400 block">Fecha Desde</label>
                    <input
                      type="date"
                      value={historyStartDate}
                      onChange={(e) => { setHistoryStartDate(e.target.value); playBeep('beep'); }}
                      className="w-full text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-2.5 py-2 text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-orange-500 font-medium font-mono cursor-pointer"
                    />
                  </div>

                  {/* Fecha Hasta */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase text-zinc-400 block">Fecha Hasta</label>
                    <input
                      type="date"
                      value={historyEndDate}
                      onChange={(e) => { setHistoryEndDate(e.target.value); playBeep('beep'); }}
                      className="w-full text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-2.5 py-2 text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-orange-500 font-medium font-mono cursor-pointer"
                    />
                  </div>

                  {/* Búsqueda Directa */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase text-zinc-400 block">Búsqueda Libre</label>
                    <div className="relative">
                      <Search className="absolute left-2.5 inset-y-0 my-auto text-zinc-400" size={13} />
                      <input
                        type="text"
                        value={historySearchQuery}
                        onChange={(e) => setHistorySearchQuery(e.target.value)}
                        placeholder="Buscar ID, medicamento, personal..."
                        className="w-full pl-8 pr-3 py-2 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-orange-500 font-medium font-sans placeholder-zinc-400"
                      />
                    </div>
                  </div>
                </div>

                {/* Mostrar Botones de Reseteo Rápido si hay filtros activos */}
                {(historyServiceFilter !== 'All' || historyStartDate || historyEndDate || historySearchQuery) && (
                  <div className="flex items-center justify-between text-xs bg-orange-500/5 border border-orange-500/10 rounded-xl p-3">
                    <span className="text-zinc-650 dark:text-zinc-350 font-medium font-sans">Hay criterios de filtrado seleccionados activos.</span>
                    <button
                      type="button"
                      onClick={() => {
                        setHistoryServiceFilter('All');
                        setHistoryStartDate('');
                        setHistoryEndDate('');
                        setHistorySearchQuery('');
                        playBeep('beep');
                      }}
                      className="text-orange-600 hover:text-orange-700 font-bold hover:underline cursor-pointer font-sans"
                    >
                      Restablecer Filtros
                    </button>
                  </div>
                )}

                {/* Lista de Registros */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-zinc-100 dark:border-zinc-800 text-zinc-400 uppercase tracking-wider font-semibold font-mono text-[10px]">
                        <th className="py-3 px-3">ID Pedido / Tipo</th>
                        <th className="py-3 px-3">Sector</th>
                        <th className="py-3 px-3">Solicitado por</th>
                        <th className="py-3 px-3">Preparó despacho</th>
                        <th className="py-3 px-3">Dispensó central</th>
                        <th className="py-3 px-3 text-center">Fecha Entrega</th>
                        <th className="py-3 px-3 text-center">Renglones</th>
                        <th className="py-3 px-3 text-center w-12">Detalle</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 text-zinc-700 dark:text-zinc-300 font-sans text-xs">
                      {filteredHistoricalOrders.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-12 text-center text-zinc-400 font-medium bg-zinc-550/5 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800">
                            No se encontraron pedidos entregados que coincidan con los filtros aplicados.
                          </td>
                        </tr>
                      ) : (
                        filteredHistoricalOrders.map((ord) => {
                          const requestDateStr = new Date(ord.requestDate).toLocaleDateString(lang === 'es' ? 'es-AR' : 'en-US', {
                            day: 'numeric', month: 'short'
                          });
                          const deliveryDateStr = ord.deliveryDate 
                            ? new Date(ord.deliveryDate).toLocaleString(lang === 'es' ? 'es-AR' : 'en-US', {
                                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                              })
                            : 'Pendiente';
                          const isExpanded = expandedHistoryOrder === ord.id;

                          return (
                            <React.Fragment key={ord.id}>
                              <tr
                                className={`group hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20 transition duration-150 cursor-pointer ${isExpanded ? 'bg-zinc-100/30 dark:bg-zinc-800/10' : ''}`}
                                onClick={() => {
                                  setExpandedHistoryOrder(isExpanded ? null : ord.id);
                                  playBeep('beep');
                                }}
                              >
                                <td className="py-3.5 px-3">
                                  <span className="font-mono text-[10px] font-bold text-zinc-700 dark:text-zinc-200 block">{ord.id}</span>
                                  <span className={`inline-block text-[9px] font-bold px-1.5 py-0.2 rounded ${ord.type === 'Extraordinario' ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-600' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
                                    {ord.type === 'Extraordinario' ? '🚨 Extraordinario' : '📋 Periódico'}
                                  </span>
                                </td>
                                <td className="py-3.5 px-3">
                                  <span className="font-bold text-orange-600 dark:text-orange-400 block">{ord.service}</span>
                                  <span className="text-[10px] text-zinc-400 italic block">Egresado</span>
                                </td>
                                <td className="py-3.5 px-3">
                                  <span className="font-semibold text-zinc-800 dark:text-zinc-100 block">{ord.requestedBy.userName}</span>
                                  <span className="text-[9px] text-zinc-400 font-mono block">{requestDateStr}</span>
                                </td>
                                <td className="py-3.5 px-3">
                                  <span className="text-zinc-700 dark:text-zinc-200 font-medium block">
                                    👤 {ord.preparedBy?.userName || 'Téc. Lucas Castro'}
                                  </span>
                                  <span className="text-[9px] text-zinc-400 block font-mono">FEFO Evaluado</span>
                                </td>
                                <td className="py-3.5 px-3">
                                  <span className="text-zinc-700 dark:text-zinc-200 font-medium block">
                                    👤 {ord.deliveredBy?.userName || 'Farm. Sofía Sabatto'}
                                  </span>
                                  <span className="text-[9px] text-zinc-400 block font-mono font-bold">Control de Provisión</span>
                                </td>
                                <td className="py-3.5 px-3 text-center text-[10px] font-mono font-bold text-orange-650 dark:text-orange-400">
                                  {deliveryDateStr}
                                </td>
                                <td className="py-3.5 px-3 text-center font-mono font-bold text-zinc-600 dark:text-zinc-400">
                                  {ord.items.length} ítems
                                </td>
                                <td className="py-3.5 px-3 text-center">
                                  <button
                                    type="button"
                                    className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-lg cursor-pointer transition"
                                  >
                                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                  </button>
                                </td>
                              </tr>

                              {/* Sección Expandida - Desglose de Entrega Valorado */}
                              {isExpanded && (
                                <tr className="bg-zinc-50/50 dark:bg-zinc-950/30">
                                  <td colSpan={8} className="py-5 px-6">
                                    <div className="space-y-4 border-l-2 border-orange-500/50 pl-5">
                                      {/* Controles de Acción (Imprimir Acta Directa) */}
                                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-3.5 rounded-2xl shadow-xs">
                                        <div className="space-y-0.5">
                                          <h5 className="font-bold text-xs text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                                            <ClipboardCheck size={14} className="text-orange-600" />
                                            Acta Digital y Hoja de Ruta Clínico Real de Consumo
                                          </h5>
                                          <p className="text-[10px] text-zinc-400 font-medium">Firma autorizada inmutable por FEFO registrada el {deliveryDateStr}.</p>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => handlePrintDeliveryOrder(ord)}
                                          className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-black font-extrabold text-[10px] uppercase px-4 py-2 rounded-xl cursor-pointer hover:bg-zinc-850 dark:hover:bg-zinc-50 shadow-xs transition flex items-center justify-center gap-1.5 self-start sm:self-auto transform active:scale-97"
                                        >
                                          <Printer size={13} />
                                          Imprimir Acta de Entrega con Firmas
                                        </button>
                                      </div>

                                      {/* Trazabilidad Digital Visual del Proceso */}
                                      <div className="space-y-2">
                                        <h6 className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Fluido Temporal e Intervinientes</h6>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                                          {/* Solicitud */}
                                          <div className="bg-white dark:bg-zinc-900 p-3 rounded-xl border border-zinc-200 dark:border-zinc-850 flex items-start gap-2.5">
                                            <span className="p-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-lg text-zinc-650 dark:text-zinc-350">
                                              <UserIcon size={14} />
                                            </span>
                                            <div>
                                              <span className="text-[10px] font-bold text-zinc-400 block uppercase font-mono tracking-wider">1. Solicitado por</span>
                                              <span className="text-xs font-bold text-zinc-850 dark:text-zinc-200 block">{ord.requestedBy.userName}</span>
                                              <span className="text-[9px] text-zinc-450 block font-mono">{requestDateStr}</span>
                                            </div>
                                          </div>

                                          {/* Preparación */}
                                          <div className="bg-white dark:bg-zinc-900 p-3 rounded-xl border border-zinc-200 dark:border-zinc-850 flex items-start gap-2.5">
                                            <span className="p-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-lg text-zinc-650 dark:text-zinc-350">
                                              <SlidersHorizontal size={14} />
                                            </span>
                                            <div>
                                              <span className="text-[10px] font-bold text-zinc-400 block uppercase font-mono tracking-wider">2. Preparado en Depósito</span>
                                              <span className="text-xs font-bold text-zinc-850 dark:text-zinc-200 block">{ord.preparedBy?.userName || 'Téc. Lucas Castro'}</span>
                                              <span className="text-[9px] text-zinc-450 block font-mono font-medium">Trazabilidad FEFO Autorizado</span>
                                            </div>
                                          </div>

                                          {/* Dispensación */}
                                          <div className="bg-white dark:bg-zinc-900 p-3 rounded-xl border border-zinc-200 dark:border-zinc-850 flex items-start gap-2.5">
                                            <span className="p-1.5 bg-orange-500/10 rounded-lg text-orange-600 dark:text-orange-400">
                                              <CheckCircle2 size={14} />
                                            </span>
                                            <div>
                                              <span className="text-[10px] font-bold text-orange-600 dark:text-orange-400 block uppercase font-mono tracking-wider">3. Dispensado por</span>
                                              <span className="text-xs font-bold text-zinc-850 dark:text-zinc-200 block">{ord.deliveredBy?.userName || 'Farm. Sofía Sabatto'}</span>
                                              <span className="text-[9px] text-orange-600 block font-mono font-bold">Entregado: {deliveryDateStr}</span>
                                            </div>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Renglones / Insumos Despachados */}
                                      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden p-4 space-y-3">
                                        <h6 className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Planilla Detallada de Suministros Entregados</h6>
                                        <div className="overflow-x-auto">
                                          <table className="w-full text-left text-xs">
                                            <thead>
                                              <tr className="border-b border-zinc-100 dark:border-zinc-800 text-zinc-400 font-bold text-[9px] uppercase tracking-wider pb-2">
                                                <th className="py-2">Fármaco / Insumo</th>
                                                <th className="py-2 text-center">Pedido</th>
                                                <th className="py-2 text-center">Entregado</th>
                                                <th className="py-2">Lotes FEFO Consumidos</th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 text-zinc-700 dark:text-zinc-350">
                                              {ord.items.map((itm, index) => (
                                                <tr key={index}>
                                                  <td className="py-2 pt-3">
                                                    <span className="font-bold text-zinc-850 dark:text-zinc-100 block">{itm.productName}</span>
                                                    <span className="text-[10px] text-zinc-400 block">{itm.presentation}</span>
                                                  </td>
                                                  <td className="py-2 pt-3 text-center font-semibold text-zinc-500 font-mono">
                                                    {itm.requestedQuantity} unidades
                                                  </td>
                                                  <td className="py-2 pt-3 text-center font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                                                    {itm.approvedQuantity || 0} unidades
                                                  </td>
                                                  <td className="py-2 pt-3">
                                                    <div className="flex flex-wrap gap-1.5">
                                                      {itm.assignedBatches && itm.assignedBatches.length > 0 ? (
                                                        itm.assignedBatches.map((b, bIdx) => (
                                                          <span key={bIdx} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-[9px] font-semibold">
                                                            <strong className="text-zinc-700 dark:text-zinc-200">{b.batchCode}</strong>
                                                            <span className="text-zinc-400 italic">(Vence: {b.expirationDate})</span>
                                                            <strong className="text-orange-600 dark:text-orange-400 bg-orange-500/10 rounded px-1">{b.quantity} U</strong>
                                                          </span>
                                                        ))
                                                      ) : (
                                                        <span className="text-zinc-400 italic text-[10px]">Sin desglose asignado. Provisión de stock directo.</span>
                                                      )}
                                                    </div>
                                                  </td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      </div>

                                    </div>
                                  </td>
                                </tr>
                              )}

                            </React.Fragment>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

              </div>
            </motion.div>
          )}

          {subTab === 'monthly_discard' && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {/* Encabezado y Simulación */}
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-3xl shadow-sm space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-red-505/10 bg-red-500/10 text-red-500 font-bold font-mono text-[9px] rounded-md uppercase">
                        {lang === 'es' ? 'Módulo Automatizado' : 'Automated Module'}
                      </span>
                      <span className={`px-2 py-0.5 font-bold font-mono text-[9px] rounded-md uppercase ${
                        isLastBusinessDayActive ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'
                      }`}>
                        {isLastBusinessDayActive 
                          ? (lang === 'es' ? 'Activo: Último Día Hábil' : 'Active: Last Business Day') 
                          : (lang === 'es' ? 'En Espera de Fin de Mes' : 'Waiting for Month-End')}
                      </span>
                    </div>
                    <h3 className="font-sans font-extrabold text-lg text-zinc-900 dark:text-zinc-50 tracking-tight">
                      {lang === 'es' ? '🚨 Control Mensual Automatizado de Vencimientos' : '🚨 Automated Monthly Expiration Clearance'}
                    </h3>
                    <p className="text-xs text-zinc-400 max-w-2xl leading-relaxed">
                      {lang === 'es' 
                        ? 'El sistema detecta automáticamente el último día hábil del mes calendario para consolidar lotes y disparar alarmas críticas de descarte FEFO.' 
                        : 'The system automatically detects the last business day of the calendar month to consolidate batches and fire critical FEFO discard alarms.'}
                    </p>
                  </div>

                  {/* Interruptor de Fuerza de Testeo */}
                  <div className="shrink-0 bg-zinc-50 dark:bg-zinc-950 p-4 rounded-2xl border border-zinc-150 dark:border-zinc-800 space-y-2">
                    <span className="text-[10px] font-extrabold uppercase font-mono tracking-widest text-zinc-400 block">
                      {lang === 'es' ? 'Simulador de Control' : 'Control Simulator'}
                    </span>
                    <button
                      type="button"
                      onClick={onToggleSimulateLastBusinessDay}
                      className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition duration-200 cursor-pointer shadow-sm border ${
                        simulateLastBusinessDay 
                          ? 'bg-orange-600 hover:bg-orange-500 text-white border-orange-500/25' 
                          : 'bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800'
                      }`}
                    >
                      <span className={`size-2 rounded-full ${simulateLastBusinessDay ? 'bg-white animate-pulse' : 'bg-zinc-400'}`}></span>
                      {simulateLastBusinessDay 
                        ? (lang === 'es' ? 'Simulación: ENCENDIDA' : 'Simulation: ON') 
                        : (lang === 'es' ? 'Simular Último Día Hábil' : 'Simulate Last Workday')}
                    </button>
                  </div>
                </div>
              </div>

              {/* Estadísticas Rápidas de Destrucción/Descarte */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 rounded-2xl">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">{lang === 'es' ? 'Lotes Ya Vencidos' : 'Already Expired'}</span>
                  <span className="text-2xl font-extrabold font-mono text-zinc-900 dark:text-white block mt-1">
                    {expiringAndExpiredBatches.filter(b => b.isExpired).length}
                  </span>
                  <p className="text-[10px] text-zinc-400 mt-1">{lang === 'es' ? 'Requieren descarte inmediato' : 'Require immediate clearance'}</p>
                </div>
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 rounded-2xl">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">{lang === 'es' ? 'Vence Próximos 60 Días' : 'Expires within 60 Days'}</span>
                  <span className="text-2xl font-extrabold font-mono text-zinc-900 dark:text-white block mt-1">
                    {expiringAndExpiredBatches.filter(b => !b.isExpired).length}
                  </span>
                  <p className="text-[10px] text-zinc-400 mt-1">{lang === 'es' ? 'En semáforo rojo o amarillo' : 'Under red/yellow alert'}</p>
                </div>
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 rounded-2xl">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">{lang === 'es' ? 'Unidades en Riesgo' : 'Units At Risk'}</span>
                  <span className="text-2xl font-extrabold font-mono text-red-600 dark:text-red-400 block mt-1">
                    {expiringAndExpiredBatches.reduce((acc, b) => acc + b.quantity, 0)}
                  </span>
                  <p className="text-[10px] text-zinc-400 mt-1">{lang === 'es' ? 'Sujetos a merma por descarte' : 'Subject to wastage'}</p>
                </div>
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 rounded-2xl flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">{lang === 'es' ? 'Estado del Alerta' : 'Alert Status'}</span>
                    <span className={`text-xs font-bold inline-block px-2.5 py-0.5 rounded-full mt-2 ${
                      isLastBusinessDayActive ? 'bg-red-500/10 text-red-500' : 'bg-zinc-100 dark:bg-zinc-805 text-zinc-400'
                    }`}>
                      {isLastBusinessDayActive ? '🚨 ALARMA ACTIVA' : 'SISTEMA SILENCIOSO'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Botón de Acción Masiva */}
              <div className="bg-red-500/5 dark:bg-red-500/10 border border-red-500/20 p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <h4 className="font-bold text-sm text-red-700 dark:text-red-400 flex items-center gap-1.5">
                    🛡️ {lang === 'es' ? 'Descarte Masivo Automatizado' : 'Automated Bulk Discard'}
                  </h4>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {lang === 'es' 
                      ? 'Deseche todos los lotes cuya fecha de vencimiento ya haya pasado. El stock se pondrá en cero y se registrará un acta en el libro de inspección.'
                      : 'Discard all batches whose expiry date has passed. Stock is cleared to zero and an official audit entry is registered.'}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!isLastBusinessDayActive || expiringAndExpiredBatches.filter(b => b.isExpired).length === 0}
                  onClick={() => {
                    handleDiscardAllExpired();
                  }}
                  className={`px-5 py-2.5 rounded-xl text-xs font-bold cursor-pointer transition flex items-center justify-center gap-1.5 shadow-sm ${
                    isLastBusinessDayActive && expiringAndExpiredBatches.filter(b => b.isExpired).length > 0
                      ? 'bg-red-600 hover:bg-red-700 text-white'
                      : 'bg-zinc-100 dark:bg-zinc-80 border border-transparent text-zinc-400 cursor-not-allowed'
                  }`}
                >
                  ✂️ {lang === 'es' ? 'Descartar Todos los Lotes Vencidos' : 'Discard All Expired Batches'}
                </button>
              </div>

              {/* Listado de Medicación Crítica para Descarte */}
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-xs overflow-hidden">
                <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
                  <h4 className="font-extrabold font-sans text-sm text-zinc-850 dark:text-zinc-100">
                    {lang === 'es' ? 'Planilla de Control y Descarte de Medicación' : 'Medicine Control and Expiration Sheet'}
                  </h4>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-100 dark:border-zinc-800 text-zinc-400 font-bold text-[10px] uppercase font-mono py-2.5 px-4">
                        <th className="py-3 px-4">{lang === 'es' ? 'Medicamento / Insumo' : 'Medicine / Supply'}</th>
                        <th className="py-3 px-4">{lang === 'es' ? 'Ubicación' : 'Location'}</th>
                        <th className="py-3 px-2 text-center">{lang === 'es' ? 'Lote' : 'Batch'}</th>
                        <th className="py-3 px-2 text-center">{lang === 'es' ? 'Vencimiento' : 'Expiry'}</th>
                        <th className="py-3 px-2 text-center">{lang === 'es' ? 'Días Restantes' : 'Days Remaining'}</th>
                        <th className="py-3 px-2 text-center">{lang === 'es' ? 'Cantidad Lote' : 'Batch Qty'}</th>
                        <th className="py-3 px-4 text-right">{lang === 'es' ? 'Acciones' : 'Actions'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {expiringAndExpiredBatches.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-zinc-400 italic">
                            {lang === 'es' ? 'No hay lotes que vencen este mes o que estén vencidos.' : 'No batches expiring this month or already expired found.'}
                          </td>
                        </tr>
                      ) : (
                        expiringAndExpiredBatches.map((item, idx) => {
                          const isExpired = item.isExpired;
                          return (
                            <tr key={idx} className={`hover:bg-zinc-50 dark:hover:bg-zinc-800/20 ${isExpired ? 'bg-red-50/20 dark:bg-red-950/5' : ''}`}>
                              <td className="py-3 px-4">
                                <span className="font-bold text-zinc-900 dark:text-zinc-100 block">{item.productName}</span>
                                <span className="text-[10px] text-zinc-400 block">{item.presentation} ({item.category})</span>
                              </td>
                              <td className="py-3 px-4 text-zinc-750 dark:text-zinc-300">
                                <div className="flex flex-col">
                                  {item.shelfLetter ? (
                                    <>
                                      <span className="font-extrabold text-indigo-600 dark:text-indigo-400 font-mono text-[11px] flex items-center gap-1">
                                        📍 {item.shelfLetter}{item.shelfLevel || ''}
                                      </span>
                                      <span className="text-[10px] text-zinc-400">
                                        {lang === 'es' ? `Estant. ${item.shelfLetter} Estante ${item.shelfLevel || '-'}` : `Shelf ${item.shelfLetter} lvl ${item.shelfLevel || '-'}`}
                                      </span>
                                    </>
                                  ) : (
                                    <span className="text-zinc-400 italic text-[10px] flex items-center gap-1">
                                      ⚠️ {lang === 'es' ? 'Sin ubicación asignada' : 'No location specified'}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-3 px-2 text-center font-mono font-bold text-zinc-700 dark:text-zinc-200">
                                {item.batchCode}
                              </td>
                              <td className="py-3 px-2 text-center font-mono text-zinc-600 dark:text-zinc-300">
                                {item.expirationDate}
                              </td>
                              <td className="py-3 px-2 text-center">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full font-mono font-bold text-[10px] ${
                                  isExpired 
                                    ? 'bg-red-650/10 text-red-600 animate-pulse' 
                                    : item.daysRemaining <= 30
                                    ? 'bg-amber-500/10 text-amber-650'
                                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                                }`}>
                                  {isExpired 
                                    ? (lang === 'es' ? 'VENCIDO' : 'EXPIRED') 
                                    : `${item.daysRemaining} ${lang === 'es' ? 'días' : 'days'}`}
                                </span>
                              </td>
                              <td className="py-3 px-2 text-center font-mono font-bold text-zinc-900 dark:text-white">
                                {item.quantity} u
                              </td>
                              <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const win = window.open('', '_blank');
                                    if (win) {
                                      const printLocation = item.shelfLetter 
                                        ? `${item.shelfLetter}${item.shelfLevel || ''} (Estantería ${item.shelfLetter} Estante ${item.shelfLevel || '-'})` 
                                        : 'Depósito General (Sin asignar)';
                                      win.document.write(`
                                        <html>
                                          <head>
                                            <title>Acta de Descarte y Destrucción</title>
                                            <style>
                                              body { font-family: 'Helvetica', Arial, sans-serif; padding: 40px; color: #333; line-height: 1.5; }
                                              .header { text-align: center; border-bottom: 2px solid #ea580c; padding-bottom: 20px; margin-bottom: 30px; }
                                              .institution { font-size: 14px; font-weight: bold; text-transform: uppercase; color: #666; }
                                              .title { font-size: 22px; font-weight: 800; color: #ea580c; margin: 10px 0; }
                                              .subtitle { font-size: 12px; font-weight: 500; color: #aaa; }
                                              .section-title { font-size: 13px; font-weight: bold; background: #f4f4f5; padding: 6px 12px; margin-top: 30px; text-transform: uppercase; }
                                              table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 12px; }
                                              th, td { border: 1px solid #e4e4e7; padding: 10px; text-align: left; }
                                              th { background: #fafafa; font-weight: bold; }
                                              .signatures { display: flex; justify-content: space-between; margin-top: 80px; }
                                              .signature-block { width: 45%; border-top: 1px italic #ccc; text-align: center; padding-top: 10px; font-size: 12px; }
                                              .seal-block { border: 1px solid #ddd; padding: 20px; font-size: 11px; text-align: center; width: 140px; float: right; margin-top: 40px;}
                                            </style>
                                          </head>
                                          <body>
                                            <div class="header">
                                              <div class="institution">Gobierno de la Provincia de Buenos Aires • Región Sanitaria VI</div>
                                              <div class="title">Acta Oficial de Descarte de Medicación Vencida</div>
                                              <div class="institution">Centro de Atención Primaria de la Salud (CAPS) Sabatto</div>
                                              <div class="subtitle">Expediente ID: ACTA-DES-${Date.now().toString().slice(-6)}</div>
                                            </div>
                                            
                                            <p>En el partido de Berazategui, Provincia de Buenos Aires, a los ${new Date().getDate()} días del mes de ${new Date().toLocaleString('es', { month: 'long' })} de ${new Date().getFullYear()}, se reúne la Dirección y el personal farmacéutico técnico del CAPS Sabatto, procediéndose a la intervención, aislamiento y descarte definitivo del siguiente lote debido a su vencimiento laboral registrado, inhibiendo su reutilización o suministro clínico conforme a la Ley de Farmacia vigentes:</p>
                                            
                                            <div class="section-title">Detalle del Insumo Intervenido</div>
                                            <table>
                                              <thead>
                                                <tr>
                                                  <th>Medicamento / Insumo</th>
                                                  <th>Ubicación</th>
                                                  <th>Presentación</th>
                                                  <th>Lote</th>
                                                  <th>Vencimiento</th>
                                                  <th>Cantidad Retirada</th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                <tr>
                                                  <td><strong>${item.productName}</strong></td>
                                                  <td><span style="font-family: monospace; font-weight: bold; color: #4f46e5;">${printLocation}</span></td>
                                                  <td>${item.presentation}</td>
                                                  <td><strong>${item.batchCode}</strong></td>
                                                  <td>${item.expirationDate}</td>
                                                  <td><strong>${item.quantity} unidades</strong></td>
                                                </tr>
                                              </tbody>
                                            </table>
                                            
                                            <div class="section-title">Dictamen Farmacéutico de Destrucción</div>
                                            <p style="font-size: 11px;">Se procedió al retiro del stock del depósito centralizado y su traspaso al circuito de tratamiento de residuos patogénicos de Berazategui para su destrucción inerte. Se deja constancia de que los números de lote señalados coinciden de forma unívoca con la presente acta.</p>
                                            
                                            <div class="seal-block">
                                              Sello Oficial<br>CAPS Sabatto<br>Berazategui
                                            </div>
                                            
                                            <div class="signatures">
                                              <div class="signature-block">
                                                <br><br>
                                                _______________________________<br>
                                                <strong>Farm. Sofía Sabatto</strong><br>
                                                Farmacéutica Directora Técnica MD: 12.421
                                              </div>
                                              <div class="signature-block">
                                                <br><br>
                                                _______________________________<br>
                                                <strong>Téc. Ariel Zárate</strong><br>
                                                Técnico de Farmacia CAPS Sabatto
                                              </div>
                                            </div>
                                          </body>
                                        </html>
                                      `);
                                      win.document.close();
                                      win.print();
                                    }
                                  }}
                                  className="px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-750 dark:text-zinc-300 bg-white hover:bg-zinc-100 dark:bg-zinc-800 dark:hover:bg-zinc-700 transition font-bold text-[10px] cursor-pointer inline-flex items-center gap-1"
                                >
                                  📄 Acta
                                </button>
                                <button
                                  type="button"
                                  disabled={!isLastBusinessDayActive}
                                  onClick={() => handleDiscardBatch(item.productId, item.batchCode, item.quantity)}
                                  className={`px-3 py-1.5 rounded-lg text-white font-bold text-[10px] cursor-pointer transition ${
                                    isLastBusinessDayActive 
                                      ? 'bg-red-650 hover:bg-red-700' 
                                      : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed'
                                  }`}
                                >
                                  ✂️ Descartar
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

      <AnimatePresence>
        {dialog?.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-xl max-w-sm w-full space-y-4"
            >
              <div className="flex items-start gap-4">
                <span className={`p-2.5 rounded-xl shrink-0 ${
                  dialog.severity === 'danger' 
                    ? 'bg-red-500/10 text-red-500' 
                    : dialog.severity === 'warning'
                    ? 'bg-amber-500/10 text-amber-500'
                    : 'bg-indigo-505/10 text-indigo-500'
                }`}>
                  <AlertTriangle size={20} />
                </span>
                <div className="space-y-1">
                  <h4 className="font-bold text-sm text-zinc-900 dark:text-zinc-50">{dialog.title}</h4>
                  <p className="text-xs text-zinc-500 leading-relaxed">{dialog.message}</p>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2 text-xs">
                {dialog.cancelText && (
                  <button
                    type="button"
                    onClick={() => setDialog(null)}
                    className="hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 font-bold px-4 py-2 rounded-xl cursor-pointer transition"
                  >
                    {dialog.cancelText}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (dialog.onConfirm) dialog.onConfirm();
                    setDialog(null);
                  }}
                  className={`font-bold px-4 py-2 rounded-xl cursor-pointer transition transform active:scale-97 ${
                    dialog.severity === 'danger'
                      ? 'bg-red-650 hover:bg-red-700 text-white'
                      : dialog.severity === 'warning'
                      ? 'bg-amber-550 hover:bg-amber-600 text-white'
                      : 'bg-zinc-800 hover:bg-zinc-900 text-white dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-black'
                  }`}
                >
                  {dialog.onConfirm 
                    ? dialog.confirmText || (lang === 'es' ? 'Aceptar' : 'Accept')
                    : (lang === 'es' ? 'Entendido' : 'Got it')
                  }
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
