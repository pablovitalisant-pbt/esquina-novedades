import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { leerDetalleNota } from '@/lib/notas-venta/detalle';
import { PrenotaDetallePage } from './client_page';

export default async function PrenotaDetalleRoute({
  params,
}: {
  params?: Promise<{ id?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  const rol = session.user.rol;
  if (rol === 'bodeguero') redirect('/dashboard');

  // Sin initialData el cliente consulta la API como antes (maneja 400/404/error).
  let initialData: { id: string; nota: unknown } | undefined;
  try {
    const idParam = (await params)?.id;
    const id = Number(idParam);
    if (Number.isInteger(id) && id > 0) {
      const nota = await leerDetalleNota(id);
      if (nota) initialData = { id: idParam!, nota };
    }
  } catch {
    // Solo fallo de lectura DB: se degrada al fetch del cliente.
  }

  return <PrenotaDetallePage key={initialData?.id} session={session} initialData={initialData} />;
}
