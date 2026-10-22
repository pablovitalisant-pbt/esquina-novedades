import { z } from "zod";

// ─── Cuentas bancarias ───────────────────────────────────────────

export const CajaCuentaCreateSchema = z.object({
  nombre: z
    .string()
    .min(1, "El nombre es requerido")
    .max(100, "Máximo 100 caracteres"),
  orden: z.number().int().min(0).default(0),
  activa: z.boolean().default(true),
});

export const CajaCuentaUpdateSchema = z.object({
  nombre: z.string().min(1).max(100).optional(),
  orden: z.number().int().min(0).optional(),
  activa: z.boolean().optional(),
});

export type CajaCuentaCreate = z.infer<typeof CajaCuentaCreateSchema>;
export type CajaCuentaUpdate = z.infer<typeof CajaCuentaUpdateSchema>;

export interface CajaCuenta {
  id: number;
  nombre: string;
  activa: boolean;
  orden: number;
  created_at: string;
}

// ─── Movimientos ─────────────────────────────────────────────────

export const CajaMovimientoCreateSchema = z.object({
  fecha: z.string().min(1, "La fecha es requerida"),
  tipo: z.enum(["cobro", "gasto"]),
  // BUG-006: kcodcli2 y empresa son necesarios — el código del POST los usa
  // y la DB los persiste. Slice 13 los marcó como "removidos" pero el código
  // nunca se actualizó para dejar de usarlos.
  kcodcli2: z.string().nullable().optional(), // UUID desde 13a
  usuario_id: z.preprocess(
    (v) => (v == null || v === "" ? null : Number(v)),
    z.number().int().positive().nullable().optional()
  ),
  nombre_cliente: z.string().nullable().optional(),
  cuenta_id: z.coerce.number().int().positive("Selecciona una cuenta"),
  monto: z.coerce.number().int("El monto debe ser entero").positive("El monto debe ser mayor a 0"),
  forma_pago: z.enum(["efectivo", "cheque", "transferencia", "mercadopago"]),
  observaciones: z.string().nullable().optional(),
  empresa: z.string().nullable().optional(),
  es_credito: z.boolean().default(false),
});

export const CajaMovimientoUpdateSchema = z.object({
  fecha: z.string().min(1).optional(),
  tipo: z.enum(["cobro", "gasto"]).optional(),
  kcodcli2: z.string().nullable().optional(), // UUID desde 13a
  usuario_id: z.preprocess(
    (v) => (v == null || v === "" ? null : Number(v)),
    z.number().int().positive().nullable().optional()
  ),
  nombre_cliente: z.string().nullable().optional(),
  cuenta_id: z.coerce.number().int().positive().optional(),
  monto: z.coerce.number().int().positive().optional(),
  forma_pago: z.enum(["efectivo", "cheque", "transferencia", "mercadopago"]).optional(),
  observaciones: z.string().nullable().optional(),
  empresa: z.string().nullable().optional(),
  es_credito: z.boolean().optional(),
});

export type CajaMovimientoUpdate = z.infer<typeof CajaMovimientoUpdateSchema>;

/** Formatea un monto CLP entero (es-CL): 1200000 → "1.200.000". */
export function formatMonto(n: number): string {
  return n.toLocaleString("es-CL", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export type CajaMovimientoCreate = z.infer<typeof CajaMovimientoCreateSchema>;

// kcodcli2 y empresa están presentes en los schemas Zod (CajaMovimientoCreateSchema,
// CajaMovimientoUpdateSchema) porque la DB y la API los retornan y el POST/PUT los
// necesita (BUG-004, BUG-006). Se declaran como opcionales para compatibilidad.
export interface CajaMovimiento {
  id: string; // UUID desde 11a
  fecha: string;
  tipo: "cobro" | "gasto" | "reembolso";
  usuario_id: number | null;
  cliente_id?: string | null; // UUID desde 13a
  nombre_cliente: string | null;
  cuenta_id: number;
  cuenta_nombre?: string;
  monto: number;
  forma_pago: "efectivo" | "cheque" | "transferencia" | "mercadopago";
  observaciones: string | null;
  empresa?: string | null;
  es_credito: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Búsqueda de clientes compradores ─────────────────────────────

export interface ClienteComprador {
  usuario_id: number;
  nombre: string;
  total_compras: number;
  ultima_compra: string;
}

// ─── Imputación a notas de venta ──────────────────────────────────

export const NotaImputacionSchema = z.object({
  prenota_id: z.number().int().positive("ID de nota requerido"),
  monto_aplicado: z.number().int().positive("El monto debe ser mayor a 0"),
});

export const CajaImputacionCreateSchema = z.object({
  notas: z.array(NotaImputacionSchema),
});

export type NotaImputacion = z.infer<typeof NotaImputacionSchema>;
export type CajaImputacionCreate = z.infer<typeof CajaImputacionCreateSchema>;

// ponytail: repunte Slice 13 — campos renombrados de WinFac a modelo prenotas.
// La DB retorna origen, empresa, cliente_id — se declaran para que el cliente
// no rompa (BUG-004).
export interface NotaVentaConSaldo {
  id: number;
  fecha: string;
  total: number;
  total_pagado: number;
  saldo_pendiente: number;
  cliente_id?: string; // UUID desde 13a
  usuario_id?: number;
  nombre_cliente?: string | null;
  origen: string;
  empresa?: string;
}

export interface NotaBusquedaResult {
  id: number;
  fecha: string;
  total: number;
  total_pagado: number;
  saldo_pendiente: number;
  cliente_id: string; // UUID desde 13a
  nombre_cliente: string;
  origen: string;
}

export interface ImputacionResult {
  movimiento_id: string; // UUID desde 11a
  total_imputado: number;
  monto_disponible: number;
  notas: {
    id: number;
    prenota_id: number;
    monto_aplicado: number;
  }[];
}

// ─── Resumen de cliente (tabla de notas) ─────────────────────────

export interface PagoDetalle {
  movimiento_id: string; // UUID desde 11a
  fecha: string;
  monto_original: number;
  monto: number; // monto aplicado a la nota (CLP)
  forma_pago: string;
}

export interface NotaConPagos extends NotaVentaConSaldo {
  pagos: PagoDetalle[];
  cliente_id: string; // UUID desde 13a
}

export interface ResumenClienteResponse {
  cliente: {
    cliente_id: string; // UUID desde 13a
    nombre: string;
  };
  notas: NotaConPagos[];
  totales: {
    total_vendido: number;
    total_pagado: number;
    total_pendiente: number;
  };
}

// ─── Vista general (tabla de movimientos + saldos) ───────────────

export interface MovimientoConCuenta extends CajaMovimiento {
  cuenta_nombre: string;
  notas_imputadas: string[];
}

export interface MovimientosPaginados {
  data: MovimientoConCuenta[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface SaldoCuenta {
  cuenta_id: number;
  cuenta_nombre: string;
  total_cobros: number;
  total_gastos: number;
  total_reembolsos: number;
  saldo_neto: number;
}

// ─── Saldos Iniciales ──────────────────────────────────────────────

export const CajaSaldoInicialSchema = z.object({
  cuenta_id: z.coerce.number().int().positive("Selecciona una cuenta"),
  fecha: z.string().min(1, "La fecha es requerida"),
  saldo: z.coerce.number().min(0, "El saldo no puede ser negativo"),
  observaciones: z.string().nullable().optional(),
});

export interface CajaSaldoInicial {
  id: number;
  cuenta_id: number;
  cuenta_nombre: string;
  fecha: string;
  saldo: number;
  observaciones: string | null;
  created_at: string;
}

// ─── Cierres de período ───────────────────────────────────────────

export interface CuentaCierreResumen {
  cuenta_id: number;
  cuenta_nombre: string;
  saldo_anterior: number;
  total_cobros: number;
  total_gastos: number;
  total_reembolsos: number;
  saldo_final: number;
}

export interface CierrePeriodo {
  id: number;
  fecha_desde: string;
  fecha_hasta: string;
  resumen: CuentaCierreResumen[];
  usuario_id: number;
  usuario_nombre: string;
  created_at: string;
}

// ─── Movimiento o Cierre (unión para tabla) ───────────────────────

export type MovimientoOCierre =
  | { tipo_fila: "movimiento"; data: MovimientoConCuenta }
  | { tipo_fila: "cierre"; data: CierrePeriodo };

export interface MovimientosPaginadosConCierres {
  data: MovimientoOCierre[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  cierres_en_rango: CierrePeriodo[];
}
