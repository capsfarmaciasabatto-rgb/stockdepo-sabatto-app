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
    allowedServices: product.allowed_services || [],
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
  // Verificar si hay productos
  const { count: productCount } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true });

  // Si no hay productos, cargar datos iniciales completos
  if (!productCount || productCount === 0) {
    console.log('[Supabase] Tablas vacías. Cargando datos iniciales...');
    await seedInitialData();
  } else {
    // Si ya hay datos, verificar si hay usuarios con contraseñas en texto plano
    await hashExistingPasswords();
  }

  const initialState: FullDBState = {
    products: await getProductsWithBatches(),
    orders: await getOrdersWithItems(),
    users: await getUsers(),
    auditLogs: await getAuditLogs(),
    serviceConfigs: await getServiceConfigs()
  };

  // Suscribirse a cambios en tiempo real
  const subscribe = (callback: (state: FullDBState) => void) => {
    const channels = [
      supabase.channel('products-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => refreshState(callback)),
      supabase.channel('batches-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'batches' }, () => refreshState(callback)),
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
  // Hashear contraseñas
  const hashedAdmin = await hashPassword('admin');
  const hashed123 = await hashPassword('123');

  // Insertar usuarios con contraseñas hasheadas
  const { error: usersError } = await supabase.from('users').insert([
    { id: 'caps_admin', email: 'capsfarmaciasabatto@gmail.com', name: 'Farm. Principal Sabatto (Admin)', role: 'FARMACEUTICO', password: hashedAdmin },
    { id: 'u1', email: 'enfermero@test.com', name: 'Enfermera Marta Gómez (Guardia)', role: 'ENFERMERO', service: 'GUARDIA', password: hashed123 },
    { id: 'u2', email: 'irab@test.com', name: 'Enfermero Ariel Blanco (IRAB)', role: 'ENFERMERO', service: 'IRAB', password: hashed123 },
    { id: 'u3', email: 'laboratorio@test.com', name: 'Técnica Analía Ruiz (Laboratorio)', role: 'ENFERMERO', service: 'LABORATORIO', password: hashed123 },
    { id: 'u6', email: 'farmacia@test.com', name: 'Enfermero Diego Paz (Farmacia Dispensa)', role: 'ENFERMERO', service: 'FARMACIA', password: hashed123 },
    { id: 'u4', email: 'tecnico@test.com', name: 'Téc. Lucas Castro', role: 'TECNICO', password: hashed123 },
    { id: 'u5', email: 'farmaceutico@test.com', name: 'Farm. Sofía Sabatto', role: 'FARMACEUTICO', password: hashed123 },
    { id: 'u7', email: 'director@test.com', name: 'Dr. Claudio Rossi (Director/a CAPS)', role: 'DIRECTOR', password: hashed123 }
  ]);
  if (usersError) console.error('[Supabase] Error insertando usuarios:', usersError);

  // Insertar configuraciones de servicios
  const { error: configsError } = await supabase.from('service_configs').insert([
    { service_name: 'GUARDIA', order_day: 3, order_day_name: 'Miércoles', allow_daily: false },
    { service_name: 'LABORATORIO', order_day: 1, order_day_name: 'Lunes', allow_daily: false },
    { service_name: 'IRAB', order_day: 5, order_day_name: 'Viernes', allow_daily: true },
    { service_name: 'FARMACIA', order_day: 2, order_day_name: 'Martes', allow_daily: true }
  ]);
  if (configsError) console.error('[Supabase] Error insertando configs:', configsError);

  // Insertar productos
  const { error: productsError } = await supabase.from('products').insert([
    { id: 'g1', name: 'Hidrocortisona 500 mg', presentation: 'Frasco Ampolla (FA) inyectable', min_stock: 20, category: 'GUARDIA', product_type: 'Med', shelf_letter: 'A', shelf_level: 1, allowed_services: ['GUARDIA'] },
    { id: 'g2', name: 'Furosemida 20 mg', presentation: 'Ampolla 2 ml', min_stock: 50, category: 'GUARDIA', product_type: 'Med', shelf_letter: 'A', shelf_level: 1, allowed_services: ['GUARDIA'] },
    { id: 'g3', name: 'Dipirona 1g (Metamizol)', presentation: 'Ampolla 2 ml', min_stock: 40, category: 'GUARDIA', product_type: 'Med', shelf_letter: 'A', shelf_level: 2, allowed_services: ['GUARDIA'] },
    { id: 'g4', name: 'Adrenalina 1 mg/ml', presentation: 'Ampolla 1 ml', min_stock: 15, category: 'GUARDIA', product_type: 'Med', shelf_letter: 'A', shelf_level: 2, allowed_services: ['GUARDIA'] },
    { id: 'g5', name: 'Diazepam 10 mg', presentation: 'Ampolla 2 ml', min_stock: 10, category: 'GUARDIA', product_type: 'Med', shelf_letter: 'A', shelf_level: 3, allowed_services: ['GUARDIA'] },
    { id: 'g6', name: 'Dexametasona 4 mg', presentation: 'Ampolla 1 ml', min_stock: 30, category: 'GUARDIA', product_type: 'Med', shelf_letter: 'A', shelf_level: 3, allowed_services: ['GUARDIA'] },
    { id: 'g7', name: 'Clonazepam 2 mg', presentation: 'Comprimidos y gotas', min_stock: 25, category: 'GUARDIA', product_type: 'Med', shelf_letter: 'B', shelf_level: 1, allowed_services: ['GUARDIA', 'IRAB'] },
    { id: 'l1', name: 'Agujas Descartables 25/8', presentation: 'Caja x 100 unidades', min_stock: 5, category: 'LABORATORIO', product_type: 'PM', shelf_letter: 'C', shelf_level: 1, allowed_services: ['LABORATORIO', 'GUARDIA'] },
    { id: 'l2', name: 'Jeringas Descartables 10 ml', presentation: 'Caja x 100 unidades', min_stock: 5, category: 'LABORATORIO', product_type: 'PM', shelf_letter: 'C', shelf_level: 1, allowed_services: ['LABORATORIO', 'GUARDIA'] },
    { id: 'l3', name: 'Jeringas Descartables 5 ml', presentation: 'Caja x 100 unidades', min_stock: 6, category: 'LABORATORIO', product_type: 'PM', shelf_letter: 'C', shelf_level: 2, allowed_services: ['LABORATORIO', 'GUARDIA'] },
    { id: 'l4', name: 'Tubos Vacutainer Tapa Roja', presentation: 'Bolsa x 100 unidades', min_stock: 3, category: 'LABORATORIO', product_type: 'PM', shelf_letter: 'C', shelf_level: 2, allowed_services: ['LABORATORIO'] },
    { id: 'l5', name: 'Tubos Vacutainer Tapa Lila (EDTA)', presentation: 'Bolsa x 100 unidades', min_stock: 3, category: 'LABORATORIO', product_type: 'PM', shelf_letter: 'C', shelf_level: 3, allowed_services: ['LABORATORIO'] },
    { id: 'l6', name: 'Alcohol Isopropílico 70%', presentation: 'Botella 1000 ml', min_stock: 4, category: 'LABORATORIO', product_type: 'PM', shelf_letter: 'D', shelf_level: 1, allowed_services: ['LABORATORIO', 'GUARDIA'] },
    { id: 'i1', name: 'Salbutamol Aerosol (Puff)', presentation: 'Inhalador 250 dosis', min_stock: 40, category: 'IRAB', product_type: 'Med', shelf_letter: 'E', shelf_level: 1, allowed_services: ['IRAB', 'GUARDIA'] },
    { id: 'i2', name: 'Amoxicilina 500mg/5ml suspension', presentation: 'Frasco 90 ml (Jarabe)', min_stock: 25, category: 'IRAB', product_type: 'Med', shelf_letter: 'E', shelf_level: 2, allowed_services: ['IRAB'] },
    { id: 'i3', name: 'Metilprednisona 4mg/ml', presentation: 'Frasco Gotas 15 ml', min_stock: 15, category: 'IRAB', product_type: 'Med', shelf_letter: 'E', shelf_level: 2, allowed_services: ['IRAB', 'GUARDIA'] },
    { id: 'i4', name: 'Budesonide 200 mcg Inhalador', presentation: 'Aerosol 200 dosis', min_stock: 20, category: 'IRAB', product_type: 'Med', shelf_letter: 'E', shelf_level: 3, allowed_services: ['IRAB'] },
    { id: 'i5', name: 'Bromuro de Ipratropio', presentation: 'Gotas para nebulizar 20 ml', min_stock: 15, category: 'IRAB', product_type: 'Med', shelf_letter: 'E', shelf_level: 3, allowed_services: ['IRAB', 'GUARDIA'] },
    { id: 'i6', name: 'Mascara de Nebulización Pediátrica', presentation: 'Unidad Individual', min_stock: 15, category: 'IRAB', product_type: 'PM', shelf_letter: 'F', shelf_level: 1, allowed_services: ['IRAB'] },
    { id: 's1', name: 'Alcohol en Gel 65%', presentation: 'Envase con válvula 500 ml', min_stock: 30, category: 'Compartido', product_type: 'PM', shelf_letter: 'G', shelf_level: 1, allowed_services: ['GUARDIA', 'LABORATORIO', 'IRAB'] },
    { id: 's2', name: 'Gasas Estériles 10x10 cm', presentation: 'Paquete x 10 sobres', min_stock: 50, category: 'Compartido', product_type: 'PM', shelf_letter: 'G', shelf_level: 2, allowed_services: ['GUARDIA', 'LABORATORIO', 'IRAB'] },
    { id: 's3', name: 'Guantes de Látex Talle M', presentation: 'Caja x 100 unidades', min_stock: 12, category: 'Compartido', product_type: 'PM', shelf_letter: 'G', shelf_level: 2, allowed_services: ['GUARDIA', 'LABORATORIO', 'IRAB'] },
    { id: 's4', name: 'Cinta Adhesiva Hipoalergénica', presentation: 'Carretel 5 cm x 9 m', min_stock: 15, category: 'Compartido', product_type: 'PM', shelf_letter: 'G', shelf_level: 3, allowed_services: ['GUARDIA', 'LABORATORIO', 'IRAB'] },
    { id: 's5', name: 'Abrojos Madera (Bajalenguas)', presentation: 'Paquete x 100 unidades', min_stock: 10, category: 'Compartido', product_type: 'PM', shelf_letter: 'H', shelf_level: 1, allowed_services: ['GUARDIA', 'IRAB'] }
  ]);
  if (productsError) console.error('[Supabase] Error insertando productos:', productsError);

  // Insertar lotes
  const { error: batchesError } = await supabase.from('batches').insert([
    { id: 'b_g1_1', product_id: 'g1', batch_code: 'HC-501A', expiration_date: '2026-06-15', quantity: 15 },
    { id: 'b_g1_2', product_id: 'g1', batch_code: 'HC-502B', expiration_date: '2026-11-30', quantity: 40 },
    { id: 'b_g2_1', product_id: 'g2', batch_code: 'FS-991', expiration_date: '2026-09-10', quantity: 80 },
    { id: 'b_g3_1', product_id: 'g3', batch_code: 'DP-044', expiration_date: '2026-06-05', quantity: 12 },
    { id: 'b_g3_2', product_id: 'g3', batch_code: 'DP-045', expiration_date: '2027-02-15', quantity: 100 },
    { id: 'b_g4_1', product_id: 'g4', batch_code: 'AD-211', expiration_date: '2026-10-01', quantity: 25 },
    { id: 'b_g5_1', product_id: 'g5', batch_code: 'DZ-881', expiration_date: '2026-12-25', quantity: 18 },
    { id: 'b_g6_1', product_id: 'g6', batch_code: 'DX-109', expiration_date: '2026-08-14', quantity: 50 },
    { id: 'b_g7_1', product_id: 'g7', batch_code: 'CN-334', expiration_date: '2026-07-20', quantity: 30 },
    { id: 'b_l1_1', product_id: 'l1', batch_code: 'AG-258A', expiration_date: '2027-04-12', quantity: 8 },
    { id: 'b_l2_1', product_id: 'l2', batch_code: 'JR-10ML', expiration_date: '2026-06-25', quantity: 3 },
    { id: 'b_l2_2', product_id: 'l2', batch_code: 'JR-10ML-B', expiration_date: '2027-01-15', quantity: 15 },
    { id: 'b_l3_1', product_id: 'l3', batch_code: 'JR-5ML', expiration_date: '2028-02-18', quantity: 12 },
    { id: 'b_l4_1', product_id: 'l4', batch_code: 'TB-TR88', expiration_date: '2026-12-01', quantity: 5 },
    { id: 'b_l5_1', product_id: 'l5', batch_code: 'TB-TL99', expiration_date: '2026-11-15', quantity: 4 },
    { id: 'b_l6_1', product_id: 'l6', batch_code: 'AL-70P', expiration_date: '2027-05-30', quantity: 10 },
    { id: 'b_i1_1', product_id: 'i1', batch_code: 'SB-001', expiration_date: '2026-06-10', quantity: 20 },
    { id: 'b_i1_2', product_id: 'i1', batch_code: 'SB-002', expiration_date: '2026-12-31', quantity: 15 },
    { id: 'b_i1_3', product_id: 'i1', batch_code: 'SB-003', expiration_date: '2027-06-15', quantity: 60 },
    { id: 'b_i2_1', product_id: 'i2', batch_code: 'AM-90M', expiration_date: '2026-08-20', quantity: 35 },
    { id: 'b_i3_1', product_id: 'i3', batch_code: 'MP-GOT', expiration_date: '2026-06-20', quantity: 5 },
    { id: 'b_i3_2', product_id: 'i3', batch_code: 'MP-GOT-2', expiration_date: '2027-03-30', quantity: 25 },
    { id: 'b_i4_1', product_id: 'i4', batch_code: 'BD-200', expiration_date: '2026-11-10', quantity: 45 },
    { id: 'b_i5_1', product_id: 'i5', batch_code: 'BI-GOT', expiration_date: '2026-10-05', quantity: 22 },
    { id: 'b_i6_1', product_id: 'i6', batch_code: 'M-NEB-P', expiration_date: '2029-01-01', quantity: 18 },
    { id: 'b_s1_1', product_id: 's1', batch_code: 'AG-404', expiration_date: '2026-06-01', quantity: 10 },
    { id: 'b_s1_2', product_id: 's1', batch_code: 'AG-405', expiration_date: '2027-10-15', quantity: 80 },
    { id: 'b_s2_1', product_id: 's2', batch_code: 'GS-101', expiration_date: '2028-11-20', quantity: 150 },
    { id: 'b_s3_1', product_id: 's3', batch_code: 'GL-12', expiration_date: '2027-01-30', quantity: 8 },
    { id: 'b_s3_2', product_id: 's3', batch_code: 'GL-13', expiration_date: '2027-08-30', quantity: 30 },
    { id: 'b_s4_1', product_id: 's4', batch_code: 'CT-991', expiration_date: '2027-12-15', quantity: 40 },
    { id: 'b_s5_1', product_id: 's5', batch_code: 'BL-88', expiration_date: '2028-05-10', quantity: 25 }
  ]);
  if (batchesError) console.error('[Supabase] Error insertando lotes:', batchesError);

  // Insertar logs de auditoría
  const { error: auditError } = await supabase.from('audit_logs').insert([
    { user_id: 'u5', user_name: 'Farm. Sofía Sabatto', user_role: 'FARMACEUTICO', action: 'USER_UPDATE', details: 'Inicialización de perfiles de farmacia y técnicos en CAPS.' },
    { user_id: 'u5', user_name: 'Farm. Sofía Sabatto', user_role: 'FARMACEUTICO', action: 'CATALOG_UPDATE', details: 'Carga inicial del catálogo de fármacos e insumos críticos FEFO.' }
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
