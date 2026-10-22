import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import flags from '@/config/feature-flags.json';

export default async function DespachosPage() {
  const session = await getServerSession(authOptions);
  if (!session) return null;

  if (!flags['despachos-ia']) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center max-w-md px-4">
          <h1 className="text-xl font-bold text-[var(--body)] dark:text-[var(--body)] mb-3">
            Despachos
          </h1>
          <p className="text-[var(--body)]500 dark:text-[var(--body)]">
            Este módulo no está disponible en esta versión.
          </p>
        </div>
      </div>
    );
  }

  const { DespachosClient } = await import('./client_page');
  const empresaId = (session.user as any)?.empresas?.[0] ?? 1;

  return <DespachosClient session={session as any} empresaId={empresaId} />;
}
