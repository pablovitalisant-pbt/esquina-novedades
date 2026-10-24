import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
const CAMPOS = ['costo', 'activa', 'orden', 'requiere_direccion', 'nota'];

type CuerpoOpcion = {
  costo?: number;
  activa?: boolean;
  requiere_direccion?: boolean;
  orden?: number;
  nota?: string | null;
};

function errorValidacion(b: CuerpoOpcion): string | null {
  if (b.costo !== undefined && (!Number.isInteger(b.costo) || b.costo < 0)) return 'costo debe ser un entero >= 0';
  if (b.activa !== undefined && typeof b.activa !== 'boolean') return 'activa debe ser booleano';
  if (b.requiere_direccion !== undefined && typeof b.requiere_direccion !== 'boolean') return 'requiere_direccion debe ser booleano';
  if (b.orden !== undefined && !Number.isInteger(b.orden)) return 'orden debe ser un entero';
  if (b.nota !== undefined && b.nota !== null && typeof b.nota !== 'string') return 'nota debe ser texto o null';
  return null;
}

// PATCH admin parcial: lo no enviado conserva su valor; `nota: null` la limpia.
export async function PATCH(request: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (session.user.rol !== 'admin') return NextResponse.json({ error: 'Permisos insuficientes' }, { status: 403 });
  const codigo = (await params).codigo;
  if (!codigo) return NextResponse.json({ error: 'Código requerido' }, { status: 400 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }
  const datos = body as CuerpoOpcion;
  const claves = Object.keys(body);
  const desconocido = claves.find((k) => !CAMPOS.includes(k));
  if (claves.length === 0 || desconocido) {
    return NextResponse.json({ error: `Nada que actualizar o campo no permitido: ${desconocido ?? ''}` }, { status: 400 });
  }
  const invalido = errorValidacion(datos);
  if (invalido) return NextResponse.json({ error: invalido }, { status: 400 });

  const actuales = await sql`SELECT * FROM opciones_entrega WHERE codigo = ${codigo}`;
  if (actuales.length === 0) return NextResponse.json({ error: 'Opción de entrega no encontrada' }, { status: 404 });
  const { costo, activa, orden, requiere_direccion, nota } = datos;
  const actual = actuales[0];
  const notaFinal = nota === undefined ? actual.nota : (nota === null || nota.trim() === '' ? null : nota.trim());
  const filas = await sql`
    UPDATE opciones_entrega SET
      costo = ${costo !== undefined ? costo : actual.costo},
      activa = ${activa !== undefined ? activa : actual.activa},
      orden = ${orden !== undefined ? orden : actual.orden},
      requiere_direccion = ${requiere_direccion !== undefined ? requiere_direccion : actual.requiere_direccion},
      nota = ${notaFinal}
    WHERE codigo = ${codigo}
    RETURNING *
  `;
  if (filas.length === 0) return NextResponse.json({ error: 'Opción de entrega no encontrada' }, { status: 404 });
  return NextResponse.json({ data: filas[0] });
}
