import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { PrenotaDetallePage } from './client_page';
import { UserSession } from '@/types';

export default async function PrenotaDetalleRoute() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  const rol = (session.user as UserSession).rol;
  if (rol === 'bodeguero') redirect('/dashboard');
  return <PrenotaDetallePage session={session} />;
}
