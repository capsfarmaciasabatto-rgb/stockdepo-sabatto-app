/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { supabase } from '../supabase';
import type {
  Order,
  OrderItem,
  Product,
  User,
  AuditLog,
  ServiceConfiguration,
  FullDBState
} from '../types';

// ============================================================
// FUNCIONES CRUD UNIFICADAS
// ============================================================

/**
 * Obtiene el estado completo actual desde Supabase.
 */
export async function getFullState(): Promise<FullDBState | null> {
  const [productsRes, ordersRes, usersRes, auditLogsRes, configsRes] = await Promise.all([
    supabase.from('products').select('*'),
    supabase.from('orders').select('*'),
    supabase.from('users').select('*'),
    supabase.from('audit_logs').select('*').order('timestamp', { ascending: false }),
    supabase.from('service_configs').select('*')
  ]);

  if (productsRes.error) throw productsRes.error;
  if (ordersRes.error) throw ordersRes.error;
  if (usersRes.error) throw usersRes.error;
  if (auditLogsRes.error) throw auditLogsRes.error;
  if (configsRes.error) throw configsRes.error;

  // Obtener lotes
  const { data: batches, error: batchesError } = await supabase
    .from('batches')
    .select('*');
  if (batchesError) throw batchesError;

  // Obtener ítems de pedidos
  const { data: orderItems, error: itemsError } = await supabase
    .from('order_items')
    .select('*');
  if (itemsError) throw itemsError;

  const productsWithBatches = (productsRes.data || []).map(p => ({
    ...p,
    minStock: p.min_stock,
    productType: p.product_type,
    shelfLetter: p.shelf_letter,
    shelfLevel: p.shelf_level,
    allowedServices: p.allowed_services || [],
    batches: (batches || [])
      .filter(b => b.product_id === p.id)
      .map(b => ({
        id: b.id,
        batchCode: b.batch_code,
        expirationDate: b.expiration_date,
        quantity: b.quantity
      }))
  }));

  const ordersWithItems = (ordersRes.data || []).map(o => ({
    ...o,
    requestDate: o.request_date,
    deliveryDate: o.delivery_date,
    requestedBy: {
      userId: o.requested_by_user_id,
      userName: o.requested_by_name,
      userEmail: o.requested_by_email
    },
    preparedBy: o.prepared_by_user_id ? {
      userId: o.prepared_by_user_id,
      userName: o.prepared_by_name
    } : undefined,
    deliveredBy: o.delivered_by_user_id ? {
      userId: o.delivered_by_user_id,
      userName: o.delivered_by_name
    } : undefined,
    items: (orderItems || [])
      .filter(i => i.order_id === o.id)
      .map(i => ({
        productId: i.product_id,
        productName: i.product_name,
        presentation: i.presentation,
        requestedQuantity: i.requested_quantity,
        approvedQuantity: i.approved_quantity,
        assignedBatches: i.assigned_batches || []
      }))
  }));

  return {
    products: productsWithBatches,
    orders: ordersWithItems,
    users: (usersRes.data || []).map(u => ({
      ...u,
      role: u.role as any
    })),
    auditLogs: (auditLogsRes.data || []).map(l => ({
      id: l.id,
      timestamp: l.timestamp,
      userId: l.user_id,
      userName: l.user_name,
      userRole: l.user_role as any,
      action: l.action,
      details: l.details
    })),
    serviceConfigs: (configsRes.data || []).map(c => ({
      serviceName: c.service_name,
      orderDay: c.order_day,
      orderDayName: c.order_day_name,
      allowDaily: c.allow_daily
    }))
  };
}

/**
 * Sobrescribe el estado completo.
 */
export async function setFullState(state: FullDBState): Promise<void> {
  // Guardar productos
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

  // Guardar lotes
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
 * Actualiza campos parciales del estado.
 */
export async function patchState(updates: Partial<FullDBState>): Promise<void> {
  if (updates.products) {
    await setFullState({ ...updates, products: updates.products } as FullDBState);
  }
}

// ============================================================
// PEDIDOS
// ============================================================

/**
 * Agrega un nuevo pedido.
 */
export async function addOrder(order: Order): Promise<void> {
  // Insertar pedido
  const { error: orderError } = await supabase.from('orders').insert({
    id: order.id,
    service: order.service,
    requested_by_user_id: order.requestedBy.userId,
    requested_by_name: order.requestedBy.userName,
    requested_by_email: order.requestedBy.userEmail,
    request_date: order.requestDate,
    status: order.status,
    type: order.type,
    notes: order.notes
  });
  if (orderError) throw orderError;

  // Insertar ítems del pedido
  if (order.items && order.items.length > 0) {
    const itemsToInsert = order.items.map(item => ({
      order_id: order.id,
      product_id: item.productId,
      product_name: item.productName,
      presentation: item.presentation,
      requested_quantity: item.requestedQuantity,
      approved_quantity: item.approvedQuantity,
      assigned_batches: item.assignedBatches
    }));

    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(itemsToInsert);
    if (itemsError) throw itemsError;
  }
}

/**
 * Actualiza un pedido existente por ID.
 */
export async function updateOrder(orderId: string, updates: Partial<Order>): Promise<void> {
  const updateData: any = {};
  
  if (updates.status !== undefined) updateData.status = updates.status;
  if (updates.deliveryDate !== undefined) updateData.delivery_date = updates.deliveryDate;
  if (updates.notes !== undefined) updateData.notes = updates.notes;
  if (updates.preparedBy !== undefined) {
    updateData.prepared_by_user_id = updates.preparedBy.userId;
    updateData.prepared_by_name = updates.preparedBy.userName;
  }
  if (updates.deliveredBy !== undefined) {
    updateData.delivered_by_user_id = updates.deliveredBy.userId;
    updateData.delivered_by_name = updates.deliveredBy.userName;
  }

  const { error } = await supabase
    .from('orders')
    .update(updateData)
    .eq('id', orderId);
  
  if (error) throw error;
}

/**
 * Reemplaza la lista completa de pedidos.
 */
export async function setOrders(orders: Order[]): Promise<void> {
  // Borrar ítems existentes
  await supabase.from('order_items').delete().neq('id', '0');
  
  // Borrar pedidos existentes
  await supabase.from('orders').delete().neq('id', '0');

  // Insertar nuevos pedidos
  for (const order of orders) {
    await addOrder(order);
  }
}

// ============================================================
// PRODUCTOS (STOCK + LOTES)
// ============================================================

/**
 * Reemplaza el catálogo completo de productos.
 */

/**
 * Actualiza los ítems de un pedido (approved_quantity y assigned_batches).
 */
export async function updateOrderItems(orderId: string, items: OrderItem[]): Promise<void> {
  // Primero eliminar los items existentes del pedido
  const { error: deleteError } = await supabase
    .from('order_items')
    .delete()
    .eq('order_id', orderId);

  if (deleteError) throw deleteError;

  // Insertar los nuevos items actualizados
  if (items && items.length > 0) {
    const itemsToInsert = items.map(item => ({
      order_id: orderId,
      product_id: item.productId,
      product_name: item.productName,
      presentation: item.presentation,
      requested_quantity: item.requestedQuantity,
      approved_quantity: item.approvedQuantity,
      assigned_batches: item.assignedBatches || []
    }));

    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(itemsToInsert);

    if (itemsError) throw itemsError;
  }
}

export async function setProducts(products: Product[]): Promise<void> {
  const productsToSave = products.map(p => ({
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

  const batchesToSave = products.flatMap(p => 
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
 * Actualiza un producto específico.
 */
export async function updateProduct(productId: string, updates: Partial<Product>): Promise<void> {
  const updateData: any = {};
  
  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.presentation !== undefined) updateData.presentation = updates.presentation;
  if (updates.minStock !== undefined) updateData.min_stock = updates.minStock;
  if (updates.category !== undefined) updateData.category = updates.category;
  if (updates.productType !== undefined) updateData.product_type = updates.productType;
  if (updates.shelfLetter !== undefined) updateData.shelf_letter = updates.shelfLetter;
  if (updates.shelfLevel !== undefined) updateData.shelf_level = updates.shelfLevel;
  if (updates.allowedServices !== undefined) updateData.allowed_services = updates.allowedServices;

  const { error } = await supabase
    .from('products')
    .update(updateData)
    .eq('id', productId);
  
  if (error) throw error;
}

// ============================================================
// USUARIOS
// ============================================================

/**
 * Reemplaza la lista completa de usuarios.
 */
export async function setUsers(users: User[]): Promise<void> {
  const usersToSave = users.map(u => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    service: u.service,
    password: u.password
  }));

  const { error } = await supabase
    .from('users')
    .upsert(usersToSave);
  
  if (error) throw error;
}

/**
 * Actualiza un usuario específico.
 */
export async function updateUser(userId: string, updates: Partial<User>): Promise<void> {
  const updateData: any = {};
  
  if (updates.email !== undefined) updateData.email = updates.email;
  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.role !== undefined) updateData.role = updates.role;
  if (updates.service !== undefined) updateData.service = updates.service;
  if (updates.password !== undefined) updateData.password = updates.password;

  const { error } = await supabase
    .from('users')
    .update(updateData)
    .eq('id', userId);
  
  if (error) throw error;
}

// ============================================================
// CONFIGURACIONES DE SERVICIO
// ============================================================

/**
 * Reemplaza las configuraciones semanales.
 */
export async function setServiceConfigs(configs: ServiceConfiguration[]): Promise<void> {
  const configsToSave = configs.map(c => ({
    service_name: c.serviceName,
    order_day: c.orderDay,
    order_day_name: c.orderDayName,
    allow_daily: c.allowDaily
  }));

  const { error } = await supabase
    .from('service_configs')
    .upsert(configsToSave);
  
  if (error) throw error;
}

// ============================================================
// AUDIT LOGS
// ============================================================

/**
 * Agrega una entrada de auditoría.
 */
export async function appendAuditLog(log: AuditLog): Promise<void> {
  const { error } = await supabase.from('audit_logs').insert({
    user_id: log.userId,
    user_name: log.userName,
    user_role: log.userRole,
    action: log.action,
    details: log.details
  });
  
  if (error) throw error;
}

/**
 * Reemplaza todos los logs de auditoría.
 */
export async function setAuditLogs(logs: AuditLog[]): Promise<void> {
  await supabase.from('audit_logs').delete().neq('id', '0');

  const logsToInsert = logs.map(l => ({
    user_id: l.userId,
    user_name: l.userName,
    user_role: l.userRole,
    action: l.action,
    details: l.details
  }));

  const { error } = await supabase
    .from('audit_logs')
    .insert(logsToInsert);
  
  if (error) throw error;
}

// ============================================================
// LISTENER EN TIEMPO REAL
// ============================================================

/**
 * Escucha cambios del estado completo en tiempo real.
 */
export function listenToState(callback: (state: FullDBState) => void): () => void {
  const channels = [
    supabase.channel('state-products')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, async () => {
        const state = await getFullState();
        if (state) callback(state);
      }),
    supabase.channel('state-batches')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'batches' }, async () => {
        const state = await getFullState();
        if (state) callback(state);
      }),
    supabase.channel('state-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, async () => {
        const state = await getFullState();
        if (state) callback(state);
      }),
    supabase.channel('state-order_items')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, async () => {
        const state = await getFullState();
        if (state) callback(state);
      }),
    supabase.channel('state-users')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, async () => {
        const state = await getFullState();
        if (state) callback(state);
      }),
    supabase.channel('state-audit_logs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'audit_logs' }, async () => {
        const state = await getFullState();
        if (state) callback(state);
      }),
    supabase.channel('state-service_configs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_configs' }, async () => {
        const state = await getFullState();
        if (state) callback(state);
      })
  ];

  channels.forEach(ch => ch.subscribe());

  return () => {
    channels.forEach(ch => supabase.removeChannel(ch));
  };
}

// ============================================================
// FUNCIONES LEGACY (compatibilidad)
// ============================================================

export async function saveOrderToFirebase(order: any): Promise<string> {
  await addOrder(order as Order);
  return order.id;
}

export async function getOrdersFromFirebase(): Promise<any[]> {
  const state = await getFullState();
  return state?.orders || [];
}

export async function updateOrderInFirebase(orderId: string, updates: any): Promise<void> {
  await updateOrder(orderId, updates);
}

export async function deleteOrderFromFirebase(orderId: string): Promise<void> {
  await supabase.from('order_items').delete().eq('order_id', orderId);
  await supabase.from('orders').delete().eq('id', orderId);
}

export function listenToOrders(callback: (orders: any[]) => void): () => void {
  return listenToState((state) => {
    callback(state.orders);
  });
}
