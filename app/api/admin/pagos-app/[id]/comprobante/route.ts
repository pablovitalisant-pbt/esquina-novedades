import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';
import { rolPagosApp } from '@/lib/pagos-app/acceso';
import { leerImagenComprobante } from '@/lib/pagos-app/imagen';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MIMES = ['image/png', 'image/jpeg', 'image/webp'];
type Contexto = { params: Promise<{ id: string }> };

/** N12d2 — GET privado: solo Pablo y Paola ven el comprobante. */
export async function GET(_request: Request, { params }: Contexto) {
  const session = await getServerSession(authOptions);
  if (!rolPagosApp(session)) return new Response(null, { status: 404 });

  const { id } = await params;
  if (!UUID.test(id)) return new Response(null, { status: 404 });

  const filas = (await sql`
    SELECT mime, encode(bytes, 'base64') AS bytes_b64
    FROM public.pagos_app_comprobantes
    WHERE pago_id = ${id}
  `) as { mime: string; bytes_b64: string }[];

  const fila = filas[0];
  const mime = MIMES.find((permitido) => permitido === fila?.mime);
  if (!fila || !mime) return new Response(null, { status: 404 });

  return new Response(Uint8Array.from(Buffer.from(fila.bytes_b64, 'base64')), {
    headers: {
      'content-type': mime,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

/** N12d2 — POST: solo Pablo adjunta una imagen a una transferencia original. */
export async function POST(request: Request, { params }: Contexto) {
  const session = await getServerSession(authOptions);
  const rol = rolPagosApp(session);
  if (!rol) return new Response(null, { status: 404 });
  if (rol !== 'pablo') return new Response(null, { status: 403 });

  const { id } = await params;
  if (!UUID.test(id)) return new Response(null, { status: 400 });

  const imagen = await leerImagenComprobante(request);
  if (!imagen) return new Response(null, { status: 400 });

  const pago = (await sql`
    SELECT medio, reversa_de FROM public.pagos_app WHERE id = ${id}
  `) as { medio: string; reversa_de: string | null }[];
  if (pago.length === 0) return new Response(null, { status: 404 });
  if (pago[0].medio !== 'transferencia' || pago[0].reversa_de !== null) {
    return new Response(null, { status: 400 });
  }

  const actor = Number(session?.user?.id);
  const creado = (await sql`
    INSERT INTO public.pagos_app_comprobantes (pago_id, mime, bytes, subido_por)
    VALUES (${id}, ${imagen.mime}, decode(${Buffer.from(imagen.bytes).toString('base64')}, 'base64'), ${actor})
    ON CONFLICT (pago_id) DO NOTHING
    RETURNING pago_id
  `) as { pago_id: string }[];
  if (creado.length === 0) return new Response(null, { status: 409 });

  return Response.json({ pago_id: id }, { status: 201 });
}
