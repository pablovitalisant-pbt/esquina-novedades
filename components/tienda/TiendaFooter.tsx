import Link from 'next/link';
import { EMPRESA } from '@/lib/empresa';
import { MessageCircle } from 'lucide-react';

/** Footer compartido por las páginas públicas de la tienda. */
export function TiendaFooter() {
  const redes = Object.entries(EMPRESA.redes).filter(([, url]) => Boolean(url));
  return (
    <footer className="bg-[#21002F] text-[#FFF8EA] mt-6">
      <div
        className="mx-auto px-4 py-8 grid gap-6 sm:grid-cols-3 text-sm"
        style={{ maxWidth: '1152px' }}
      >
        <div>
          <p className="font-serif text-lg font-bold text-[#F2B936]">{EMPRESA.nombre}</p>
          <p className="text-[#FFF8EA]/80 mt-1">
            {EMPRESA.direccion}, {EMPRESA.ciudad}
          </p>
          <p className="text-[#FFF8EA]/80">Horario: {EMPRESA.horario}</p>
        </div>
        <div>
          <p className="font-semibold text-[#FFE6A0] mb-1">Contacto</p>
          <a
            href={EMPRESA.whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[#FFF8EA]/80 hover:text-white"
          >
            <MessageCircle className="w-4 h-4" aria-hidden />
            WhatsApp {EMPRESA.whatsapp}
          </a>
        </div>
        <div>
          <p className="font-semibold text-[#FFE6A0] mb-1">Medios de pago</p>
          <p className="text-[#FFF8EA]/80">Mercado Pago</p>
          {redes.length > 0 && (
            <div className="mt-2 flex gap-3">
              {redes.map(([red, url]) => (
                <a
                  key={red}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#FFF8EA]/80 hover:text-white capitalize"
                >
                  {red}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="border-t border-white/15">
        <div className="mx-auto px-4 py-3 text-center" style={{ maxWidth: '1152px' }}>
          <Link href="/login" className="text-xs text-[#FFE6A0]/70 hover:text-[#FFE6A0] transition-colors">
            Acceso equipo
          </Link>
        </div>
      </div>
    </footer>
  );
}
