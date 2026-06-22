/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import { initializeDB, saveDBState, FullDBState } from './lib/database';
import { User, Order, Product, Role, AuditLog, ServiceConfiguration, OrderStatus } from './types';
import AuthScreen from './components/AuthScreen';
import Navigation from './components/Navigation';
import EnfermeroView from './components/RoleViews/EnfermeroView';
import TecnicoView from './components/RoleViews/TecnicoView';
import FarmaceuticoView from './components/RoleViews/FarmaceuticoView';
import DirectorView from './components/RoleViews/DirectorView';
import { playBeep } from './lib/sound';
import { Activity } from 'lucide-react';
import { saveOrderToFirebase } from './lib/firebaseUtils';
import { getOrdersFromFirebase } from './lib/firebaseUtils';

export default function App() {
  // --- CORE SYSTEM STATES ---
  const [dbState, setDbState] = useState<FullDBState | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [lang, setLang] = useState<'es' | 'en'>('es');
  const [darkMode, setDarkMode] = useState<boolean>(false);
  const [soundMuted, setSoundMuted] = useState<boolean>(false);
  const [transitionLoading, setTransitionLoading] = useState<boolean>(false);
  const [transitionText, setTransitionText] = useState<string>('');

  // Centro de alertas activas
  const [activeAlerts, setActiveAlerts] = useState<{ id: string; text: string; type: 'critical' | 'new_order' | 'info' | 'expiring' }[]>([]);
  
  // Simulación de Último Día Hábil de Mes (Para testing y demostración interactiva)
  const [simulateLastBusinessDay, setSimulateLastBusinessDay] = useState<boolean>(false);

  // Selector de ordenamiento de insumos (Nombre A-Z, Z-A, Medicamentos primero, PM primero)
  const [productSortOrder, setProductSortOrder] = useState<'name-asc' | 'name-desc' | 'type-med' | 'type-pm'>('name-asc');


  // Función para determinar si una fecha es el último día hábil del mes (Lunes-Viernes)
  const isLastBusinessDayOfMonth = (date: Date = new Date()): boolean => {
    const y = date.getFullYear();
    const m = date.getMonth();
    // Obtener el último día del mes corriente
    const lastDay = new Date(y, m + 1, 0);
    const temp = new Date(lastDay);
    // Retroceder si cae sábado (6) o domingo (0)
    while (temp.getDay() === 0 || temp.getDay() === 6) {
      temp.setDate(temp.getDate() - 1);
    }
    return date.getDate() === temp.getDate() && 
           date.getMonth() === temp.getMonth() && 
           date.getFullYear() === temp.getFullYear();
  };

  const isLastBusinessDayActive = isLastBusinessDayOfMonth() || simulateLastBusinessDay;

  // --- INITIALIZE APPLICATION & PERSISTENCE ---
useEffect(() => {
    async function loadData() {
      // 1. Cargar base de datos local primero
      const state = initializeDB();
      
      // 2. Intentar cargar pedidos desde Firebase
      try {
        const firebaseOrders = await getOrdersFromFirebase();
        if (firebaseOrders.length > 0) {
          // Si hay pedidos en Firebase, usarlos
          setDbState({
            ...state,
            orders: firebaseOrders
          });
        } else {
          // Si no hay pedidos en Firebase, usar local
          setDbState(state);
        }
      } catch (error) {
        console.error('Error cargando desde Firebase:', error);
        setDbState(state);
      }
    }
    
    loadData();

    // Cargar preferencias de usuario de localStorage
    const savedUser = localStorage.getItem('sabatto_current_user');
    if (savedUser) {
      try {
        setCurrentUser(JSON.parse(savedUser));
      } catch (e) {
        console.error('Error parsed saved session', e);
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
  }, []);

  useEffect(() => {
    localStorage.setItem('sabatto_product_sort_order', productSortOrder);
  }, [productSortOrder]);


  // Guardar preferencias en localStorage
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

  // --- EVALUACIÓN DE ALERTAS EN TIEMPO REAL ---
  // Alertas de stock crítico e insumos caducando
  const evaluateAlertsAndAlarms = (state: FullDBState) => {
    const alertsList: { id: string; text: string; type: 'critical' | 'new_order' | 'info' | 'expiring' }[] = [];
    const today = new Date();
    const thirtyDaysLater = new Date();
    thirtyDaysLater.setDate(today.getDate() + 30);

    // 1. Alertas de Stock Crítico Bajo
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

      // 2. Alertas de Próximos a Vencer
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

    // 3. Alertas de Pedidos Pendientes Nuevos (Para técnicos/farmacéuticos)
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

    // 4. ALERTA MENSUAL DE DESCARTE (AUTOMÁTICA FIN DE MES)
    if (isLastBusinessDayActive) {
      // Buscar fármacos que vencen este mes o ya están vencidos
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

  // Escuchar cambios en dbState para recalcular alertas
  useEffect(() => {
    if (dbState) {
      evaluateAlertsAndAlarms(dbState);
    }
  }, [dbState, lang, simulateLastBusinessDay]);

  // --- CONTROLES DE TRANSICIONES ---
  const triggerTransition = (text: string, callback: () => void) => {
    setTransitionText(text);
    setTransitionLoading(true);
    setTimeout(() => {
      callback();
      setTransitionLoading(false);
    }, 750);
  };

  // --- HANDLERS CONTROLES USUARIOS ---
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

  // --- OPERATIONS ON DB/STATE ---
  
  // Enfermero envía pedido
  const handleSubmitOrder = async (order: Order) => {
    if (!dbState) return;

    const updatedOrders = [order, ...dbState.orders];
    const updatedState = { ...dbState, orders: updatedOrders };

    // Agregar bitácora de auditoría
    const newAudit: AuditLog = {
      id: `aud_${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: currentUser?.id || 'none',
      userName: currentUser?.name || 'Sistema',
      userRole: currentUser?.role || Role.ENFERMERO,
      action: 'CREATE_ORDER',
      details: `Generó nuevo pedido (${order.type === 'Extraordinario' ? 'Extraordinario' : 'Semanal'}) para sector ${order.service}.`
    };
    updatedState.auditLogs.unshift(newAudit);

    setDbState(updatedState);
    saveDBState(updatedState);
    // Sincronizar con Firebase
try {
  await saveOrderToFirebase(order);
} catch (error) {
  console.error('Error sincronizando con Firebase:', error);
}

    // Reproducir pitido de alarma nuevo pedido para el depósito
    playBeep('alert');
  };

  // Técnico prepara pedido (Edita cantidades y realiza FEFO)
  const handlePrepareOrder = (orderId: string, itemQuantities: Record<string, number>, assignedBatchesMap: Record<string, any>) => {
    if (!dbState) return;

    // Actualizar pedido
    const updatedOrders = dbState.orders.map(ord => {
      if (ord.id === orderId) {
        // Mapear cantidades aprobadas y lotes FEFO
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

    // Descontar del stock real
    const updatedProducts = dbState.products.map(prod => {
      const editQty = itemQuantities[prod.id];
      if (editQty === undefined) return prod; // No estaba en el pedido

      const assignedBatches = assignedBatchesMap[prod.id] || [];
      const updatedBatches = prod.batches.map(batch => {
        const matchAssigned = assignedBatches.find((ab: any) => ab.batchId === batch.id);
        if (matchAssigned) {
          // Descontar la cantidad
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

    // Auditoría
    const currentOrder = dbState.orders.find(o => o.id === orderId);
    const newAudit: AuditLog = {
      id: `aud_${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: currentUser?.id || 'sys',
      userName: currentUser?.name || 'Técnico',
      userRole: currentUser?.role || Role.TECNICO,
      action: 'PREPARE_ORDER',
      details: `Preparó despacho e implementó FEFO para pedido ID: ${orderId} (${currentOrder?.service})`
    };

    const updatedState = {
      ...dbState,
      orders: updatedOrders,
      products: updatedProducts,
      auditLogs: [newAudit, ...dbState.auditLogs]
    };

    setDbState(updatedState);
    saveDBState(updatedState);
  };

  // Entrega final de pedido
  const handleDeliverOrder = (orderId: string) => {
    if (!dbState) return;

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
    const newAudit: AuditLog = {
      id: `aud_${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: currentUser?.id || 'sys',
      userName: currentUser?.name || 'Personal Depósito',
      userRole: currentUser?.role || Role.TECNICO,
      action: 'DELIVER_ORDER',
      details: `Marcó pedido ${orderId} con destino a ${currentOrder?.service} como ENTREGADO.`
    };

    const updatedState = {
      ...dbState,
      orders: updatedOrders,
      auditLogs: [newAudit, ...dbState.auditLogs]
    };

    setDbState(updatedState);
    saveDBState(updatedState);
  };

  // Farmacéutico actualiza productos
  const handleUpdateProducts = (updatedProducts: Product[]) => {
    setDbState(prev => {
      if (!prev) return prev;
      const updatedState = { ...prev, products: updatedProducts };
      saveDBState(updatedState);
      return updatedState;
    });
  };

  // Farmacéutico actualiza usuarios
  const handleUpdateUsers = (updatedUsers: User[]) => {
    setDbState(prev => {
      if (!prev) return prev;
      const updatedState = { ...prev, users: updatedUsers };
      saveDBState(updatedState);
      return updatedState;
    });
  };

  // Farmacéutico actualiza configs semanales
  const handleUpdateServiceConfigs = (updatedConfigs: ServiceConfiguration[]) => {
    setDbState(prev => {
      if (!prev) return prev;
      const updatedState = { ...prev, serviceConfigs: updatedConfigs };
      saveDBState(updatedState);
      return updatedState;
    });
  };

  // Farmacéutico añade auditLog manual
  const handleAppendAudit = (log: AuditLog) => {
    setDbState(prev => {
      if (!prev) return prev;
      const updatedState = { ...prev, auditLogs: [log, ...prev.auditLogs] };
      saveDBState(updatedState);
      return updatedState;
    });
  };

  // Farmacéutico limpia base de datos para iniciar de forma limpia e impecable en producción real
  const handleResetProductionMode = () => {
    setDbState(prev => {
      if (!prev) return prev;
      
      const resetProducts = prev.products.map(p => ({
        ...p,
        batches: [] // Despejar de raíz todos los lotes experimentales o simulados
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
        orders: [], // Limpiar pedidos históricos simulados
        auditLogs: [newAudit] // Dejar únicamente la bitácora de inauguración limpia
      };
      
      saveDBState(updatedState);
      return updatedState;
    });
    
    playBeep('success');
  };

  const handleClearAlert = (id: string) => {
    setActiveAlerts(prev => prev.filter(a => a.id !== id));
  };

  // --- ORDENAMIENTO DE INSUMOS FEFO SEGÚN SELECCIÓN DE USUARIO ---
  const sortedProducts = useMemo(() => {
    if (!dbState) return [];
    
    // Hacer una copia del catálogo de productos para no mutar el estado directamente
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

  // --- CONTROL VISTAS PRINCIPALES POR ROL ---
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
            
            {/* El farmacéutico como super-usuario tiene acceso inmediato a probar comportamientos de los otros roles */}
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
      
      {/* Pantalla suave de transiciones de rol */}
      {transitionLoading && (
        <div id="transition_screen" className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex flex-col items-center justify-center z-50 transition-opacity duration-300">
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
            
            {/* Banner de Sincronización Local & Criterio de Ordenamiento de Insumos */}
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

              {/* Selector de Ordenamiento Global */}
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
