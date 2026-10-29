import { EMPRESA } from '@/lib/empresa';
import { ShieldCheck, Truck, CreditCard } from 'lucide-react';

/** Franja de confianza con datos reales de EMPRESA. */
export function FranjaConfianza({ hayRetiro }: { hayRetiro: boolean }) {
  return (
    <section className="bg-[var(--muted)] border-b border-[var(--border-default)]">
      <div
        className="mx-auto px-4 py-4 grid gap-3 sm:grid-cols-3 text-sm text-[var(--body)]"
        style={{ maxWidth: '1152px' }}
      >
        <p className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-[var(--primary)] shrink-0" aria-hidden />
          Pago seguro Mercado Pago
        </p>
        {hayRetiro && (
          <p className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-[var(--primary)] shrink-0" aria-hidden />
            Retiro en tienda {EMPRESA.direccion}, {EMPRESA.ciudad}
          </p>
        )}
        <p className="flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-[var(--primary)] shrink-0" aria-hidden />
          Atención por WhatsApp {EMPRESA.whatsapp}
        </p>
      </div>
    </section>
  );
}
