import { sql } from '@/lib/db';

/** N12c1 — asiento del registro privado, sin bytes del comprobante. */
export type PagoAppResumen = {
  id: string;
  fecha: string;
  medio: 'efectivo' | 'transferencia';
  monto_clp: number;
  detalle: string;
  reversa_de: string | null;
  tiene_comprobante: boolean;
};

export type ResumenPagosApp = {
  total: number;
  abonado: number;
  saldo: number;
  progreso: number;
  pagos: PagoAppResumen[];
};

const INT4_MAX = 2_147_483_647;

function totalValido(valor: string | undefined): number | null {
  const texto = valor?.trim() ?? '';
  if (!/^[1-9]\d*$/.test(texto)) return null;
  const total = Number(texto);
  return total <= INT4_MAX ? total : null;
}

/**
 * - Total configurado entero positivo, o null sin tocar la base.
 * - Historial ordenado por fecha y creación descendente.
 * - La reversa resta su monto; el saldo nunca baja de cero y el progreso
 *   queda entre 0 y 100.
 * - Comprobante solo como booleano: los bytes no salen de la base.
 */
export async function leerResumenPagosApp(): Promise<ResumenPagosApp | null> {
  const total = totalValido(process.env.PAGOS_APP_TOTAL_CLP);
  if (total === null) return null;

  const pagos = (await sql`
    SELECT p.id, p.fecha::text AS fecha, p.medio, p.monto_clp, p.detalle, p.reversa_de,
           (c.pago_id IS NOT NULL) AS tiene_comprobante
    FROM public.pagos_app p
    LEFT JOIN public.pagos_app_comprobantes c ON c.pago_id = p.id
    ORDER BY p.fecha DESC, p.creado_en DESC
  `) as PagoAppResumen[];

  const abonado = pagos.reduce(
    (suma, pago) => suma + (pago.reversa_de ? -pago.monto_clp : pago.monto_clp),
    0,
  );
  const saldo = Math.max(0, total - abonado);
  const progreso = Math.min(100, Math.max(0, Math.round((abonado / total) * 100)));

  return { total, abonado, saldo, progreso, pagos };
}
