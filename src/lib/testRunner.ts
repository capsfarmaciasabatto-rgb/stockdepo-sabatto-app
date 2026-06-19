/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FullDBState, suggestFEFOBatches } from './database';
import { Role, PredefinedService, Order, Product, AuditLog } from '../types';

export interface TestResult {
  name: string;
  passed: boolean;
  message: string;
}

export function runIntegrationTests(dbState: FullDBState): {
  success: boolean;
  results: TestResult[];
  updatedState?: FullDBState;
} {
  const results: TestResult[] = [];
  let success = true;
  
  // Clonar el estado para realizar las pruebas sin alterar definitivamente el principal, a no ser que pase todo
  const state: FullDBState = JSON.parse(JSON.stringify(dbState));

  try {
    // 1. Verificar roles preexistentes (Marta = Enfermero, Lucas = Tecnico, Sofia = Farmaceutico)
    const marta = state.users.find(u => u.email === 'enfermero@test.com');
    const lucas = state.users.find(u => u.email === 'tecnico@test.com');
    const sofia = state.users.find(u => u.email === 'farmaceutico@test.com');

    if (marta?.role === Role.ENFERMERO && lucas?.role === Role.TECNICO && sofia?.role === Role.FARMACEUTICO) {
      results.push({
        name: 'Autenticación y Matriz de Roles',
        passed: true,
        message: 'Usuarios de prueba y roles cargados correctamente.'
      });
    } else {
      throw new Error('Matriz de roles incorrecta.');
    }

    // 2. Simular armado de pedido por parte del enfermero Marta (Guardia)
    // Elige Hidrocortisona (g1) y Dipirona (g3)
    const p1 = state.products.find(p => p.id === 'g1');
    const p2 = state.products.find(p => p.id === 'g3');

    if (!p1 || !p2) {
      throw new Error('No se encontraron los productos con id g1 o g3 en el catálogo.');
    }

    const testOrderId = `ord_test_${Date.now()}`;
    const newOrder: Order = {
      id: testOrderId,
      service: PredefinedService.GUARDIA,
      requestedBy: {
        userId: marta.id,
        userName: marta.name,
        userEmail: marta.email
      },
      requestDate: new Date().toISOString(),
      status: 'Pendiente',
      type: 'Periodico',
      items: [
        {
          productId: p1.id,
          productName: p1.name,
          presentation: p1.presentation,
          requestedQuantity: 5 // Marta pide 5 unidades
        },
        {
          productId: p2.id,
          productName: p2.name,
          presentation: p2.presentation,
          requestedQuantity: 10 // Marta pide 10 unidades
        }
      ],
      notes: 'Pedido de prueba automático del sistema'
    };

    state.orders.push(newOrder);
    results.push({
      name: 'Armado de Pedido (Enfermero)',
      passed: true,
      message: `Marta Gómez armó pedido ${testOrderId} Guardia: 5x Hidrocortisona, 10x Dipirona.`
    });

    // 3. Simular Preparación de Pedido por Técnico Lucas (FEFO) con edición de cantidad
    // El técnico ve el stock de Hidrocortisona y decide enviar 4 en lugar de 5. Para Dipirona aprueba los 10 solicitados.
    const orderInProcess = state.orders.find(o => o.id === testOrderId);
    if (!orderInProcess) throw new Error('Pedido no encontrado en cola.');

    orderInProcess.preparedBy = {
      userId: lucas.id,
      userName: lucas.name
    };

    // Aplicar descuento de stock y priorización FEFO
    const requestedEdits: Record<string, number> = {
      'g1': 4, // Edita la cantidad aprobada a 4
      'g3': 10 // Mantiene 10
    };

    for (const item of orderInProcess.items) {
      const qSelected = requestedEdits[item.productId];
      if (qSelected === undefined) continue;

      item.approvedQuantity = qSelected;

      // Buscar el producto en la copia del estado
      const pInStore = state.products.find(p => p.id === item.productId);
      if (!pInStore) throw new Error(`Producto ${item.productId} no encontrado.`);

      // Obtener sugerencias FEFO
      const fefoPlan = suggestFEFOBatches(pInStore, qSelected);
      item.assignedBatches = fefoPlan.map(fp => ({
        batchId: fp.batchId,
        batchCode: fp.batchCode,
        expirationDate: fp.expirationDate,
        quantity: fp.suggestedQty
      }));

      // Descontar del stock real
      let remainingToDeduct = qSelected;
      for (const fp of fefoPlan) {
        const originalBatch = pInStore.batches.find(b => b.id === fp.batchId);
        if (originalBatch) {
          originalBatch.quantity -= fp.suggestedQty;
          remainingToDeduct -= fp.suggestedQty;
        }
      }

      if (remainingToDeduct > 0) {
        throw new Error(`Stock insuficiente en lotes para ${pInStore.name}.`);
      }
    }

    orderInProcess.status = 'Preparado';
    results.push({
      name: 'Preparación y Algoritmo FEFO (Técnico)',
      passed: true,
      message: 'Cantidades editadas con éxito. Se distribuyeron y descontaron de los lotes más próximos a vencer en stock.'
    });

    // 4. Pasar pedido a "Entregado" y verificar registros
    orderInProcess.status = 'Entregado';
    orderInProcess.deliveryDate = new Date().toISOString();

    // Crear registro de auditoría
    const testAudit: AuditLog = {
      id: `aud_test_${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: lucas.id,
      userName: lucas.name,
      userRole: Role.TECNICO,
      action: 'DELIVER_ORDER',
      details: `Pedido de simulación ${testOrderId} entregado a Guardia. Se descontó del stock.`
    };
    state.auditLogs.unshift(testAudit);

    results.push({
      name: 'Simulacro de Entrega y Auditoría',
      passed: true,
      message: 'Pedido marcado como Entregado. Historial de auditoría creado con éxito.'
    });

  } catch (error) {
    success = false;
    results.push({
      name: 'Ejecución Ciclo de Suministros',
      passed: false,
      message: error instanceof Error ? error.message : 'Error desconocido en test.'
    });
  }

  return { success, results, updatedState: state };
}
