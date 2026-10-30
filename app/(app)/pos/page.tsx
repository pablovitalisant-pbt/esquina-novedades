import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import flags from '@/config/feature-flags.json';
import { PosPage } from './client_page';

export default async function PosRoute() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  const rol = session.user.rol;
  if (rol !== 'admin' && rol !== 'vendedor') redirect('/dashboard');
  if ((flags as Record<string, boolean>)['pos-v1'] !== true) redirect('/notas-venta');
  return <PosPage session={session} />;
}
