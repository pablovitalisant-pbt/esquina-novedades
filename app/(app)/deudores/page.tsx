import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { DeudoresClient } from './client_page';

export default async function DeudoresPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  const rol = (session.user as any).rol;
  if (rol === 'bodeguero') redirect('/dashboard');
  return <DeudoresClient session={session} />;
}
