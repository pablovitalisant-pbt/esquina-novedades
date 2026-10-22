import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { liberarReservasVencidas } from '@/lib/pedidos/liberar-reservas';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/liberar-reservas — respaldo diario del cron de Vercel.
 * Proceso, no usuario: Authorization: Bearer $CRON_SECRET en tiempo constante.
 * La liberación efectiva es la perezosa; con Hobby (1/día) esto solo barre.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET no configurado' }, { status: 500 });
  }

  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  if (!token || a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const data = await liberarReservasVencidas();
    return NextResponse.json({ data });
  } catch (error) {
    console.error('GET /api/cron/liberar-reservas error:', error);
    return NextResponse.json({ error: 'Error liberando reservas' }, { status: 500 });
  }
}
