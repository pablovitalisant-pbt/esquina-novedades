import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { ClientesPage } from './client_page';

export default async function ClientesRoute() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  // bodeguero solo accede a herramientas de bodega
  if (session.user.rol === 'bodeguero') redirect('/dashboard');
  return <ClientesPage />;
}
