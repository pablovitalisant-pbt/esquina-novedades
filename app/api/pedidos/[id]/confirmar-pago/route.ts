import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';
import { usuarioSesion } from '@/lib/session';
import { adquirirPagoManual } from '@/lib/pedidos/adquirir-pago-manual';
import { convertirPedido } from '@/lib/pedidos/convertir';
import { registrarCobroManualPedido } from '@/lib/pedidos/cobro-pedido';
import flags from '@/config/feature-flags.json';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_INT4 = 2_147_483_647;
const RECUPERABLE = { error: 'No se pudo completar el cobro. Intenta nuevamente.' };

const enteroPositivo = (v: unknown): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= MAX_INT4 ? v : null;

// N04c2 — Un admin confirma una transferencia o efectivo ya verificado. El
// movimiento de caja es la prueba de cierre: sin caja_movimiento_id persistido
// no hay 200.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if ((flags as Record<string, boolean>)['pedido-cobro-manual'] !== true) {
    return NextResponse.json({ error: 'No disponible' }, { status: 404 });
  }
  const session = await getServerSession(authOptions);
  const usuario = usuarioSesion(session);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const usuarioId = Number(usuario.id);
  if (usuario.rol !== 'admin' || !Number.isInteger(usuarioId) || usuarioId <= 0) {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
  }

  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 });

  let cuerpo: { cuenta_id?: unknown; monto?: unknown; referencia?: unknown } | null;
  try {
    cuerpo = await request.json();
  } catch {
    cuerpo = null;
  }
  const cuentaId = enteroPositivo(cuerpo?.cuenta_id);
  const monto = enteroPositivo(cuerpo?.monto);
  if (cuentaId === null || monto === null) {
    return NextResponse.json({ error: 'Datos de pago inválidos' }, { status: 400 });
  }
  let referencia: string | undefined;
  if (cuerpo?.referencia !== undefined) {
    if (typeof cuerpo.referencia !== 'string') {
      return NextResponse.json({ error: 'Referencia inválida' }, { status: 400 });
    }
    referencia = cuerpo.referencia.trim();
    if (referencia.length < 1 || referencia.length > 128) {
      return NextResponse.json({ error: 'Referencia inválida' }, { status: 400 });
    }
  }

  try {
    const adquisicion = await adquirirPagoManual({ pedidoId: id, cuentaId, usuarioId, monto, referencia });
    if (adquisicion === 'conflicto') {
      return NextResponse.json({ error: 'La confirmación no coincide con el pedido' }, { status: 409 });
    }

    const conversion = await convertirPedido(id, usuarioId, usuario.nombre ?? '');
    // Un 409 puede significar que otra solicitud ya convirtió: el registro de
    // pago persistido permite completar caja al reintentar.
    const cobro = await registrarCobroManualPedido(id);
    if (conversion.status !== 201 && cobro === 'sin_confirmacion') return NextResponse.json(RECUPERABLE, { status: 502 });

    const [fila] = await sql`SELECT id, estado, caja_movimiento_id FROM pedidos WHERE id = ${id}::uuid`;
    if (!fila || fila.caja_movimiento_id == null) return NextResponse.json(RECUPERABLE, { status: 502 });
    return NextResponse.json({
      id: fila.id,
      estado: fila.estado,
      caja_movimiento_id: fila.caja_movimiento_id,
    });
  } catch {
    return NextResponse.json(RECUPERABLE, { status: 502 });
  }
}
