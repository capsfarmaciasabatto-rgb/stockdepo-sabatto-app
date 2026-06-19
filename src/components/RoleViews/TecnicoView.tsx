/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { translations } from '../../translations';
import { User, Order, Product, OrderItem, OrderStatus, PredefinedService, StockBatch, Role } from '../../types';
import { suggestFEFOBatches } from '../../lib/database';
import { 
  ClipboardCheck, 
  Edit3, 
  Check, 
  AlertTriangle, 
  Search, 
  Upload,
  Activity,
  FileCheck2
} from 'lucide-react';
import { playBeep } from '../../lib/sound';
import { motion, AnimatePresence } from 'motion/react';

interface TecnicoViewProps {
  currentUser: User;
  products: Product[];
  orders: Order[];
  onPrepareOrder: (orderId: string, itemQuantities: Record<string, number>, assignedBatchesMap: Record<string, any>) => void;
  onDeliverOrder: (orderId: string) => void;
  onUpdateProducts: (products: Product[]) => void;
  onAppendAudit: (log: any) => void;
  lang: 'es' | 'en';
  isLastBusinessDayActive?: boolean;
  simulateLastBusinessDay?: boolean;
  onToggleSimulateLastBusinessDay?: () => void;
}

export default function TecnicoView({
  currentUser,
  products,
  orders,
  onPrepareOrder,
  onDeliverOrder,
  onUpdateProducts,
  onAppendAudit,
  lang,
  isLastBusinessDayActive = false,
  simulateLastBusinessDay = false,
  onToggleSimulateLastBusinessDay
}: TecnicoViewProps) {
  const [activeTab, setActiveTab] = useState<'pedidos' | 'stock' | 'receipt' | 'monthly_discard'>('pedidos');

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
              daysRemaining: diffDays
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
        ? `SISTEMA AUTOMÁTICO DE DESCARTE (CONTROL MENSUAL TÉCNICO): Se descartaron ${quantityToDiscard} u. de ${targetProduct?.name} (Lote: ${batchCode}) por vencimiento registrado.`
        : `AUTOMATIC DISCARD SYSTEM (MONTH-END TECHNICAL): Discarded ${quantityToDiscard} u. of ${targetProduct?.name} (Batch: ${batchCode}) due to expiration.`
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
          ? `SISTEMA AUTOMÁTICO DE DESCARTE MASIVO (CONTR. TÉCNICO): Se descartaron ${item.quantity} u. de ${item.productName} (Lote: ${item.batchCode}, Vence: ${item.expirationDate}) por vencimiento.`
          : `AUTOMATIC MASS DISCARD SYSTEM (TECH CONTROL): Discarded ${item.quantity} u. of ${item.productName} (Batch: ${item.batchCode}, Expires: ${item.expirationDate}) due to expiration.`
      });
    });

    playBeep('success');
  };
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'Todos'>('Todos');
  const [serviceFilter, setServiceFilter] = useState<string>('Todos');
  const [searchStock, setSearchStock] = useState('');
  const [productTypeFilter, setProductTypeFilter] = useState<'All' | 'Med' | 'PM'>('All');
  const [dialog, setDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm?: () => void;
  } | null>(null);
  
  // Detalle del pedido en preparación activa
  const [preparingOrder, setPreparingOrder] = useState<Order | null>(null);
  const [draftQuantities, setDraftQuantities] = useState<Record<string, string>>({}); // productId -> string quantity

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

  const t = translations[lang];

  // Agrupar pedidos agrupados por fecha o servicio (Técnicos/Farmacéuticos eligen)
  const sortedOrders = useMemo(() => {
    return [...orders].sort((a, b) => new Date(b.requestDate).getTime() - new Date(a.requestDate).getTime());
  }, [orders]);

  const filteredOrders = useMemo(() => {
    return sortedOrders.filter(ord => {
      const matchStatus = statusFilter === 'Todos' || ord.status === statusFilter;
      const matchService = serviceFilter === 'Todos' || ord.service === serviceFilter;
      return matchStatus && matchService;
    });
  }, [sortedOrders, statusFilter, serviceFilter]);

  // Total de stock físico por producto (utilidad)
  const getProductTotalStock = (prod: Product) => {
    return prod.batches.reduce((acc, c) => acc + c.quantity, 0);
  };

  const getProductExpStatus = (prod: Product) => {
    const today = new Date();
    const thirtyDaysLater = new Date();
    thirtyDaysLater.setDate(today.getDate() + 30);

    let soonCount = 0;
    prod.batches.forEach(b => {
      const exp = new Date(b.expirationDate);
      if (exp <= thirtyDaysLater && b.quantity > 0) {
        soonCount += b.quantity;
      }
    });

    return soonCount;
  };

  const handleStartPrepare = (ord: Order) => {
    setPreparingOrder(ord);
    // Inicializar cantidades de edición precargadas con las solicitadas
    const preQty: Record<string, string> = {};
    ord.items.forEach(itm => {
      preQty[itm.productId] = String(itm.requestedQuantity);
    });
    setDraftQuantities(preQty);
    playBeep('beep');
  };

  const handleQtyChange = (productId: string, val: string) => {
    const cleanVal = val.replace(/[^0-9]/g, '');
    setDraftQuantities(prev => ({ ...prev, [productId]: cleanVal }));
  };

  const handleSubmitPrepare = (e: React.FormEvent) => {
    e.preventDefault();
    if (!preparingOrder) return;

    const requestedEdits: Record<string, number> = {};
    const finalAssignedBatches: Record<string, any> = {};

    let hasInadequateStock = false;

    for (const item of preparingOrder.items) {
      const strQty = draftQuantities[item.productId] || '0';
      const numQty = parseInt(strQty) || 0;
      requestedEdits[item.productId] = numQty;

      // Obtener producto para ver stock disponible
      const prod = products.find(p => p.id === item.productId);
      if (!prod) continue;

      const totalStock = getProductTotalStock(prod);
      if (numQty > totalStock) {
        hasInadequateStock = true;
      }

      // Calcular asignaciones FEFO automáticas
      const fefoPlan = suggestFEFOBatches(prod, numQty);
      finalAssignedBatches[item.productId] = fefoPlan;
    }

    const proceedWithPrepare = (edits: Record<string, number>, batches: Record<string, any>) => {
      onPrepareOrder(preparingOrder.id, edits, batches);
      setPreparingOrder(null);
      setDraftQuantities({});
      playBeep('success');
    };

    if (hasInadequateStock) {
      setDialog({
        isOpen: true,
        title: lang === 'es' ? 'Atención: Stock Insuficiente' : 'Warning: Insufficient Stock',
        message: lang === 'es'
          ? 'Algunas de las cantidades a enviar superan el stock físico disponible en el depósito. Dichos lotes quedarán temporalmente en cero. ¿Desea forzar el descuento de todos modos?'
          : 'Some dispatched quantities exceed actual depot stock. Stock will drop to zero. Do you wish to force the dispatch anyway?',
        confirmText: lang === 'es' ? 'Forzar Egreso' : 'Force Output',
        cancelText: lang === 'es' ? 'Cancelar' : 'Cancel',
        onConfirm: () => proceedWithPrepare(requestedEdits, finalAssignedBatches)
      });
      return;
    }

    proceedWithPrepare(requestedEdits, finalAssignedBatches);
  };

  const handleDeliver = (orderId: string) => {
    onDeliverOrder(orderId);
    playBeep('success');
  };

  const handleReceiptFileUpload = async (file: File) => {
    try {
      setReceiptError('');
      setReceiptSuccessMsg('');
      setReceiptItems([]);
      setReceiptFileName(file.name);
      setIsProcessingReceipt(true);

      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const base64String = evt.target?.result as string;
          if (!base64String) {
            throw new Error(lang === 'es' ? 'No se pudo leer el archivo.' : 'Failed to read file contents.');
          }

          const response = await fetch('/api/parse-receipt', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              fileData: base64String,
              mimeType: file.type || 'application/octet-stream',
              fileName: file.name
            }),
          });

          const data = await response.json();
          if (!response.ok || !data.success) {
            throw new Error(data.error || (lang === 'es' ? 'Error desconocido en el servidor.' : 'Unknown backend parsing error.'));
          }

          if (!data.items || data.items.length === 0) {
            throw new Error(lang === 'es' ? 'No se detectaron insumos legibles en el remito. Intenta con otra imagen.' : 'No readable items detected in the receipt.');
          }

          // Intentar emparentar automáticamente los nombres del remito con el catálogo existente
          const mappedItems = data.items.map((item: any) => {
            const normName = item.name.trim().toLowerCase();
            const normPres = item.presentation ? item.presentation.trim().toLowerCase() : '';
            
            let matched = products.find(
              p => p.name.trim().toLowerCase() === normName && 
                   p.presentation.trim().toLowerCase() === normPres
            );
            
            if (!matched) {
              matched = products.find(p => p.name.trim().toLowerCase() === normName);
            }
            
            if (!matched) {
              matched = products.find(
                p => p.name.trim().toLowerCase().includes(normName) || 
                     normName.includes(p.name.trim().toLowerCase())
              );
            }
            
            return {
              ...item,
              productId: matched ? matched.id : undefined
            };
          });

          setReceiptItems(mappedItems);
          playBeep('success');
        } catch (err: any) {
          console.error(err);
          setReceiptError(err.message || 'Error parsing file.');
        } finally {
          setIsProcessingReceipt(false);
        }
      };

      reader.onerror = () => {
        setReceiptError(lang === 'es' ? 'Fallo en la lectura del archivo.' : 'File reader encountered an error.');
        setIsProcessingReceipt(false);
      };

      reader.readAsDataURL(file);

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
          productType: 'Med', // Default classifications
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
      userRole: Role.TECNICO,
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
    playBeep('success');
  };

  const filteredProducts = useMemo(() => {
    let list = products;
    if (productTypeFilter !== 'All') {
      list = list.filter(p => (p.productType || 'Med') === productTypeFilter);
    }
    if (!searchStock.trim()) return list;
    return list.filter(p => 
      p.name.toLowerCase().includes(searchStock.toLowerCase()) || 
      p.presentation.toLowerCase().includes(searchStock.toLowerCase()) ||
      p.category.toLowerCase().includes(searchStock.toLowerCase())
    );
  }, [products, searchStock, productTypeFilter]);

  return (
    <div className="space-y-6">
      
      {/* Botones de navegación interna */}
      <div className="bg-zinc-100 dark:bg-zinc-900/60 p-1 rounded-xl flex flex-wrap gap-1 max-w-2xl border border-zinc-200 dark:border-zinc-800">
        <button
          onClick={() => { setActiveTab('pedidos'); setPreparingOrder(null); }}
          className={`flex-1 min-w-[125px] py-1.5 px-3 text-xs font-bold text-center rounded-lg transition duration-200 cursor-pointer ${activeTab === 'pedidos' ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800'}`}
        >
          📋 {lang === 'es' ? 'Gestión de Pedidos' : 'Order Manager'}
        </button>
        <button
          onClick={() => { setActiveTab('stock'); setPreparingOrder(null); }}
          className={`flex-1 min-w-[125px] py-1.5 px-3 text-xs font-bold text-center rounded-lg transition duration-200 cursor-pointer ${activeTab === 'stock' ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800'}`}
        >
          📦 {lang === 'es' ? 'Stock de Depósito' : 'Depot Inventory'}
        </button>
        <button
          onClick={() => { setActiveTab('receipt'); setPreparingOrder(null); }}
          className={`flex-1 min-w-[180px] py-1.5 px-3 text-xs font-bold text-center rounded-lg transition duration-200 cursor-pointer ${activeTab === 'receipt' ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-505 dark:text-zinc-400 hover:text-zinc-800'}`}
        >
          📥 {lang === 'es' ? 'Recibir Remito Municipal' : 'Receive Municipal Receipt'}
        </button>
        <button
          onClick={() => { setActiveTab('monthly_discard'); setPreparingOrder(null); }}
          className={`flex-1 min-w-[190px] py-1.5 px-3 text-xs font-bold text-center rounded-lg transition duration-200 cursor-pointer relative ${activeTab === 'monthly_discard' ? 'bg-red-650 text-white shadow-sm' : 'text-zinc-505 dark:text-zinc-400 hover:text-zinc-800'}`}
        >
          <span className="relative inline-flex size-1.5 mr-1 bg-red-500 rounded-full"></span>
          🚨 {lang === 'es' ? 'Descarte Fin de Mes' : 'Month-End Discard'}
        </button>
      </div>

      {activeTab === 'pedidos' && !preparingOrder && (
        <div className="space-y-4 animate-fade-in">
          
          {/* Tarjeta de bienvenida y filtros */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-2xl shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-sans font-bold text-base text-zinc-900 dark:text-zinc-100">
                  {lang === 'es' ? ' Cola Inteligente de Suministros' : 'Smart Supply Queue'}
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {lang === 'es' ? 'Pedidos internos recibidos en tiempo real por fecha de ingreso.' : 'Internal requests received in real-time ordered by entry date.'}
                </p>
              </div>

              {/* Controles de Agrupamiento y Filtrado */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] uppercase font-bold text-zinc-400 font-mono">Estado:</span>
                  <select
                    id="tecnico-filter-state"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                    className="text-xs p-1.5 border border-zinc-200 dark:border-zinc-800 rounded-lg bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200 focus:outline-none"
                  >
                    <option value="Todos">{lang === 'es' ? 'Todos los estados' : 'All states'}</option>
                    <option value="Pendiente">{t.pending}</option>
                    <option value="Preparado">{t.ready}</option>
                    <option value="Entregado">{t.delivered}</option>
                  </select>
                </div>

                <div className="flex items-center gap-1">
                  <span className="text-[10px] uppercase font-bold text-zinc-400 font-mono">Servivio:</span>
                  <select
                    id="tecnico-filter-service"
                    value={serviceFilter}
                    onChange={(e) => setServiceFilter(e.target.value)}
                    className="text-xs p-1.5 border border-zinc-200 dark:border-zinc-800 rounded-lg bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200 focus:outline-none"
                  >
                    <option value="Todos">{lang === 'es' ? 'Todos los servicios' : 'All services'}</option>
                    <option value={PredefinedService.GUARDIA}>{PredefinedService.GUARDIA}</option>
                    <option value={PredefinedService.LABORATORIO}>{PredefinedService.LABORATORIO}</option>
                    <option value={PredefinedService.IRAB}>{PredefinedService.IRAB}</option>
                    <option value={PredefinedService.FARMACIA}>{PredefinedService.FARMACIA}</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Lista de Pedidos */}
          <div className="grid grid-cols-1 gap-4">
            {filteredOrders.length === 0 ? (
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 py-12 rounded-2xl text-center text-zinc-400 text-sm font-sans">
                {lang === 'es' ? 'No se encontraron pedidos con estos filtros.' : 'No orders matched search criteria.'}
              </div>
            ) : (
              filteredOrders.map(ord => (
                <div
                  key={ord.id}
                  className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col md:flex-row justify-between gap-4"
                >
                  <div className="space-y-3 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-300 rounded font-bold font-mono text-[10px]">
                        #{ord.id.split('_')[1] || ord.id.substr(0, 8)}
                      </span>
                      <span className={`px-2.5 py-0.5 rounded font-bold font-mono text-[10px] ${
                        ord.service === PredefinedService.IRAB 
                          ? 'bg-indigo-50 text-indigo-850 dark:bg-indigo-950/40 dark:text-indigo-400' 
                          : ord.service === PredefinedService.GUARDIA 
                            ? 'bg-orange-100 text-orange-850 dark:bg-orange-950/40 dark:text-orange-400' 
                            : ord.service === PredefinedService.LABORATORIO 
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400' 
                              : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400'
                      }`}>
                        {ord.service}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${ord.type === 'Extraordinario' ? 'bg-red-50 text-red-700 border border-red-200/50 dark:bg-red-950/20 dark:text-red-400 dark:border-red-900/10' : 'bg-transparent text-zinc-400'}`}>
                        {ord.type === 'Extraordinario' ? `¡${lang === 'es' ? 'EXTRAORDINARIO' : 'EMERGENCY'}!` : 'Periódico'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div className="space-y-1">
                        <p className="text-zinc-400 font-medium">{lang === 'es' ? 'Solicitado por:' : 'Requested by:'}</p>
                        <p className="text-zinc-700 dark:text-zinc-200 font-semibold">{ord.requestedBy.userName}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-zinc-400 font-medium">{lang === 'es' ? 'Fecha solicitud:' : 'Requested on:'}</p>
                        <p className="text-zinc-700 dark:text-zinc-200 font-mono">
                          {new Date(ord.requestDate).toLocaleDateString()} • {new Date(ord.requestDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>

                    {ord.notes && (
                      <div className="p-2 bg-zinc-50 dark:bg-zinc-800/30 rounded-lg text-[11px] text-zinc-500 italic max-w-xl">
                        "{ord.notes}"
                      </div>
                    )}

                    {/* Detalle interno de items solicitado */}
                    <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
                      <p className="text-[10px] font-extrabold uppercase font-mono tracking-widest text-zinc-400 mb-2">
                        {lang === 'es' ? 'Medicamentos pedidos' : 'Requested products'}
                      </p>
                      <div className="flex flex-wrap gap-2 text-[11px]">
                        {ord.items.map((itm, idx) => (
                          <div key={idx} className="bg-zinc-50 dark:bg-zinc-800/50 px-2.5 py-1 rounded border border-zinc-200/40 dark:border-zinc-700/50 font-mono text-zinc-700 dark:text-zinc-300">
                            <strong>{itm.productName}</strong>: {itm.requestedQuantity} unidades 
                            {itm.approvedQuantity !== undefined && (
                              <span className="text-orange-600 dark:text-orange-400 font-bold ml-1">
                                (→ {itm.approvedQuantity} enviadas)
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Columna Acciones */}
                  <div className="flex flex-row md:flex-col justify-end items-center gap-3 border-t md:border-t-0 border-zinc-100 dark:border-zinc-800 pt-3 md:pt-0 shrink-0">
                    <div className="text-right space-y-1 hidden md:block">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold leading-none ${ord.status === 'Pendiente' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400' : ord.status === 'Preparado' ? 'bg-orange-100 text-orange-850 dark:bg-orange-950/30 dark:text-orange-400' : 'bg-orange-50 text-orange-800 dark:bg-orange-950/20 dark:text-orange-400'}`}>
                        <span className={`size-1.5 rounded-full ${ord.status === 'Pendiente' ? 'bg-amber-500' : ord.status === 'Preparado' ? 'bg-orange-500' : 'bg-orange-600'}`}></span>
                        <span>{ord.status === 'Pendiente' ? t.pending : ord.status === 'Preparado' ? t.ready : t.delivered}</span>
                      </span>
                    </div>

                    <div className="w-full flex md:flex-col gap-2 justify-end">
                      {ord.status === 'Pendiente' && (
                        <button
                          id={`btn-prep-${ord.id}`}
                          onClick={() => handleStartPrepare(ord)}
                          className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer flex-1 md:flex-initial transition-all"
                        >
                          <Edit3 size={14} />
                          <span>{lang === 'es' ? 'Preparar Suministro' : 'Assemble Order'}</span>
                        </button>
                      )}

                      {ord.status === 'Preparado' && (
                        <button
                          id={`btn-delivery-${ord.id}`}
                          onClick={() => handleDeliver(ord.id)}
                          className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer flex-1 md:flex-initial transition-all shadow-md shadow-orange-500/10"
                        >
                          <Check size={14} />
                          <span>{t.markAsDelivered}</span>
                        </button>
                      )}

                      {ord.status === 'Entregado' && (
                        <div className="text-[11px] text-zinc-400 font-mono text-center md:text-right py-2">
                          <p>{lang === 'es' ? 'Recibido conforme' : 'Delivered ok'}</p>
                          <p className="text-[10px]">{new Date(ord.deliveryDate || '').toLocaleDateString()}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* MODAL / SECCIÓN DE PREPARACIÓN DE PEDIDOS (Requisito: Editar cantidades con visualizador de Stock y FEFO) */}
      {activeTab === 'pedidos' && preparingOrder && (
        <div id="preparation-zone" className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-lg p-6 space-y-6 transition-colors animate-fade-in">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-4 gap-3">
            <div>
              <span className="text-[10px] uppercase font-bold font-mono text-amber-500 tracking-wider">
                {t.editingQuantities}
              </span>
              <h3 className="text-base font-sans font-bold text-zinc-900 dark:text-zinc-50">
                {lang === 'es' ? `Preparando pedido para: ${preparingOrder.service}` : `Preparing order for: ${preparingOrder.service}`}
              </h3>
            </div>
            <button
              onClick={() => { setPreparingOrder(null); setDraftQuantities({}); }}
              className="text-xs font-bold text-zinc-400 hover:text-zinc-650 cursor-pointer"
            >
              [ {lang === 'es' ? 'Cancelar y volver' : 'Cancel & view queue'} ]
            </button>
          </div>

          <form onSubmit={handleSubmitPrepare} className="space-y-6">
            <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {preparingOrder.items.map((item, idx) => {
                const prodInStock = products.find(p => p.id === item.productId);
                const currentStrQty = draftQuantities[item.productId] || '0';
                const currentNumQty = parseInt(currentStrQty) || 0;
                
                // Calcular stock central total
                const totalStock = prodInStock ? getProductTotalStock(prodInStock) : 0;
                const isOutOfStock = currentNumQty > totalStock;

                // Generar sugerencias FEFO del depósito en tiempo real
                const fefoSuggestions = prodInStock ? suggestFEFOBatches(prodInStock, currentNumQty) : [];

                return (
                  <div key={idx} className="py-5 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 font-sans tracking-tight flex items-center gap-1.5 flex-wrap">
                          {item.productName}
                          {prodInStock?.shelfLetter && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 border border-indigo-200/20 font-mono">
                              📍 Estant. {prodInStock.shelfLetter}-{prodInStock.shelfLevel}
                            </span>
                          )}
                        </h4>
                        <p className="text-[11px] text-zinc-400 font-mono font-medium">
                          {item.presentation} • <strong className="text-zinc-500 dark:text-zinc-400 font-mono">{lang === 'es' ? 'Pedido por enfermería:' : 'Nursing requested:'} {item.requestedQuantity} {lang === 'es' ? 'unids' : 'units'}</strong>
                        </p>
                      </div>

                      {/* Control Editable Numérico de Técnico */}
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-[10px] text-zinc-400 uppercase font-bold font-mono tracking-wide">{lang === 'es' ? 'Preparar para enviar' : 'Approve to send'}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <input
                              id={`edit-send-qty-${item.productId}`}
                              type="text"
                              value={currentStrQty}
                              onChange={(e) => handleQtyChange(item.productId, e.target.value)}
                              className={`w-20 text-center text-sm font-bold py-1 border rounded-xl focus:outline-none bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 ${isOutOfStock ? 'border-red-500 ring-2 ring-red-500/20 text-red-600' : 'border-zinc-200 dark:border-zinc-800 focus:ring-1 focus:ring-orange-500'}`}
                            />
                            <span className="text-xs text-zinc-400 font-medium font-mono">unid.</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Ayuda Visual de Stock Central y Descuento FEFO */}
                    <div className="p-3 bg-zinc-50/50 dark:bg-zinc-850/20 border border-zinc-200/40 dark:border-zinc-700/30 rounded-xl space-y-2">
                      <div className="flex flex-wrap items-center justify-between text-xs font-sans">
                        <span className="font-semibold text-zinc-650 dark:text-zinc-300">
                          {t.stockAvailable}: <strong className={`${totalStock < (prodInStock?.minStock || 0) ? 'text-red-500 font-extrabold' : 'text-zinc-700 dark:text-zinc-100'}`}>{totalStock} {lang === 'es' ? 'unidades' : 'units'}</strong>
                          {prodInStock && totalStock < prodInStock.minStock && (
                            <span className="text-[9px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded font-mono font-extrabold uppercase ml-1.5 border border-red-200/20">CRÍTICO</span>
                          )}
                        </span>
                        
                        <span className="text-[11px] text-orange-600 dark:text-orange-400 font-semibold font-mono">
                          {t.fefoSuggestion}
                        </span>
                      </div>

                      {/* Desglose FEFO sugerido */}
                      {fefoSuggestions.length === 0 ? (
                        <p className="text-[11px] text-zinc-400 italic">
                          {lang === 'es' ? 'Sugerencias no disponibles para cantidad cero o sin stock.' : 'No batch assignments needed for zero quantity or empty stock.'}
                        </p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono p-2 bg-white dark:bg-zinc-950/40 border border-zinc-200/20 dark:border-zinc-800/50 rounded-lg">
                          {fefoSuggestions.map((fp, fIdx) => (
                            <div key={fIdx} className="flex justify-between items-center text-zinc-700 dark:text-zinc-300">
                              <span className="flex items-center gap-1.5">
                                <span className={`size-1.5 rounded-full ${fIdx === 0 ? 'bg-amber-500 animate-ping' : 'bg-indigo-300'}`}></span>
                                <span>{lang === 'es' ? 'Lote' : 'Batch'}: <strong>{fp.batchCode}</strong> <span className="text-[10px] text-zinc-400">(vence {new Date(fp.expirationDate).toLocaleDateString()})</span></span>
                              </span>
                              <span className="font-bold text-orange-600 dark:text-orange-400">
                                -{fp.suggestedQty}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {isOutOfStock && (
                        <div className="flex items-center gap-1 text-[11px] text-red-600 dark:text-red-400 font-semibold pt-1">
                          <AlertTriangle size={14} />
                          <span>{t.notEnoughStock}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-zinc-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => { setPreparingOrder(null); setDraftQuantities({}); }}
                className="px-4 py-2 border border-zinc-200 dark:border-zinc-800 text-xs font-bold text-zinc-500 dark:text-zinc-400 hover:text-zinc-750 dark:hover:text-zinc-200 rounded-xl cursor-pointer"
              >
                {lang === 'es' ? 'Volver a cola de pedidos' : 'Back to orders'}
              </button>
              <button
                id="tecnico-confirm-prepare-btn"
                type="submit"
                className="px-5 py-2 bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs rounded-xl shadow-md shadow-orange-500/10 transition hover:scale-[1.01] cursor-pointer flex items-center gap-1.5"
              >
                <ClipboardCheck size={14} />
                <span>{t.saveAndPrepare}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAP 2: TABLA DE STOCK DEPÓSITO CON VENCIMIENTOS (Requisito: se agrupa por nombre pero se separa por lotes/fechas de vencimiento) */}
      {activeTab === 'stock' && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden p-6 space-y-4 transition-colors animate-fade-in">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-100 dark:border-zinc-800">
            <div>
              <h3 className="font-sans font-bold text-base text-zinc-900 dark:text-zinc-50">
                {lang === 'es' ? 'Consulta de Inventario de Depósito' : 'Depot Live Inventory Audit'}
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                {lang === 'es' ? 'Control de stocks consolidados y lotes detallados con lógica de expiración.' : 'Consolidated stock monitoring with detailed batches expirations.'}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
              {/* Botones de filtro de Tipo de Insumo */}
              <div className="flex items-center bg-zinc-100 dark:bg-zinc-800 p-0.5 rounded-lg border border-zinc-200/50 dark:border-zinc-700/50 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setProductTypeFilter('All')}
                  className={`px-2.5 py-1 rounded text-[10px] font-bold cursor-pointer transition ${productTypeFilter === 'All' ? 'bg-orange-600 text-white' : 'text-zinc-500'}`}
                >
                  {lang === 'es' ? 'Todos' : 'All'}
                </button>
                <button
                  type="button"
                  onClick={() => setProductTypeFilter('Med')}
                  className={`px-2.5 py-1 rounded text-[10px] font-bold cursor-pointer transition flex items-center gap-1 ${productTypeFilter === 'Med' ? 'bg-orange-600 text-white' : 'text-zinc-500'}`}
                >
                  <span>💊</span>
                  <span>{lang === 'es' ? 'Med' : 'Meds'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setProductTypeFilter('PM')}
                  className={`px-2.5 py-1 rounded text-[10px] font-bold cursor-pointer transition flex items-center gap-1 ${productTypeFilter === 'PM' ? 'bg-orange-600 text-white' : 'text-zinc-500'}`}
                >
                  <span>📦</span>
                  <span>{lang === 'es' ? 'PM' : 'PM'}</span>
                </button>
              </div>

              <div className="relative w-full sm:w-56">
                <Search className="absolute left-3 inset-y-0 my-auto text-zinc-400" size={16} />
                <input
                  id="tecnico-stock-search-input"
                  type="text"
                  placeholder={lang === 'es' ? 'Buscar medicamentos...' : 'Filter inventories...'}
                  value={searchStock}
                  onChange={(e) => setSearchStock(e.target.value)}
                  className="w-full text-xs pl-9 pr-3 py-1.5 border border-zinc-200 dark:border-zinc-800 rounded-lg bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs divide-y divide-zinc-200 dark:divide-zinc-800 font-sans">
              <thead>
                <tr className="text-zinc-400 font-mono uppercase text-[10px] tracking-wider">
                  <th className="py-3 px-2">{lang === 'es' ? 'Insumo / Fármaco' : 'Stock Item'}</th>
                  <th className="py-3 px-2">{lang === 'es' ? 'Categoría' : 'Category'}</th>
                  <th className="py-3 px-2 text-center">{lang === 'es' ? 'Stock Mín.' : 'Alert Min'}</th>
                  <th className="py-3 px-2 text-center">{lang === 'es' ? 'Stock Físico' : 'Physical Stock'}</th>
                  <th className="py-3 px-2 text-right">{lang === 'es' ? 'Lotes Activos (FEFO)' : 'Subbatches (FEFO)'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {filteredProducts.map((prod) => {
                  const total = getProductTotalStock(prod);
                  const criticallyLow = total < prod.minStock;
                  const expSoon = getProductExpStatus(prod);

                  return (
                    <tr key={prod.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/10 transition">
                      <td className="py-3 px-2">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-bold text-zinc-800 dark:text-zinc-100">{prod.name}</p>
                            <span className={`inline-flex items-center px-1.5 py-0.2 rounded text-[8px] font-bold ${
                              (prod.productType || 'Med') === 'PM' 
                                ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/10' 
                                : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/10'
                            }`}>
                              {(prod.productType || 'Med') === 'PM' ? '📦 PM' : '💊 MED'}
                            </span>
                            {prod.shelfLetter && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200/20 font-mono">
                                📍 {prod.shelfLetter}-{prod.shelfLevel}
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-zinc-400 font-mono">{prod.presentation}</p>
                        </div>
                      </td>
                      <td className="py-3 px-2">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${prod.category === 'Compartido' ? 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400' : 'bg-orange-50 text-orange-850 dark:bg-orange-950/30 dark:text-orange-400'}`}>
                          {prod.category}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-center font-mono">
                        {prod.minStock}
                      </td>
                      <td className="py-3 px-2 text-center">
                        <span className={`font-mono text-xs font-extrabold px-2 py-0.5 rounded-full ${criticallyLow ? 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-400 font-extrabold' : 'bg-orange-50 text-orange-850 dark:bg-orange-950/30 dark:text-orange-400'}`}>
                          {total}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-right max-w-sm">
                        <div className="space-y-1 font-mono text-[10px]">
                          {prod.batches.map((b, bIdx) => {
                            const isPast = new Date(b.expirationDate) <= new Date();
                            const thirtyDaysLater = new Date();
                            thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);
                            const isAlmostExp = new Date(b.expirationDate) <= thirtyDaysLater;

                            return (
                              <div key={bIdx} className="inline-flex items-center gap-1.5 ml-2 p-1 border border-zinc-200/40 dark:border-zinc-800/40 rounded bg-zinc-50/50 dark:bg-zinc-950/40">
                                <span>Lote: <strong>{b.batchCode}</strong></span>
                                <span className={isPast ? 'text-red-500 font-extrabold underline' : isAlmostExp ? 'text-amber-500 font-bold' : 'text-zinc-400'}>
                                  (V. {new Date(b.expirationDate).toLocaleDateString().split('/').slice(0, 2).join('/')})
                                </span>
                                <span className="font-extrabold text-indigo-700 dark:text-indigo-400 font-sans">[{b.quantity}]</span>
                              </div>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'receipt' && (
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
                    ? 'Sube el remito de egreso de depósito municipal (PDF o Imagen de planilla). El sistema procesará automáticamente los fármacos, lotes, vencimientos y sumará el stock al inventario.' 
                    : 'Upload the delivery slip received from the central laboratory (PDF, screenshot, camera capture). The system will parse items, batches, and quantities automatically.'}
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
                  <label htmlFor="receipt-file-upload-tecnico" className="cursor-pointer space-y-3 block">
                    <div className="size-10 bg-orange-500/10 text-orange-600 rounded-full flex items-center justify-center mx-auto mb-1">
                      <Upload size={20} />
                    </div>
                    <span className="block text-xs font-bold text-zinc-700 dark:text-zinc-300">
                      {lang === 'es' ? 'Arrastra remito aquí o haz click' : 'Drag file here or click to browse'}
                    </span>
                    <span className="block text-[9px] text-zinc-400">
                      PDF, PNG, JPG, JPEG • Máx 20MB
                    </span>
                    <input 
                      id="receipt-file-upload-tecnico"
                      type="file"
                      accept=".pdf,image/*"
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

                {isProcessingReceipt && (
                  <div className="p-4 bg-orange-50/40 dark:bg-orange-950/10 border border-orange-100 dark:border-orange-900/10 rounded-xl space-y-3">
                    <div className="flex items-center gap-2">
                      <Activity className="size-4 text-orange-500 animate-spin" />
                      <p className="font-bold text-xs text-orange-850 dark:text-orange-400">
                        {lang === 'es' ? 'Procesando remito de Berazategui...' : 'Processing receipt...'}
                      </p>
                    </div>
                    <p className="text-[10px] text-zinc-400">
                      {lang === 'es' ? 'Transfiriendo planilla, normalizando lotes y alineando expiraciones FEFO...' : 'Recognizing products, matching catalog items, mapping batches...'}
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

      {activeTab === 'monthly_discard' && (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6 animate-fade-in"
        >
          {/* Encabezado y Simulación */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-3xl shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-red-500/10 text-red-500 font-bold font-mono text-[9px] rounded-md uppercase">
                    {lang === 'es' ? 'Perfil Técnico Farmacia' : 'Pharmacy Technician Profile'}
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
                  {lang === 'es' ? '🚨 Control Mensual de Vencidos y Descarte' : '🚨 Monthly Expirations & Discards Control'}
                </h3>
                <p className="text-xs text-zinc-400 max-w-2xl leading-relaxed">
                  {lang === 'es' 
                    ? 'Los técnicos pueden descartar lotes vencidos al final del mes calendario usando este panel. El descarte debe ser autorizado por el Farmacéutico o simulador de mes.' 
                    : 'Technicians can discard expired batches at the end of the calendar month using this panel. Discards must be authorized by the Pharmacist or month simulator.'}
                </p>
              </div>

              {/* Interruptor de Fuerza de Testeo */}
              <div className="shrink-0 bg-zinc-50 dark:bg-zinc-950 p-4 rounded-2xl border border-zinc-150 dark:border-zinc-400 space-y-2">
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
                🛡️ {lang === 'es' ? 'Descarte Masivo por Técnico' : 'Technical Bulk Discard'}
              </h4>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {lang === 'es' 
                  ? 'Fuerce el descarte de todos los lotes vencidos del CAPS. Esta acción actualizará el inventario a cero y registrará los datos en la auditoría del sistema.'
                  : 'Flush all expired batches from CAPS stock. This action will clear the inventory to zero and write records in the audit list.'}
              </p>
            </div>
            <button
              type="button"
              disabled={!isLastBusinessDayActive || expiringAndExpiredBatches.filter(b => b.isExpired).length === 0}
              onClick={handleDiscardAllExpired}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold cursor-pointer transition flex items-center justify-center gap-1.5 shadow-sm ${
                isLastBusinessDayActive && expiringAndExpiredBatches.filter(b => b.isExpired).length > 0
                  ? 'bg-red-655 hover:bg-red-700 text-white'
                  : 'bg-zinc-100 dark:bg-zinc-8 border border-transparent text-zinc-400 cursor-not-allowed'
              }`}
            >
              ✂️ {lang === 'es' ? 'Descartar Todos los Lotes Vencidos' : 'Discard All Expired Batches'}
            </button>
          </div>

          {/* Listado de Medicación Crítica para Descarte */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-xs overflow-hidden">
            <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
              <h4 className="font-extrabold font-sans text-sm text-zinc-850 dark:text-zinc-100">
                {lang === 'es' ? 'Planilla de Control de Medicamentos Vencidos' : 'Expired Medicine Control Sheet'}
              </h4>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-100 dark:border-zinc-800 text-zinc-400 font-bold text-[10px] uppercase font-mono py-2.5 px-4">
                    <th className="py-3 px-4">{lang === 'es' ? 'Medicamento / Insumo' : 'Medicine / Supply'}</th>
                    <th className="py-3 px-1.5 text-center">{lang === 'es' ? 'Lote' : 'Batch'}</th>
                    <th className="py-3 px-1.5 text-center">{lang === 'es' ? 'Vencimiento' : 'Expiry'}</th>
                    <th className="py-3 px-1.5 text-center">{lang === 'es' ? 'Días Restantes' : 'Days Remaining'}</th>
                    <th className="py-3 px-1.5 text-center">{lang === 'es' ? 'Cantidad Lote' : 'Batch Qty'}</th>
                    <th className="py-3 px-4 text-right">{lang === 'es' ? 'Acciones' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {expiringAndExpiredBatches.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-zinc-400 italic">
                        {lang === 'es' ? 'No hay lotes que vencen este mes o que estén vencidos.' : 'No batches expiring this month or already expired found.'}
                      </td>
                    </tr>
                  ) : (
                    expiringAndExpiredBatches.map((item, idx) => {
                      const isExpired = item.isExpired;
                      return (
                        <tr key={idx} className={`hover:bg-zinc-50 dark:hover:bg-zinc-800/15 ${isExpired ? 'bg-red-50/15 dark:bg-red-950/5' : ''}`}>
                          <td className="py-3 px-4">
                            <span className="font-bold text-zinc-900 dark:text-zinc-100 block">{item.productName}</span>
                            <span className="text-[10px] text-zinc-400 block">{item.presentation} ({item.category})</span>
                          </td>
                          <td className="py-3 px-1.5 text-center font-mono font-bold text-zinc-700 dark:text-zinc-200">
                            {item.batchCode}
                          </td>
                          <td className="py-3 px-1.5 text-center font-mono text-zinc-600 dark:text-zinc-300">
                            {item.expirationDate}
                          </td>
                          <td className="py-3 px-1.5 text-center">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full font-mono font-bold text-[9px] ${
                              isExpired 
                                ? 'bg-red-650/10 text-red-655 animate-pulse' 
                                : item.daysRemaining <= 30
                                ? 'bg-amber-500/10 text-amber-600'
                                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                            }`}>
                              {isExpired 
                                ? (lang === 'es' ? 'VENCIDO' : 'EXPIRED') 
                                : `${item.daysRemaining} d`}
                            </span>
                          </td>
                          <td className="py-3 px-1.5 text-center font-mono font-bold text-zinc-900 dark:text-white">
                            {item.quantity} u
                          </td>
                          <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => {
                                const win = window.open('', '_blank');
                                if (win) {
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
                                              <th>Presentación</th>
                                              <th>Lote</th>
                                              <th>Vencimiento</th>
                                              <th>Cantidad Retirada</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            <tr>
                                              <td><strong>${item.productName}</strong></td>
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
                <span className="p-2.5 bg-red-550/10 text-red-500 rounded-xl shrink-0">
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
                  className="bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2 rounded-xl cursor-pointer transition transform active:scale-97"
                >
                  {dialog.confirmText || (lang === 'es' ? 'Aceptar' : 'Accept')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
