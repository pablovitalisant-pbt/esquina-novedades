import { Schema, Table, column } from '@powersync/web';

// Schema local de Bodega piloto (Fase 1).
//
// Columnas verificadas contra el uso real en `components/BodegaCard.tsx` y
// `app/(app)/bodega/client_page.tsx`, NO contra `migrations/` (riesgo de
// drift ya registrado en PRD §10 — seed.ts/migrations/ no reflejan el
// schema real).
//
// No se declara columna `id`: PowerSync la crea automáticamente.
export const AppSchema = new Schema({
  productos: new Table({
    codigo: column.text,
    detalle: column.text,
    imagen_url: column.text,
    saldo: column.real,
    cantcaja: column.integer,
    umed: column.text,
    es_nuevo: column.integer,
    // Precios (Slice 7) — diseño contra ProductCard/ProductDrawer/client_page,
    // no contra migrations. Sin `cif`/`nroingreso` (ningún .tsx los consume)
    // ni `empresa_id`/`empresas` (nombre_empresa es dead prop, ver ProductCard).
    prcventa: column.real,
    prcminimo: column.real,
    costo: column.real,
    margen_pct: column.real,
    categoria: column.text,
    stock_minimo: column.real,
    pesocaja: column.real,
    cubicaja: column.real,
    no_reponer: column.integer, // booleano 0/1 (Slice 15)
  }),
  // Alertas de stock bajo (Slice 15) — solo el producto silenciado ("ignorar").
  alertas_stock_bajo: new Table({
    // producto_id es el id de PowerSync de `productos` (texto, aunque
    // productos.id sea SERIAL en Postgres) — texto para que la comparación
    // `a.producto_id = p.id` funcione (mismo bug ya visto en 11b y 13a).
    producto_id: column.text,
  }),
  ubicaciones_bodega: new Table({
    codigo: column.text,
    ubicacion: column.text,
    saldo: column.real,
    fisico: column.real,
    fisico_cajas: column.integer,
    fisico_unidades: column.integer,
    diferencia: column.real,
    observaciones: column.text,
  }),
  // Notas de Venta — diseño contra el uso real en app/api/notas-venta/**
  // y client_page.tsx (no contra migrations/ — drift registrado en PRD §10:
  // migración 001 no incluye `estado`; 002 tiene `saldo_zofri`, el código
  // usa `stock_referencia`).
  prenotas: new Table({
    titulo: column.text,
    titulo_base: column.text,
    usuario_id: column.integer,
    // cliente_id es texto (UUID) desde 13a. Antes integer funcionaba por la
    // afinidad dinámica de SQLite con ids SERIAL; con UUID real el LEFT JOIN
    // `c.id = p.cliente_id` (c.id = id de PowerSync, texto) dejaba de
    // coincidir y cliente_nombre quedaba vacío (bug latente del Slice 6,
    // expuesto por la migración 030). Bugfix.
    cliente_id: column.text,
    nombre_cliente: column.text,
    estado: column.text,
    updated_at: column.text,
    created_at: column.text,
  }),
  prenota_items: new Table({
    prenota_id: column.integer,
    codigo: column.text,
    descripcion: column.text,
    imagen_url: column.text,
    empresa_id: column.integer,
    cajas: column.integer,
    unidades: column.integer,
    precio: column.real,
    stock_referencia: column.integer,
    created_at: column.text,
  }),
  clientes: new Table({
    nombre: column.text,
    telefono: column.text,
    direccion: column.text,
    notas: column.text,
    created_at: column.text,
  }),
  // caja_movimientos se amplía (Slice 8) — Slice 6 la declaró con solo `tipo`
  // para el total_pagado de Notas de Venta; se conserva `tipo` y se agregan
  // las columnas de la vista principal de Caja Mayor (diseño contra
  // app/api/caja/** — este módulo no tiene drift conocido).
  caja_movimientos: new Table({
    fecha: column.text,
    tipo: column.text,
    kcodcli2: column.text, // UUID desde 13a (cliente), antes integer SERIAL
    nombre_cliente: column.text,
    cuenta_id: column.integer,
    moneda: column.text,
    monto: column.real,
    monto_usd: column.real,
    tipo_cambio: column.real,
    forma_pago: column.text,
    observaciones: column.text,
    empresa: column.text,
    es_credito: column.integer,
    usuario_id: column.integer,
    usuario_nombre: column.text,
    created_at: column.text,
    updated_at: column.text,
  }),
  caja_movimiento_notas: new Table({
    // movimiento_id es texto (UUID) desde 11a. Antes integer funcionaba por
    // la afinidad dinámica de SQLite con ids SERIAL; con UUID real la
    // comparación `cmn.movimiento_id = m.id` (PowerSync id = texto) dejaba
    // de coincidir y notas_imputadas quedaba vacío (regresión latente del
    // Slice 8, expuesta por la migración 028). Bugfix.
    movimiento_id: column.text,
    prenota_id: column.integer,
    monto_aplicado: column.real,
  }),
  caja_config: new Table({
    clave: column.text,
    valor: column.text,
    updated_at: column.text,
    updated_por: column.text,
  }),
  caja_cuentas: new Table({
    nombre: column.text,
    moneda: column.text,
    activa: column.integer,
    orden: column.integer,
    created_at: column.text, // Slice 17
  }),
  caja_cierres: new Table({
    fecha_desde: column.text,
    fecha_hasta: column.text,
    resumen: column.text,
    usuario_id: column.integer,
    usuario_nombre: column.text,
    created_at: column.text,
  }),
  // cuenta_id se queda integer a propósito (Slice 17): caja_cuentas.id nunca
  // migra a UUID bajo Opción B, no aplica el bug de ids-siempre-texto.
  caja_saldos_iniciales: new Table({
    cuenta_id: column.integer,
    saldo: column.real,
    fecha: column.text,          // Slice 17
    observaciones: column.text,  // Slice 17
    creado_por: column.text,     // Slice 17
    created_at: column.text,     // Slice 17
  }),
  categorias: new Table({
    nombre: column.text,
    created_at: column.text,
  }),
  // Usuarios (Slice 16) — SOLO LECTURA offline. Sin columna `password`: el
  // Sync Stream usa un query explícito sin ella (riesgo de seguridad, ver
  // contrato 16). `usuario_empresa` no se sincroniza (single-tenant, la
  // lectura local arma empresas: [1] sin consultar).
  usuarios: new Table({
    rut: column.text,
    nombre: column.text,
    rol: column.text,
    activo: column.integer,
    created_at: column.text,
  }),
  // Catálogos (Slice 18) — SOLO LECTURA offline. Sin margen_precio/
  // palabras_excluir (solo se usan en edición, que queda online). user_id
  // integer (mismo tipo que Postgres — no se corrige acá el bug de
  // comparación, se preserva el comportamiento).
  catalogos: new Table({
    titulo: column.text,
    descripcion: column.text,
    slug: column.text,
    activo: column.integer,
    user_id: column.integer,
    created_at: column.text,
  }),
});
