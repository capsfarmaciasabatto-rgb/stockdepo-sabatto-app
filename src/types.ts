/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum Role {
  ENFERMERO = 'enfermero',
  TECNICO = 'tecnico',
  FARMACEUTICO = 'farmaceutico',
  DIRECTOR = 'director',
}

export enum PredefinedService {
  GUARDIA = 'Guardia',
  LABORATORIO = 'Laboratorio',
  IRAB = 'IRAB',
  FARMACIA = 'Farmacia dispensa',
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  service?: PredefinedService; // Solo para enfermeros, representa a qué servicio pertenecen
  password?: string; // Contraseña de acceso opcional para el personal
}

export interface StockBatch {
  id: string; // ID único de lote
  batchCode: string; // Código de lote (ej: L-2041)
  expirationDate: string; // Formato YYYY-MM-DD
  quantity: number; // Cantidad en este lote
}

export interface Product {
  id: string;
  name: string;
  presentation: string; // Presentación (ej: FA, Ampollas, Frasco 5ml)
  minStock: number; // Stock crítico mínimo
  category: PredefinedService | 'Compartido'; // Categoría predefinida
  batches: StockBatch[]; // Lotes bajo FEFO
  allowedServices: string[]; // Servicios autorizados a pedir (Guardia, Laboratorio, IRAB)
  shelfLetter?: string; // Estantería (A-Z)
  shelfLevel?: number; // Nivel de estante (1, 2, 3...)
  productType?: 'Med' | 'PM'; // Tipo de producto: 'Med' (Medicamento) o 'PM' (Producto Médico / Insumo)
}

export type OrderStatus = 'Pendiente' | 'Preparado' | 'Entregado';

export interface OrderItem {
  productId: string;
  productName: string;
  presentation: string;
  requestedQuantity: number; // Cantidad solicitada por enfermero
  approvedQuantity?: number; // Cantidad aprobada/preparada por técnico/farmacéutico
  // Detalles del lote asignado (FEFO) al preparar
  assignedBatches?: {
    batchId: string;
    batchCode: string;
    expirationDate: string;
    quantity: number;
  }[];
}

export interface Order {
  id: string;
  service: string; // Servicio que pide (Guardia, Laboratorio, IRAB)
  requestedBy: {
    userId: string;
    userName: string;
    userEmail: string;
  };
  requestDate: string; // YYYY-MM-DD THH:mm:ss
  deliveryDate?: string; // YYYY-MM-DD THH:mm:ss
  status: OrderStatus;
  type: 'Periodico' | 'Extraordinario';
  items: OrderItem[];
  notes?: string;
  preparedBy?: {
    userId: string;
    userName: string;
  };
  deliveredBy?: {
    userId: string;
    userName: string;
  };
}

export interface AuditLog {
  id: string;
  timestamp: string; // YYYY-MM-DD THH:mm:ss
  userId: string;
  userName: string;
  userRole: Role;
  action: string; // 'CREATE_ORDER', 'PREPARE_ORDER', 'DELIVER_ORDER', 'MANUAL_STOCK_ADJUST', 'CATALOG_UPDATE', 'USER_UPDATE'
  details: string; // Descripción human-friendly de lo que se cambió
}

export interface ServiceConfiguration {
  serviceName: PredefinedService;
  orderDay: number; // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado
  orderDayName: string; // "Lunes", "Martes", etc.
  allowDaily: boolean; // Si puede pedir diariamente (IRAB por defecto true)
}
