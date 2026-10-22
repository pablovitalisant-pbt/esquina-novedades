// Footer compartido para los catálogos públicos (/productos y /catalogo/[slug]).
// Bloque CTA discreto hacia Servicios Digitales PBT. Un único enlace.
export function CatalogFooter() {
  return (
    <div className="border-t border-[var(--border-default)] py-8 px-6 text-center">
      <a
        href="https://www.serviciosdigitalespbt.site/"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block max-w-2xl text-sm leading-relaxed text-[var(--body)] hover:text-[var(--primary)] transition-colors"
      >
        Tú buscas productos para vender. Servicios Digitales PBT construye herramientas para ayudarte a venderlos.
        <span className="block mt-1">
          Este catálogo es solo una de las cosas que podemos hacer por un negocio. ¿Qué podríamos hacer por el tuyo? Descúbrelo →
        </span>
      </a>
    </div>
  );
}
