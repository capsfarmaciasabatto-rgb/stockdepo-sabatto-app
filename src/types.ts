/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum Role {
  ENFERMERO = 'ENFERMERO',
  TECNICO = 'TECNICO',
  FARMACEUTICO = 'FARMACEUTICO',
  DIRECTOR = 'DIRECTOR',
}

export enum PredefinedService {
  GUARDIA = 'GUARDIA',
  LABORATORIO = 'LABORATORIO',
  IRAB = 'IRAB',
  FARMACIA = 'FARMACIA',
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  service?: PredefinedService;
  password?: string;
}

export interface StockBatch {
  id: string;
  batchCode: string;
  expirationDate: string;
  quantity: number;
}

export interface Product {
  id: string;
  name: string;
  presentation: string;
  minStock: number;
  category: PredefinedService | 'Compartido';
  batches: StockBatch[];
  allowedServices: string[];
  shelfLetter?: string;
  shelfLevel?: number;
  productType?: 'Med' | 'PM';
}

export type OrderStatus = 'Pendiente' | 'Preparado' | 'Entregado';

export interface OrderItem {
  productId: string;
  productName: string;
  presentation: string;
  requestedQuantity: number;
  approvedQuantity?: number;
  assignedBatches?: {
    batchId: string;
    batchCode: string;
    expirationDate: string;
    quantity: number;
  }[];
}

export interface Order {
  id: string;
  service: string;
  requestedBy: {
    userId: string;
    userName: string;
    userEmail: string;
  };
  requestDate: string;
  deliveryDate?: string;
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
  timestamp: string;
  userId: string;
  userName: string;
  userRole: Role;
  action: string;
  details: string;
}

export interface ServiceConfiguration {
  serviceName: PredefinedService;
  orderDay: number;
  orderDayName: string;
  allowDaily: boolean;
}

export interface FullDBState {
  products: Product[];
  orders: Order[];
  users: User[];
  auditLogs: AuditLog[];
  serviceConfigs: ServiceConfiguration[];
}
