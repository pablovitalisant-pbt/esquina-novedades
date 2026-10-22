'use client';

import * as React from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { signOut, useSession } from 'next-auth/react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from './ui/dropdown-menu';
import {
  Box,
  LogOut,
  ChevronDown,
  Users,
  ShoppingCart,
  LayoutList,
  Tag,
  ClipboardList,
  Landmark,
  AlertTriangle,
  FileText,
  ShieldAlert,
  PackagePlus,
  Inbox,
  PieChart
} from 'lucide-react';
import { Badge } from './ui/badge';
import { AlertasBell } from './AlertasBell';
import { useAlertas } from '@/contexts/AlertasContext';
import flags from '@/config/feature-flags.json';

export function TopNav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isAdmin = (session?.user as any)?.rol === 'admin';
  const rol = (session?.user as any)?.rol as string;

  const logoHref = rol === 'bodeguero' ? '/bodega' : '/precios';
  const { stockBajoCount } = useAlertas();

  const getSaludo = () => {
    const hora = new Date().getHours();
    if (hora >= 5 && hora < 12) return 'Buenos días';
    if (hora >= 12 && hora < 20) return 'Buenas tardes';
    return 'Buenas noches';
  };

  const primerNombre = ((session?.user as any)?.nombre as string)?.split(' ')[0] ?? '';

  const [ventasOpen, setVentasOpen] = useState(false);
  const [bodegaOpen, setBodegaOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);

  const openOnly = (which: 'ventas' | 'bodega' | 'admin') => {
    setVentasOpen(which === 'ventas');
    setBodegaOpen(which === 'bodega');
    setAdminOpen(which === 'admin');
  };

  const dropdownTrigger = (active: boolean) => cn(
    'flex items-center gap-2 px-3 py-2 rounded-full text-sm font-medium transition-all hover:bg-[var(--muted)] dark:hover:bg-[var(--muted)] focus:outline-none',
    active ? 'bg-[var(--primary)]/10 text-[var(--primary)]' : 'text-[var(--body)]'
  );

  const ventasActive =
    pathname.startsWith('/precios') ||
    pathname.startsWith('/notas-venta') ||
    pathname.startsWith('/clientes') ||
    pathname.startsWith('/caja-mayor') ||
    pathname.startsWith('/deudores') ||
    pathname.startsWith('/pedidos');

  return (
    <header className="hidden md:flex sticky top-0 z-50 w-full h-16 border-b border-[var(--border)] bg-[var(--card)]/70 backdrop-blur-xl transition-all">
      <div className="container flex h-16 max-w-7xl items-center justify-between mx-auto px-4">
        <div className="flex items-center gap-8">
          <Link href={logoHref} className="shrink-0">
            <img src="/logo-texto.png" alt="Bazar Naty" className="h-9 w-auto" />
          </Link>
          <nav className="flex items-center space-x-1">

            {/* Ventas — admin y vendedor */}
            {(isAdmin || rol === 'vendedor') && (
              <DropdownMenu open={ventasOpen} onOpenChange={setVentasOpen}>
                <DropdownMenuTrigger
                  onMouseEnter={() => openOnly('ventas')}
                  className={dropdownTrigger(ventasActive)}
                >
                  Ventas <ChevronDown className="w-4 h-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52" onMouseLeave={() => setVentasOpen(false)}>
                  <DropdownMenuItem>
                    <Link href="/precios" className="flex items-center gap-2 w-full">
                      <ShoppingCart className="w-4 h-4" /> Sala de Venta
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Link href="/notas-venta" className="flex items-center gap-2 w-full">
                      <FileText className="w-4 h-4" /> Notas de Venta
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Link href="/clientes" className="flex items-center gap-2 w-full">
                      <Users className="w-4 h-4" /> Clientes
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Link href="/deudores" className="flex items-center gap-2 w-full">
                      <Users className="w-4 h-4" /> Deudores
                    </Link>
                  </DropdownMenuItem>
                  {(flags as any)['pedidos-staff-ui'] && (
                    <DropdownMenuItem>
                      <Link href="/pedidos" className="flex items-center gap-2 w-full">
                        <Inbox className="w-4 h-4" /> Pedidos
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {isAdmin && (
                    <DropdownMenuItem>
                      <Link href="/caja-mayor" className="flex items-center gap-2 w-full">
                        <Landmark className="w-4 h-4" /> Caja Mayor
                      </Link>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Catálogo — admin y vendedor, link directo */}
            {(isAdmin || rol === 'vendedor') && (
              <Link
                href="/catalogo/admin"
                className={dropdownTrigger(
                  pathname.startsWith('/catalogo')
                )}
              >
                <LayoutList className="w-4 h-4" /> Catálogo
              </Link>
            )}

            {/* Categorías — admin y vendedor (fuera de Administración admin-only) */}
            {(isAdmin || rol === 'vendedor') && (
              <Link
                href="/admin/categorias"
                className={dropdownTrigger(pathname.startsWith('/admin/categorias'))}
              >
                <Tag className="w-4 h-4" /> Categorías
              </Link>
            )}

            {/* Bodega — admin, bodeguero y vendedor */}
            {(isAdmin || rol === 'bodeguero' || rol === 'vendedor') && (
              <DropdownMenu open={bodegaOpen} onOpenChange={setBodegaOpen}>
                <DropdownMenuTrigger
                  onMouseEnter={() => openOnly('bodega')}
                  className={dropdownTrigger(pathname.startsWith('/bodega') || pathname.startsWith('/alertas-stock'))}
                >
                  Bodega <ChevronDown className="w-4 h-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52" onMouseLeave={() => setBodegaOpen(false)}>
                  <DropdownMenuItem>
                    <Link href="/bodega" className="flex items-center gap-2 w-full">
                      <Box className="w-4 h-4" /> Ubicaciones
                    </Link>
                  </DropdownMenuItem>
                  {(flags as any)['ingreso-mercaderia'] && (
                    <DropdownMenuItem>
                      <Link href="/bodega/ingresos" className="flex items-center gap-2 w-full">
                        <PackagePlus className="w-4 h-4" /> Ingreso de Mercadería
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {(flags as any)['registro_notas_bodega_ui'] && (
                    <DropdownMenuItem>
                      <Link href="/bodega/registro-notas" className="flex items-center gap-2 w-full">
                        <ClipboardList className="w-4 h-4" /> Registro de Notas
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {(isAdmin || rol === 'bodeguero' || rol === 'vendedor') && (
                    <DropdownMenuItem>
                      <Link href="/alertas-stock" className="flex items-center gap-2 w-full">
                        <AlertTriangle className="w-4 h-4" /> Alertas de stock
                        {stockBajoCount > 0 && (
                          <Badge variant="destructive" className="ml-auto text-[10px] px-1.5 py-0">
                            {stockBajoCount}
                          </Badge>
                        )}
                      </Link>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Administración — solo admin */}
            {isAdmin && (
              <DropdownMenu open={adminOpen} onOpenChange={setAdminOpen}>
                <DropdownMenuTrigger
                  onMouseEnter={() => openOnly('admin')}
                  className={dropdownTrigger(
                    pathname.startsWith('/admin')
                  )}
                >
                  Administración <ChevronDown className="w-4 h-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48" onMouseLeave={() => setAdminOpen(false)}>
                  <DropdownMenuItem>
                    <Link href="/admin/usuarios" className="flex items-center gap-2 w-full">
                      <Users className="w-4 h-4" /> Usuarios
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Link href="/admin/caja-config" className="flex items-center gap-2 w-full">
                      <Landmark className="w-4 h-4" /> Config de Caja
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Link href="/admin/sync-conflictos" className="flex items-center gap-2 w-full">
                      <ShieldAlert className="w-4 h-4" /> Conflictos de Sync
                    </Link>
                  </DropdownMenuItem>
                  {(flags as any)['inversion-mercaderia'] && (
                    <DropdownMenuItem>
                      <Link href="/admin/inversion-mercaderia" className="flex items-center gap-2 w-full">
                        <PieChart className="w-4 h-4" /> Inversión en Mercadería
                      </Link>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

          </nav>
        </div>
        <div className="flex items-center gap-2">
          {primerNombre && (
            <span className="text-sm text-[var(--primary)] dark:text-[var(--primary)] hidden lg:block">
              {getSaludo()}, <span className="font-semibold text-[var(--body)] dark:text-[var(--body)]">{primerNombre}</span>
            </span>
          )}
          <AlertasBell />
          <button onClick={() => signOut({ callbackUrl: '/' })} className="p-2 text-[var(--body)] hover:text-[var(--destructive)] transition-colors" title="Cerrar sesión">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
}
