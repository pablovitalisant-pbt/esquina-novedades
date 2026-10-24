import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { IngresosClient } from './client_page';
import { UserSession } from '@/types';

export default async function IngresosPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const empresaId = (session.user as UserSession)?.empresas?.[0] ?? 1;
  return <IngresosClient empresaId={empresaId} />;
}
