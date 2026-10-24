import { sql } from '@/lib/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// GET público: opciones de entrega activas para el checkout.
export async function GET() {
  try {
    const rows = await sql`
      SELECT codigo, nombre, costo, requiere_direccion, nota
      FROM opciones_entrega
      WHERE activa = true
      ORDER BY orden ASC, codigo ASC
    `;
    return NextResponse.json({ data: rows });
  } catch (error) {
    console.error('GET /api/entrega/opciones error:', error);
    return NextResponse.json({ error: 'Error al obtener opciones de entrega' }, { status: 500 });
  }
}
