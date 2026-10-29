/**
 * Franja superior de beneficios reales. En móvil es UNA línea fija con scroll
 * horizontal (sin barra visible); desde sm se reparte como antes.
 */
export function FranjaBeneficios({ nombresEntrega }: { nombresEntrega?: string }) {
  return (
    <div className="bg-[#F2B936] text-[#21002F]">
      <div
        data-testid="franja-beneficios"
        className="mx-auto px-3 flex items-center gap-2 h-8 overflow-x-auto whitespace-nowrap text-[11px] font-semibold [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:h-auto sm:flex-wrap sm:justify-center sm:gap-x-4 sm:gap-y-0.5 sm:overflow-visible sm:px-3 sm:py-1.5 sm:text-xs sm:text-center"
        style={{ maxWidth: '1152px' }}
      >
        <span className="shrink-0 sm:shrink">Pago seguro con Mercado Pago</span>
        {nombresEntrega && (
          <>
            <span className="shrink-0 sm:hidden" aria-hidden>·</span>
            <span className="shrink-0 sm:shrink">{nombresEntrega}</span>
          </>
        )}
        <span className="shrink-0 sm:hidden" aria-hidden>·</span>
        <span className="shrink-0 sm:shrink">Precios por mayor y por menor</span>
      </div>
    </div>
  );
}
