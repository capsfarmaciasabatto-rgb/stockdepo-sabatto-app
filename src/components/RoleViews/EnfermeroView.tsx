/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { translations } from '../../translations';
import { User, Product, Order, OrderItem, PredefinedService, ServiceConfiguration } from '../../types';
import { Send, FileWarning, Search, ClipboardList, Info, Sparkles, CheckCircle2, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { playBeep } from '../../lib/sound';
import { motion, AnimatePresence } from 'motion/react';

interface EnfermeroViewProps {
  currentUser: User;
  products: Product[];
  orders: Order[];
  serviceConfigs: ServiceConfiguration[];
  onSubmitOrder: (order: Order) => void;
  lang: 'es' | 'en';
}

export default function EnfermeroView({
  currentUser,
  products,
  orders,
  serviceConfigs,
  onSubmitOrder,
  lang
}: EnfermeroViewProps) {
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [orderType, setOrderType] = useState<'Periodico' | 'Extraordinario'>('Periodico');
  const [dialog, setDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
  } | null>(null);
  const [notes, setNotes] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [successBanner, setSuccessBanner] = useState(false);
  const [productTypeFilter, setProductTypeFilter] = useState<'All' | 'Med' | 'PM'>('All');
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  const t = translations[lang];
  const service = currentUser.service || PredefinedService.GUARDIA;

  // Encontrar configuración semanal para este servicio
  const config = useMemo(() => {
    return serviceConfigs.find(c => c.serviceName === service);
  }, [serviceConfigs, service]);

  // Verificar si hoy es el día de pedido permitido o si el servicio tiene permitido pedir de forma diaria (IRAB)
  const isRegularDay = useMemo(() => {
    if (!config) return false;
    if (config.allowDaily) return true;
    
    const todayNum = new Date().getDay(); // 0 = Domingo, 1 = Lunes, ..., 6 = Sabado
    return todayNum === config.orderDay;
  }, [config]);

  // Filtrar productos asignados a este servicio o compartidos
  const allowedProducts = useMemo(() => {
    return products.filter(p => p.allowedServices.includes(service));
  }, [products, service]);

  const filteredProducts = useMemo(() => {
    let list = allowedProducts;
    if (productTypeFilter !== 'All') {
      list = list.filter(p => (p.productType || 'Med') === productTypeFilter);
    }
    if (!searchQuery.trim()) return list;
    return list.filter(p =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.presentation.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [allowedProducts, searchQuery, productTypeFilter]);

  const handleQtyChange = (productId: string, val: string) => {
    // Permitir solo números enteros o vacío
    const cleaned = val.replace(/[^0-9]/g, '');
    setQuantities(prev => ({
      ...prev,
      [productId]: cleaned
    }));
  };

  const hasSelectedAny = useMemo(() => {
    return Object.entries(quantities).some(([_, qty]) => parseInt(qty as string) > 0);
  }, [quantities]);

  const handleSendOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasSelectedAny) return;

    // Si hoy no es el día fijado y no es extraordinario, oponer resistencia pedagógica/alerta
    if (!isRegularDay && orderType !== 'Extraordinario') {
      setDialog({
        isOpen: true,
        title: lang === 'es' ? 'Frecuencia de Pedido Regulada' : 'Schedule Guideline Warning',
        message: lang === 'es' 
          ? 'Hoy no es el día de pedido regular asignado para su servicio. Por favor, marque "Pedido Extraordinario" en los controles si necesita realizar un pedido excepcional.' 
          : 'Today is not your scheduled regular ordering day. Please toggle "Extraordinary Order" in order controls to proceed.'
      });
      return;
    }

    const orderItems: OrderItem[] = [];
    Object.entries(quantities).forEach(([pId, qtyStr]) => {
      const q = parseInt(qtyStr as string);
      if (q > 0) {
        const prod = products.find(p => p.id === pId);
        if (prod) {
          orderItems.push({
            productId: prod.id,
            productName: prod.name,
            presentation: prod.presentation,
            requestedQuantity: q
          });
        }
      }
    });

    const newOrder: Order = {
      id: `ord_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      service,
      requestedBy: {
        userId: currentUser.id,
        userName: currentUser.name,
        userEmail: currentUser.email
      },
      requestDate: new Date().toISOString(),
      status: 'Pendiente',
      type: orderType,
      items: orderItems,
      notes: notes.trim()
    };

    onSubmitOrder(newOrder);
    playBeep('success');

    // Limpiar estado local
    setQuantities({});
    setNotes('');
    setOrderType('Periodico');
    setSuccessBanner(true);
    setTimeout(() => setSuccessBanner(false), 5000);
  };

  // Filtrar mis pedidos recientes del servicio activo
  const myRecentOrders = useMemo(() => {
    return orders
      .filter(o => o.service === service)
      .sort((a, b) => new Date(b.requestDate).getTime() - new Date(a.requestDate).getTime())
      .slice(0, 10);
  }, [orders, service]);

  const dayOfWeekNames = lang === 'es' 
    ? ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
    : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  return (
    <div className="space-y-6">
      
      {/* Targeta de Presentación del Gabinete */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-md relative overflow-hidden border border-slate-800">
        <div className="absolute top-0 right-0 transform translate-x-4 -translate-y-4 opacity-10">
          <ClipboardList size={180} />
        </div>
        <div className="relative z-10 space-y-2">
          <span className="bg-slate-800 border border-slate-700 text-slate-300 text-xs px-3 py-1 rounded-full font-mono font-bold uppercase tracking-wider">
            {lang === 'es' ? 'Portal de Enfermería' : 'Nursing Portal'}
          </span>
          <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight">
            {lang === 'es' ? `Servicio: ${service}` : `Service: ${service}`}
          </h2>
          <p className="text-xs text-slate-400 max-w-2xl font-sans leading-relaxed">
            {lang === 'es' 
              ? 'Área para solicitar medicamentos y descartables de tu gabinete al depósito. Elige insumos, cantidades y envía tu pedido.'
              : 'Add medicines and disposables for your specific cabinet to request stock from local deposit.'
            }
          </p>
        </div>
      </div>

      {/* Control de Planificaciones / Días fijados */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-4 transition-colors">
          <div className="flex items-center gap-2.5">
            <span className="p-1.5 bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 rounded-lg">
              <Info size={18} />
            </span>
            <h3 className="font-sans font-bold text-sm text-zinc-900 dark:text-zinc-100">
              {lang === 'es' ? 'Frecuencia de Pedidos' : 'Ordering Frequency'}
            </h3>
          </div>
          
          <div className="text-xs text-zinc-600 dark:text-zinc-400 space-y-2 font-medium">
            <p>
              {t.regularDayInfo.replace('%day%', config ? (lang === 'es' ? config.orderDayName : dayOfWeekNames[config.orderDay]) : '...')}. 
              {config?.allowDaily && (
                <span className="bg-orange-100 dark:bg-orange-950/70 text-orange-850 dark:text-orange-350 px-2 py-0.5 rounded ml-1 font-mono text-[10px] uppercase font-bold border border-orange-500/10">
                  {lang === 'es' ? 'SOPORTE DIARIO ACTIVO' : 'DAILY PERMITTED'}
                </span>
              )}
            </p>
            {!isRegularDay && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40 rounded-xl text-amber-700 dark:text-amber-400 leading-tight">
                <FileWarning size={16} className="shrink-0 mt-0.5" />
                <p id="order-day-warning-text">{t.orderDayWarning}</p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              id="btn-order-regular"
              type="button"
              disabled={!isRegularDay}
              onClick={() => setOrderType('Periodico')}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition cursor-pointer ${orderType === 'Periodico' && isRegularDay ? 'bg-indigo-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 disabled:opacity-40'}`}
            >
              {lang === 'es' ? 'Pedido Periódico Semanal' : 'Standard Weekly Request'}
            </button>
            <button
              id="btn-order-extraordinary"
              type="button"
              onClick={() => setOrderType(orderType === 'Extraordinario' ? 'Periodico' : 'Extraordinario')}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl flex items-center gap-1.5 transition cursor-pointer ${orderType === 'Extraordinario' ? 'bg-amber-500 text-white shadow-sm' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200'}`}
            >
              <Sparkles size={14} />
              <span>{t.exceptionalOrder}</span>
            </button>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm flex flex-col justify-between transition-colors">
          <div className="space-y-1">
            <h4 className="text-xs font-extrabold uppercase font-mono tracking-wider text-zinc-400">
              {lang === 'es' ? 'Tipo de Solictud' : 'Submission Type'}
            </h4>
            <div className="pt-2">
              <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold ${orderType === 'Extraordinario' ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400' : 'bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400'}`}>
                <span className="size-2 rounded-full animate-ping bg-current"></span>
                <span>{orderType === 'Extraordinario' ? t.exceptionalOrder : (lang === 'es' ? 'Regular Semanal' : 'Regular Weekly')}</span>
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 font-sans mt-2">
              {orderType === 'Extraordinario' 
                ? (lang === 'es' ? 'Permite saltear la restricción horaria o de día fijo por desabastecimiento de emergencia.' : 'Allows bypassing schedule restricts during local medical emergencies.')
                : (lang === 'es' ? 'Se consolida según el día regular asignado.' : 'Consolidated in scheduled replenishment.')
              }
            </p>
          </div>
        </div>
      </div>

      {successBanner && (
        <div id="nurse-success-banner" className="p-4 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900/50 text-orange-800 dark:text-orange-400 rounded-2xl flex items-center gap-3 font-sans font-semibold text-sm transition animate-bounce">
          <CheckCircle2 className="text-orange-500 shrink-0" size={20} />
          <span>{t.orderSentSuccess}</span>
        </div>
      )}

      {/* Formulario de Armado de Pedidos */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden transition-colors">
        <div className="px-6 py-4 bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="font-sans font-bold text-base text-zinc-900 dark:text-zinc-100">
            {t.prepareOrder}
          </h3>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
            {/* Botones de filtro de Tipo de Insumo */}
            <div className="flex items-center bg-zinc-100 dark:bg-zinc-800 p-0.5 rounded-lg border border-zinc-200/50 dark:border-zinc-700/50 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setProductTypeFilter('All')}
                className={`px-2.5 py-1 rounded text-[10px] font-bold cursor-pointer transition ${productTypeFilter === 'All' ? 'bg-indigo-600 text-white shadow-xs' : 'text-zinc-500'}`}
              >
                {lang === 'es' ? 'Todos' : 'All'}
              </button>
              <button
                type="button"
                onClick={() => setProductTypeFilter('Med')}
                className={`px-2.5 py-1 rounded text-[10px] font-bold cursor-pointer transition flex items-center gap-1 ${productTypeFilter === 'Med' ? 'bg-indigo-600 text-white shadow-xs' : 'text-zinc-500'}`}
              >
                <span>💊</span>
                <span>{lang === 'es' ? 'Medicamentos' : 'Meds'}</span>
              </button>
              <button
                type="button"
                onClick={() => setProductTypeFilter('PM')}
                className={`px-2.5 py-1 rounded text-[10px] font-bold cursor-pointer transition flex items-center gap-1 ${productTypeFilter === 'PM' ? 'bg-indigo-600 text-white shadow-xs' : 'text-zinc-500'}`}
              >
                <span>📦</span>
                <span>{lang === 'es' ? 'PM' : 'PM'}</span>
              </button>
            </div>

            <div className="relative w-full sm:w-56">
              <Search className="absolute left-3 inset-y-0 my-auto text-zinc-400" size={14} />
              <input
                id="nurse-search-input"
                type="text"
                placeholder={lang === 'es' ? 'Buscar insumo...' : 'Search item...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs pl-8 pr-3 py-1.5 border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>

        <form onSubmit={handleSendOrder} className="p-6 space-y-6">
          {filteredProducts.length === 0 ? (
            <div className="py-8 text-center text-zinc-400 text-sm font-sans">
              {t.noProductsForService}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[420px] overflow-y-auto pr-2">
              {filteredProducts.map((prod) => {
                const qtyVal = quantities[prod.id] || '';
                const isChecked = parseInt(qtyVal) > 0;
                
                return (
                  <div
                    key={prod.id}
                    className={`p-4 border rounded-xl flex items-center justify-between gap-3 transition-all ${isChecked ? 'bg-orange-50/40 dark:bg-orange-950/10 border-orange-500/50 ring-1 ring-orange-500/20' : 'bg-transparent border-slate-200 dark:border-slate-800 hover:border-slate-300'}`}
                  >
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100 font-sans tracking-tight">
                        {prod.name}
                      </p>
                      <p className="text-[10px] text-zinc-400 font-mono">
                        {prod.presentation}
                      </p>
                      <div className="flex flex-wrap gap-1 items-center pt-0.5">
                        <span className={`inline-flex items-center px-1.5 py-0.2 rounded text-[8px] font-extrabold ${
                          (prod.productType || 'Med') === 'PM' 
                            ? 'bg-blue-500/10 text-blue-600 dark:text-blue-450 border border-blue-500/10' 
                            : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-450 border border-emerald-500/10'
                        }`}>
                          {(prod.productType || 'Med') === 'PM' ? '📦 PM' : '💊 MED'}
                        </span>
                        {prod.category === 'Compartido' && (
                          <span className="inline-block text-[8px] bg-zinc-100 dark:bg-zinc-800 text-zinc-500 px-1.5 py-0.2 rounded font-bold font-mono">
                            {lang === 'es' ? 'Compartido' : 'Shared'}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        id={`input-qty-${prod.id}`}
                        type="text"
                        placeholder="0"
                        value={qtyVal}
                        onChange={(e) => handleQtyChange(prod.id, e.target.value)}
                        className={`w-14 text-center text-xs font-bold py-1 border rounded-lg focus:outline-none bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 ${isChecked ? 'border-orange-500 ring-2 ring-orange-500/20' : 'border-zinc-200 dark:border-zinc-800'}`}
                      />
                      <span className="text-[10px] text-zinc-400 font-medium">{t.quantityPlaceholder}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Notas y Enviar */}
          <div className="space-y-2 border-t border-zinc-100 dark:border-zinc-800 pt-5">
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block">
              {lang === 'es' ? 'Observaciones / Motivo:' : 'Comments / Reason:'}
            </label>
            <textarea
              id="nurse-notes-input"
              rows={2}
              placeholder={lang === 'es' ? 'Ej: "Aumento estacional de casos respiratorios", "Frecuencia regular".' : 'Specify some comments...'}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full text-xs p-3 border border-zinc-200 dark:border-zinc-800 rounded-xl bg-transparent text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="flex justify-end pt-2">
            <button
              id="nurse-submit-btn"
              type="submit"
              disabled={!hasSelectedAny}
              className={`px-5 py-2.5 rounded-xl font-bold font-sans text-xs flex items-center gap-2 shadow-sm transition-all cursor-pointer ${hasSelectedAny ? 'bg-orange-600 hover:bg-orange-700 text-white hover:scale-[1.01]' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed border border-transparent'}`}
            >
              <Send size={14} />
              <span>{t.sendOrder}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Historial de Pedidos Recientes */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm p-6 space-y-4 transition-colors">
        <h3 className="font-sans font-bold text-base text-zinc-900 dark:text-zinc-100">
          {t.yourRecentOrders}
        </h3>
        {myRecentOrders.length === 0 ? (
          <div className="py-4 text-center text-zinc-400 text-xs font-sans">
            {lang === 'es' ? 'No has enviado pedidos recientemente.' : 'No recent orders.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs divide-y divide-zinc-200 dark:divide-zinc-800 font-sans">
              <thead>
                <tr className="text-zinc-400 font-mono uppercase tracking-wider text-[10px]">
                  <th className="py-2.5 w-8 pl-1"></th>
                  <th className="py-2.5">{lang === 'es' ? 'ID Pedido' : 'Order ID'}</th>
                  <th className="py-2.5">{lang === 'es' ? 'Fecha' : 'Date'}</th>
                  <th className="py-2.5">{lang === 'es' ? 'Tipo' : 'Type'}</th>
                  <th className="py-2.5">{lang === 'es' ? 'Estado' : 'Status'}</th>
                  <th className="py-2.5 text-right pr-2.5">{lang === 'es' ? 'Insumos / Resumen' : 'Supplies / Summary'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {myRecentOrders.map((ord) => {
                  const isExpanded = expandedOrderId === ord.id;
                  return (
                    <React.Fragment key={ord.id}>
                      <tr 
                        onClick={() => {
                          setExpandedOrderId(isExpanded ? null : ord.id);
                          playBeep('beep');
                        }}
                        className={`hover:bg-zinc-50 dark:hover:bg-zinc-800/20 cursor-pointer transition-colors ${isExpanded ? 'bg-zinc-50/50 dark:bg-zinc-800/10' : ''}`}
                      >
                        <td className="py-3 pl-2.5 align-middle">
                          {isExpanded ? (
                            <ChevronUp size={14} className="text-orange-500 animate-pulse" />
                          ) : (
                            <ChevronDown size={14} className="text-zinc-400" />
                          )}
                        </td>
                        <td className="py-3 font-mono text-zinc-400 align-middle">
                          #{ord.id.split('_')[1] || ord.id.substr(0, 8)}
                        </td>
                        <td className="py-3 text-zinc-500 align-middle">
                          {new Date(ord.requestDate).toLocaleDateString(lang === 'es' ? 'es-AR' : 'en-US')} • {new Date(ord.requestDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="py-3 align-middle">
                          <span className={`px-2 py-0.5 rounded font-semibold font-mono text-[10px] ${ord.type === 'Extraordinario' ? 'bg-amber-100 text-amber-850 dark:bg-amber-950/30 dark:text-amber-400 border border-amber-200/10' : 'bg-orange-100 text-orange-850 dark:bg-orange-950/30 dark:text-orange-400 border border-orange-200/10'}`}>
                            {ord.type === 'Extraordinario' ? t.exceptionalOrder : 'Regular'}
                          </span>
                        </td>
                        <td className="py-3 align-middle">
                          <span className={`inline-block size-2 rounded-full mr-1.5 ${ord.status === 'Pendiente' ? 'bg-amber-500' : ord.status === 'Preparado' ? 'bg-orange-500 animate-pulse' : 'bg-orange-600'}`}></span>
                          <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                            {ord.status === 'Pendiente' ? t.pending : ord.status === 'Preparado' ? t.ready : t.delivered}
                          </span>
                        </td>
                        <td className="py-3 text-right pr-2.5 align-middle">
                          <div className="flex items-center justify-end gap-2.5">
                            <span className="font-mono text-zinc-500 text-[11px] hidden sm:inline" title={ord.items.map(i => `${i.productName} (${i.requestedQuantity})`).join(', ')}>
                              {ord.items.length} {lang === 'es' ? 'items' : 'items'} ({ord.items.reduce((acc, c) => acc + c.requestedQuantity, 0)} {lang === 'es' ? 'unids' : 'units'})
                            </span>
                            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-xl transition cursor-pointer select-none border ${isExpanded ? 'bg-orange-600 border-orange-600 text-white' : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-750'}`}>
                              {isExpanded ? (lang === 'es' ? 'Ocultar' : 'Hide') : (lang === 'es' ? 'Ver Resumen' : 'View Summary')}
                            </span>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-zinc-50/50 dark:bg-zinc-950/20">
                          <td colSpan={6} className="p-4 sm:p-5 border-t border-zinc-150 dark:border-zinc-800">
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden space-y-4"
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-150 dark:border-zinc-800 pb-3">
                                <div className="flex items-center gap-2">
                                  <span className="p-1.5 bg-orange-500/10 text-orange-600 dark:text-orange-400 rounded-lg">
                                    <ClipboardList size={16} />
                                  </span>
                                  <span className="font-extrabold text-xs text-zinc-700 dark:text-zinc-300 uppercase tracking-wider font-sans">
                                    {lang === 'es' ? 'Resumen Detallado del Pedido' : 'Detailed Order Summary'}
                                  </span>
                                </div>
                                <div className="text-[10px] font-mono text-zinc-400">
                                  Ref ID: <span className="font-bold text-zinc-650 dark:text-zinc-300">#{ord.id}</span>
                                </div>
                              </div>

                              {/* Información de firmas / auditoría */}
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px] bg-white dark:bg-zinc-900 border border-zinc-150 dark:border-zinc-800/80 p-3.5 rounded-2xl font-medium shadow-xs">
                                <div className="space-y-1">
                                  <span className="text-zinc-400 block font-mono uppercase text-[9px]">{lang === 'es' ? 'Solicitado por' : 'Requested by'}</span>
                                  <span className="text-zinc-800 dark:text-zinc-200 font-bold block">{ord.requestedBy.userName}</span>
                                  <span className="text-zinc-450 dark:text-zinc-400 text-[10px] block font-mono leading-none">{ord.requestedBy.userEmail}</span>
                                </div>
                                {ord.preparedBy && (
                                  <div className="space-y-1 border-t sm:border-t-0 sm:border-l border-zinc-100 dark:border-zinc-800 sm:pl-3.5 pt-2 sm:pt-0">
                                    <span className="text-zinc-400 block font-mono uppercase text-[9px]">{lang === 'es' ? 'Preparado por (Técnico / Farmacéutico)' : 'Prepared by (Technician / Pharmacist)'}</span>
                                    <span className="text-zinc-800 dark:text-zinc-150 font-bold block">{ord.preparedBy.userName}</span>
                                  </div>
                                )}
                                {ord.deliveredBy && (
                                  <div className="space-y-1 border-t sm:border-t-0 sm:border-l border-zinc-100 dark:border-zinc-800 sm:pl-3.5 pt-2 sm:pt-0">
                                    <span className="text-zinc-400 block font-mono uppercase text-[9px]">{lang === 'es' ? 'Entregado por' : 'Delivered by'}</span>
                                    <span className="text-zinc-800 dark:text-zinc-150 font-bold block">{ord.deliveredBy.userName}</span>
                                    {ord.deliveryDate && (
                                      <span className="text-[10px] text-zinc-500 font-mono block">
                                        {new Date(ord.deliveryDate).toLocaleDateString(lang === 'es' ? 'es-AR' : 'en-US')} • {new Date(ord.deliveryDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>

                              {ord.notes && (
                                <div className="p-3 bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-150 dark:border-zinc-850 rounded-xl text-xs">
                                  <span className="font-bold text-zinc-700 dark:text-zinc-300 block mb-1">
                                    {lang === 'es' ? 'Observaciones de Enfermería:' : 'Nursing Notes:'}
                                  </span>
                                  <p className="text-zinc-600 dark:text-zinc-400 italic font-mono leading-relaxed">{ord.notes}</p>
                                </div>
                              )}

                              {/* Items List */}
                              <div className="space-y-2">
                                <span className="block text-[10px] font-mono text-zinc-400 uppercase tracking-wider font-bold">
                                  {lang === 'es' ? 'Insumos Pedidos y Aprobación' : 'Requested Supplies & Approvals'}
                                </span>
                                <div className="overflow-hidden border border-zinc-150 dark:border-zinc-800 rounded-2xl divide-y divide-zinc-100 dark:divide-zinc-850 bg-white dark:bg-zinc-900 shadow-xs">
                                  {ord.items.map((item, itemIdx) => {
                                    const isDispensationDifference = item.approvedQuantity !== undefined && item.approvedQuantity !== item.requestedQuantity;
                                    
                                    return (
                                      <div key={item.productId || itemIdx} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                                        <div className="space-y-0.5">
                                          <span className="font-bold text-zinc-800 dark:text-zinc-200 block text-xs sm:text-[13px]">{item.productName}</span>
                                          <span className="text-[10px] text-zinc-400 block font-mono">{item.presentation}</span>
                                        </div>
                                        
                                        <div className="flex flex-wrap items-center gap-4 sm:gap-6">
                                          {/* Cantidad Solicitada */}
                                          <div className="text-center sm:text-right min-w-[70px]">
                                            <span className="text-zinc-400 block text-[9px] font-mono uppercase">{lang === 'es' ? 'Solicitado' : 'Requested'}</span>
                                            <span className="font-mono font-bold text-zinc-800 dark:text-zinc-200 text-sm">
                                              {item.requestedQuantity}
                                            </span>
                                          </div>

                                          {/* Cantidad Entregada / Aprobada */}
                                          {(ord.status === 'Preparado' || ord.status === 'Entregado') ? (
                                            <div className="text-center sm:text-right min-w-[70px] bg-zinc-50 dark:bg-zinc-950 p-1.5 px-3 rounded-lg border border-zinc-150 dark:border-zinc-800">
                                              <span className="text-zinc-500 dark:text-zinc-400 block text-[9px] font-mono uppercase">{lang === 'es' ? 'Entregado' : 'Delivered'}</span>
                                              <span className={`font-mono font-extrabold text-sm ${isDispensationDifference ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-450'}`}>
                                                {item.approvedQuantity !== undefined ? item.approvedQuantity : item.requestedQuantity}
                                              </span>
                                              {isDispensationDifference && (
                                                <span className="block text-[8px] font-bold text-amber-600 dark:text-amber-400 font-sans" title="Ajustado durante la preparación por falta de stock o regulación de consumo">
                                                  {lang === 'es' ? '⚠️ Ajustado' : '⚠️ Adjusted'}
                                                </span>
                                              )}
                                            </div>
                                          ) : (
                                            <div className="text-center sm:text-right min-w-[70px]">
                                              <span className="text-zinc-400 block text-[9px] font-mono uppercase">{lang === 'es' ? 'Estado' : 'Status'}</span>
                                              <span className="font-sans font-bold text-[9px] text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded-lg uppercase">
                                                {lang === 'es' ? 'Pendiente' : 'Pending'}
                                              </span>
                                            </div>
                                          )}

                                          {/* Detalle de lotes (si fue preparado) */}
                                          {item.assignedBatches && item.assignedBatches.length > 0 && (
                                            <div className="text-left text-[10px] font-mono bg-zinc-50 dark:bg-zinc-950 p-1.5 px-2.5 rounded-lg border border-zinc-150 dark:border-zinc-800 max-w-xs">
                                              <span className="text-zinc-400 block text-[8px] uppercase font-bold leading-tight">{lang === 'es' ? 'Lotes FEFO Asignados' : 'Assigned FEFO Batches'}</span>
                                              <div className="space-y-0.5 mt-0.5 max-h-[44px] overflow-y-auto pr-1">
                                                {item.assignedBatches.map((b, bIdx) => (
                                                  <span key={b.batchId || bIdx} className="block text-zinc-650 dark:text-zinc-300">
                                                    Lote: <strong className="text-zinc-800 dark:text-zinc-200">{b.batchCode}</strong> ({b.quantity} unids) - Exp: {b.expirationDate}
                                                  </span>
                                                ))}
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </motion.div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AnimatePresence>
        {dialog?.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-xl max-w-sm w-full space-y-4"
            >
              <div className="flex items-start gap-3">
                <span className="p-2 bg-amber-500/10 text-amber-500 rounded-xl shrink-0">
                  <AlertTriangle size={20} />
                </span>
                <div className="space-y-1">
                  <h4 className="font-bold text-sm text-zinc-900 dark:text-zinc-50">{dialog.title}</h4>
                  <p className="text-xs text-zinc-500 leading-relaxed">{dialog.message}</p>
                </div>
              </div>
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setDialog(null)}
                  className="bg-zinc-800 hover:bg-zinc-900 text-white dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-black font-bold text-xs px-4 py-2 rounded-xl cursor-pointer transition transform active:scale-97"
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
