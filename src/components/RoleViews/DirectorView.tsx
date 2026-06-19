/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { translations } from '../../translations';
import { User, Product, Order, AuditLog, Role, PredefinedService } from '../../types';
import { 
  Building2, 
  Search, 
  AlertTriangle, 
  TrendingUp, 
  FileText, 
  History, 
  Printer, 
  Layers, 
  Calendar, 
  ClipboardCheck,
  CheckCircle2,
  Info,
  SlidersHorizontal,
  FolderLock,
  ChevronDown,
  ChevronUp,
  Clock,
  ArrowRight,
  User as UserIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { playBeep } from '../../lib/sound';

interface DirectorViewProps {
  currentUser: User;
  products: Product[];
  orders: Order[];
  users: User[];
  auditLogs: AuditLog[];
  lang: 'es' | 'en';
}

export default function DirectorView({
  currentUser,
  products,
  orders,
  users,
  auditLogs,
  lang,
}: DirectorViewProps) {
  const [activeTab, setActiveTab] = useState<'catalog' | 'history_deliveries' | 'audit' | 'reports'>('catalog');
  const [searchQuery, setSearchQuery] = useState('');
  const [productTypeFilter, setProductTypeFilter] = useState<'All' | 'Med' | 'PM'>('All');
  const [semaforoFilter, setSemaforoFilter] = useState<'All' | 'Rojo' | 'Amarillo' | 'Verde' | 'Vencido'>('All');
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);

  // Estados para consulta de historial de entregas
  const [historyServiceFilter, setHistoryServiceFilter] = useState<string>('All');
  const [historyStartDate, setHistoryStartDate] = useState<string>('');
  const [historyEndDate, setHistoryEndDate] = useState<string>('');
  const [historySearchQuery, setHistorySearchQuery] = useState<string>('');
  const [expandedHistoryOrder, setExpandedHistoryOrder] = useState<string | null>(null);

  // Estados de informes
  const [reportSelection, setReportSelection] = useState<'consumption' | 'low_stock' | 'expiring'>('consumption');

  // Estado para cuadro de diálogos modernos
  const [dialog, setDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm?: () => void;
  } | null>(null);

  const t = translations[lang];

  // Helper de cálculo de stock total
  const getProductTotalStock = (p: Product) => {
    return p.batches.reduce((acc, b) => acc + b.quantity, 0);
  };

  // Saber la situación del producto (Semaforización)
  const getProductStatus = (p: Product) => {
    const total = getProductTotalStock(p);
    
    // Verificar si hay lotes vencidos
    const today = new Date().toISOString().split('T')[0];
    const hasExpired = p.batches.some(b => b.expirationDate < today && b.quantity > 0);
    if (hasExpired) return 'Vencido';

    if (total === 0) return 'Rojo'; // Sin stock
    if (total <= p.minStock) return 'Amarillo'; // Stock bajo
    return 'Verde'; // Stock correcto
  };

  // Filtrado del catálogo
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      // Búsqueda textual
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            p.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            (p.shelfLetter && `estanteria ${p.shelfLetter}`.toLowerCase().includes(searchQuery.toLowerCase()));
      
      // Tipo (Medicamento vs Producto Médico)
      const matchesType = productTypeFilter === 'All' || p.productType === productTypeFilter;

      // Semaforización
      const status = getProductStatus(p);
      const matchesSemaforo = semaforoFilter === 'All' || status === semaforoFilter;

      return matchesSearch && matchesType && matchesSemaforo;
    });
  }, [products, searchQuery, productTypeFilter, semaforoFilter]);

  // Cálculos estadísticos para directores
  const metrics = useMemo(() => {
    const totalItems = products.length;
    let criticalItemsCount = 0;
    let outOfStockItemsCount = 0;
    let expiredBatchesCount = 0;
    let totalStockVolume = 0;

    const today = new Date().toISOString().split('T')[0];

    products.forEach(p => {
      const total = getProductTotalStock(p);
      totalStockVolume += total;

      const status = getProductStatus(p);
      if (status === 'Amarillo') criticalItemsCount++;
      if (status === 'Rojo') outOfStockItemsCount++;
      
      p.batches.forEach(b => {
        if (b.expirationDate < today && b.quantity > 0) {
          expiredBatchesCount++;
        }
      });
    });

    const activeOrders = orders.filter(o => o.status !== 'Entregado').length;
    const completedOrders = orders.filter(o => o.status === 'Entregado').length;

    return {
      totalItems,
      criticalItemsCount,
      outOfStockItemsCount,
      expiredBatchesCount,
      totalStockVolume,
      activeOrders,
      completedOrders
    };
  }, [products, orders]);

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

  // Imprimir reporte consolidado
  const handlePrintReport = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      setDialog({
        isOpen: true,
        title: lang === 'es' ? 'Permiso Bloqueado por el Navegador' : 'Popup Blocked',
        message: lang === 'es' 
          ? 'Para descargar/imprimir el informe de la Dirección, habilite los permisos para abrir ventanas emergentes (popups) en la barra del navegador.' 
          : 'To print this executive report, please allow popups in your browser address bar settings.'
      });
      return;
    }

    const todayStr = new Date().toLocaleDateString(lang === 'es' ? 'es-AR' : 'en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    let reportTitle = '';
    let reportHtml = '';

    if (reportSelection === 'consumption') {
      reportTitle = lang === 'es' ? 'Informe Ejecutivo de Consumo de Servicios' : 'Executive Service Consumption Report';
      
      // Calcular consumo asignado por servicio en órdenes entregadas
      const consumption: Record<string, Record<string, number>> = {
        [PredefinedService.GUARDIA]: {},
        [PredefinedService.LABORATORIO]: {},
        [PredefinedService.IRAB]: {},
        [PredefinedService.FARMACIA]: {}
      };

      orders.filter(o => o.status === 'Entregado').forEach(o => {
        const svc = o.service;
        if (!consumption[svc]) consumption[svc] = {};
        
        o.items.forEach(itm => {
          const qty = itm.approvedQuantity || 0;
          if (qty > 0) {
            consumption[svc][itm.productName] = (consumption[svc][itm.productName] || 0) + qty;
          }
        });
      });

      reportHtml = `
        <div style="margin-bottom: 25px;">
          <p style="font-size: 14px; color: #555;">Este reporte consolida el total de medicamentos e insumos médicos egresados del Depósito Central y recibidos efectivamente por las enfermerías de cada servicio clínico.</p>
        </div>
        ${Object.entries(consumption).map(([service, items]) => `
          <div style="margin-bottom: 30px; page-break-inside: avoid;">
            <h3 style="border-bottom: 2px solid #0f172a; padding-bottom: 5px; color: #0f172a; text-transform: uppercase; font-size: 15px; margin-bottom: 10px;">
              Servicio: ${service}
            </h3>
            ${Object.keys(items).length === 0 ? `
              <p style="font-size: 12px; color: #777; font-style: italic;">Sin consumos registrados en este período.</p>
            ` : `
              <table style="width:100%; border-collapse:collapse; font-size:12px;">
                <thead>
                  <tr style="background-color: #f1f5f9;">
                    <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: left;">Insumo / Fármaco</th>
                    <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right; width: 120px;">Cantidad Consumida</th>
                  </tr>
                </thead>
                <tbody>
                  ${Object.entries(items).map(([name, qty]) => `
                    <tr>
                      <td style="padding: 8px; border: 1px solid #e2e8f0;">${name}</td>
                      <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: right; font-weight: bold;">${qty} U</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            `}
          </div>
        `).join('')}
      `;
    } else if (reportSelection === 'low_stock') {
      reportTitle = lang === 'es' ? 'Reporte Directivo de Alerta de Stock Bajo y Quiebre' : 'Directorial Under-Stock & Stockout Alert';
      const criticalProducts = products.filter(p => getProductStatus(p) === 'Amarillo' || getProductStatus(p) === 'Rojo');

      reportHtml = `
        <div style="margin-bottom: 25px;">
          <p style="font-size: 14px; color: #555;">Lista de insumos críticos con stock central igual a cero (quiebre absoluto) o por debajo del stock de seguridad especificado para alertas preventivas.</p>
        </div>
        <table style="width:100%; border-collapse:collapse; font-size:12px;">
          <thead>
            <tr style="background-color: #f1f5f9;">
              <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: left;">ID</th>
              <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: left;">Fármaco / Insumo</th>
              <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: left;">Ubicación</th>
              <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right; width: 100px;">Stock Actual</th>
              <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right; width: 100px;">Umbral Mín.</th>
              <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: center; width: 120px;">Estado</th>
            </tr>
          </thead>
          <tbody>
            ${criticalProducts.length === 0 ? `
              <tr>
                <td colspan="6" style="padding: 15px; text-align: center; color: #15803d; font-weight: bold; background-color: #f0fdf4;">
                  🎉 ¡Perfecto! Ningún insumo central se encuentra por debajo de su stock crítico de seguridad.
                </td>
              </tr>
            ` : criticalProducts.map(p => {
              const total = getProductTotalStock(p);
              const isOut = total === 0;
              return `
                <tr>
                  <td style="padding: 8px; border: 1px solid #e2e8f0; font-family:monospace;">${p.id}</td>
                  <td style="padding: 8px; border: 1px solid #e2e8f0;">
                    <strong>${p.name}</strong><br/>
                    <small style="color: #64748b;">${p.presentation}</small>
                  </td>
                  <td style="padding: 8px; border: 1px solid #e2e8f0;">Estante ${p.shelfLetter || 'N/A'}-${p.shelfLevel || '?' }</td>
                  <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: right; font-weight: bold; color: ${isOut ? '#dc2626' : '#d97706'}">${total} U</td>
                  <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: right;">${p.minStock} U</td>
                  <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center; font-weight: bold; text-transform: uppercase;">
                    <span style="color: ${isOut ? '#dc2626' : '#d97706'}; font-size:11px;">
                      ${isOut ? (lang === 'es' ? 'QUIEBRE DE STOCK' : 'OUT OF STOCK') : (lang === 'es' ? 'ALERTA BAJO' : 'LOW STOCK')}
                    </span>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      `;
    } else {
      reportTitle = lang === 'es' ? 'Planilla Preventiva de Expiración por Lotes' : 'Preventive Expiration Chart by Batches';
      const today = new Date().toISOString().split('T')[0];
      
      const expiringList: { product: Product; batch: any; isExpired: boolean; daysRemaining: number }[] = [];
      products.forEach(p => {
        p.batches.forEach(b => {
          if (b.quantity > 0) {
            const timeDiff = new Date(b.expirationDate).getTime() - new Date(today).getTime();
            const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
            // Si está vencido o vence en menos de 95 días
            if (daysDiff <= 95) {
              expiringList.push({
                product: p,
                batch: b,
                isExpired: daysDiff <= 0,
                daysRemaining: daysDiff
              });
            }
          }
        });
      });

      // Ordenar por días de vencimiento progresivo
      expiringList.sort((a, b) => a.daysRemaining - b.daysRemaining);

      reportHtml = `
        <div style="margin-bottom: 25px;">
          <p style="font-size: 14px; color: #555;">Análisis preventivo de lotes próximos a vencer dentro del rango de 90 días o ya vencidos en estanterías. Planificado bajo criterio de supervisión FEFO.</p>
        </div>
        <table style="width:100%; border-collapse:collapse; font-size:12px;">
          <thead>
            <tr style="background-color: #f1f5f9;">
              <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: left;">Medicamento / Insumo</th>
              <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: left;">Código Lote</th>
              <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: center; width: 110px;">Fecha Expiración</th>
              <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right; width: 100px;">Lote Cantidad</th>
              <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right; width: 110px;">Días Restantes</th>
              <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: center; width: 100px;">Tipo Alerta</th>
            </tr>
          </thead>
          <tbody>
            ${expiringList.length === 0 ? `
              <tr>
                <td colspan="6" style="padding: 15px; text-align: center; color: #15803d; font-weight: bold; background-color: #f0fdf4;">
                  🎉 ¡Excelente! No hay lotes activos próximos a vencer en los siguientes 90 días.
                </td>
              </tr>
            ` : expiringList.map(item => `
              <tr>
                <td style="padding: 8px; border: 1px solid #e2e8f0;">
                  <strong>${item.product.name}</strong><br/>
                  <small style="color: #64748b;">${item.product.presentation}</small>
                </td>
                <td style="padding: 8px; border: 1px solid #e2e8f0; font-family: monospace;">${item.batch.batchCode}</td>
                <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center;">${item.batch.expirationDate}</td>
                <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: right; font-weight: bold;">${item.batch.quantity} U</td>
                <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: right; font-weight: bold; color: ${item.isExpired ? '#e11d48' : item.daysRemaining <= 30 ? '#ea580c' : '#ca8a04'}">
                  ${item.isExpired ? (lang === 'es' ? 'VENCIDO' : 'EXPIRED') : `${item.daysRemaining} d`}
                </td>
                <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center; font-weight: bold; text-transform: uppercase;">
                  <span style="color: ${item.isExpired ? '#e11d48' : item.daysRemaining <= 30 ? '#ea580c' : '#ca8a04'}; font-size: 11px;">
                    ${item.isExpired ? 'CRÍTICO ROJO' : item.daysRemaining <= 30 ? 'ALERTA NARANJA' : 'PREVENTIVO'}
                  </span>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    const htmlToPrint = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${reportTitle}</title>
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1e293b; padding: 40px; line-height: 1.5; }
          .header { border-bottom: 3px double #0f172a; padding-bottom: 20px; margin-bottom: 30px; text-align: center; }
          .logo-sub { text-transform: uppercase; letter-spacing: 2px; font-size: 11px; color: #ea580c; font-weight: bold; margin-bottom: 5px;}
          .main-title { font-size: 22px; color: #0f172a; font-weight: 800; margin: 0; }
          .meta-info { font-size: 12px; color: #64748b; margin-top: 8px; font-family: sans-serif; }
          .footer { border-top: 1px solid #e2e8f0; padding-top: 15px; margin-top: 50px; font-size: 10px; color: #94a3b8; text-align: center; }
          .sig-container { margin-top: 60px; float: right; text-align: center; width: 220px; page-break-inside: avoid; }
          .line { border-top: 1px solid #1e293b; margin-bottom: 5px; width: 100%; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo-sub">Soporte CAPS Digital • Argentina</div>
          <h1 class="main-title">${reportTitle}</h1>
          <div class="meta-info">
            Fecha de Emisión: <strong>${todayStr}</strong> | Solicitante: <strong>${currentUser.name} (Supervisión CAPS)</strong>
          </div>
        </div>

        ${reportHtml}

        <div style="clear: both;"></div>

        <div class="sig-container">
          <div class="line"></div>
          <span style="font-size: 11px; font-weight: bold; color: #0f172a;">${currentUser.name}</span><br/>
          <span style="font-size: 10px; color: #64748b;">Dirección General CAPS Sabatto</span>
        </div>

        <div class="footer">
          Documento Clínico de Carga Directiva y Seguimiento Interno de Existencias FEFO. Prohibida su copia no autorizada.
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
            <span style="font-size: 9px; color: #64748b;">${currentUser.name}</span>
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

  return (
    <div className="space-y-6">
      
      {/* Banner Principal de Dirección */}
      <div className="bg-radial from-teal-900 via-zinc-950 to-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 relative overflow-hidden shadow-sm transition-colors">
        <div className="absolute top-0 right-0 p-8 text-teal-500/10 pointer-events-none select-none">
          <Building2 size={240} className="stroke-1" />
        </div>
        <div className="relative space-y-3 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-teal-500/10 border border-teal-500/20 text-teal-400 font-mono text-[10px] font-bold rounded-full uppercase tracking-wider">
            <span className="size-1.5 bg-teal-400 rounded-full animate-pulse"></span>
            Portal de Dirección y Control
          </div>
          <h2 className="font-sans font-extrabold text-2xl tracking-tight text-white leading-tight">
            Gobierno Estratégico y Auditoría de Suministros
          </h2>
          <p className="text-sm text-zinc-400 leading-relaxed font-sans">
            Bienvenido doctor/a. Como miembro de la <strong>Dirección del CAPS</strong>, posee atribuciones de lectura consolidada en tiempo real de lotes FEFO, historial clínico-administrativo de auditorías sistémicas y generación de informes ejecutivos de consumo para el Ministerio de Salud.
          </p>
        </div>
      </div>

      {/* Tarjetas Informativas / Métricas KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Catálogo de Insumos */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 rounded-2xl flex items-start gap-4 transition shadow-sm">
          <span className="p-3 bg-teal-500/10 text-teal-600 dark:text-teal-400 rounded-xl shrink-0">
            <Layers size={20} />
          </span>
          <div className="space-y-0.5">
            <span className="text-[10px] font-extrabold uppercase font-mono tracking-widest text-zinc-400 block">Total Catálogo</span>
            <span className="text-2xl font-bold font-sans tracking-tight text-zinc-900 dark:text-zinc-50">{metrics.totalItems}</span>
            <p className="text-[11px] text-zinc-400 truncate">Medicamentos y Materiales</p>
          </div>
        </div>

        {/* Desviaciones / Stock Crítico */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 rounded-2xl flex items-start gap-4 transition shadow-sm">
          <span className="p-3 bg-red-500/10 text-red-600 dark:text-red-400 rounded-xl shrink-0">
            <AlertTriangle size={20} />
          </span>
          <div className="space-y-0.5">
            <span className="text-[10px] font-extrabold uppercase font-mono tracking-widest text-zinc-400 block">Stock Crítico o Quiebre</span>
            <span className="text-2xl font-bold font-sans tracking-tight text-red-600 dark:text-red-400">
              {metrics.criticalItemsCount + metrics.outOfStockItemsCount}
            </span>
            <p className="text-[11px] text-zinc-400">
              {metrics.outOfStockItemsCount} en falta absoluta
            </p>
          </div>
        </div>

        {/* Lotes vencidos */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 rounded-2xl flex items-start gap-4 transition shadow-sm">
          <span className="p-3 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-xl shrink-0">
            <Calendar size={20} />
          </span>
          <div className="space-y-0.5">
            <span className="text-[10px] font-extrabold uppercase font-mono tracking-widest text-zinc-400 block">Lotes Vencidos</span>
            <span className="text-2xl font-bold font-sans tracking-tight text-amber-600 dark:text-amber-400">{metrics.expiredBatchesCount}</span>
            <p className="text-[11px] text-zinc-400">Omitidos en FEFO activo</p>
          </div>
        </div>

        {/* Auditorías registradas */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 rounded-2xl flex items-start gap-4 transition shadow-sm">
          <span className="p-3 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl shrink-0">
            <History size={20} />
          </span>
          <div className="space-y-0.5">
            <span className="text-[10px] font-extrabold uppercase font-mono tracking-widest text-zinc-400 block">Registros de Auditoría</span>
            <span className="text-2xl font-bold font-sans tracking-tight text-zinc-900 dark:text-zinc-50">{auditLogs.length}</span>
            <p className="text-[11px] text-zinc-400 truncate">Acciones de personal</p>
          </div>
        </div>

      </div>

      {/* Navegador de Pestañas */}
      <div className="flex border-b border-zinc-200 dark:border-zinc-800">
        <button
          onClick={() => { setActiveTab('catalog'); playBeep('beep'); }}
          className={`px-5 py-3 text-xs font-bold transition duration-200 border-b-2 cursor-pointer flex items-center gap-2 ${activeTab === 'catalog' ? 'border-teal-500 text-teal-600 dark:text-teal-400 font-extrabold' : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-100'}`}
        >
          <Layers size={14} />
          <span>Consulta General de Stock</span>
        </button>
        <button
          onClick={() => { setActiveTab('history_deliveries'); playBeep('beep'); }}
          className={`px-5 py-3 text-xs font-bold transition duration-200 border-b-2 cursor-pointer flex items-center gap-2 ${activeTab === 'history_deliveries' ? 'border-teal-500 text-teal-600 dark:text-teal-400 font-extrabold' : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-100'}`}
        >
          <CheckCircle2 size={14} />
          <span>Historial de Entregas por Sector</span>
        </button>
        <button
          onClick={() => { setActiveTab('audit'); playBeep('beep'); }}
          className={`px-5 py-3 text-xs font-bold transition duration-200 border-b-2 cursor-pointer flex items-center gap-2 ${activeTab === 'audit' ? 'border-teal-500 text-teal-600 dark:text-teal-400 font-extrabold' : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-100'}`}
        >
          <History size={14} />
          <span>Conformidad e Historial Sistémico</span>
        </button>
        <button
          onClick={() => { setActiveTab('reports'); playBeep('beep'); }}
          className={`px-5 py-3 text-xs font-bold transition duration-200 border-b-2 cursor-pointer flex items-center gap-2 ${activeTab === 'reports' ? 'border-teal-500 text-teal-600 dark:text-teal-400 font-extrabold' : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-100'}`}
        >
          <FileText size={14} />
          <span>Informes Clínicos y Reportes</span>
        </button>
      </div>

      {/* Contenedor de Vistas */}
      <div>
        <AnimatePresence mode="wait">
          
          {/* TAB 1: CONSULTA DE CATÁLOGO */}
          {activeTab === 'catalog' && (
            <motion.div
              key="catalog"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-sm overflow-hidden p-6 space-y-4">
                
                {/* Control Filtros */}
                <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
                  <div className="relative w-full md:w-80">
                    <Search className="absolute left-3 inset-y-0 my-auto text-zinc-400" size={14} />
                    <input
                      type="text"
                      className="w-full pl-9 pr-4 py-2 border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-xs rounded-xl focus:outline-none focus:ring-1 focus:ring-teal-500 text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 font-sans"
                      placeholder={lang === 'es' ? 'Buscar fármaco por nombre, estante...' : 'Search clinical product, location...'}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                    
                    {/* Filtro Medicamento vs PM */}
                    <div className="flex bg-zinc-100 dark:bg-zinc-950 rounded-xl p-0.5 border border-zinc-200 dark:border-zinc-800 text-semibold text-zinc-500 text-[10px]">
                      <button
                        type="button"
                        onClick={() => { setProductTypeFilter('All'); playBeep('beep'); }}
                        className={`px-3 py-1 cursor-pointer font-bold rounded-lg transition-all ${productTypeFilter === 'All' ? 'bg-white dark:bg-zinc-900 shadow-xs text-teal-600 dark:text-teal-400 font-extrabold' : 'hover:text-zinc-700'}`}
                      >
                        Todos
                      </button>
                      <button
                        type="button"
                        onClick={() => { setProductTypeFilter('Med'); playBeep('beep'); }}
                        className={`px-3 py-1 cursor-pointer font-bold rounded-lg transition-all ${productTypeFilter === 'Med' ? 'bg-white dark:bg-zinc-900 shadow-xs text-teal-600 dark:text-teal-400 font-extrabold' : 'hover:text-zinc-700'}`}
                      >
                        💊 Fármaco
                      </button>
                      <button
                        type="button"
                        onClick={() => { setProductTypeFilter('PM'); playBeep('beep'); }}
                        className={`px-3 py-1 cursor-pointer font-bold rounded-lg transition-all ${productTypeFilter === 'PM' ? 'bg-white dark:bg-zinc-900 shadow-xs text-teal-600 dark:text-teal-400 font-extrabold' : 'hover:text-zinc-700'}`}
                      >
                        📦 Mat. Médico
                      </button>
                    </div>

                    {/* Filtro Semaforización */}
                    <div className="flex items-center gap-1.5 bg-zinc-50 dark:bg-zinc-950 px-2.5 py-1 rounded-xl border border-zinc-200 dark:border-zinc-800">
                      <SlidersHorizontal size={12} className="text-zinc-400" />
                      <select
                        value={semaforoFilter}
                        onChange={(e) => { setSemaforoFilter(e.target.value as any); playBeep('beep'); }}
                        className="bg-transparent border-none text-[10px] font-bold text-zinc-650 focus:outline-none dark:text-zinc-300 pr-1 cursor-pointer"
                      >
                        <option value="All">{lang === 'es' ? 'Semáforo: Todos' : 'Status: All'}</option>
                        <option value="Verde">🟢 {lang === 'es' ? 'Stock Correcto' : 'Stock OK'}</option>
                        <option value="Amarillo">🟡 {lang === 'es' ? 'Stock Crítico Bajo' : 'Under Safety Min'}</option>
                        <option value="Rojo">🔴 {lang === 'es' ? 'Falta de Stock (Quiebre)' : 'Out of Stock'}</option>
                        <option value="Vencido">⚫ {lang === 'es' ? 'Material Vencido' : 'Expired Batches'}</option>
                      </select>
                    </div>

                  </div>
                </div>

                {/* Grid o Tabla de Stock */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-zinc-100 dark:border-zinc-800 text-zinc-400 uppercase tracking-wider font-semibold font-mono text-[10px]">
                        <th className="py-3 px-3">Código / ID</th>
                        <th className="py-3 px-3">{lang === 'es' ? 'Fármaco / Insumo' : 'Description'}</th>
                        <th className="py-3 px-3">{lang === 'es' ? 'Clasificación' : 'Classification'}</th>
                        <th className="py-3 px-3">{lang === 'es' ? 'Ubicación' : 'Position'}</th>
                        <th className="py-3 px-3 text-right">{lang === 'es' ? 'Mín. Alerta' : 'Safety Min'}</th>
                        <th className="py-3 px-3 text-right">{lang === 'es' ? 'Existencias Central' : 'Central Stock'}</th>
                        <th className="py-3 px-3 text-center">{lang === 'es' ? 'Estado' : 'Status badge'}</th>
                        <th className="py-3 px-3 text-center w-12">Detalle Lotes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 text-zinc-700 dark:text-zinc-300 font-sans">
                      {filteredProducts.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-8 text-center text-zinc-400 font-medium bg-zinc-50/50 dark:bg-zinc-950/20 rounded-xl">
                            No se encontraron insumos bajo las condiciones de filtros aplicadas.
                          </td>
                        </tr>
                      ) : (
                        filteredProducts.map((p) => {
                          const totalStock = getProductTotalStock(p);
                          const status = getProductStatus(p);
                          const isExpanded = expandedProduct === p.id;

                          return (
                            <React.Fragment key={p.id}>
                              <tr 
                                className={`group hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20 transition duration-150 cursor-pointer ${isExpanded ? 'bg-zinc-100/30 dark:bg-zinc-800/10' : ''}`}
                                onClick={() => {
                                  setExpandedProduct(isExpanded ? null : p.id);
                                  playBeep('beep');
                                }}
                              >
                                <td className="py-3 px-3 font-mono text-[10px] text-zinc-500 font-bold">{p.id}</td>
                                <td className="py-3 px-3">
                                  <span className="font-bold text-zinc-900 dark:text-zinc-100 hover:text-teal-600 block">{p.name}</span>
                                  <span className="text-[10px] text-zinc-400 block">{p.presentation}</span>
                                </td>
                                <td className="py-3 px-3 text-[10px]">
                                  <span className={`inline-flex px-2 py-0.5 rounded-md font-bold ${p.productType === 'PM' ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400' : 'bg-indigo-100 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400'}`}>
                                    {p.productType === 'PM' ? '📦 Producto Médico' : '💊 Medicamento'}
                                  </span>
                                </td>
                                <td className="py-3 px-3 font-mono text-[10px]">
                                  Estantería <strong className="text-zinc-850 dark:text-zinc-200">{p.shelfLetter || 'A'}</strong> • Nivel <strong className="text-zinc-850 dark:text-zinc-200">{p.shelfLevel || 1}</strong>
                                </td>
                                <td className="py-3 px-3 text-right font-mono text-zinc-500">{p.minStock} U</td>
                                <td className="py-3 px-3 text-right font-bold font-mono">
                                  <span className={status === 'Rojo' ? 'text-red-500' : status === 'Amarillo' ? 'text-amber-500' : 'text-zinc-800 dark:text-zinc-200'}>
                                    {totalStock} U
                                  </span>
                                </td>
                                <td className="py-3 px-3 text-center">
                                  {status === 'Vencido' && (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-950 text-rose-300 border border-rose-800 uppercase tracking-wider font-mono">
                                      ☠️ Lote Vencido
                                    </span>
                                  )}
                                  {status === 'Rojo' && (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-400 border border-red-500/10 uppercase tracking-wider font-mono">
                                      🔴 Quiebre (0)
                                    </span>
                                  )}
                                  {status === 'Amarillo' && (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 dark:bg-amber-900/10 text-amber-700 dark:text-amber-400 border border-amber-500/10 uppercase tracking-wider font-mono">
                                      🟡 Crítico ({totalStock})
                                    </span>
                                  )}
                                  {status === 'Verde' && (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/10 uppercase tracking-wider font-mono">
                                      🟢 Disponible
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 px-3 text-center">
                                  <button
                                    type="button"
                                    className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-lg cursor-pointer transition font-mono font-bold"
                                  >
                                    {isExpanded ? '[-]' : '[+]'}
                                  </button>
                                </td>
                              </tr>

                              {/* Lotes Desplegados */}
                              {isExpanded && (
                                <tr className="bg-zinc-50/50 dark:bg-zinc-950/30">
                                  <td colSpan={8} className="py-4 px-6">
                                    <div className="space-y-3.5 border-l-2 border-teal-500/50 pl-4 py-1">
                                      <div className="flex items-center justify-between">
                                        <h5 className="font-bold text-xs text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                                          <ClipboardCheck size={14} className="text-teal-600" />
                                          Distribución de Lotes Fiscos (FEFO Activo)
                                        </h5>
                                        <span className="text-[10px] text-zinc-400 font-mono italic">
                                          Se despacha prioritariamente el lote con expiración más próxima.
                                        </span>
                                      </div>

                                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                        {p.batches.length === 0 ? (
                                          <div className="col-span-full text-xs text-red-500 bg-red-100/10 p-3 rounded-xl border border-red-500/15 font-semibold">
                                            Sin lotes registrados. Quiebre de stock en estantería central.
                                          </div>
                                        ) : (
                                          p.batches.map((batch) => {
                                            const today = new Date().toISOString().split('T')[0];
                                            const isExpired = batch.expirationDate < today;
                                            
                                            return (
                                              <div 
                                                key={batch.id} 
                                                className={`p-3 rounded-xl border flex flex-col justify-between text-xs transition duration-150 ${isExpired ? 'bg-red-500/5 border-red-500/20' : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800'}`}
                                              >
                                                <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-1.5 mb-1.5">
                                                  <span className="font-mono text-[10px] font-bold text-zinc-400">Lote: <strong className="text-zinc-700 dark:text-zinc-200">{batch.batchCode}</strong></span>
                                                  <span className={`px-1.5 py-0.5 rounded-md font-mono font-bold text-[9px] ${isExpired ? 'bg-rose-950 text-rose-300' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-650'}`}>
                                                    {batch.quantity} U
                                                  </span>
                                                </div>
                                                <div className="flex items-center justify-between">
                                                  <span className="text-zinc-450 block text-[10px]">Vence:</span>
                                                  <span className={`font-mono text-[10px] font-bold ${isExpired ? 'text-red-500' : 'text-zinc-600 dark:text-zinc-300'}`}>
                                                    {batch.expirationDate}
                                                  </span>
                                                </div>
                                                {isExpired && (
                                                  <div className="mt-2 text-[9px] font-extrabold text-red-600 uppercase font-mono tracking-widest text-center animate-pulse">
                                                    ☠️ RETIRADO DEL CONSUMO
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          })
                                        )}
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

          {/* TAB: HISTORIAL DE ENTREGAS POR SECTOR Y FECHA */}
          {activeTab === 'history_deliveries' && (
            <motion.div
              key="history_deliveries"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm space-y-6">
                
                {/* Cabecera del Tab */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-100 dark:border-zinc-800 pb-4">
                  <div>
                    <h4 className="font-sans font-extrabold text-sm text-zinc-900 dark:text-zinc-100">Consultas de Despachos y Entregas Clínicas</h4>
                    <p className="text-[11px] text-zinc-400">Auditoría completa de suministros despachados a cada servicio, incluyendo trazabilidad del personal interviniente y lotes asignados.</p>
                  </div>
                  <div className="text-[10px] bg-teal-500/10 text-teal-600 dark:text-teal-400 font-extrabold uppercase px-2.5 py-1 rounded-xl self-start sm:self-auto">
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
                      className="w-full text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-2.5 py-2 text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-teal-500 font-medium cursor-pointer"
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
                      className="w-full text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-2.5 py-2 text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-teal-500 font-medium font-mono cursor-pointer"
                    />
                  </div>

                  {/* Fecha Hasta */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase text-zinc-400 block">Fecha Hasta</label>
                    <input
                      type="date"
                      value={historyEndDate}
                      onChange={(e) => { setHistoryEndDate(e.target.value); playBeep('beep'); }}
                      className="w-full text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-2.5 py-2 text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-teal-500 font-medium font-mono cursor-pointer"
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
                        className="w-full pl-8 pr-3 py-2 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-teal-500 font-medium font-sans placeholder-zinc-400"
                      />
                    </div>
                  </div>
                </div>

                {/* Mostrar Botones de Reseteo Rápido si hay filtros activos */}
                {(historyServiceFilter !== 'All' || historyStartDate || historyEndDate || historySearchQuery) && (
                  <div className="flex items-center justify-between text-xs bg-teal-500/5 border border-teal-500/10 rounded-xl p-3">
                    <span className="text-zinc-650 dark:text-zinc-350 font-medium">Hay criterios de filtrado seleccionados activos.</span>
                    <button
                      type="button"
                      onClick={() => {
                        setHistoryServiceFilter('All');
                        setHistoryStartDate('');
                        setHistoryEndDate('');
                        setHistorySearchQuery('');
                        playBeep('beep');
                      }}
                      className="text-teal-650 hover:text-teal-700 font-bold hover:underline cursor-pointer"
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
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 text-zinc-700 dark:text-zinc-300 font-sans">
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
                                  <span className="font-bold text-teal-600 dark:text-teal-400 block">{ord.service}</span>
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
                                <td className="py-3.5 px-3 text-center text-[10px] font-mono font-bold text-teal-650 dark:text-teal-400">
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
                                    <div className="space-y-4 border-l-2 border-teal-500/50 pl-5">
                                      {/* Controles de Acción (Imprimir Acta Directa) */}
                                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-3.5 rounded-2xl shadow-xs">
                                        <div className="space-y-0.5">
                                          <h5 className="font-bold text-xs text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                                            <ClipboardCheck size={14} className="text-teal-600" />
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
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
                                            <span className="p-1.5 bg-teal-500/10 rounded-lg text-teal-600 dark:text-teal-400">
                                              <CheckCircle2 size={14} />
                                            </span>
                                            <div>
                                              <span className="text-[10px] font-bold text-teal-600 dark:text-teal-400 block uppercase font-mono tracking-wider">3. Dispensado por</span>
                                              <span className="text-xs font-bold text-zinc-850 dark:text-zinc-200 block">{ord.deliveredBy?.userName || 'Farm. Sofía Sabatto'}</span>
                                              <span className="text-[9px] text-teal-600 block font-mono font-bold">Entregado: {deliveryDateStr}</span>
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
                                                            <strong className="text-teal-650 dark:text-teal-400 bg-teal-500/10 rounded px-1">{b.quantity} U</strong>
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

          {/* TAB 2: AUDITORÍA DE ACTIVIDAD */}
          {activeTab === 'audit' && (
            <motion.div
              key="audit"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
                  <div>
                    <h4 className="font-sans font-extrabold text-sm text-zinc-900 dark:text-zinc-100">Transparencia y Trazabilidad Sistémica</h4>
                    <p className="text-[11px] text-zinc-400">Control de firma digital e inmutabilidad de acciones realizadas por el personal.</p>
                  </div>
                  <FolderLock size={18} className="text-teal-600 shrink-0" />
                </div>

                <div className="flow-root">
                  <div className="-my-6 divide-y divide-zinc-100 dark:divide-zinc-800">
                    {auditLogs.length === 0 ? (
                      <div className="py-12 text-center text-xs text-zinc-400">
                        No hay firmas de auditoría registradas aún.
                      </div>
                    ) : (
                      auditLogs.map((log) => {
                        const date = new Date(log.timestamp);
                        const formatStr = date.toLocaleDateString(lang === 'es' ? 'es-AR' : 'en-US', {
                          day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                        });

                        return (
                          <div key={log.id} className="py-4 font-sans text-xs flex flex-col sm:flex-row sm:items-start justify-between gap-2 group">
                            <div className="space-y-1 max-w-xl">
                              <p className="text-zinc-850 dark:text-zinc-250 leading-relaxed font-medium">
                                {log.details}
                              </p>
                              <div className="flex flex-wrap items-center gap-2 text-[10px] text-zinc-400">
                                <span className="font-mono text-[9px] px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded-md font-bold">{log.id}</span>
                                <span>•</span>
                                <span>Por: <strong className="text-zinc-700 dark:text-zinc-300">{log.userName}</strong> ({log.userRole === Role.FARMACEUTICO ? 'Farmacéutico' : log.userRole === Role.TECNICO ? 'Técnico' : 'Enfermero'})</span>
                              </div>
                            </div>
                            <div className="text-right text-[10px] sm:self-center font-mono text-zinc-400 select-none group-hover:text-teal-600 transition">
                              {formatStr}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

              </div>
            </motion.div>
          )}

          {/* TAB 3: INFORMES DIRECTIVOS */}
          {activeTab === 'reports' && (
            <motion.div
              key="reports"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Selector de Informes en tarjeta izquierda */}
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm space-y-4 h-fit">
                  <h4 className="font-bold text-sm text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                    <SlidersHorizontal size={14} className="text-teal-600" />
                    Filtro de Reportes
                  </h4>
                  <p className="text-[11px] text-zinc-400">Configure qué información precisa relevar y consolidar para su análisis.</p>
                  
                  <div className="space-y-2 pt-2 text-xs">
                    
                    <button
                      type="button"
                      onClick={() => { setReportSelection('consumption'); playBeep('beep'); }}
                      className={`w-full text-left px-4 py-3 rounded-xl border flex items-center gap-3 cursor-pointer transition ${reportSelection === 'consumption' ? 'bg-teal-500/5 border-teal-500/30 text-teal-600 dark:text-teal-400 font-extrabold' : 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}
                    >
                      <TrendingUp size={16} />
                      <div className="space-y-0.5">
                        <span className="block">Consumo por Servicio</span>
                        <span className="text-[9px] text-zinc-400 font-medium block">Medicamentos egresados efectivos</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => { setReportSelection('low_stock'); playBeep('beep'); }}
                      className={`w-full text-left px-4 py-3 rounded-xl border flex items-center gap-3 cursor-pointer transition ${reportSelection === 'low_stock' ? 'bg-teal-500/5 border-teal-500/30 text-teal-600 dark:text-teal-400 font-extrabold' : 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}
                    >
                      <AlertTriangle size={16} />
                      <div className="space-y-0.5">
                        <span className="block">Alertas de Stock de Seguridad</span>
                        <span className="text-[9px] text-zinc-400 font-medium block">Productos en quiebre o sub-crónicos</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => { setReportSelection('expiring'); playBeep('beep'); }}
                      className={`w-full text-left px-4 py-3 rounded-xl border flex items-center gap-3 cursor-pointer transition ${reportSelection === 'expiring' ? 'bg-teal-500/5 border-teal-500/30 text-teal-600 dark:text-teal-400 font-extrabold' : 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}
                    >
                      <Calendar size={16} />
                      <div className="space-y-0.5">
                        <span className="block">Radar de Expiración (90 d)</span>
                        <span className="text-[9px] text-zinc-400 font-medium block">Alerta temprana de vencimientos</span>
                      </div>
                    </button>

                  </div>

                  <div className="h-[1px] bg-zinc-100 dark:bg-zinc-800 my-4"></div>

                  <button
                    type="button"
                    onClick={handlePrintReport}
                    className="w-full bg-slate-900 border border-slate-800 text-white dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-black hover:bg-slate-950 font-bold px-4 py-3 rounded-xl cursor-pointer shadow-sm transition flex items-center justify-center gap-2 transform active:scale-97 text-xs"
                  >
                    <Printer size={15} />
                    <span>Imprimir Planilla Oficial</span>
                  </button>
                </div>

                {/* Previsualización del informe en panel derecho */}
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm space-y-4 lg:col-span-2">
                  <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
                    <h4 className="font-bold text-sm text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                      <FileText size={15} className="text-teal-600" />
                      {reportSelection === 'consumption' && 'Previsualización: Consumo Clínico por Área'}
                      {reportSelection === 'low_stock' && 'Previsualización: Suministros Bajo Umbral de Seguridad'}
                      {reportSelection === 'expiring' && 'Previsualización: Cronología FEFO Próxima a Expirar'}
                    </h4>
                    <span className="text-[9px] px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded font-mono font-bold uppercase text-zinc-450">Borrador Directivo</span>
                  </div>

                  <div className="space-y-4 text-xs">
                    
                    {reportSelection === 'consumption' && (
                      <div className="space-y-4 max-h-[420px] overflow-y-auto">
                        <p className="text-zinc-500 italic leading-relaxed text-xs">
                          Muestra el total de insumos y fármacos correctamente preparados en el Depósito Central de la Farmacia CAPS e integrados a las enfermerías de consulta y emergencias.
                        </p>
                        {(() => {
                          const consumption: Record<string, Record<string, number>> = {
                            [PredefinedService.GUARDIA]: {},
                            [PredefinedService.LABORATORIO]: {},
                            [PredefinedService.IRAB]: {},
                            [PredefinedService.FARMACIA]: {}
                          };

                          orders.filter(o => o.status === 'Entregado').forEach(o => {
                            const svc = o.service;
                            if (consumption[svc]) {
                              o.items.forEach(itm => {
                                const qty = itm.approvedQuantity || 0;
                                if (qty > 0) {
                                  consumption[svc][itm.productName] = (consumption[svc][itm.productName] || 0) + qty;
                                }
                              });
                            }
                          });

                          return Object.entries(consumption).map(([svc, items]) => (
                            <div key={svc} className="p-4 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-850">
                              <h5 className="font-bold text-teal-600 dark:text-teal-400 border-b border-zinc-100 dark:border-zinc-800 pb-1.5 mb-2.5 flex items-center justify-between">
                                <span className="uppercase text-[10px] tracking-wider">{svc}</span>
                                <span className="font-mono text-[9px] text-zinc-400 font-bold">{Object.keys(items).length} ítems consumidos</span>
                              </h5>
                              {Object.keys(items).length === 0 ? (
                                <p className="text-zinc-400 italic">No hay suministros despachados en este período para el servicio.</p>
                              ) : (
                                <ul className="divide-y divide-zinc-200/50 dark:divide-zinc-800 space-y-1.5">
                                  {Object.entries(items).map(([name, qty]) => (
                                    <li key={name} className="flex items-center justify-between pt-1.5">
                                      <span className="text-zinc-800 dark:text-zinc-200">{name}</span>
                                      <span className="font-mono font-bold text-zinc-700 dark:text-zinc-300">{qty} unidades</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          ));
                        })()}
                      </div>
                    )}

                    {reportSelection === 'low_stock' && (
                      <div className="space-y-4">
                        <p className="text-zinc-500 italic leading-relaxed text-xs">
                          Listado directo de productos en stock central centralizado de CAPS Sabatto que están igual a cero (quiebre de provisión) o por debajo de su umbral de aviso.
                        </p>
                        <div className="overflow-x-auto max-h-[380px] overflow-y-auto border border-zinc-100 dark:border-zinc-800 rounded-2xl">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-zinc-50 dark:bg-zinc-950 text-zinc-400 font-bold text-[9px] uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-800">
                              <tr>
                                <th className="p-3">Insumo / Fármaco</th>
                                <th className="p-3 text-right">Stock Central</th>
                                <th className="p-3 text-right">Límite</th>
                                <th className="p-3 text-center">Riesgo</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(() => {
                                const criticalProducts = products.filter(p => getProductStatus(p) === 'Amarillo' || getProductStatus(p) === 'Rojo');
                                if (criticalProducts.length === 0) {
                                  return (
                                    <tr>
                                      <td colSpan={4} className="p-6 text-center text-emerald-600 font-bold bg-emerald-500/5">
                                        No hay productos centrales bajo mínimos de alerta. Provisión garantizada.
                                      </td>
                                    </tr>
                                  );
                                }
                                return criticalProducts.map(p => {
                                  const total = getProductTotalStock(p);
                                  const isOut = total === 0;
                                  return (
                                    <tr key={p.id} className="border-b border-zinc-100 dark:border-zinc-800">
                                      <td className="p-3">
                                        <p className="font-bold text-zinc-850 dark:text-zinc-100">{p.name}</p>
                                        <span className="text-[10px] text-zinc-400">{p.presentation}</span>
                                      </td>
                                      <td className="p-3 text-right font-mono font-bold text-zinc-800 dark:text-zinc-200">{total} U</td>
                                      <td className="p-3 text-right font-mono text-zinc-500">{p.minStock} U</td>
                                      <td className="p-3 text-center">
                                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${isOut ? 'bg-red-100 dark:bg-red-950/20 text-red-650' : 'bg-amber-100 dark:bg-amber-950/20 text-amber-650'}`}>
                                          {isOut ? 'QUIEBRE REGISTRADO' : 'STOCK CRÍTICO'}
                                        </span>
                                      </td>
                                    </tr>
                                  );
                                });
                              })()}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {reportSelection === 'expiring' && (
                      <div className="space-y-4">
                        <p className="text-zinc-500 italic leading-relaxed text-xs">
                          Muestra los lotes con fecha de vencimiento menor a 90 días ordenados de forma ascendente estricta según el principio First Expired First Out (FEFO).
                        </p>
                        <div className="overflow-x-auto max-h-[380px] overflow-y-auto border border-zinc-100 dark:border-zinc-800 rounded-2xl">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-zinc-50 dark:bg-zinc-950 text-zinc-400 font-bold text-[9px] uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-800">
                              <tr>
                                <th className="p-3">Insumo / Fármaco</th>
                                <th className="p-3">Lote Código</th>
                                <th className="p-3 text-center">Vence El</th>
                                <th className="p-3 text-right">Días Restantes</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(() => {
                                const today = new Date().toISOString().split('T')[0];
                                const expiringList: any[] = [];
                                products.forEach(p => {
                                  p.batches.forEach(b => {
                                    if (b.quantity > 0) {
                                      const timeDiff = new Date(b.expirationDate).getTime() - new Date(today).getTime();
                                      const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
                                      if (daysDiff <= 95) {
                                        expiringList.push({
                                          product: p,
                                          batch: b,
                                          isExpired: daysDiff <= 0,
                                          daysRemaining: daysDiff
                                        });
                                      }
                                    }
                                  });
                                });

                                expiringList.sort((a, b) => a.daysRemaining - b.daysRemaining);

                                if (expiringList.length === 0) {
                                  return (
                                    <tr>
                                      <td colSpan={4} className="p-6 text-center text-emerald-600 font-bold bg-emerald-500/5">
                                        No se detectaron vencimientos próximos en la estantería central en 90 días.
                                      </td>
                                    </tr>
                                  );
                                }

                                return expiringList.map((item, idx) => (
                                  <tr key={idx} className="border-b border-zinc-100 dark:border-zinc-800">
                                    <td className="p-3">
                                      <p className="font-bold text-zinc-850 dark:text-zinc-100">{item.product.name}</p>
                                    </td>
                                    <td className="p-3 font-mono font-bold text-zinc-550">{item.batch.batchCode}</td>
                                    <td className="p-3 text-center font-mono">{item.batch.expirationDate}</td>
                                    <td className="p-3 text-right">
                                      <span className={`font-mono font-bold ${item.isExpired ? 'text-red-500 animate-pulse' : item.daysRemaining <= 30 ? 'text-orange-500' : 'text-amber-500'}`}>
                                        {item.isExpired ? 'VENCIDO' : `${item.daysRemaining} días`}
                                      </span>
                                    </td>
                                  </tr>
                                ));
                              })()}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                  </div>
                </div>

              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* Alertas Modernas en React/Tailwind (Control de confirmación o de alertas directivas) */}
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
                <span className="p-2 bg-teal-500/10 text-teal-500 rounded-xl shrink-0">
                  <Info size={20} />
                </span>
                <div className="space-y-1">
                  <h4 className="font-bold text-sm text-zinc-900 dark:text-zinc-50">{dialog.title}</h4>
                  <p className="text-xs text-zinc-500 leading-relaxed font-sans">{dialog.message}</p>
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
                  className="bg-teal-650 hover:bg-teal-700 text-white font-bold px-4 py-2 rounded-xl cursor-pointer transition transform active:scale-97"
                >
                  {dialog.confirmText || (lang === 'es' ? 'Entendido' : 'Got it')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
