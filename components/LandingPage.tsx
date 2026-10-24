'use client';

import { ImageWithFallback } from '@/components/ImageWithFallback';
import { formatCLP } from '@/lib/utils';
import { EMPRESA } from '@/lib/empresa';
import { MarcaLogo } from '@/components/MarcaLogo';
import { RedesSociales } from '@/components/RedesSociales';
import { ShoppingBag, MessageCircle } from 'lucide-react';

interface LandingProducto {
  codigo: string;
  id: number;
  detalle: string | null;
  imagen_url: string | null;
  cantcaja: number;
  umed: string;
  precio: number;
  saldo: number;
  es_nuevo: boolean;
}

export function LandingPage({ productos, empresaSlug }: { productos: LandingProducto[]; empresaSlug: string }) {
  return (
    <div className="landing-page min-h-screen font-sans bg-background">
      {/* 1. Header */}
      <header className="border-b border-[var(--border-default)] sticky top-0 bg-background z-50">
        <div className="mx-auto px-6 h-16 flex items-center justify-between gap-4" style={{ maxWidth: '1152px' }}>
          <MarcaLogo className="text-xl font-extrabold tracking-tight text-[var(--heading)]" />
          <nav className="hidden md:flex items-center gap-6">
            <a href="#catalogo" className="text-sm font-medium text-[var(--body)] hover:text-[var(--landing-primary)] transition-colors border-b-2 border-transparent hover:border-[var(--landing-primary)]">
              Catálogo
            </a>
            <a href="#nosotros" className="text-sm font-medium text-[var(--body)] hover:text-[var(--landing-primary)] transition-colors border-b-2 border-transparent hover:border-[var(--landing-primary)]">
              Quiénes Somos
            </a>
            <a href="#contacto" className="text-sm font-medium text-[var(--body)] hover:text-[var(--landing-primary)] transition-colors border-b-2 border-transparent hover:border-[var(--landing-primary)]">
              Contacto
            </a>
          </nav>
          <div className="flex items-center gap-3 shrink-0">
            <a
              href="/login"
              className="text-sm text-[var(--body-subtle)] hover:text-[var(--landing-primary)] transition-colors"
            >
              Ingresar
            </a>
            <a
              href={EMPRESA.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--landing-primary)] hover:underline"
            >
              <MessageCircle className="w-4 h-4" />
              WhatsApp
            </a>
          </div>
        </div>
      </header>

      {/* 2. Hero */}
      <section className="py-24 bg-[var(--landing-surface)]">
        <div className="mx-auto px-6" style={{ maxWidth: '1152px' }}>
          <div className="text-center max-w-3xl mx-auto">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-[1.05] tracking-tight text-[var(--heading)] mb-6">
              {EMPRESA.nombre}
            </h1>
            <p className="text-xl leading-relaxed text-[var(--body)] mb-10">
              Venta por mayor (cajas) y al detalle en {EMPRESA.ciudad}.
              Variedad, calidad y los mejores precios para tu negocio.
            </p>
            <a
              href={EMPRESA.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full text-white font-medium text-base shadow-xs transition-all hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--landing-primary)] bg-[var(--landing-primary)]"
            >
              <MessageCircle className="w-5 h-5" />
              Contáctanos por WhatsApp
            </a>
          </div>
        </div>
      </section>

      {/* 3. Catálogo */}
      <section id="catalogo" className="py-24">
        <div className="mx-auto px-6" style={{ maxWidth: '1152px' }}>
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold leading-[1.1] tracking-tight text-[var(--heading)]">
              Nuestros Productos
            </h2>
            <p className="text-lg leading-relaxed text-[var(--body)] max-w-[65ch] mx-auto mt-4">
              Productos disponibles con stock inmediato para tu negocio. Precios en CLP.
            </p>
          </div>
          {!productos?.length ? (
            <div className="text-center text-[var(--body)] py-20 flex flex-col items-center">
              <ShoppingBag className="w-16 h-16 opacity-20 mb-4" />
              <p className="text-xl">No hay productos disponibles en este momento.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {productos.map((p) => (
                <div
                  key={p.id}
                  className="bg-[var(--card)] border border-[var(--border-default)] rounded-[48px] overflow-hidden flex flex-col"
                >
                  <div className="relative aspect-square bg-[var(--muted)]">
                    <ImageWithFallback
                      src={p.imagen_url}
                      codigo={p.codigo}
                      empresaSlug={empresaSlug}
                      fill
                    />
                    {p.es_nuevo && (
                      <div className="absolute top-3 right-3 z-10">
                        <span className="bg-[var(--success)] text-white text-xs font-bold px-3 py-1 rounded-full">
                          NUEVO
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="p-5 flex flex-col flex-1 gap-1.5">
                    <span className="font-mono text-xs text-[var(--body-subtle)] font-semibold">{p.codigo}</span>
                    <h3 className="font-bold text-base leading-tight line-clamp-2 flex-1 text-[var(--heading)]">
                      {p.detalle}
                    </h3>
                    {p.cantcaja > 1 && (
                      <span className="text-xs text-[var(--body)]">
                        Packing: {p.cantcaja} {p.umed}/Caja
                      </span>
                    )}
                    <div className="mt-2 pt-3 border-t border-[var(--border-default)]">
                      <span className="text-[10px] uppercase font-bold text-[var(--body-subtle)] tracking-wider">
                        Precio
                      </span>
                      <div className="text-2xl font-black text-[var(--landing-primary)] leading-none">
                        {formatCLP(p.precio)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {productos.length > 0 && (
            <div className="text-center mt-10">
              <a
                href="/productos"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-medium border border-[var(--border-default)] text-[var(--body)] hover:text-[var(--landing-primary)] hover:border-[var(--landing-primary)] transition-colors shadow-xs"
              >
                Ver catálogo completo
              </a>
            </div>
          )}
        </div>
      </section>

      {/* 4. Quiénes somos */}
      <section id="nosotros" className="py-24 bg-[var(--landing-surface)]">
        <div className="mx-auto px-6" style={{ maxWidth: '1152px' }}>
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold leading-[1.1] tracking-tight text-[var(--heading)] mb-6">
              Quiénes Somos
            </h2>
            <p className="text-lg leading-relaxed text-[var(--body)]">
              {EMPRESA.nombre} es una tienda en {EMPRESA.ciudad} que vende por mayor (cajas) y al detalle.
              Atendemos de {EMPRESA.horario} en {EMPRESA.direccion}.
            </p>
          </div>
        </div>
      </section>

      {/* 5. Contacto */}
      <section id="contacto" className="py-24 bg-background">
        <div className="mx-auto px-6" style={{ maxWidth: '1152px' }}>
          <div className="rounded-[48px] bg-[var(--landing-primary)] px-8 py-16 md:py-20 text-center">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold leading-[1.1] tracking-tight text-white mb-6">
              Contacto
            </h2>
            <p className="text-lg leading-relaxed text-white/90 mb-8 max-w-2xl mx-auto">
              Estamos listos para atenderte. Escríbenos por WhatsApp para consultar precios,
              realizar pedidos o resolver cualquier duda.
            </p>
            <a
              href={EMPRESA.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full text-[var(--landing-primary)] font-medium text-base bg-white shadow-xs transition-all hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/50"
            >
              <MessageCircle className="w-5 h-5" />
              Escríbenos a WhatsApp
            </a>
          </div>
        </div>
      </section>

      {/* 6. Footer */}
      <footer className="bg-[#231F20] py-12 text-sm">
        <div className="mx-auto px-6 text-center" style={{ maxWidth: '1152px' }}>
          <p className="text-white mb-1">© {new Date().getFullYear()} {EMPRESA.razonSocial}</p>
          <p className="text-white/70">{EMPRESA.direccion}, {EMPRESA.ciudad}</p>
          <p className="text-white/70">Horario: {EMPRESA.horario}</p>
          <RedesSociales className="flex justify-center gap-4 text-white/70 mb-5" />
          <div className="flex justify-center gap-4">
            <a
              href={EMPRESA.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-white/70 hover:text-white transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
              WhatsApp {EMPRESA.whatsapp}
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
