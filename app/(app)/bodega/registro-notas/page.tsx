import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { RegistroNotasPage } from './client_page';

export default async function RegistroNotasRoute() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  return <RegistroNotasPage session={session} />;
}
