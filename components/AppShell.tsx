'use client';

import * as React from 'react';
import Link from 'next/link';
import { TopNav } from './TopNav';
import { BottomNav } from './BottomNav';
import { AlertasBell } from './AlertasBell';
import { SessionProvider } from 'next-auth/react';
import type { Session } from 'next-auth';
import type { SessionProp } from '@/types';
import { AlertasProvider } from '@/contexts/AlertasContext';
import { MarcaLogo } from '@/components/MarcaLogo';

export function AppShell({ children, session }: { children: React.ReactNode, session: SessionProp }) {
  return (
    <SessionProvider session={session as Session}>
    <AlertasProvider>
      <div className="min-h-screen bg-[var(--background)] flex flex-col pt-16 md:pt-16 pb-16 md:pb-0">
        <TopNav />
        <header className="md:hidden fixed top-0 left-0 right-0 z-50 h-16 border-b border-[var(--border)] bg-[var(--card)]/80 backdrop-blur-xl flex items-center justify-between px-4">
          <Link href={
            session?.user?.rol === 'bodeguero' ? '/bodega' : '/precios'
          } className="shrink-0">
            <MarcaLogo logoClassName="h-9 w-auto max-w-[170px]" />
          </Link>
          <AlertasBell />
        </header>
        <main className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
          {children}
        </main>
        <BottomNav />
      </div>
    </AlertasProvider>
    </SessionProvider>
  );
}
