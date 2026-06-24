/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { db } from '../firebase';
import {
  doc,
  setDoc,
  updateDoc,
  getDoc,
  onSnapshot,
  type FirestoreError
} from 'firebase/firestore';
import type {
  Order,
  Product,
  User,
  AuditLog,
  ServiceConfiguration,
  FullDBState
} from '../types';

const STATE_DOC_PATH = 'states/caps_sabatto';

// ============================================================
// FUNCIONES CRUD UNIFICADAS PARA EL ESTADO COMPLETO
// ============================================================

/**
 * Obtiene el estado completo actual desde Firestore.
 */
export async function getFullState(): Promise<FullDBState | null> {
  const ref = doc(db, STATE_DOC_PATH);
  const snap = await getDoc(ref);
  return snap.exists() ? (snap.data() as FullDBState) : null;
}

/**
 * Sobrescribe el estado completo.
 */
export async function setFullState(state: FullDBState): Promise<void> {
  const ref = doc(db, STATE_DOC_PATH);
  await setDoc(ref, state);
}

/**
 * Actualiza campos parciales del estado.
 */
export async function patchState(updates: Partial<FullDBState>): Promise<void> {
  const ref = doc(db, STATE_DOC_PATH);
  await updateDoc(ref, updates);
}

// ============================================================
// PEDIDOS
// ============================================================

/**
 * Agrega un nuevo pedido al estado.
 */
export async function addOrder(order: Order): Promise<void> {
  const state = await getFullState();
  if (!state) throw new Error('Estado no inicializado');
  const updatedOrders = [order, ...state.orders];
  await patchState({ orders: updatedOrders });
}

/**
 * Actualiza un pedido existente por ID.
 */
export async function updateOrder(orderId: string, updates: Partial<Order>): Promise<void> {
  const state = await getFullState();
  if (!state) throw new Error('Estado no inicializado');
  const updatedOrders = state.orders.map(o =>
    o.id === orderId ? { ...o, ...updates } : o
  );
  await patchState({ orders: updatedOrders });
}

/**
 * Reemplaza la lista completa de pedidos.
 */
export async function setOrders(orders: Order[]): Promise<void> {
  await patchState({ orders });
}

// ============================================================
// PRODUCTOS (STOCK + LOTES)
// ============================================================

/**
 * Reemplaza el catálogo completo de productos.
 */
export async function setProducts(products: Product[]): Promise<void> {
  await patchState({ products });
}

/**
 * Actualiza un producto específico.
 */
export async function updateProduct(productId: string, updates: Partial<Product>): Promise<void> {
  const state = await getFullState();
  if (!state) throw new Error('Estado no inicializado');
  const updatedProducts = state.products.map(p =>
    p.id === productId ? { ...p, ...updates } : p
  );
  await patchState({ products: updatedProducts });
}

// ============================================================
// USUARIOS
// ============================================================

/**
 * Reemplaza la lista completa de usuarios.
 */
export async function setUsers(users: User[]): Promise<void> {
  await patchState({ users });
}

/**
 * Actualiza un usuario específico.
 */
export async function updateUser(userId: string, updates: Partial<User>): Promise<void> {
  const state = await getFullState();
  if (!state) throw new Error('Estado no inicializado');
  const updatedUsers = state.users.map(u =>
    u.id === userId ? { ...u, ...updates } : u
  );
  await patchState({ users: updatedUsers });
}

// ============================================================
// CONFIGURACIONES DE SERVICIO
// ============================================================

/**
 * Reemplaza las configuraciones semanales.
 */
export async function setServiceConfigs(configs: ServiceConfiguration[]): Promise<void> {
  await patchState({ serviceConfigs: configs });
}

// ============================================================
// AUDIT LOGS
// ============================================================

/**
 * Agrega una entrada de auditoría al principio del array.
 */
export async function appendAuditLog(log: AuditLog): Promise<void> {
  const state = await getFullState();
  if (!state) throw new Error('Estado no inicializado');
  const updatedLogs = [log, ...state.auditLogs];
  await patchState({ auditLogs: updatedLogs });
}

/**
 * Reemplaza todos los logs de auditoría.
 */
export async function setAuditLogs(logs: AuditLog[]): Promise<void> {
  await patchState({ auditLogs: logs });
}

// ============================================================
// LISTENER EN TIEMPO REAL
// ============================================================

/**
 * Escucha cambios del estado completo en tiempo real.
 * Retorna función de limpieza (unsubscribe).
 */
export function listenToState(callback: (state: FullDBState) => void): () => void {
  const ref = doc(db, STATE_DOC_PATH);
  return onSnapshot(
    ref,
    (snap) => {
      if (snap.exists()) {
        callback(snap.data() as FullDBState);
      }
    },
    (error: FirestoreError) => {
      console.error('[Firebase] Error en listenToState:', error);
    }
  );
}

// ============================================================
// FUNCIONES LEGACY (compatibilidad con código existente)
// Estas funciones mantienen la misma firma que el firebaseUtils.ts anterior
// ============================================================

/**
 * Guarda un pedido nuevo en Firebase.
 * @deprecated Usar addOrder() o saveDBState() en su lugar.
 */
export async function saveOrderToFirebase(order: any): Promise<string> {
  await addOrder(order as Order);
  return order.id;
}

/**
 * Obtiene todos los pedidos desde Firebase.
 * @deprecated Usar getFullState() en su lugar.
 */
export async function getOrdersFromFirebase(): Promise<any[]> {
  const state = await getFullState();
  return state?.orders || [];
}

/**
 * Actualiza un pedido en Firebase.
 * @deprecated Usar updateOrder() en su lugar.
 */
export async function updateOrderInFirebase(orderId: string, updates: any): Promise<void> {
  await updateOrder(orderId, updates);
}

/**
 * Elimina un pedido de Firebase.
 * @deprecated Usar setOrders() con el array filtrado en su lugar.
 */
export async function deleteOrderFromFirebase(orderId: string): Promise<void> {
  const state = await getFullState();
  if (!state) throw new Error('Estado no inicializado');
  const updatedOrders = state.orders.filter(o => o.id !== orderId);
  await setOrders(updatedOrders);
}

/**
 * Escucha pedidos en tiempo real.
 * @deprecated Usar listenToState() en su lugar.
 */
export function listenToOrders(callback: (orders: any[]) => void): () => void {
  const ref = doc(db, STATE_DOC_PATH);
  return onSnapshot(
    ref,
    (snap) => {
      if (snap.exists()) {
        const state = snap.data() as FullDBState;
        callback(state.orders);
      }
    },
    (error: FirestoreError) => {
      console.error('[Firebase] Error en listenToOrders:', error);
    }
  );
}
