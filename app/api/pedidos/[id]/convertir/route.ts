import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { convertirPedido } from '@/lib/pedidos/convertir';

// POST /api/pedidos/[id]/convertir — convierte un pedido en Nota de Venta.
// Envoltorio con sesión; la lógica vive en lib/pedidos/convertir.ts.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const rol = (session?.user as any)?.rol;
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if (rol === 'bodeguero') {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
  }

  try {
    const { id } = await params;
    const user = session.user as any;
    const { status, body } = await convertirPedido(id, Number(user.id), user.nombre);
    return NextResponse.json(body, { status });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
