import { NextRequest, NextResponse } from 'next/server';
import { InvalidWebhookSignatureError, Payment, WebhookSignatureValidator } from 'mercadopago';
import { sql } from '@/lib/db';
import { mpConfig, TOLERANCIA_SEGUNDOS } from '@/lib/mercadopago/config';
import { pagoAprobado } from '@/lib/pedidos/pago-aprobado';
import flags from '@/config/feature-flags.json';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ok = () => NextResponse.json({ received: true });
const fail = (status: number) => NextResponse.json({ error: status === 401 ? 'Firma inválida' : 'Error' }, { status });

// Contrato §4.3. Nunca se loguea token, secret ni body; nunca se lee estado/monto del body.
export async function POST(req: NextRequest) {
  const secret = process.env.MP_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.error('[mp-webhook] MP_WEBHOOK_SECRET no configurado');
    return fail(500);
  }
  const xSignature = req.headers.get('x-signature')?.trim();
  const xRequestId = req.headers.get('x-request-id')?.trim();
  const dataId = req.nextUrl.searchParams.get('data.id')?.trim();
  // IPN legacy ("MercadoPago Feed v2.0", vía notification_url): sin data.id ni firma.
  // No se procesa nada (el cobro entra solo por la notificación firmada); 200 corta los reintentos.
  const topic = req.nextUrl.searchParams.get('topic');
  if (!dataId && topic && ['payment', 'merchant_order'].includes(topic) && flags['mp-webhook-ignorar-ipn-legacy'] === true) {
    return ok();
  }
  // Los tres son obligatorios: el SDK omitiría un par faltante y aceptaría una firma más débil.
  if (!xSignature || !xRequestId || !dataId) return fail(401);
  try {
    WebhookSignatureValidator.validate({ xSignature, xRequestId, dataId, secret, toleranceSeconds: TOLERANCIA_SEGUNDOS });
  } catch (e) {
    if (e instanceof InvalidWebhookSignatureError) {
      console.warn('[mp-webhook] firma inválida', e.reason, xRequestId);
      return fail(401);
    }
    console.error('[mp-webhook] error validando firma');
    return fail(500);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const tipo = req.nextUrl.searchParams.get('type') ?? body?.type ?? req.nextUrl.searchParams.get('topic');
    if (tipo !== 'payment') return ok();

    let pago;
    try {
      pago = await new Payment(mpConfig()).get({ id: dataId });
    } catch (e) {
      // Pago inexistente (p. ej. el simulador de MP o un id ajeno): no hay nada que
      // procesar y reintentar no lo hará aparecer -> 200 para cortar los reintentos.
      // Cualquier otro error (red, 5xx, token) sigue en 500 para que MP reintente.
      if (e && typeof e === 'object' && 'status' in e && (e as { status?: unknown }).status === 404) {
        console.warn('[mp-webhook] pago inexistente', xRequestId);
        return ok();
      }
      throw e;
    }
    const ref = pago.external_reference;
    if (!ref || !UUID.test(ref)) {
      console.warn('[mp-webhook] external_reference inválida', xRequestId);
      return ok();
    }
    const found = await sql`SELECT id FROM pedidos WHERE id = ${ref}`;
    if (found.length === 0) {
      console.warn('[mp-webhook] pedido inexistente', xRequestId);
      return ok();
    }

    if (pago.status === 'approved') {
      await pagoAprobado(ref, {
        id: pago.id as number,
        transaction_amount: pago.transaction_amount as number,
        currency_id: pago.currency_id as string,
      });
    } else if (pago.status === 'rejected' || pago.status === 'cancelled') {
      // Decisión DT: es un intento fallido; el comprador puede reintentar en la misma preferencia.
      // El stock se libera solo por expiración (36 h) o fallo de preferencia (9c).
      console.warn('[mp-webhook] pago', pago.status, xRequestId);
    }
    return ok();
  } catch (e) {
    console.error('[mp-webhook] error procesando', xRequestId, e instanceof Error ? e.message : 'desconocido');
    return fail(500);
  }
}
