import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import flags from '@/config/feature-flags.json';
import { IngresosClient } from './client_page';

export default async function IngresosPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  if (!(flags as any)['ingreso-mercaderia']) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center max-w-md px-4">
          <h1 className="text-xl font-bold text-[var(--body)] dark:text-[var(--body)] mb-3">
            Ingreso de Mercadería
          </h1>
          <p className="text-[var(--body)] dark:text-[var(--body)]">
            Este módulo no está disponible en esta versión.
          </p>
        </div>
      </div>
    );
  }

  const empresaId = (session.user as any)?.empresas?.[0] ?? 1;
  return <IngresosClient empresaId={empresaId} />;
}
