/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { supabase } from '../supabase';
import { hashPassword } from './auth';
import type {
  User,
  Product,
  Order,
  AuditLog,
  Role,
  ServiceConfiguration
} from '../types';
import { PredefinedService } from '../types';

// ============================================================
// INTERFAZ DE ESTADO COMPLETO
// ============================================================

export interface FullDBState {
  products: Product[];
  orders: Order[];
  users: User[];
  auditLogs: AuditLog[];
  serviceConfigs: ServiceConfiguration[];
}

// ============================================================
// FUNCIONES AUXILIARES
// ============================================================

/**
 * Obtiene todos los productos con sus lotes.
 */
async function getProductsWithBatches(): Promise<Product[]> {
  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('*')
    .order('name');

  if (productsError) throw productsError;
  if (!products) return [];

  const { data: batches, error: batchesError } = await supabase
    .from('batches')
    .select('*')
    .order('expiration_date');

  if (batchesError) throw batchesError;

  return products.map(product => ({
    ...product,
    minStock: product.min_stock,
    productType: product.product_type,
    shelfLetter: product.shelf_letter,
    shelfLevel: product.shelf_level,
    allowedServices: (typeof product.allowed_services === 'string'
      ? JSON.parse(product.allowed_services)
      : product.allowed_services) || [],
    batches: (batches || [])
      .filter(b => b.product_id === product.id)
      .map(b => ({
        id: b.id,
        batchCode: b.batch_code,
        expirationDate: b.expiration_date,
        quantity: b.quantity
      }))
  }));
}

/**
 * Obtiene todos los pedidos con sus ítems.
 */
async function getOrdersWithItems(): Promise<Order[]> {
  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('*')
    .order('request_date', { ascending: false });

  if (ordersError) throw ordersError;
  if (!orders) return [];

  const { data: items, error: itemsError } = await supabase
    .from('order_items')
    .select('*');

  if (itemsError) throw itemsError;

  return orders.map(order => ({
    ...order,
    requestDate: order.request_date,
    deliveryDate: order.delivery_date,
    requestedBy: {
      userId: order.requested_by_user_id,
      userName: order.requested_by_name,
      userEmail: order.requested_by_email
    },
    preparedBy: order.prepared_by_user_id ? {
      userId: order.prepared_by_user_id,
      userName: order.prepared_by_name
    } : undefined,
    deliveredBy: order.delivered_by_user_id ? {
      userId: order.delivered_by_user_id,
      userName: order.delivered_by_name
    } : undefined,
    items: (items || [])
      .filter(i => i.order_id === order.id)
      .map(i => ({
        productId: i.product_id,
        productName: i.product_name,
        presentation: i.presentation,
        requestedQuantity: i.requested_quantity,
        approvedQuantity: i.approved_quantity,
        assignedBatches: i.assigned_batches || []
      }))
  }));
}

/**
 * Obtiene todos los usuarios.
 */
async function getUsers(): Promise<User[]> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .order('name');

  if (error) throw error;
  return data || [];
}

/**
 * Obtiene todos los logs de auditoría.
 */
async function getAuditLogs(): Promise<AuditLog[]> {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .order('timestamp', { ascending: false });

  if (error) throw error;
  return (data || []).map(log => ({
    id: log.id,
    timestamp: log.timestamp,
    userId: log.user_id,
    userName: log.user_name,
    userRole: log.user_role as Role,
    action: log.action,
    details: log.details
  }));
}

/**
 * Obtiene las configuraciones de servicios.
 */
async function getServiceConfigs(): Promise<ServiceConfiguration[]> {
  const { data, error } = await supabase
    .from('service_configs')
    .select('*');

  if (error) throw error;
  return (data || []).map(config => ({
    serviceName: config.service_name,
    orderDay: config.order_day,
    orderDayName: config.order_day_name,
    allowDaily: config.allow_daily
  }));
}

// ============================================================
// INICIALIZACIÓN
// ============================================================

/**
 * Inicializa la base de datos.
 * Si las tablas están vacías, carga datos por defecto.
 * Si hay usuarios con contraseñas en texto plano, las hashea.
 */
export async function initializeDB(): Promise<{
  initialState: FullDBState;
  subscribe: (callback: (state: FullDBState) => void) => () => void;
}> {
  // Verificar si hay usuarios (no productos) para decidir si cargar datos iniciales
  const { count: userCount } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true });

  // Si no hay usuarios, cargar datos iniciales completos
  if (!userCount || userCount === 0) {
    console.log('[Supabase] Tablas vacías. Cargando datos iniciales...');
    await seedInitialData();
  } else {
    // Si ya hay usuarios, verificar si hay contraseñas en texto plano
    console.log('[Supabase] Usuarios existentes detectados. Verificando contraseñas...');
    await hashExistingPasswords();
  }

  // SIEMPRE cargar el estado actual de la base de datos
  const initialState: FullDBState = {
    products: await getProductsWithBatches(),
    orders: await getOrdersWithItems(),
    users: await getUsers(),
    auditLogs: await getAuditLogs(),
    serviceConfigs: await getServiceConfigs()
  };

  console.log('[Supabase] Estado inicial cargado:', {
    products: initialState.products.length,
    orders: initialState.orders.length,
    users: initialState.users.length,
    auditLogs: initialState.auditLogs.length
  });

  // Suscribirse a cambios en tiempo real
  const subscribe = (callback: (state: FullDBState) => void) => {
    const channels = [
      // NOTA: Desactivados realtime para products y batches para evitar
      // que pisen el estado local durante edición manual de asignaciones.
      // Los cambios se refrescan al recargar la página o navegar entre tabs.
      // supabase.channel('products-changes')
      //   .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => refreshState(callback)),
      // supabase.channel('batches-changes')
      //   .on('postgres_changes', { event: '*', schema: 'public', table: 'batches' }, () => refreshState(callback)),
      supabase.channel('orders-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => refreshState(callback)),
      supabase.channel('order_items-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => refreshState(callback)),
      supabase.channel('users-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => refreshState(callback)),
      supabase.channel('audit_logs-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'audit_logs' }, () => refreshState(callback)),
      supabase.channel('service_configs-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'service_configs' }, () => refreshState(callback))
    ];

    channels.forEach(ch => ch.subscribe());

    return () => {
      channels.forEach(ch => supabase.removeChannel(ch));
    };
  };

  return { initialState, subscribe };
}

async function refreshState(callback: (state: FullDBState) => void) {
  const state: FullDBState = {
    products: await getProductsWithBatches(),
    orders: await getOrdersWithItems(),
    users: await getUsers(),
    auditLogs: await getAuditLogs(),
    serviceConfigs: await getServiceConfigs()
  };
  callback(state);
}

// ============================================================
// HASHING DE CONTRASEÑAS EXISTENTES
// ============================================================

/**
 * Detecta usuarios con contraseñas en texto plano y las hashea.
 * Esto se ejecuta automáticamente al iniciar la app.
 */
async function hashExistingPasswords(): Promise<void> {
  const { data: users, error } = await supabase
    .from('users')
    .select('id, password');

  if (error || !users) return;

  // Detectar contraseñas en texto plano (los hashes de bcrypt empiezan con $2)
  const plainTextUsers = users.filter(u => !u.password.startsWith('$2'));

  if (plainTextUsers.length === 0) {
    console.log('[Auth] Todas las contraseñas ya están hasheadas.');
    return;
  }

  console.log(`[Auth] Hasheando ${plainTextUsers.length} contraseñas en texto plano...`);

  for (const user of plainTextUsers) {
    const hashed = await hashPassword(user.password);
    
    const { error: updateError } = await supabase
      .from('users')
      .update({ password: hashed })
      .eq('id', user.id);

    if (updateError) {
      console.error(`[Auth] Error hasheando contraseña de ${user.id}:`, updateError);
    } else {
      console.log(`[Auth] Contraseña de ${user.id} hasheada correctamente.`);
    }
  }
}

// ============================================================
// SEEDING DE DATOS INICIALES
// ============================================================

/**
 * Carga datos iniciales en la base de datos.
 * Las contraseñas se guardan hasheadas.
 */
async function seedInitialData(): Promise<void> {
  // Insertar logs de auditoría
  const { error: auditError } = await supabase.from('audit_logs').insert([
    { user_id: 'u5', user_name: 'Farm. Ramon Sabatto', user_role: 'FARMACEUTICO', action: 'USER_UPDATE', details: 'Inicialización de perfiles de farmacia y técnicos en CAPS.' },
    { user_id: 'u5', user_name: 'Farm. Ramon Sabatto', user_role: 'FARMACEUTICO', action: 'CATALOG_UPDATE', details: 'Carga inicial del catálogo de fármacos e insumos críticos FEFO.' }
  ]);
  if (auditError) console.error('[Supabase] Error insertando logs:', auditError);
}

// ============================================================
// GUARDAR ESTADO COMPLETO
// ============================================================

/**
 * Guarda el estado completo en Supabase.
 */
export async function saveDBState(state: FullDBState): Promise<void> {
  console.warn('[Supabase] saveDBState es costoso con tablas separadas. Usar funciones específicas.');
  
  const productsToSave = state.products.map(p => ({
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
  
  const { error: productsError } = await supabase
    .from('products')
    .upsert(productsToSave);
  if (productsError) throw productsError;

  const batchesToSave = state.products.flatMap(p => 
    p.batches.map(b => ({
      id: b.id,
      product_id: p.id,
      batch_code: b.batchCode,
      expiration_date: b.expirationDate,
      quantity: b.quantity
    }))
  );
  
  const { error: batchesError } = await supabase
    .from('batches')
    .upsert(batchesToSave);
  if (batchesError) throw batchesError;
}

/**
 * Actualiza campos específicos del estado.
 */
export async function updateDBState(updates: Partial<FullDBState>): Promise<void> {
  if (updates.products) {
    await saveDBState({ ...updates, products: updates.products } as FullDBState);
  }
}

/**
 * Resetea la base de datos a los valores por defecto.
 */
export async function resetDBToDefaults(): Promise<void> {
  await supabase.from('order_items').delete().neq('id', '0');
  await supabase.from('orders').delete().neq('id', '0');
  await supabase.from('audit_logs').delete().neq('id', '0');
  await supabase.from('batches').delete().neq('id', '0');
  await supabase.from('products').delete().neq('id', '0');
  await supabase.from('users').delete().neq('id', '0');
  await supabase.from('service_configs').delete().neq('service_name', '0');
  
  await seedInitialData();
}

/**
 * Limpia todos los listeners activos.
 */
export function cleanupDBListeners(): void {
  supabase.removeAllChannels();
}

// ============================================================
// ALGORITMO FEFO
// ============================================================

export function suggestFEFOBatches(product: Product, requestedQty: number): {
  batchId: string;
  batchCode: string;
  expirationDate: string;
  suggestedQty: number;
}[] {
  const activeBatches = [...product.batches]
    .filter(b => b.quantity > 0)
    .sort((a, b) => new Date(a.expirationDate).getTime() - new Date(b.expirationDate).getTime());

  let remaining = requestedQty;
  const suggested: { batchId: string; batchCode: string; expirationDate: string; suggestedQty: number; }[] = [];

  for (const batch of activeBatches) {
    if (remaining <= 0) break;
    const take = Math.min(batch.quantity, remaining);
    suggested.push({
      batchId: batch.id,
      batchCode: batch.batchCode,
      expirationDate: batch.expirationDate,
      suggestedQty: take
    });
    remaining -= take;
  }

  return suggested;
}
