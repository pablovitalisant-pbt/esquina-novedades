/**
 * S2a — cálculo puro del historial de movimientos por producto.
 *
 * El signo de `cantidad` es el movimiento histórico; `efecto` es lo que
 * realmente movió el saldo (0 en notas anuladas y reservas liberadas).
 * `calcularResumen` explica el saldo actual y, si sobra stock sin movimiento
 * registrado, lo atribuye al stock inicial de "Nuevo producto" (inferido).
 *
 * La lista llega del movimiento MÁS RECIENTE al más antiguo (la API ordena
 * DESC). `queda` es el saldo que dejó cada movimiento: se calcula hacia atrás
 * desde el saldo actual, así que es exacto incluso si la lista viene truncada.
 */

/** Observación con que B2 registra el stock con que se crea un producto. */
export const OBS_STOCK_INICIAL = 'Stock inicial al crear el producto';

export type TipoMovimiento =
  | 'ingreso'
  | 'conciliacion'
  | 'venta'
  | 'reserva'
  | 'stock_inicial';

export interface ReferenciaMovimiento {
  tipo: 'ingreso' | 'conciliacion' | 'nota' | 'pedido';
  id: number | string;
  href: string | null;
}

export interface MovimientoHistorial {
  fecha: string;
  tipo: TipoMovimiento;
  cantidad: number;
  efecto: number;
  detalle: string | null;
  usuario: string | null;
  referencia: ReferenciaMovimiento | null;
  estado: string | null;
  inferido: boolean;
  codigo: string | null;
  /** Saldo resultante tras este movimiento. Lo completa `armarHistorial`. */
  queda: number;
}

/** Fila tal como la devuelve la query UNION (columnas ya normalizadas). */
export interface MovimientoCrudo {
  fecha: string | Date;
  tipo: string;
  cantidad: number | string;
  detalle: string | null;
  usuario: string | null;
  ref_tipo: string | null;
  ref_id: number | string | null;
  estado: string | null;
  codigo?: string | null;
}

export interface ProductoHistorial {
  codigo: string;
  detalle: string | null;
  saldo: number;
  cantcaja: number;
  fecha_ingreso: string;
  codigos_anteriores?: string[];
}

export interface ResumenHistorial {
  ingresado: number;
  ajustes: number;
  vendido: number;
  reservado: number;
  stock_inicial_inferido: number | null;
  stock_esperado: number | null;
  saldo_actual: number;
  diferencia: number | null;
  truncado: boolean;
}

function fechaISO(fecha: string | Date): string {
  return fecha instanceof Date ? fecha.toISOString() : fecha;
}

function referenciaDe(
  tipo: string | null,
  id: number | string | null,
): ReferenciaMovimiento | null {
  if (!tipo || id === null || id === undefined || id === '') return null;
  const numero = Number(id);
  const idFinal = Number.isNaN(numero) ? String(id) : numero;
  if (tipo === 'nota') {
    return { tipo: 'nota', id: idFinal, href: `/notas-venta/${idFinal}` };
  }
  if (tipo === 'ingreso' || tipo === 'conciliacion' || tipo === 'pedido') {
    return { tipo, id: idFinal, href: null };
  }
  return null;
}

export function normalizarMovimiento(crudo: MovimientoCrudo): MovimientoHistorial {
  const cantidad = Number(crudo.cantidad) || 0;
  const mueve =
    crudo.tipo === 'venta'
      ? crudo.estado === 'activa'
      : crudo.tipo === 'reserva'
        ? crudo.estado === 'vigente'
        : true;
  return {
    fecha: fechaISO(crudo.fecha),
    tipo: crudo.tipo as TipoMovimiento,
    cantidad,
    efecto: mueve ? cantidad : 0,
    detalle: crudo.detalle,
    usuario: crudo.usuario,
    referencia: referenciaDe(crudo.ref_tipo, crudo.ref_id),
    estado: crudo.estado,
    inferido: false,
    codigo: crudo.codigo ?? null,
    queda: 0,
  };
}

export function calcularResumen(
  movimientos: MovimientoHistorial[],
  saldoActual: number,
  truncado = false,
): ResumenHistorial {
  const suma = (tipo: TipoMovimiento) =>
    movimientos.filter((m) => m.tipo === tipo).reduce((acc, m) => acc + m.efecto, 0);

  // `|| 0` evita el -0 de negar una suma vacía (toBe distingue -0 de 0).
  const ingresado = suma('ingreso') || 0;
  const ajustes = suma('conciliacion') || 0;
  const vendido = -suma('venta') || 0;
  const reservado = -suma('reserva') || 0;
  const base = ingresado + ajustes - vendido - reservado;

  if (truncado) {
    return {
      ingresado, ajustes, vendido, reservado,
      stock_inicial_inferido: null,
      stock_esperado: null,
      saldo_actual: saldoActual,
      diferencia: null,
      truncado: true,
    };
  }

  const residual = saldoActual - base;
  if (residual > 0) {
    return {
      ingresado, ajustes, vendido, reservado,
      stock_inicial_inferido: residual,
      stock_esperado: saldoActual,
      saldo_actual: saldoActual,
      diferencia: 0,
      truncado: false,
    };
  }
  return {
    ingresado, ajustes, vendido, reservado,
    stock_inicial_inferido: 0,
    stock_esperado: base,
    saldo_actual: saldoActual,
    diferencia: residual,
    truncado: false,
  };
}

export function armarHistorial(
  producto: ProductoHistorial,
  crudos: MovimientoCrudo[],
  truncado = false,
): { movimientos: MovimientoHistorial[]; resumen: ResumenHistorial } {
  const movimientos = crudos.map(normalizarMovimiento);
  const resumen = calcularResumen(movimientos, producto.saldo, truncado);

  if (resumen.stock_inicial_inferido && resumen.stock_inicial_inferido > 0) {
    const n = resumen.stock_inicial_inferido;
    // DESC: el stock inicial es lo más antiguo, va al final de la lista.
    movimientos.push({
      fecha: producto.fecha_ingreso,
      tipo: 'stock_inicial',
      cantidad: n,
      efecto: n,
      detalle: `Stock al crear el producto (sin registro de ingreso): ${n}`,
      usuario: null,
      referencia: null,
      estado: 'inferido',
      inferido: true,
      codigo: null,
      queda: 0,
    });
  }

  // Saldo hacia atrás: la fila más reciente deja el saldo actual; la anterior
  // deja el saldo de la más reciente menos su efecto. Exacto aun truncado.
  let queda = producto.saldo;
  for (const movimiento of movimientos) {
    movimiento.queda = queda;
    queda -= movimiento.efecto;
  }

  return { movimientos, resumen };
}
