/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import { initializeDB, saveDBState, FullDBState } from './lib/database';
import { addOrder, updateOrder, updateOrderItems, updateProduct, appendAuditLog } from './lib/supabaseUtils';
import { User, Order, Product, Role, AuditLog, ServiceConfiguration, OrderStatus } from './types';
import AuthScreen from './components/AuthScreen';
import Navigation from './components/Navigation';
import EnfermeroView from './components/RoleViews/EnfermeroView';
import TecnicoView from './components/RoleViews/TecnicoView';
import FarmaceuticoView from './components/RoleViews/FarmaceuticoView';
import DirectorView from './components/RoleViews/DirectorView';
import { playBeep } from './lib/sound';
import { supabase } from './lib/supabase';
import { Activity, AlertCircle, Calendar, RefreshCw } from 'lucide-react';

export default function App() {
  // --- CORE SYSTEM STATES ---
  const [dbState, setDbState] = useState<FullDBState | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [lang, setLang] = useState<'es' | 'en'>('es');
  const [darkMode, setDarkMode] = useState<boolean>(false);
  const [soundMuted, setSoundMuted] = useState<boolean>(false);
  const [transitionLoading, setTransitionLoading] = useState<boolean>(false);
  const [transitionText, setTransitionText] = useState<string>('');
  const [initError, setInitError] = useState<string | null>(null);

  // Centro de alertas activas
  const [activeAlerts, setActiveAlerts] = useState<{ id: string; text: string; type: 'critical' | 'new_order' | 'info' | 'expiring' }[]>([]);

  // Simulación de Último Día Hábil de Mes
  const [simulateLastBusinessDay, setSimulateLastBusinessDay] = useState<boolean>(false);

  // Selector de ordenamiento de insumos
  const [productSortOrder, setProductSortOrder] = useState<'name-asc' | 'name-desc' | 'type-med' | 'type-pm'>('name-asc');

  const isLastBusinessDayOfMonth = (date: Date = new Date()): boolean => {
    const y = date.getFullYear();
    const m = date.getMonth();
    const lastDay = new Date(y, m + 1, 0);
    const temp = new Date(lastDay);
    while (temp.getDay() === 0 || temp.getDay() === 6) {
      temp.setDate(temp.getDate() - 1);
    }
    return date.getDate() === temp.getDate() && 
           date.getMonth() === temp.getMonth() && 
           date.getFullYear() === temp.getFullYear();
  };

  const isLastBusinessDayActive = isLastBusinessDayOfMonth() || simulateLastBusinessDay;

  // --- FIX: Timeout de seguridad para transiciones colgadas ---
  useEffect(() => {
    if (!transitionLoading) return;
    const timer = setTimeout(() => {
      console.warn('[App] Forzando cierre de transición colgada');
      setTransitionLoading(false);
    }, 3000);
    return () => clearTimeout(timer);
  }, [transitionLoading]);

  // --- INITIALIZE APPLICATION ---
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    initializeDB()
      .then(({ initialState, subscribe }) => {
        setDbState(initialState);
        unsubscribe = subscribe((newState) => {
          setDbState(newState);
        });
      })
      .catch((err) => {
        console.error('[App] Error inicializando DB:', err);
        setInitError(err.message || 'Error al conectar con la base de datos');
      });

    // Cargar preferencias de usuario de localStorage
    const savedUser = localStorage.getItem('sabatto_current_user');
    if (savedUser) {
      try {
        setCurrentUser(JSON.parse(savedUser));
      } catch (e) {
        console.error('Error parsed saved session', e);
        localStorage.removeItem('sabatto_current_user');
      }
    }

    const savedLang = localStorage.getItem('sabatto_preferred_lang');
    if (savedLang === 'es' || savedLang === 'en') {
      setLang(savedLang);
    }

    const savedDark = localStorage.getItem('sabatto_dark_mode') === 'true';
    setDarkMode(savedDark);
    if (savedDark) {
      document.documentElement.classList.add('dark');
    }

    const savedMuted = localStorage.getItem('sabatto_sound_muted') === 'true';
    setSoundMuted(savedMuted);

    const savedSortOrder = localStorage.getItem('sabatto_product_sort_order');
    if (savedSortOrder === 'name-asc' || savedSortOrder === 'name-desc' || savedSortOrder === 'type-med' || savedSortOrder === 'type-pm') {
      setProductSortOrder(savedSortOrder);
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('sabatto_product_sort_order', productSortOrder);
  }, [productSortOrder]);

  useEffect(() => {
    localStorage.setItem('sabatto_preferred_lang', lang);
  }, [lang]);

  useEffect(() => {
    localStorage.setItem('sabatto_dark_mode', String(darkMode));
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  useEffect(() => {
    localStorage.setItem('sabatto_sound_muted', String(soundMuted));
  }, [soundMuted]);

  // --- ALERTAS EN TIEMPO REAL ---
  const evaluateAlertsAndAlarms = (state: FullDBState) => {
    const alertsList: { id: string; text: string; type: 'critical' | 'new_order' | 'info' | 'expiring' }[] = [];
    const today = new Date();
    const thirtyDaysLater = new Date();
    thirtyDaysLater.setDate(today.getDate() + 30);

    state.products.forEach(p => {
      const totalStock = p.batches.reduce((acc, c) => acc + c.quantity, 0);
      if (totalStock < p.minStock) {
        alertsList.push({
          id: `crit_${p.id}`,
          text: lang === 'es' 
            ? `¡Alerta! Stock crítico para ${p.name}: ${totalStock} u. (Mínimo: ${p.minStock})` 
            : `Critical level for ${p.name}: ${totalStock} u. (Min: ${p.minStock})`,
          type: 'critical'
        });
      }

      p.batches.forEach(b => {
        if (b.quantity > 0) {
          const exp = new Date(b.expirationDate);
          if (exp <= thirtyDaysLater) {
            const diffDays = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            alertsList.push({
              id: `exp_${b.id}`,
              text: lang === 'es'
                ? `Lote ${b.batchCode} de ${p.name} vence pronto (${diffDays} días)`
                : `Batch ${b.batchCode} of ${p.name} expires soon (${diffDays} days)`,
              type: 'expiring'
            });
          }
        }
      });
    });

    const pendingOrdersCount = state.orders.filter(o => o.status === 'Pendiente').length;
    if (pendingOrdersCount > 0) {
      alertsList.push({
        id: 'new_orders_alert',
        text: lang === 'es'
          ? `Hay ${pendingOrdersCount} pedidos pendientes en espera de preparación.`
          : `${pendingOrdersCount} pending internal requests are awaiting replenishment.`,
        type: 'new_order'
      });
    }

    if (isLastBusinessDayActive) {
      const today = new Date();
      const thisMonth = today.getMonth();
      const thisYear = today.getFullYear();
      let expiringThisMonthCount = 0;

      state.products.forEach(p => {
        p.batches.forEach(b => {
          if (b.quantity > 0) {
            const exp = new Date(b.expirationDate);
            if (exp.getFullYear() === thisYear && exp.getMonth() === thisMonth) {
              expiringThisMonthCount++;
            } else if (exp < today) {
              expiringThisMonthCount++;
            }
          }
        });
      });

      alertsList.push({
        id: 'month_end_discard_alert',
        text: lang === 'es'
          ? `🚨 ¡FIN DE MES! Hoy es el último día hábil. Control Automatizado: Se registraron ${expiringThisMonthCount} lotes vencidos/por vencer para descarte.`
          : `🚨 MONTH-END WORKDAY! Today is the last business day. Automated audit: ${expiringThisMonthCount} expired/expiring batches detected for discard clearance.`,
        type: 'critical'
      });
    }

    setActiveAlerts(alertsList);
  };

  useEffect(() => {
    if (dbState) {
      evaluateAlertsAndAlarms(dbState);
    }
  }, [dbState, lang, simulateLastBusinessDay]);

  // --- TRANSICIONES ---
  const triggerTransition = (text: string, callback: () => void) => {
    setTransitionText(text);
    setTransitionLoading(true);
    setTimeout(() => {
      callback();
      setTransitionLoading(false);
    }, 750);
  };

  // --- HANDLERS ---
  const handleLogin = (user: User) => {
    triggerTransition(lang === 'es' ? 'Validando huella informática de acceso...' : 'Validating professional credentials...', () => {
      setCurrentUser(user);
      localStorage.setItem('sabatto_current_user', JSON.stringify(user));
      playBeep('success');
    });
  };

  const handleLogout = () => {
    triggerTransition(lang === 'es' ? 'Cerrando sesión del CAPS militar...' : 'Signing out completely...', () => {
      setCurrentUser(null);
      localStorage.removeItem('sabatto_current_user');
      playBeep('beep');
    });
  };

  const handleSwitchUser = (user: User) => {
    triggerTransition(lang === 'es' ? `Abriendo portal: ${user.name}` : `Opening portal: ${user.name}`, () => {
      setCurrentUser(user);
      localStorage.setItem('sabatto_current_user', JSON.stringify(user));
      playBeep('beep');
    });
  };

  // --- OPERATIONS ---
  const handleSubmitOrder = async (order: Order) => {
    if (!dbState) return;

    try {
      await addOrder(order);

      await appendAuditLog({
        id: `aud_${Date.now()}`,
        timestamp: new Date().toISOString(),
        userId: currentUser?.id || 'none',
        userName: currentUser?.name || 'Sistema',
        userRole: currentUser?.role || Role.ENFERMERO,
        action: 'CREATE_ORDER',
        details: `Generó nuevo pedido (${order.type === 'Extraordinario' ? 'Extraordinario' : 'Semanal'}) para sector ${order.service}.`
      });

      const updatedOrders = [order, ...dbState.orders];
      const updatedState = { ...dbState, orders: updatedOrders };
      setDbState(updatedState);

      playBeep('alert');
    } catch (error) {
      console.error('Error guardando pedido:', error);
      alert('Error al guardar el pedido. Revisa la consola.');
    }
  };

  const handlePrepareOrder = async (orderId: string, itemQuantities: Record<string, number>, assignedBatchesMap: Record<string, any>) => {
    if (!dbState) return;

    try {
      const updatedOrders = dbState.orders.map(ord => {
        if (ord.id === orderId) {
          const updatedItems = ord.items.map(itm => {
            const qty = itemQuantities[itm.productId] !== undefined ? itemQuantities[itm.productId] : itm.requestedQuantity;
            return {
              ...itm,
              approvedQuantity: qty,
              assignedBatches: assignedBatchesMap[itm.productId] || []
            };
          });

          return {
            ...ord,
            status: 'Preparado' as OrderStatus,
            items: updatedItems,
            preparedBy: {
              userId: currentUser?.id || 'sys',
              userName: currentUser?.name || 'Técnico'
            }
          };
        }
        return ord;
      });

      const updatedProducts = dbState.products.map(prod => {
        const editQty = itemQuantities[prod.id];
        if (editQty === undefined) return prod;

        const assignedBatches = assignedBatchesMap[prod.id] || [];
        const updatedBatches = prod.batches.map(batch => {
          const matchAssigned = assignedBatches.find((ab: any) => ab.batchId === batch.id);
          if (matchAssigned) {
            return {
              ...batch,
              quantity: Math.max(0, batch.quantity - matchAssigned.suggestedQty)
            };
          }
          return batch;
        });

        return {
          ...prod,
          batches: updatedBatches
        };
      });

      const currentOrder = dbState.orders.find(o => o.id === orderId);

      await updateOrder(orderId, {
        status: 'Preparado',
        preparedBy: {
          userId: currentUser?.id || 'sys',
          userName: currentUser?.name || 'Técnico'
        }
      });

      const preparedOrder = updatedOrders.find(o => o.id === orderId);
      if (preparedOrder) {
        await updateOrderItems(orderId, preparedOrder.items);
      }

      await saveDBState({ ...dbState, products: updatedProducts });

      await appendAuditLog({
        id: `aud_${Date.now()}`,
        timestamp: new Date().toISOString(),
        userId: currentUser?.id || 'sys',
        userName: currentUser?.name || 'Técnico',
        userRole: currentUser?.role || Role.TECNICO,
        action: 'PREPARE_ORDER',
        details: `Preparó despacho e implementó FEFO para pedido ID: ${orderId} (${currentOrder?.service})`
      });

      const updatedState = {
        ...dbState,
        orders: updatedOrders,
        products: updatedProducts
      };
      setDbState(updatedState);
    } catch (error) {
      console.error('Error preparando pedido:', error);
      alert('Error al preparar el pedido. Revisa la consola.');
    }
  };

  const handleDeliverOrder = async (orderId: string) => {
    if (!dbState) return;

    try {
      const updatedOrders = dbState.orders.map(ord => {
        if (ord.id === orderId) {
          return {
            ...ord,
            status: 'Entregado' as OrderStatus,
            deliveryDate: new Date().toISOString(),
            deliveredBy: {
              userId: currentUser?.id || 'sys',
              userName: currentUser?.name || 'Personal Depósito'
            }
          };
        }
        return ord;
      });

      const currentOrder = dbState.orders.find(o => o.id === orderId);

      await updateOrder(orderId, {
        status: 'Entregado',
        deliveryDate: new Date().toISOString(),
        deliveredBy: {
          userId: currentUser?.id || 'sys',
          userName: currentUser?.name || 'Personal Depósito'
        }
      });

      await appendAuditLog({
        id: `aud_${Date.now()}`,
        timestamp: new Date().toISOString(),
        userId: currentUser?.id || 'sys',
        userName: currentUser?.name || 'Personal Depósito',
        userRole: currentUser?.role || Role.TECNICO,
        action: 'DELIVER_ORDER',
        details: `Marcó pedido ${orderId} con destino a ${currentOrder?.service} como ENTREGADO.`
      });

      const updatedState = {
        ...dbState,
        orders: updatedOrders
      };
      setDbState(updatedState);
    } catch (error) {
      console.error('Error entregando pedido:', error);
      alert('Error al marcar el pedido como entregado. Revisa la consola.');
    }
  };

  const handleUpdateUsers = async (updatedUsers: User[]) => {
    if (!dbState) return;
    const updatedState = { ...dbState, users: updatedUsers };
    try {
      await saveDBState(updatedState);
      setDbState(updatedState);
    } catch (error) {
      console.error('Error guardando usuarios:', error);
      alert('Error al guardar cambios de usuarios. Revisa la consola.');
    }
  };

  const handleUpdateProducts = async (updatedProducts: Product[]) => {
    if (!dbState) return;

    // ACTUALIZAR ESTADO LOCAL INMEDIATAMENTE (la UI responde al toque)
    const updatedState = { ...dbState, products: updatedProducts };
    setDbState(updatedState);

    // GUARDAR EN SUPABASE SOLO LOS PRODUCTOS QUE CAMBIARON
    try {
      const oldProducts = dbState.products;
      const changedProducts = updatedProducts.filter((newProd) => {
        const oldProd = oldProducts.find(p => p.id === newProd.id);
        if (!oldProd) return true; // Producto nuevo
        return JSON.stringify(newProd.allowedServices) !== JSON.stringify(oldProd.allowedServices) ||
               JSON.stringify(newProd.batches) !== JSON.stringify(oldProd.batches) ||
               newProd.name !== oldProd.name ||
               newProd.presentation !== oldProd.presentation ||
               newProd.minStock !== oldProd.minStock ||
               newProd.category !== oldProd.category ||
               newProd.shelfLetter !== oldProd.shelfLetter ||
               newProd.shelfLevel !== oldProd.shelfLevel ||
               newProd.productType !== oldProd.productType;
      });

      if (changedProducts.length > 0) {
        const productsToSave = changedProducts.map(p => ({
          id: p.id,
          name: p.name,
          presentation: p.presentation,
          min_stock: p.minStock,
          category: p.category,
          product_type: p.productType,
          shelf_letter: p.shelfLetter,
          shelf_level: p.shelfLevel,
          allowed_services: p.allowedServices
        }));

        const { error } = await supabase
          .from('products')
          .upsert(productsToSave);

        if (error) {
          console.error('[Supabase] Error upsert products:', error);
          throw error;
        }

        // Guardar batches también
        const batchesToSave = changedProducts.flatMap(p => 
          p.batches.map(b => ({
            id: b.id,
            product_id: p.id,
            batch_code: b.batchCode,
            expiration_date: b.expirationDate,
            quantity: b.quantity
          }))
        );

        if (batchesToSave.length > 0) {
          const { error: batchError } = await supabase
            .from('batches')
            .upsert(batchesToSave);

          if (batchError) {
            console.error('[Supabase] Error upsert batches:', batchError);
            throw batchError;
          }
        }

        console.log('[App] Productos actualizados en Supabase:', changedProducts.map(p => p.name));
      }
    } catch (error) {
      console.error('Error guardando productos:', error);
      alert('Error al guardar productos. Revisa la consola.');
      // Revertir al estado anterior si falló
      setDbState(dbState);
    }
  };

  const handleUpdateServiceConfigs = async (updatedConfigs: ServiceConfiguration[]) => {
    if (!dbState) return;
    const updatedState = { ...dbState, serviceConfigs: updatedConfigs };
    try {
      await saveDBState(updatedState);
      setDbState(updatedState);
    } catch (error) {
      console.error('Error guardando configs:', error);
      alert('Error al guardar configuraciones. Revisa la consola.');
    }
  };

  const handleAppendAudit = (log: AuditLog) => {
    setDbState(prev => {
      if (!prev) return prev;
      const updatedState = { ...prev, auditLogs: [log, ...prev.auditLogs] };
      saveDBState(updatedState);
      return updatedState;
    });
  };

  const handleResetProductionMode = () => {
    setDbState(prev => {
      if (!prev) return prev;

      const resetProducts = prev.products.map(p => ({
        ...p,
        batches: []
      }));

      const newAudit: AuditLog = {
        id: `aud_${Date.now()}`,
        timestamp: new Date().toISOString(),
        userId: currentUser?.id || 'sys',
        userName: currentUser?.name || 'Administrador CAPS',
        userRole: Role.FARMACEUTICO,
        action: 'SYSTEM_RESET',
        details: 'Base de datos de prueba purgada con éxito por el Farmacéutico Administrador. Todos los lotes simulados se ajustaron a 0 y se borró el historial de pedidos de prueba. CAPS iniciado en Producción Real.'
      };

      const updatedState = {
        ...prev,
        products: resetProducts,
        orders: [],
        auditLogs: [newAudit]
      };

      saveDBState(updatedState);
      return updatedState;
    });

    playBeep('success');
  };

  const handleClearAlert = (id: string) => {
    setActiveAlerts(prev => prev.filter(a => a.id !== id));
  };

  // --- ORDENAMIENTO FEFO ---
  const sortedProducts = useMemo(() => {
    if (!dbState) return [];

    const productsCopy = [...dbState.products];

    return productsCopy.sort((a, b) => {
      const nameA = a.name.trim().toLowerCase();
      const nameB = b.name.trim().toLowerCase();
      const typeA = a.productType || 'Med';
      const typeB = b.productType || 'Med';

      if (productSortOrder === 'name-asc') {
        return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
      } else if (productSortOrder === 'name-desc') {
        return nameB.localeCompare(nameA, undefined, { sensitivity: 'base' });
      } else if (productSortOrder === 'type-med') {
        if (typeA === 'Med' && typeB === 'PM') return -1;
        if (typeA === 'PM' && typeB === 'Med') return 1;
        return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
      } else if (productSortOrder === 'type-pm') {
        if (typeA === 'PM' && typeB === 'Med') return -1;
        if (typeA === 'Med' && typeB === 'PM') return 1;
        return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
      }
      return 0;
    });
  }, [dbState?.products, productSortOrder]);

  // --- VISTAS POR ROL ---
  const renderRoleView = () => {
    if (!currentUser || !dbState) return null;

    switch (currentUser.role) {
      case Role.ENFERMERO:
        return (
          <EnfermeroView
            currentUser={currentUser}
            products={sortedProducts}
            orders={dbState.orders}
            serviceConfigs={dbState.serviceConfigs}
            onSubmitOrder={handleSubmitOrder}
            lang={lang}
          />
        );
      case Role.TECNICO:
        return (
          <TecnicoView
            currentUser={currentUser}
            products={sortedProducts}
            orders={dbState.orders}
            onPrepareOrder={handlePrepareOrder}
            onDeliverOrder={handleDeliverOrder}
            onUpdateProducts={handleUpdateProducts}
            onAppendAudit={handleAppendAudit}
            lang={lang}
            isLastBusinessDayActive={isLastBusinessDayActive}
            simulateLastBusinessDay={simulateLastBusinessDay}
            onToggleSimulateLastBusinessDay={() => {
              setSimulateLastBusinessDay(!simulateLastBusinessDay);
              playBeep('beep');
            }}
          />
        );
      case Role.FARMACEUTICO:
        return (
          <div className="space-y-6">
            {/* Banner de Control del Fin de Mes para el Farmacéutico */}
            <div className="bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-900/40 p-4 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 rounded-xl shrink-0">
                  <Calendar className="size-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-purple-950 dark:text-purple-200">
                      {lang === 'es' ? 'Simulador de Fin de Mes (Auditoría FEFO)' : 'Month-End Simulator (FEFO Audit)'}
                    </h4>
                    {isLastBusinessDayActive && (
                      <span className="px-2 py-0.5 bg-purple-600 text-white text-[10px] font-bold rounded-full uppercase tracking-wider animate-pulse">
                        {lang === 'es' ? 'Activo' : 'Active'}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-purple-700 dark:text-purple-300/80 mt-0.5">
                    {lang === 'es' 
                      ? 'Activa el modo de último día hábil para ejecutar descartes automáticos de lotes vencidos o por vencer.'
                      : 'Activate last business day mode to execute automated discards of expired/expiring batches.'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 w-full md:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setSimulateLastBusinessDay(!simulateLastBusinessDay);
                    playBeep('beep');
                  }}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-xs cursor-pointer ${
                    simulateLastBusinessDay
                      ? 'bg-purple-600 text-white hover:bg-purple-700'
                      : 'bg-white dark:bg-slate-800 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 hover:bg-purple-50 dark:hover:bg-purple-900/30'
                  }`}
                >
                  <RefreshCw className={`size-3.5 ${simulateLastBusinessDay ? 'animate-spin' : ''}`} />
                  {simulateLastBusinessDay 
                    ? (lang === 'es' ? 'Desactivar Simulación' : 'Disable Simulation')
                    : (lang === 'es' ? 'Simular Fin de Mes' : 'Simulate Month-End')
                  }
                </button>
              </div>
            </div>

            <div className="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl flex items-start gap-3">
              <span className="p-1 px-1.5 bg-orange-100 dark:bg-orange-950 rounded font-bold font-mono text-[10px] text-orange-700 dark:text-orange-300 uppercase shrink-0">VISTA DIRECTA</span>
              <p className="text-xs text-slate-700 dark:text-slate-300 font-sans tracking-tight leading-relaxed">
                Como <strong>Farmacéutico/a</strong> posees privilegios totales. Puedes simular flujos de preparación y control directamente en las secciones o alternar perfiles rápidamente desde el desplegable de tu barra.
              </p>
            </div>

            <FarmaceuticoView
              currentUser={currentUser}
              products={sortedProducts}
              orders={dbState.orders}
              users={dbState.users}
              auditLogs={dbState.auditLogs}
              serviceConfigs={dbState.serviceConfigs}
              onUpdateProducts={handleUpdateProducts}
              onUpdateUsers={handleUpdateUsers}
              onUpdateServiceConfigs={handleUpdateServiceConfigs}
              onAppendAudit={handleAppendAudit}
              onResetProductionMode={handleResetProductionMode}
              lang={lang}
              isLastBusinessDayActive={isLastBusinessDayActive}
              simulateLastBusinessDay={simulateLastBusinessDay}
              onToggleSimulateLastBusinessDay={() => {
                setSimulateLastBusinessDay(!simulateLastBusinessDay);
                playBeep('beep');
              }}
            />
          </div>
        );
      case Role.DIRECTOR:
        return (
          <DirectorView
            currentUser={currentUser}
            products={sortedProducts}
            orders={dbState.orders}
            users={dbState.users}
            auditLogs={dbState.auditLogs}
            lang={lang}
          />
        );

      default:
        return null;
    }
  };

  // --- FIX: Pantalla de error si falla la inicialización ---
  if (initError) {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center font-sans bg-slate-950 text-white p-8">
        <AlertCircle className="size-12 text-red-500 mb-4" />
        <h1 className="text-xl font-bold text-red-400 mb-2">Error de Conexión</h1>
        <p className="text-sm text-slate-400 text-center max-w-md mb-6">{initError}</p>
        <button 
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-sm font-semibold transition-colors"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (!dbState) {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center font-sans bg-[var(--app-bg)]">
        <Activity className="size-10 text-orange-600 animate-spin" />
        <p className="text-xs font-mono font-bold text-slate-500 uppercase mt-4 tracking-wider">Iniciando Servidor CAPS...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--app-bg)] transition-colors duration-300 text-slate-800 dark:text-slate-200">

      {/* Transición con z-index de seguridad */}
      {transitionLoading && (
        <div id="transition_screen" className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex flex-col items-center justify-center z-[9999] transition-opacity duration-300">
          <Activity className="size-12 text-orange-500 animate-pulse" />
          <p className="text-sm font-semibold text-zinc-200 mt-4 font-sans tracking-tight animate-bounce">{transitionText}</p>
        </div>
      )}

      {!currentUser ? (
        <AuthScreen
          users={dbState.users}
          onLoginSuccess={handleLogin}
          lang={lang}
        />
      ) : (
        <div className="space-y-6">
          <Navigation
            currentUser={currentUser}
            allUsers={dbState.users}
            onSwitchUser={handleSwitchUser}
            onLogout={handleLogout}
            lang={lang}
            setLang={setLang}
            darkMode={darkMode}
            setDarkMode={setDarkMode}
            soundMuted={soundMuted}
            setSoundMuted={setSoundMuted}
            alerts={activeAlerts}
            onClearAlert={handleClearAlert}
          />

          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">

            {/* Banner de Sincronización */}
            <div className="mb-6 flex flex-col md:flex-row justify-between items-stretch md:items-center p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xs gap-4 text-[11px] font-mono text-slate-400">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5 font-bold">
                  <span className="size-2 bg-orange-500 rounded-full inline-block animate-ping"></span>
                  <span className="text-slate-700 dark:text-slate-300">CONECTADO: Stock_Depósito CAPS Sabatto</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-0.5 rounded uppercase font-bold text-[9px] border border-slate-200 dark:border-slate-700/60">Sincronización Local</span>
                  <span className="text-slate-500 dark:text-slate-400">FEFO Algoritmo Activo</span>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start md:self-auto bg-slate-50 dark:bg-slate-950 p-1.5 px-3 rounded-2xl border border-slate-150 dark:border-slate-850">
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 font-sans">
                  {lang === 'es' ? 'Orden Visualización:' : 'Display Ordering:'}
                </span>
                <select
                  id="global-product-sort-select"
                  value={productSortOrder}
                  onChange={(e) => {
                    setProductSortOrder(e.target.value as any);
                    playBeep('beep');
                  }}
                  className="bg-white dark:bg-slate-900 text-slate-850 dark:text-slate-200 border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-1 text-xs font-sans font-bold focus:outline-none focus:ring-1 focus:ring-orange-500 cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  <option value="name-asc">🔤 {lang === 'es' ? 'Nombre (A - Z)' : 'Name (A - Z)'}</option>
                  <option value="name-desc">🔤 {lang === 'es' ? 'Nombre (Z - A)' : 'Name (Z - A)'}</option>
                  <option value="type-med">💊 {lang === 'es' ? 'Medicamentos primero, luego PM' : 'Meds first, then Supply'}</option>
                  <option value="type-pm">🩹 {lang === 'es' ? 'PM primero, luego Medicamentos' : 'Supply first, then Meds'}</option>
                </select>
              </div>
            </div>

            {renderRoleView()}
          </main>

        </div>
      )}
    </div>
  );
}
