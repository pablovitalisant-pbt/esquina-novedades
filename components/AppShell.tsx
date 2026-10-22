'use client';

import * as React from 'react';
import Link from 'next/link';
import { TopNav } from './TopNav';
import { BottomNav } from './BottomNav';
import { AlertasBell } from './AlertasBell';
import { SessionProvider } from 'next-auth/react';
import { AlertasProvider } from '@/contexts/AlertasContext';
import { PowerSyncProvider } from '@/lib/powersync/PowerSyncProvider';
import flags from '@/config/feature-flags.json';

export function AppShell({ children, session }: { children: React.ReactNode, session: any }) {
  const rol = (session?.user as any)?.rol as string;
  const isAdmin = rol === 'admin';
  // Badge + dropdown offline: si el flag está en true, PowerSync se monta desde
  // el arranque para que AlertasContext (badge) y AlertasBell (dropdown) lean
  // local. Debe envolver a AlertasProvider porque éste llama a usePowerSync().
  // Con el flag en false no se monta → comportamiento actual sin cambios.
  const BADGE_OFFLINE = (flags as any)["alertas-badge-offline"];

  const app = (
    <AlertasProvider>
      <div className="min-h-screen bg-[var(--background)] flex flex-col pt-16 md:pt-16 pb-16 md:pb-0">
        <TopNav />
        <header className="md:hidden fixed top-0 left-0 right-0 z-50 h-16 border-b border-[var(--border)] bg-[var(--card)]/80 backdrop-blur-xl flex items-center justify-between px-4">
          <Link href={
            (session?.user as any)?.rol === 'bodeguero' ? '/bodega' : '/precios'
          } className="font-extrabold text-xl tracking-tight text-[var(--primary)]">
            Bazar Naty
          </Link>
          <AlertasBell />
        </header>
        <main className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
          {children}
        </main>
        <BottomNav />
      </div>
    </AlertasProvider>
  );

  return (
    <SessionProvider session={session}>
      {BADGE_OFFLINE ? <PowerSyncProvider>{app}</PowerSyncProvider> : app}
    </SessionProvider>
  );
}
