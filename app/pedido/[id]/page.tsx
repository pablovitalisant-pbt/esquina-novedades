import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CircleCheck, CircleX, Clock, Search, ShoppingBag, type LucideIcon } from 'lucide-react';
import { sql } from '@/lib/db';
import { liberarReservasVencidas } from '@/lib/pedidos/liberar-reservas';
import { formatCLP } from '@/lib/utils';
import { CatalogFooter } from '@/components/CatalogFooter';
import { MarcaLogo } from '@/components/MarcaLogo';
import { ConfettiCompra } from '@/components/ConfettiCompra';
import flags from '@/config/feature-flags.json';

export const dynamic = 'force-dynamic';

// UUID como capability URL. Validar antes de consultar evita 22P02.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Tono = 'exito' | 'espera' | 'revision' | 'error';
// Pastel del design-skill (cards.md); el texto va fijo oscuro para contraste también en modo oscuro.
const TONOS: Record<Tono, { fondo: string; icono: LucideIcon; color: string }> = {
  exito: { fondo: '#D9F2D8', icono: CircleCheck, color: '#007A55' },
  espera: { fondo: '#DAEFF8', icono: Clock, color: '#0B6E99' },
  revision: { fondo: '#E0D9F1', icono: Search, color: '#5B3FA8' },
  error: { fondo: '#F2D9DC', icono: CircleX, color: '#B4232A' },
};

const ESTADOS: Record<string, { label: string; titulo: string; mensaje: string; tono: Tono }> = {
  pendiente: { label: 'Pendiente', titulo: 'Recibimos tu pedido', mensaje: 'Recibimos tu pedido.', tono: 'espera' },
  pendiente_pago: { label: 'Pendiente de pago', titulo: 'Tu pedido está reservado', mensaje: 'Tu pedido está reservado. Completa el pago para confirmarlo.', tono: 'espera' },
  pagado: { label: 'Pagado', titulo: '¡Gracias por tu compra', mensaje: 'Recibimos tu pago. Estamos confirmando tu pedido.', tono: 'exito' },
  convertido: { label: 'Confirmado', titulo: '¡Gracias por tu compra', mensaje: 'Tu pedido fue confirmado.', tono: 'exito' },
  rechazado: { label: 'Pago rechazado', titulo: 'El pago fue rechazado', mensaje: 'El pago fue rechazado y la reserva se liberó. Puedes hacer un pedido nuevo.', tono: 'error' },
  expirado: { label: 'Reserva expirada', titulo: 'La reserva venció', mensaje: 'La reserva venció. Puedes hacer un pedido nuevo.', tono: 'error' },
  pagado_tardio: { label: 'Pago recibido', titulo: 'Recibimos tu pago', mensaje: 'Recibimos tu pago. La tienda lo revisará y te contactará.', tono: 'revision' },
  revision: { label: 'Pago en revisión', titulo: 'Estamos revisando tu pago', mensaje: 'Estamos revisando tu pago. La tienda te contactará.', tono: 'revision' },
  descartado: { label: 'Pedido cancelado', titulo: 'Pedido cancelado', mensaje: 'Este pedido fue cancelado.', tono: 'error' },
};

function fechaCorta(valor: string | null): string {
  if (!valor) return '';
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime())
    ? ''
    : fecha.toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' });
}

function cantidadTexto(cantidad: number, modalidad: string): string {
  const plural = cantidad !== 1;
  const base = `${cantidad} ${plural ? 'unidades' : 'unidad'}`;
  return modalidad === 'mayor' ? `${base} (precio mayor)` : base;
}

// Entrada escalonada (layout.md: un solo momento orquestado), desactivada con reduced motion.
const ANIMACION = `
@keyframes pedido-entrada { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
.pedido-entrada { animation: pedido-entrada 480ms cubic-bezier(.2,.8,.2,1) both; }
@media (prefers-reduced-motion: reduce) { .pedido-entrada { animation: none; } }
`;

/**
 * Slice 9d — estado público del pedido. Solo nombre, estado, fecha, ítems,
 * entrega, costo y total: nunca teléfono, email ni dirección.
 */
export default async function PedidoPage({ params }: { params: Promise<{ id: string }> }) {
  const id = (await params)?.id ?? '';
  if (!UUID_RE.test(id)) notFound();

  try {
    // Misma política que el catálogo: una falla no puede tumbar la página.
    await liberarReservasVencidas();
  } catch (error) {
    console.error('liberarReservasVencidas (pedido):', error);
  }

  const [pedido] = await sql`
    SELECT p.id, p.nombre_contacto, p.estado, p.created_at::text, p.total,
           p.entrega_codigo, p.entrega_costo, p.mp_init_point, p.expira_en::text,
           o.nombre AS entrega_nombre
    FROM public.pedidos p
    LEFT JOIN public.opciones_entrega o ON o.codigo = p.entrega_codigo
    WHERE p.id = ${id}
  `;
  if (!pedido) notFound();

  const items = await sql`
    SELECT codigo, detalle, cantidad, modalidad, precio, precio_lista, subtotal
    FROM public.pedido_items
    WHERE pedido_id = ${id}
    ORDER BY created_at
  `;

  const estado = ESTADOS[pedido.estado] ?? { label: pedido.estado, titulo: 'Tu pedido', mensaje: '', tono: 'espera' as Tono };
  const tono = TONOS[estado.tono];
  const Icono = tono.icono;
  const exito = estado.tono === 'exito';
  const titulo = exito ? `${estado.titulo}, ${pedido.nombre_contacto}!` : estado.titulo;
  const numero = `#${String(pedido.id).slice(0, 8).toUpperCase()}`;
  const entregaCosto = Number(pedido.entrega_costo) || 0;
  const vencido = !pedido.expira_en || new Date(pedido.expira_en).getTime() <= Date.now();
  const puedePagar = pedido.estado === 'pendiente_pago' && !!pedido.mp_init_point && !vencido;
  const confetti = flags['pedido-confetti'] === true && ['pagado', 'convertido'].includes(pedido.estado);
  const ahorroTotal = (items as Array<{
    cantidad: number | string;
    precio: number | string;
    precio_lista?: number | string | null;
  }>).reduce((acc, item) => {
    const lista = item.precio_lista == null ? null : Number(item.precio_lista);
    const precio = Number(item.precio);
    return lista != null && lista > precio ? acc + (lista - precio) * Number(item.cantidad) : acc;
  }, 0);

  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)] font-sans text-[var(--body)]">
      <style>{ANIMACION}</style>
      {confetti && <ConfettiCompra />}

      <header className="border-b border-[var(--border-default)]">
        <div className="mx-auto flex h-16 items-center justify-between gap-4 px-6" style={{ maxWidth: '1152px' }}>
          <MarcaLogo className="text-lg font-bold text-[var(--heading)]" />
          <Link href="/productos" className="inline-flex items-center gap-1 text-sm text-[var(--body-subtle)] transition-colors hover:text-[var(--primary)]">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Volver a la tienda
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-12">
        <section className="pedido-entrada flex flex-col items-center gap-4 rounded-[48px] px-6 py-10 text-center" style={{ background: tono.fondo, color: '#231F20' }}>
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-white" style={{ color: tono.color }}>
            <Icono className="h-7 w-7" aria-hidden="true" />
          </span>
          <span className="rounded-full border border-[#231F201A] bg-white/70 px-2 py-1 text-sm font-medium">{estado.label}</span>
          <h1 className="text-[28px] font-bold leading-[1.1] tracking-tight md:text-[36px]">{titulo}</h1>
          {estado.mensaje && <p className="max-w-md text-lg text-[#231F20CC]">{estado.mensaje}</p>}
          <p className="text-sm text-[#231F2099]">
            Pedido <span className="font-mono font-semibold">{numero}</span>
            {!exito && <> · {pedido.nombre_contacto}</>} · {fechaCorta(pedido.created_at)}
          </p>
        </section>

        <section className="pedido-entrada flex flex-col gap-3 rounded-[48px] border border-[var(--border-default)] bg-[var(--card)] p-8" style={{ animationDelay: '120ms' }}>
          <h2 className="inline-flex items-center gap-2 text-xl font-bold text-[var(--heading)]">
            <ShoppingBag className="h-5 w-5 text-[var(--primary)]" aria-hidden="true" />
            Tu compra
          </h2>
          <ul className="flex flex-col divide-y divide-[var(--border-default)]">
            {(items as Array<{
              codigo: string;
              detalle: string | null;
              cantidad: number | string;
              modalidad: string | null;
              precio: number | string;
              precio_lista?: number | string | null;
              subtotal?: number | string | null;
            }>).map((item, i) => {
              const subtotal = item.subtotal ?? Number(item.precio) * Number(item.cantidad);
              const lista = item.precio_lista == null ? null : Number(item.precio_lista);
              const conDescuento = lista != null && lista > Number(item.precio);
              return (
                <li key={i} className="flex items-start justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="font-medium text-[var(--heading)]">{item.detalle ?? item.codigo}</p>
                    <p className="text-sm text-[var(--body-subtle)]">
                      {cantidadTexto(Number(item.cantidad), item.modalidad ?? '')} · <span className="font-mono text-xs">{item.codigo}</span>
                      {conDescuento && (
                        <>
                          {' '}· <span className="line-through">{formatCLP(lista)}</span>{' '}
                          <span className="font-semibold text-[var(--success)]">Descuento especial</span>
                        </>
                      )}
                    </p>
                  </div>
                  <span className="shrink-0 font-medium">{formatCLP(Number(subtotal))}</span>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-col gap-2 border-t border-[var(--border-default)] pt-3 text-sm">
            {pedido.entrega_codigo && (
              <div className="flex justify-between gap-4">
                <span className="text-[var(--body-subtle)]">Entrega: {pedido.entrega_nombre ?? pedido.entrega_codigo}</span>
                <span>{entregaCosto > 0 ? formatCLP(entregaCosto) : 'Sin costo'}</span>
              </div>
            )}
            {ahorroTotal > 0 && (
              <div className="font-semibold text-[var(--success)]">Ahorraste {formatCLP(ahorroTotal)}</div>
            )}
            <div className="flex items-baseline justify-between gap-4 pt-1 font-bold text-[var(--heading)]">
              <span className="text-base">Total</span>
              <span className="text-2xl font-black text-[var(--primary)]">{formatCLP(Number(pedido.total))}</span>
            </div>
          </div>
        </section>

        <div className="pedido-entrada flex flex-col gap-3" style={{ animationDelay: '240ms' }}>
          {puedePagar ? (
            <a
              href={pedido.mp_init_point}
              className="inline-flex h-12 items-center justify-center rounded-[var(--radius-pill)] bg-[var(--primary)] px-6 text-base font-medium text-[var(--primary-foreground)] transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
            >
              Pagar con Mercado Pago
            </a>
          ) : (
            <Link
              href="/productos"
              className="inline-flex h-12 items-center justify-center rounded-[var(--radius-pill)] border border-transparent bg-[var(--accent)] px-6 text-base font-medium text-[var(--accent-foreground)] shadow-[0_2px_4px_0_rgb(0_0_0/0.04)] transition hover:brightness-95 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            >
              Seguir comprando
            </Link>
          )}
        </div>
      </main>

      <CatalogFooter />
    </div>
  );
}
