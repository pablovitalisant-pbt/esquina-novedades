import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { PrenotaDetallePage } from './client_page';

export default async function PrenotaDetalleRoute({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  const rol = (session.user as any).rol;
  if (rol === 'bodeguero') redirect('/dashboard');
  return <PrenotaDetallePage session={session} params={params} />;
}
