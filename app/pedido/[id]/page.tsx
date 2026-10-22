import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { liberarReservasVencidas } from '@/lib/pedidos/liberar-reservas';
import { formatCLP } from '@/lib/utils';

export const dynamic = 'force-dynamic';

// UUID como capability URL. Validar antes de consultar evita 22P02.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ESTADOS: Record<string, { label: string; mensaje: string }> = {
  pendiente: { label: 'Pendiente', mensaje: 'Recibimos tu pedido.' },
  pendiente_pago: { label: 'Pendiente de pago', mensaje: 'Tu pedido está reservado. Completa el pago para confirmarlo.' },
  pagado: { label: 'Pagado', mensaje: 'Recibimos tu pago. Estamos confirmando tu pedido.' },
  convertido: { label: 'Confirmado', mensaje: 'Tu pedido fue confirmado.' },
  rechazado: { label: 'Pago rechazado', mensaje: 'El pago fue rechazado y la reserva se liberó. Puedes hacer un pedido nuevo.' },
  expirado: { label: 'Reserva expirada', mensaje: 'La reserva venció. Puedes hacer un pedido nuevo.' },
  pagado_tardio: { label: 'Pago recibido', mensaje: 'Recibimos tu pago. La tienda lo revisará y te contactará.' },
  revision: { label: 'Pago en revisión', mensaje: 'Estamos revisando tu pago. La tienda te contactará.' },
  descartado: { label: 'Pedido cancelado', mensaje: 'Este pedido fue cancelado.' },
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
  if (modalidad === 'caja') return `${cantidad} ${plural ? 'cajas' : 'caja'}`;
  return `${cantidad} ${plural ? 'unidades' : 'unidad'}`;
}

/**
 * Slice 9d — estado público del pedido. Solo nombre, estado, fecha, ítems,
 * entrega, costo y total: nunca teléfono, email ni dirección.
 */
export default async function PedidoPage({ params }: { params: { id: string } }) {
  const id = params?.id ?? '';
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
    SELECT codigo, detalle, cantidad, modalidad, precio, subtotal
    FROM public.pedido_items
    WHERE pedido_id = ${id}
    ORDER BY created_at
  `;

  const estado = ESTADOS[pedido.estado] ?? { label: pedido.estado, mensaje: '' };
  const entregaCosto = Number(pedido.entrega_costo) || 0;
  const vencido = !pedido.expira_en || new Date(pedido.expira_en).getTime() <= Date.now();
  const puedePagar = pedido.estado === 'pendiente_pago' && !!pedido.mp_init_point && !vencido;

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--body)]">
      <div className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-16">
        <header className="flex flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-[0.4px] text-[var(--body-subtle)]">Pedido</p>
          <h1 className="text-3xl font-bold text-[var(--heading)] md:text-4xl">{pedido.nombre_contacto}</h1>
          <p className="text-sm text-[var(--body-subtle)]">{fechaCorta(pedido.created_at)}</p>
        </header>

        <section className="flex flex-col gap-3 rounded-[var(--radius-overlay)] border border-[var(--border-default)] bg-[var(--card)] p-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-bold text-[var(--heading)]">Estado</h2>
            <span className="rounded-full bg-[var(--muted)] px-3 py-1 text-sm font-medium text-[var(--heading)]">
              {estado.label}
            </span>
          </div>
          {estado.mensaje && <p className="text-sm">{estado.mensaje}</p>}
        </section>

        <section className="flex flex-col gap-3 rounded-[var(--radius-overlay)] border border-[var(--border-default)] bg-[var(--card)] p-6">
          <h2 className="text-xl font-bold text-[var(--heading)]">Productos</h2>
          <ul className="flex flex-col divide-y divide-[var(--border-default)]">
            {items.map((item: any, i: number) => {
              const subtotal = item.subtotal ?? Number(item.precio) * Number(item.cantidad);
              return (
                <li key={i} className="flex items-start justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="font-medium text-[var(--heading)]">{item.detalle ?? item.codigo}</p>
                    <p className="text-sm text-[var(--body-subtle)]">
                      {cantidadTexto(Number(item.cantidad), item.modalidad)} · <span className="font-mono text-xs">{item.codigo}</span>
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
                <span className="text-[var(--body-subtle)]">
                  Entrega: {pedido.entrega_nombre ?? pedido.entrega_codigo}
                </span>
                <span>{entregaCosto > 0 ? formatCLP(entregaCosto) : 'Sin costo'}</span>
              </div>
            )}
            <div className="flex justify-between gap-4 text-base font-bold text-[var(--heading)]">
              <span>Total</span>
              <span>{formatCLP(Number(pedido.total))}</span>
            </div>
          </div>
        </section>

        {puedePagar && (
          <a
            href={pedido.mp_init_point}
            className="inline-flex h-12 items-center justify-center rounded-[var(--radius-pill)] bg-[var(--primary)] px-6 text-base font-medium text-[var(--primary-foreground)] transition-opacity hover:opacity-90"
          >
            Pagar con Mercado Pago
          </a>
        )}
      </div>
    </main>
  );
}
