import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { crearPreferenciaPedido } from '@/lib/pedidos/preferencia';
import { mpAccessToken, siteUrl } from '@/lib/mercadopago/config';
import flags from '@/config/feature-flags.json';

type PedidoPago = {
  id: string; estado: string; stock_reservado: boolean;
  expira_en: string | null; mp_init_point: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function vigente(p: PedidoPago): boolean {
  const fin = p.expira_en ? new Date(p.expira_en).getTime() : NaN;
  return p.estado === 'pendiente_pago' && p.stock_reservado === true
    && Number.isFinite(fin) && fin > Date.now();
}

async function pagoConfigurado(): Promise<boolean> {
  try { mpAccessToken(); siteUrl(); } catch { return false; }
  const [cfg] = await sql`SELECT valor FROM public.caja_config WHERE clave = 'mp_cuenta_id'`;
  const cuentaId = Number(cfg?.valor);
  if (!Number.isInteger(cuentaId) || cuentaId <= 0) return false;
  const [cuenta] = await sql`SELECT id FROM public.caja_cuentas WHERE id = ${cuentaId} AND activa = true`;
  return Boolean(cuenta);
}

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if ((flags as Record<string, boolean>)['pedido-pago-opcional'] !== true) {
    return NextResponse.json({ error: 'No disponible' }, { status: 404 });
  }
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 });

  try {
    const [pedido] = (await sql`
      SELECT id, estado, stock_reservado, expira_en::text, mp_init_point
      FROM public.pedidos WHERE id = ${id}
    `) as PedidoPago[];
    if (!pedido) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
    if (!vigente(pedido)) return NextResponse.json({ error: 'La reserva no está vigente' }, { status: 409 });
    if (pedido.mp_init_point) return NextResponse.json({ init_point: pedido.mp_init_point }, { status: 200 });
    if (!(await pagoConfigurado())) return NextResponse.json({ error: 'Pago online no configurado' }, { status: 503 });

    const { initPoint } = await crearPreferenciaPedido(id);
    // Releer tras la llamada: nunca entregar un link sobre una reserva vencida.
    const [actual] = (await sql`
      SELECT id, estado, stock_reservado, expira_en::text
      FROM public.pedidos WHERE id = ${id}
    `) as PedidoPago[];
    if (!actual || !vigente(actual)) return NextResponse.json({ error: 'La reserva no está vigente' }, { status: 409 });
    return NextResponse.json({ init_point: initPoint }, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'No se pudo iniciar el pago. Intenta nuevamente.' }, { status: 502 });
  }
}
