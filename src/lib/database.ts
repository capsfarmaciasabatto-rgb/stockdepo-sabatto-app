/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  User, 
  Product, 
  Order, 
  AuditLog, 
  Role, 
  PredefinedService, 
  ServiceConfiguration 
} from '../types';

// Datos iniciales de fármacos e insumos (lista realista para CAPS de Argentina - 55 insumos)
const INITIAL_PRODUCTS: Product[] = [
  // --- GUARDIA ---
  {
    id: 'g1',
    name: 'Hidrocortisona 500 mg',
    presentation: 'Frasco Ampolla (FA) inyectable',
    minStock: 20,
    category: PredefinedService.GUARDIA,
    allowedServices: [PredefinedService.GUARDIA],
    batches: [
      { id: 'b_g1_1', batchCode: 'HC-501A', expirationDate: '2026-06-15', quantity: 15 }, // Próximo a vencer (menos de 30 días)
      { id: 'b_g1_2', batchCode: 'HC-502B', expirationDate: '2026-11-30', quantity: 40 }
    ]
  },
  {
    id: 'g2',
    name: 'Furosemida 20 mg',
    presentation: 'Ampolla 2 ml',
    minStock: 50,
    category: PredefinedService.GUARDIA,
    allowedServices: [PredefinedService.GUARDIA],
    batches: [
      { id: 'b_g2_1', batchCode: 'FS-991', expirationDate: '2026-09-10', quantity: 80 }
    ]
  },
  {
    id: 'g3',
    name: 'Dipirona 1g (Metamizol)',
    presentation: 'Ampolla 2 ml',
    minStock: 40,
    category: PredefinedService.GUARDIA,
    allowedServices: [PredefinedService.GUARDIA],
    batches: [
      { id: 'b_g3_1', batchCode: 'DP-044', expirationDate: '2026-06-05', quantity: 12 }, // Próximo a vencer y stock crítico
      { id: 'b_g3_2', batchCode: 'DP-045', expirationDate: '2027-02-15', quantity: 100 }
    ]
  },
  {
    id: 'g4',
    name: 'Adrenalina 1 mg/ml',
    presentation: 'Ampolla 1 ml',
    minStock: 15,
    category: PredefinedService.GUARDIA,
    allowedServices: [PredefinedService.GUARDIA],
    batches: [
      { id: 'b_g4_1', batchCode: 'AD-211', expirationDate: '2026-10-01', quantity: 25 }
    ]
  },
  {
    id: 'g5',
    name: 'Diazepam 10 mg',
    presentation: 'Ampolla 2 ml',
    minStock: 10,
    category: PredefinedService.GUARDIA,
    allowedServices: [PredefinedService.GUARDIA],
    batches: [
      { id: 'b_g5_1', batchCode: 'DZ-881', expirationDate: '2026-12-25', quantity: 18 }
    ]
  },
  {
    id: 'g6',
    name: 'Dexametasona 4 mg',
    presentation: 'Ampolla 1 ml',
    minStock: 30,
    category: PredefinedService.GUARDIA,
    allowedServices: [PredefinedService.GUARDIA],
    batches: [
      { id: 'b_g6_1', batchCode: 'DX-109', expirationDate: '2026-08-14', quantity: 50 }
    ]
  },
  {
    id: 'g7',
    name: 'Clonazepam 2 mg',
    presentation: 'Comprimidos y gotas',
    minStock: 25,
    category: PredefinedService.GUARDIA,
    allowedServices: [PredefinedService.GUARDIA, PredefinedService.IRAB],
    batches: [
      { id: 'b_g7_1', batchCode: 'CN-334', expirationDate: '2026-07-20', quantity: 30 }
    ]
  },

  // --- LABORATORIO ---
  {
    id: 'l1',
    name: 'Agujas Descartables 25/8',
    presentation: 'Caja x 100 unidades',
    minStock: 5,
    category: PredefinedService.LABORATORIO,
    allowedServices: [PredefinedService.LABORATORIO, PredefinedService.GUARDIA],
    batches: [
      { id: 'b_l1_1', batchCode: 'AG-258A', expirationDate: '2027-04-12', quantity: 8 }
    ]
  },
  {
    id: 'l2',
    name: 'Jeringas Descartables 10 ml',
    presentation: 'Caja x 100 unidades',
    minStock: 5,
    category: PredefinedService.LABORATORIO,
    allowedServices: [PredefinedService.LABORATORIO, PredefinedService.GUARDIA],
    batches: [
      { id: 'b_l2_1', batchCode: 'JR-10ML', expirationDate: '2026-06-25', quantity: 3 }, // Bajo stock crítico + vence pronto
      { id: 'b_l2_2', batchCode: 'JR-10ML-B', expirationDate: '2027-01-15', quantity: 15 }
    ]
  },
  {
    id: 'l3',
    name: 'Jeringas Descartables 5 ml',
    presentation: 'Caja x 100 unidades',
    minStock: 6,
    category: PredefinedService.LABORATORIO,
    allowedServices: [PredefinedService.LABORATORIO, PredefinedService.GUARDIA],
    batches: [
      { id: 'b_l3_1', batchCode: 'JR-5ML', expirationDate: '2028-02-18', quantity: 12 }
    ]
  },
  {
    id: 'l4',
    name: 'Tubos Vacutainer Tapa Roja',
    presentation: 'Bolsa x 100 unidades',
    minStock: 3,
    category: PredefinedService.LABORATORIO,
    allowedServices: [PredefinedService.LABORATORIO],
    batches: [
      { id: 'b_l4_1', batchCode: 'TB-TR88', expirationDate: '2026-12-01', quantity: 5 }
    ]
  },
  {
    id: 'l5',
    name: 'Tubos Vacutainer Tapa Lila (EDTA)',
    presentation: 'Bolsa x 100 unidades',
    minStock: 3,
    category: PredefinedService.LABORATORIO,
    allowedServices: [PredefinedService.LABORATORIO],
    batches: [
      { id: 'b_l5_1', batchCode: 'TB-TL99', expirationDate: '2026-11-15', quantity: 4 }
    ]
  },
  {
    id: 'l6',
    name: 'Alcohol Isopropílico 70%',
    presentation: 'Botella 1000 ml',
    minStock: 4,
    category: PredefinedService.LABORATORIO,
    allowedServices: [PredefinedService.LABORATORIO, PredefinedService.GUARDIA],
    batches: [
      { id: 'b_l6_1', batchCode: 'AL-70P', expirationDate: '2027-05-30', quantity: 10 }
    ]
  },

  // --- IRAB ---
  {
    id: 'i1',
    name: 'Salbutamol Aerosol (Puff)',
    presentation: 'Inhalador 250 dosis',
    minStock: 40,
    category: PredefinedService.IRAB,
    allowedServices: [PredefinedService.IRAB, PredefinedService.GUARDIA],
    batches: [
      { id: 'b_i1_1', batchCode: 'SB-001', expirationDate: '2026-06-10', quantity: 20 }, // Vence pronto
      { id: 'b_i1_2', batchCode: 'SB-002', expirationDate: '2026-12-31', quantity: 15 }, // Stock de este lote
      { id: 'b_i1_3', batchCode: 'SB-003', expirationDate: '2027-06-15', quantity: 60 }
    ]
  },
  {
    id: 'i2',
    name: 'Amoxicilina 500mg/5ml suspension',
    presentation: 'Frasco 90 ml (Jarabe)',
    minStock: 25,
    category: PredefinedService.IRAB,
    allowedServices: [PredefinedService.IRAB],
    batches: [
      { id: 'b_i2_1', batchCode: 'AM-90M', expirationDate: '2026-08-20', quantity: 35 }
    ]
  },
  {
    id: 'i3',
    name: 'Metilprednisona 4mg/ml',
    presentation: 'Frasco Gotas 15 ml',
    minStock: 15,
    category: PredefinedService.IRAB,
    allowedServices: [PredefinedService.IRAB, PredefinedService.GUARDIA],
    batches: [
      { id: 'b_i3_1', batchCode: 'MP-GOT', expirationDate: '2026-06-20', quantity: 5 }, // Bajo Stock + vence pronto
      { id: 'b_i3_2', batchCode: 'MP-GOT-2', expirationDate: '2027-03-30', quantity: 25 }
    ]
  },
  {
    id: 'i4',
    name: 'Budesonide 200 mcg Inhalador',
    presentation: 'Aerosol 200 dosis',
    minStock: 20,
    category: PredefinedService.IRAB,
    allowedServices: [PredefinedService.IRAB],
    batches: [
      { id: 'b_i4_1', batchCode: 'BD-200', expirationDate: '2026-11-10', quantity: 45 }
    ]
  },
  {
    id: 'i5',
    name: 'Bromuro de Ipratropio',
    presentation: 'Gotas para nebulizar 20 ml',
    minStock: 15,
    category: PredefinedService.IRAB,
    allowedServices: [PredefinedService.IRAB, PredefinedService.GUARDIA],
    batches: [
      { id: 'b_i5_1', batchCode: 'BI-GOT', expirationDate: '2026-10-05', quantity: 22 }
    ]
  },
  {
    id: 'i6',
    name: 'Mascara de Nebulización Pediátrica',
    presentation: 'Unidad Individual',
    minStock: 15,
    category: PredefinedService.IRAB,
    allowedServices: [PredefinedService.IRAB],
    batches: [
      { id: 'b_i6_1', batchCode: 'M-NEB-P', expirationDate: '2029-01-01', quantity: 18 }
    ]
  },

  // --- INSUMOS COMPARTIDOS ---
  {
    id: 's1',
    name: 'Alcohol en Gel 65%',
    presentation: 'Envase con válvula 500 ml',
    minStock: 30,
    category: 'Compartido',
    allowedServices: [PredefinedService.GUARDIA, PredefinedService.LABORATORIO, PredefinedService.IRAB],
    batches: [
      { id: 'b_s1_1', batchCode: 'AG-404', expirationDate: '2026-06-01', quantity: 10 }, // Crítico
      { id: 'b_s1_2', batchCode: 'AG-405', expirationDate: '2027-10-15', quantity: 80 }
    ]
  },
  {
    id: 's2',
    name: 'Gasas Estériles 10x10 cm',
    presentation: 'Paquete x 10 sobres',
    minStock: 50,
    category: 'Compartido',
    allowedServices: [PredefinedService.GUARDIA, PredefinedService.LABORATORIO, PredefinedService.IRAB],
    batches: [
      { id: 'b_s2_1', batchCode: 'GS-101', expirationDate: '2028-11-20', quantity: 150 }
    ]
  },
  {
    id: 's3',
    name: 'Guantes de Látex Talle M',
    presentation: 'Caja x 100 unidades',
    minStock: 12,
    category: 'Compartido',
    allowedServices: [PredefinedService.GUARDIA, PredefinedService.LABORATORIO, PredefinedService.IRAB],
    batches: [
      { id: 'b_s3_1', batchCode: 'GL-12', expirationDate: '2027-01-30', quantity: 8 }, // Bajo stock crítico
      { id: 'b_s3_2', batchCode: 'GL-13', expirationDate: '2027-08-30', quantity: 30 }
    ]
  },
  {
    id: 's4',
    name: 'Cinta Adhesiva Hipoalergénica',
    presentation: 'Carretel 5 cm x 9 m',
    minStock: 15,
    category: 'Compartido',
    allowedServices: [PredefinedService.GUARDIA, PredefinedService.LABORATORIO, PredefinedService.IRAB],
    batches: [
      { id: 'b_s4_1', batchCode: 'CT-991', expirationDate: '2027-12-15', quantity: 40 }
    ]
  },
  {
    id: 's5',
    name: 'Abrojos Madera (Bajalenguas)',
    presentation: 'Paquete x 100 unidades',
    minStock: 10,
    category: 'Compartido',
    allowedServices: [PredefinedService.GUARDIA, PredefinedService.IRAB],
    batches: [
      { id: 'b_s5_1', batchCode: 'BL-88', expirationDate: '2028-05-10', quantity: 25 }
    ]
  }
];

// Generar hasta 50 insumos para simular carga completa para CAPS argentina real
const GENERATOR_CATEGORIES = [
  { service: PredefinedService.GUARDIA, prefix: 'g_gen', names: ['Ibuprofeno 400 mg comprimidos', 'Paracetamol 500 mg comprimidos', 'Ranitidina 150 mg ampolla', 'Diclofenac sódico 75 mg ampolla', 'Penicilina G benzatínica 1.2M UI', 'Morfina 10 mg/ml ampolla', 'Atropina 1 mg ampolla', 'Suelofisiológico 500 ml sachet', 'Dextrosa 5% 500 ml sachet', 'Ceftriaxona 1g frasco ampolla', 'Platsul A crema 400g'] },
  { service: PredefinedService.LABORATORIO, prefix: 'l_gen', names: ['Tubos tapa celeste (Citrato)', 'Gradillas plásticas', 'Punteras amarillas descartables', 'Punteras azules descartables', 'Lancetas estériles', 'Reactivo PCR látex', 'Reactivo VDRL', 'Portaobjetos vidrio', 'Cubreobjetos 20x20', 'Tiras Reactivas de Orina (Multistix)', 'Aceite de inmersión 100ml'] },
  { service: PredefinedService.IRAB, prefix: 'i_gen', names: ['Amoxicilina + Clavulánico Suspension', 'Meprednisona 40 mg comprimidos', 'Hexetidina colutorio', 'Cámara espaciadora inhaladora', 'Sonda de aspiración pediátrica', 'Fluticasona aerosol', 'Fisiológico gotas nasales', 'Mascarilla Nebulización Adulto'] },
  { service: PredefinedService.FARMACIA, prefix: 'f_gen', names: ['Hidrocortisona 500 mg ampolla', 'Losartán 50 mg comprimidos', 'Enalapril 10 mg comprimidos', 'Metformina 850 mg comprimidos', 'Atorvastatín 20 mg comprimidos', 'Aspirina Prevent 100 mg', 'Salbutamol 100 mcg aerosol', 'Levotiroxina 100 mcg comprimidos'] },
  { service: 'Compartido', prefix: 's_gen', names: ['Algodón hidrófilo 500g', 'Vendas de gasa 10 cm x 3 m', 'Jeringas 3 ml con aguja', 'Agujas tipo Butterfly (mariposa)', 'Solución fisiológica lavado 100ml', 'Termómetros digitales', 'Tensiómetro aneroide pediátrico', 'Jabón desinfectante líquido', 'Barbijo tricapa elástico', 'Cofias descartables'] }
];

const generatedProducts: Product[] = [...INITIAL_PRODUCTS];
let curId = 20;

GENERATOR_CATEGORIES.forEach((cat) => {
  cat.names.forEach((name, idx) => {
    const serviceName = cat.service === 'Compartido' ? 'Compartido' : cat.service;
    const prodId = `${cat.prefix}_${idx}`;
    
    // Solo si no fue agregada para evitar duplicar
    if (!generatedProducts.some(p => p.name === name)) {
      curId++;
      generatedProducts.push({
        id: prodId,
        name,
        presentation: indexPresentation(name),
        minStock: Math.floor(Math.random() * 20) + 5,
        category: serviceName as any,
        allowedServices: serviceName === 'Compartido' 
          ? [PredefinedService.GUARDIA, PredefinedService.LABORATORIO, PredefinedService.IRAB, PredefinedService.FARMACIA] 
          : [serviceName as PredefinedService],
        shelfLetter: String.fromCharCode(65 + ((idx + curId) % 12)), // A-L
        shelfLevel: ((idx + curId) % 5) + 1, // 1-5
        batches: [
          {
            id: `b_${prodId}_1`,
            batchCode: `L-GEN-${curId}`,
            expirationDate: randomDateInFuture(idx % 4 === 0), // Algunos venciendo pronto
            quantity: Math.floor(Math.random() * 60) + 10
          }
        ]
      });
    }
  });
});

function getInitialType(name: string): 'Med' | 'PM' {
  const lowercaseName = name.toLowerCase();
  const pmKeywords = [
    'aguja', 'jeringa', 'tubo', 'guante', 'venda', 'gasa', 'cinta', 
    'abrojo', 'bajalenguas', 'baja lenguas', 'nebulizacíon', 'nebulizacion', 'nebulizar',
    'cámara espaciadora', 'camara espaciadora', 'mascarilla', 'sonda', 'butterfly',
    'gradilla', 'puntera', 'lanceta', 'portaobjeto', 'cubreobjeto', 'tiras reactivas', 
    'termómetro', 'termometro', 'tensiómetro', 'tensiometro', 'barbijo', 'cofia', 
    'descartador', 'algodón', 'algodon', 'gel p/', 'electrodo', 'tela adhesiva',
    'termometros'
  ];
  if (pmKeywords.some(keyword => lowercaseName.includes(keyword))) {
    return 'PM';
  }
  return 'Med';
}

// Post-proceso para garantizar que todos los productos (incluyendo INITIAL_PRODUCTS) tengan estantería, nivel estante y tipo
generatedProducts.forEach((p, idx) => {
  if (!p.shelfLetter) {
    p.shelfLetter = String.fromCharCode(65 + (idx % 8)); // A-H
  }
  if (!p.shelfLevel) {
    p.shelfLevel = (idx % 4) + 1; // 1-4
  }
  if (!p.productType) {
    p.productType = getInitialType(p.name);
  }
});

function indexPresentation(name: string): string {
  if (name.includes('comprimidos')) return 'Caja x 30 Comp.';
  if (name.includes('ampolla') || name.includes('Ampolla')) return 'Ampolla 1 ml';
  if (name.includes('sachet')) return 'Sachet plástico 500 ml';
  if (name.includes('gotas')) return 'Gotas 20 ml';
  if (name.includes('Reactivo') || name.includes('reactivo')) return 'Equipo Diagnóstico';
  if (name.includes('Vendas')) return 'Rollo individual';
  if (name.includes('crema')) return 'Pote crema de 400g';
  return 'Unidad';
}

function randomDateInFuture(soon: boolean): string {
  const baseDate = new Date(); // Actual local time es medidos de 2026
  if (soon) {
    // Vence pronto: entre 5 y 25 días
    const days = Math.floor(Math.random() * 20) + 5;
    baseDate.setDate(baseDate.getDate() + days);
  } else {
    // Vence más tarde: entre 90 y 500 días
    const days = Math.floor(Math.random() * 410) + 90;
    baseDate.setDate(baseDate.getDate() + days);
  }
  return baseDate.toISOString().split('T')[0];
}

// Usuarios predefinidos con emails correspondientes
const DEFAULT_USERS: User[] = [
  { id: 'caps_admin', email: 'capsfarmaciasabatto@gmail.com', name: 'Farm. Principal Sabatto (Admin)', role: Role.FARMACEUTICO, password: 'admin' },
  { id: 'u1', email: 'enfermero@test.com', name: 'Enfermera Marta Gómez (Guardia)', role: Role.ENFERMERO, service: PredefinedService.GUARDIA, password: '123' },
  { id: 'u2', email: 'irab@test.com', name: 'Enfermero Ariel Blanco (IRAB)', role: Role.ENFERMERO, service: PredefinedService.IRAB, password: '123' },
  { id: 'u3', email: 'laboratorio@test.com', name: 'Técnica Analía Ruiz (Laboratorio)', role: Role.ENFERMERO, service: PredefinedService.LABORATORIO, password: '123' },
  { id: 'u6', email: 'farmacia@test.com', name: 'Enfermero Diego Paz (Farmacia Dispensa)', role: Role.ENFERMERO, service: PredefinedService.FARMACIA, password: '123' },
  { id: 'u4', email: 'tecnico@test.com', name: 'Téc. Lucas Castro', role: Role.TECNICO, password: '123' },
  { id: 'u5', email: 'farmaceutico@test.com', name: 'Farm. Sofía Sabatto', role: Role.FARMACEUTICO, password: '123' },
  { id: 'u7', email: 'director@test.com', name: 'Dr. Claudio Rossi (Director/a CAPS)', role: Role.DIRECTOR, password: '123' }
];

// Configuración semanal por defecto para realizar pedidos
const DEFAULT_SERVICE_CONFIGS: ServiceConfiguration[] = [
  { serviceName: PredefinedService.GUARDIA, orderDay: 3, orderDayName: 'Miércoles', allowDaily: false },
  { serviceName: PredefinedService.LABORATORIO, orderDay: 1, orderDayName: 'Lunes', allowDaily: false },
  { serviceName: PredefinedService.IRAB, orderDay: 5, orderDayName: 'Viernes', allowDaily: true }, // Diario/Viernes
  { serviceName: PredefinedService.FARMACIA, orderDay: 2, orderDayName: 'Martes', allowDaily: true }
];

const INITIAL_AUDITS: AuditLog[] = [
  {
    id: 'a1',
    timestamp: '2026-05-28T09:15:00Z',
    userId: 'u5',
    userName: 'Farm. Sofía Sabatto',
    userRole: Role.FARMACEUTICO,
    action: 'USER_UPDATE',
    details: 'Inicialización de perfiles de farmacia y técnicos en CAPS.'
  },
  {
    id: 'a2',
    timestamp: '2026-05-28T10:45:00Z',
    userId: 'u5',
    userName: 'Farm. Sofía Sabatto',
    userRole: Role.FARMACEUTICO,
    action: 'CATALOG_UPDATE',
    details: 'Carga inicial del catálogo de fármacos e insumos críticos FEFO.'
  }
];

export interface FullDBState {
  products: Product[];
  orders: Order[];
  users: User[];
  auditLogs: AuditLog[];
  serviceConfigs: ServiceConfiguration[];
}

const STORAGE_KEY = 'sabatto_stock_db_state';

// Cargar o inicializar base de datos
export function initializeDB(): FullDBState {
  const localData = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  if (localData) {
    try {
      const parsed = JSON.parse(localData);
      // Validar claves básicas
      if (parsed.products && parsed.users && parsed.orders) {
         // Garantizar migración de estanterías, niveles y tipo (Med vs. PM)
         parsed.products = parsed.products.map((p: any, idx: number) => ({
           ...p,
           shelfLetter: p.shelfLetter || String.fromCharCode(65 + (idx % 8)), // A-H
           shelfLevel: p.shelfLevel || (idx % 4) + 1, // 1-4
           productType: p.productType || getInitialType(p.name)
         }));

         // Garantizar migración de la lista de usuarios para accesos rápidos demo nuevos (p.ej. Dirección)
         let migrated = false;
         DEFAULT_USERS.forEach(defU => {
           const exists = parsed.users.some((u: any) => u.email.toLowerCase() === defU.email.toLowerCase());
           if (!exists) {
             parsed.users.push(defU);
             migrated = true;
           }
         });

         // Sanitización contra duplicados (ID o Email) que puedan causar errores de keys duplicadas en React
         const seenIds = new Set<string>();
         const seenEmails = new Set<string>();
         const uniqueUsers: any[] = [];
         parsed.users.forEach((u: any) => {
           const emailKey = (u.email || '').toLowerCase().trim();
           if (seenEmails.has(emailKey)) {
             migrated = true; // Forzar persistencia para eliminar duplicado de email
             return; // Ignorar duplicado de email completo
           }

           let finalId = u.id;
           if (!finalId || seenIds.has(finalId)) {
             finalId = `u_${Math.floor(Math.random() * 1000000)}_${Date.now()}`;
             u.id = finalId;
             migrated = true; // Forzar persistencia de ID corregido
           }

           seenIds.add(finalId);
           seenEmails.add(emailKey);
           uniqueUsers.push(u);
         });
         parsed.users = uniqueUsers;

         if (migrated && typeof window !== 'undefined') {
           localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
         }

         return parsed as FullDBState;
      }
    } catch (e) {
      console.error('Error parsing local state, resetting data', e);
    }
  }

  const defaultState: FullDBState = {
    products: generatedProducts,
    orders: [
      {
        id: 'ord_demo_1',
        service: PredefinedService.GUARDIA,
        requestedBy: {
          userId: 'u1',
          userName: 'Enfermera Marta Gómez (Guardia)',
          userEmail: 'enfermero@test.com'
        },
        requestDate: '2026-05-28T08:30:00Z',
        status: 'Pendiente',
        type: 'Periodico',
        items: [
          { productId: 'g1', productName: 'Hidrocortisona 500 mg', presentation: 'Frasco Ampolla (FA) inyectable', requestedQuantity: 10 },
          { productId: 'g3', productName: 'Dipirona 1g (Metamizol)', presentation: 'Ampolla 2 ml', requestedQuantity: 15 },
          { productId: 's1', productName: 'Alcohol en Gel 65%', presentation: 'Envase con válvula 500 ml', requestedQuantity: 5 }
        ],
        notes: 'Pedido semanal regular para stock del gabinete de Guardia.'
      },
      {
        id: 'ord_demo_2',
        service: PredefinedService.IRAB,
        requestedBy: {
          userId: 'u2',
          userName: 'Enfermero Ariel Blanco (IRAB)',
          userEmail: 'irab@test.com'
        },
        requestDate: '2026-05-29T11:00:00Z',
        status: 'Pendiente',
        type: 'Extraordinario',
        items: [
          { productId: 'i1', productName: 'Salbutamol Aerosol (Puff)', presentation: 'Inhalador 250 dosis', requestedQuantity: 25 },
          { productId: 'i3', productName: 'Metilprednisona 4mg/ml', presentation: 'Frasco Gotas 15 ml', requestedQuantity: 10 }
        ],
        notes: 'Aumento de demanda respiratoria por bajas temperaturas.'
      },
      {
        id: 'ord_demo_hist_1',
        service: PredefinedService.GUARDIA,
        requestedBy: {
          userId: 'u1',
          userName: 'Enfermera Marta Gómez (Guardia)',
          userEmail: 'enfermero@test.com'
        },
        requestDate: '2026-05-24T10:15:00Z',
        deliveryDate: '2026-05-24T12:30:00Z',
        status: 'Entregado',
        type: 'Periodico',
        items: [
          { 
            productId: 'g1', 
            productName: 'Hidrocortisona 500 mg', 
            presentation: 'Frasco Ampolla (FA) inyectable', 
            requestedQuantity: 20,
            approvedQuantity: 20,
            assignedBatches: [
              { batchId: 'b_g1_1', batchCode: 'L-G1-24', expirationDate: '2027-04-12', quantity: 20 }
            ]
          },
          { 
            productId: 'g3', 
            productName: 'Dipirona 1g (Metamizol)', 
            presentation: 'Ampolla 2 ml', 
            requestedQuantity: 10,
            approvedQuantity: 10,
            assignedBatches: [
              { batchId: 'b_g3_1', batchCode: 'L-G3-23', expirationDate: '2026-08-11', quantity: 10 }
            ]
          }
        ],
        notes: 'Urgente requerimiento estacional.',
        preparedBy: {
          userId: 'u4',
          userName: 'Téc. Lucas Castro'
        },
        deliveredBy: {
          userId: 'u5',
          userName: 'Farm. Sofía Sabatto'
        }
      },
      {
        id: 'ord_demo_hist_2',
        service: PredefinedService.LABORATORIO,
        requestedBy: {
          userId: 'u3',
          userName: 'Técnica Analía Ruiz (Laboratorio)',
          userEmail: 'laboratorio@test.com'
        },
        requestDate: '2026-05-26T09:00:00Z',
        deliveryDate: '2026-05-26T11:15:00Z',
        status: 'Entregado',
        type: 'Extraordinario',
        items: [
          { 
            productId: 's1', 
            productName: 'Alcohol en Gel 65%', 
            presentation: 'Envase con válvula 500 ml', 
            requestedQuantity: 8,
            approvedQuantity: 5,
            assignedBatches: [
              { batchId: 'b_s1_1', batchCode: 'L-S1-25', expirationDate: '2028-01-15', quantity: 5 }
            ]
          }
        ],
        notes: 'Pedido de reposición para desinfección de mesadas de toma de muestras.',
        preparedBy: {
          userId: 'u4',
          userName: 'Téc. Lucas Castro'
        },
        deliveredBy: {
          userId: 'u5',
          userName: 'Farm. Sofía Sabatto'
        }
      }
    ],
    users: DEFAULT_USERS,
    auditLogs: INITIAL_AUDITS,
    serviceConfigs: DEFAULT_SERVICE_CONFIGS
  };

  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultState));
  }
  return defaultState;
}

export function saveDBState(state: FullDBState) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
}

// Algoritmo de sugerencia FEFO (Ayuda Visual)
// Retorna cuántas unidades se sugieren descontar de qué lote ordenados por vencimiento ascendente
export function suggestFEFOBatches(product: Product, requestedQty: number): {
  batchId: string;
  batchCode: string;
  expirationDate: string;
  suggestedQty: number;
}[] {
  // Clonar y ordenar lotes por vencimiento más próximo, omitiendo lotes vacíos
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
