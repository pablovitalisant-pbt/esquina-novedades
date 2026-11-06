import { sql } from '@/lib/db';

/** N12e1 — asiento a registrar. La validación de entrada vive en el CLI. */
export type PagoAppDatos = {
  clave: string;
  fecha: string;
  medio: 'efectivo' | 'transferencia';
  monto_clp: number;
  detalle: string;
  reversa_de?: string;
};

export type PagoAppRegistro = { id: string; nuevo: boolean };

type FilaExistente = {
  id: string;
  fecha: string;
  medio: string;
  monto_clp: number;
  detalle: string;
  reversa_de: string | null;
};

/**
 * Inserta idempotente por clave. Si la clave ya existía, compara los datos
 * persistidos exactos: mismos datos devuelven el id sin duplicar; datos
 * distintos lanzan. Solo lo llama el CLI técnico.
 */
export async function registrarPagoApp(pago: PagoAppDatos): Promise<PagoAppRegistro> {
  const reversa = pago.reversa_de ?? null;

  const insertados = (await sql`
    INSERT INTO public.pagos_app (clave, fecha, medio, monto_clp, detalle, reversa_de)
    VALUES (${pago.clave}, ${pago.fecha}::date, ${pago.medio}, ${pago.monto_clp},
            ${pago.detalle}, ${reversa})
    ON CONFLICT (clave) DO NOTHING
    RETURNING id
  `) as Array<{ id: string }>;
  if (insertados.length > 0) return { id: insertados[0].id, nuevo: true };

  const [existente] = (await sql`
    SELECT id, fecha::text AS fecha, medio, monto_clp, detalle, reversa_de
    FROM public.pagos_app
    WHERE clave = ${pago.clave}
  `) as FilaExistente[];

  if (!existente) throw new Error(`pagos_app: la clave ${pago.clave} no se encontró`);
  const iguales =
    existente.fecha === pago.fecha &&
    existente.medio === pago.medio &&
    existente.monto_clp === pago.monto_clp &&
    existente.detalle === pago.detalle &&
    existente.reversa_de === reversa;
  if (!iguales) throw new Error(`pagos_app: la clave ${pago.clave} ya existe con datos distintos`);

  return { id: existente.id, nuevo: false };
}
