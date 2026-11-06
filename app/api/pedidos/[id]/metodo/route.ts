import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { leerDatosTransferencia } from '@/lib/pedidos/datos-transferencia';
import flags from '@/config/feature-flags.json';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if ((flags as Record<string, boolean>)['pedido-pago-opcional'] !== true) {
    return NextResponse.json({ error: 'No disponible' }, { status: 404 });
  }
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 });

  let cuerpo: unknown;
  try { cuerpo = await request.json(); } catch { cuerpo = null; }
  const metodo = (cuerpo as { metodo?: unknown } | null)?.metodo;
  if (metodo !== 'transferencia' && metodo !== 'efectivo') {
    return NextResponse.json({ error: 'Método de pago inválido' }, { status: 400 });
  }

  const datos = metodo === 'transferencia' ? leerDatosTransferencia() : null;
  if (metodo === 'transferencia' && !datos) {
    return NextResponse.json({ error: 'Transferencia no configurada' }, { status: 503 });
  }

  try {
    // Único UPDATE atómico: reserva vigente, sin preferencia MP, método compatible
    // (null o el mismo) y, para efectivo, opción de entrega local activa.
    const elegido = (await sql`
      UPDATE public.pedidos p
      SET metodo_pago = ${metodo}
      WHERE p.id = ${id}
        AND p.mp_init_point IS NULL
        AND p.mp_payment_id IS NULL
        AND (p.metodo_pago IS NULL OR p.metodo_pago = ${metodo})
        AND p.estado = 'pendiente_pago' AND p.stock_reservado = true AND p.expira_en > NOW()
        AND (${metodo} = 'transferencia' OR EXISTS (
          SELECT 1 FROM public.opciones_entrega o
          WHERE o.codigo = p.entrega_codigo AND o.activa = true
            AND o.codigo IN ('delivery_iquique', 'delivery_alto_hospicio')))
      RETURNING p.id
    `) as { id: string }[];
    if (elegido.length === 0) {
      return NextResponse.json({ error: 'Selección de pago no disponible' }, { status: 409 });
    }
    return NextResponse.json({
      metodo,
      referencia: id.slice(0, 8).toUpperCase(),
      ...(datos ? { datos_transferencia: datos } : {}),
    });
  } catch {
    return NextResponse.json({ error: 'No se pudo guardar el método de pago. Intenta nuevamente.' }, { status: 502 });
  }
}
