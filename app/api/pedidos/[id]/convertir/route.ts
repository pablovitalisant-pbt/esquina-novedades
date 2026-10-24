import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { convertirPedido } from '@/lib/pedidos/convertir';

type UsuarioSesion = { id: string; nombre: string; rol: string };

function usuarioSesion(session: { user?: unknown } | null | undefined): UsuarioSesion {
  return (session?.user as UsuarioSesion | undefined) ?? ({} as UsuarioSesion);
}

function mensajeError(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// POST /api/pedidos/[id]/convertir — convierte un pedido en Nota de Venta.
// Envoltorio con sesión; la lógica vive en lib/pedidos/convertir.ts.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const rol = usuarioSesion(session).rol;
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if (rol === 'bodeguero') {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
  }

  try {
    const { id } = await params;
    const user = usuarioSesion(session);
    const { status, body } = await convertirPedido(id, Number(user.id), user.nombre);
    return NextResponse.json(body, { status });
  } catch (error) {
    return NextResponse.json({ error: mensajeError(error) }, { status: 500 });
  }
}
