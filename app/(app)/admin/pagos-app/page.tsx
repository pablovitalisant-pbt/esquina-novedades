import { getServerSession } from 'next-auth';
import { notFound } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { rolPagosApp } from '@/lib/pagos-app/acceso';
import { leerResumenPagosApp } from '@/lib/pagos-app/resumen';
import { formatCLP } from '@/lib/utils';

/** '2026-10-01' → '01-10-2026', sin pasar por Date (evita corrimiento de zona). */
function fechaDMY(fecha: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : fecha;
}

export default async function PagosAppPage() {
  const session = await getServerSession(authOptions);
  if (!rolPagosApp(session)) notFound();

  const resumen = await leerResumenPagosApp();
  if (!resumen) {
    return (
      <main className="mx-auto max-w-[1152px] px-6 py-12">
        <h1 className="text-2xl font-bold text-[var(--heading)]">Pagos privados</h1>
        <p className="mt-4 text-[var(--body)]">Falta configurar el total del registro (PAGOS_APP_TOTAL_CLP).</p>
      </main>
    );
  }

  const cifras = [
    { etiqueta: 'Total', valor: resumen.total },
    { etiqueta: 'Abonado', valor: resumen.abonado },
    { etiqueta: 'Saldo', valor: resumen.saldo },
  ];

  return (
    <main className="mx-auto flex max-w-[1152px] flex-col gap-6 px-6 py-12">
      <h1 className="text-2xl font-bold text-[var(--heading)] md:text-3xl">Pagos privados</h1>

      <section className="rounded-[48px] border border-[var(--border-default)] bg-[var(--card)] p-8">
        <div className="grid gap-6 sm:grid-cols-3">
          {cifras.map(({ etiqueta, valor }) => (
            <div key={etiqueta}>
              <p className="text-sm font-medium text-[var(--body-subtle)]">{etiqueta}</p>
              <p className="text-2xl font-bold text-[var(--heading)]">{formatCLP(valor)}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 flex items-center gap-4">
          <div role="progressbar" aria-label="Progreso de pagos" aria-valuemin={0} aria-valuemax={100}
            aria-valuenow={resumen.progreso} aria-valuetext={`${resumen.progreso}%`}
            className="h-3 flex-1 overflow-hidden rounded-full bg-[var(--muted)]">
            <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${resumen.progreso}%` }} />
          </div>
          <span className="text-sm font-medium text-[var(--body)]">{resumen.progreso}%</span>
        </div>
      </section>

      <section className="rounded-[48px] border border-[var(--border-default)] bg-[var(--card)] p-8">
        <h2 className="text-xl font-bold text-[var(--heading)]">Historial</h2>
        {resumen.pagos.length === 0 ? (
          <p className="mt-4 text-[var(--body-subtle)]">Todavía no hay pagos registrados.</p>
        ) : (
          <ul className="mt-4 divide-y divide-[var(--border-default)]">
            {resumen.pagos.map((pago) => (
              <li key={pago.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-[var(--heading)]">{pago.detalle}</p>
                  <p className="text-sm text-[var(--body-subtle)]">
                    {fechaDMY(pago.fecha)} · {pago.medio === 'transferencia' ? 'Transferencia' : 'Efectivo'}
                    {pago.reversa_de && ' · Reversa'}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-semibold text-[var(--heading)]">{formatCLP(pago.monto_clp)}</span>
                  {pago.tiene_comprobante && (
                    <a href={`/api/admin/pagos-app/${pago.id}/comprobante`}
                      className="text-sm font-medium text-[var(--primary)] underline hover:no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]">
                      Ver comprobante
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
