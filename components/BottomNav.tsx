'use client';

import Link from 'next/link';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  ShoppingCart, Users, LayoutList, Tag, Box,
  Settings, ClipboardList, Landmark, AlertTriangle, FileText,PackagePlus, Inbox, PieChart
} from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { signOut, useSession } from 'next-auth/react';
import flags from '@/config/feature-flags.json';

export function BottomNav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const rol = (session?.user as any)?.rol as string;

  const [ventasOpen, setVentasOpen] = useState(false);
  const [bodegaOpen, setBodegaOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);

  const isAdmin = rol === 'admin';
  const isVendedor = rol === 'vendedor';
  const isBodeguero = rol === 'bodeguero';

  const btnClass = (active: boolean) => cn(
    'flex flex-col items-center justify-center flex-shrink-0 w-16 h-full gap-1 transition-colors',
    active
      ? 'text-[var(--primary)] dark:text-[var(--primary)]'
      : 'text-[var(--body)] hover:text-[var(--body)] dark:hover:text-[var(--body)]'
  );

  const sheetLink = (href: string, icon: React.ReactNode, label: string, onClose: () => void) => (
    <Link
      href={href}
      onClick={onClose}
      className={cn(
        'flex items-center justify-between py-3 font-medium border-b border-[var(--border)] dark:border-[var(--border)]',
        pathname === href || pathname.startsWith(href + '/')
          ? 'text-[var(--primary)] dark:text-[var(--primary)]'
          : 'text-[var(--body)] dark:text-[var(--body)]'
      )}
    >
      <span className="flex items-center gap-3">
        <span className="text-[var(--body)]">{icon}</span>
        {label}
      </span>
    </Link>
  );

  const ventasActive =
    pathname.startsWith('/precios') ||
    pathname.startsWith('/notas-venta') ||
    pathname.startsWith('/clientes') ||
    pathname.startsWith('/caja-mayor') ||
    pathname.startsWith('/deudores') ||
    pathname.startsWith('/pedidos');

  const catalogoActive = pathname.startsWith('/catalogo');

  const bodegaActive =
    pathname.startsWith('/bodega') ||
    pathname.startsWith('/alertas-stock');

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 h-16 border-t border-[var(--border)] dark:border-[var(--border)] bg-white/80 dark:bg-[var(--muted)]/80 backdrop-blur-xl pb-safe">
      <div
        className="flex items-center justify-around h-full px-2"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}
      >

        {/* Ventas — admin, vendedor */}
        {(isAdmin || isVendedor) && (
          <>
            <button
              onClick={() => setVentasOpen(true)}
              className={btnClass(ventasActive)}
            >
              <ShoppingCart className="w-6 h-6" />
              <span className="text-[10px] font-medium">Ventas</span>
            </button>
            <Sheet open={ventasOpen} onOpenChange={setVentasOpen}>
              <SheetTrigger className="hidden" />
              <SheetContent side="bottom" className="rounded-t-2xl p-6 pb-10">
                <h3 className="text-xs font-semibold text-[var(--body)] uppercase tracking-wider mb-4">
                  Ventas
                </h3>
                <div className="space-y-0">
                  {sheetLink('/precios', <ShoppingCart className="w-5 h-5" />, 'Sala de Venta', () => setVentasOpen(false))}
                  {sheetLink('/notas-venta', <FileText className="w-5 h-5" />, 'Notas de Venta', () => setVentasOpen(false))}
                  {sheetLink('/clientes', <Users className="w-5 h-5" />, 'Clientes', () => setVentasOpen(false))}
                  {sheetLink('/deudores', <Users className="w-5 h-5" />, 'Deudores', () => setVentasOpen(false))}
                  {sheetLink('/pedidos', <Inbox className="w-5 h-5" />, 'Pedidos', () => setVentasOpen(false))}
                  {isAdmin && sheetLink('/caja-mayor', <Landmark className="w-5 h-5" />, 'Caja Mayor', () => setVentasOpen(false))}
                </div>
              </SheetContent>
            </Sheet>
          </>
        )}

        {/* Catálogo — admin, vendedor, link directo */}
        {(isAdmin || isVendedor) && (
          <Link href="/catalogo/admin" className={btnClass(catalogoActive)}>
            <LayoutList className="w-6 h-6" />
            <span className="text-[10px] font-medium">Catálogo</span>
          </Link>
        )}

        {/* Categorías — admin, vendedor (fuera del Sheet Admin admin-only) */}
        {(isAdmin || isVendedor) && (
          <Link href="/admin/categorias" className={btnClass(pathname.startsWith('/admin/categorias'))}>
            <Tag className="w-6 h-6" />
            <span className="text-[10px] font-medium">Categorías</span>
          </Link>
        )}

        {/* Bodega — admin, bodeguero, vendedor */}
        {(isAdmin || isBodeguero || isVendedor) && (
          <>
            <button
              onClick={() => setBodegaOpen(true)}
              className={btnClass(bodegaActive)}
            >
              <Box className="w-6 h-6" />
              <span className="text-[10px] font-medium">Bodega</span>
            </button>
            <Sheet open={bodegaOpen} onOpenChange={setBodegaOpen}>
              <SheetTrigger className="hidden" />
              <SheetContent side="bottom" className="rounded-t-2xl p-6 pb-10">
                <h3 className="text-xs font-semibold text-[var(--body)] uppercase tracking-wider mb-4">
                  Bodega
                </h3>
                <div className="space-y-0">
                  {sheetLink('/bodega', <Box className="w-5 h-5" />, 'Ubicaciones', () => setBodegaOpen(false))}
                  {sheetLink('/bodega/ingresos', <PackagePlus className="w-5 h-5" />, 'Ingreso de Mercadería', () => setBodegaOpen(false))}
                  {(flags as any)['registro_notas_bodega_ui'] && sheetLink('/bodega/registro-notas', <ClipboardList className="w-5 h-5" />, 'Registro de Notas', () => setBodegaOpen(false))}
                  {(isAdmin || isBodeguero || isVendedor) &&
                    sheetLink('/alertas-stock', <AlertTriangle className="w-5 h-5" />, 'Alertas de stock', () => setBodegaOpen(false))
                  }
                </div>
              </SheetContent>
            </Sheet>
          </>
        )}

        {/* Admin — solo admin */}
        {isAdmin && (
          <>
            <button
              onClick={() => setAdminOpen(true)}
              className={btnClass(pathname.startsWith('/admin'))}
            >
              <Settings className="w-6 h-6" />
              <span className="text-[10px] font-medium">Admin</span>
            </button>
            <Sheet open={adminOpen} onOpenChange={setAdminOpen}>
              <SheetTrigger className="hidden" />
              <SheetContent side="right" className="w-[80vw] sm:w-[300px] p-6">
                <div className="flex flex-col h-full pt-8 gap-4">
                  <div className="space-y-2 flex-1 overflow-y-auto">
                    <h3 className="text-xs font-semibold text-[var(--body)] uppercase tracking-wider mb-4">
                      Administración
                    </h3>
                    <Link href="/admin/usuarios" onClick={() => setAdminOpen(false)}
                      className="flex items-center gap-3 py-3 font-medium border-b border-[var(--border)] dark:border-[var(--border)]">
                      <Users className="w-4 h-4 text-[var(--body)]" /> Usuarios
                    </Link>
                    <Link href="/admin/caja-config" onClick={() => setAdminOpen(false)}
                      className="flex items-center gap-3 py-3 font-medium border-b border-[var(--border)] dark:border-[var(--border)]">
                      <Landmark className="w-4 h-4 text-[var(--body)]" /> Config de Caja
                    </Link>
                    <Link href="/admin/inversion-mercaderia" onClick={() => setAdminOpen(false)}
                      className="flex items-center gap-3 py-3 font-medium border-b border-[var(--border)] dark:border-[var(--border)]">
                      <PieChart className="w-4 h-4 text-[var(--body)]" /> Inversión en Mercadería
                    </Link>
                  </div>
                  <Button variant="destructive" onClick={() => signOut({ callbackUrl: '/' })} className="w-full">
                    Cerrar sesión
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </>
        )}

      </div>
    </nav>
  );
}
