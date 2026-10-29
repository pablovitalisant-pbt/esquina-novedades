'use client';

export type CategoriaBarra = { id: string; nombre: string };

/** Barra de categorías compartida. No se renderiza si no hay categorías. */
export function BarraCategorias({
  categorias,
  categoria,
  onCategoria,
}: {
  categorias: CategoriaBarra[];
  categoria: string | null;
  onCategoria: (nombre: string | null) => void;
}) {
  if (categorias.length === 0) return null;
  return (
    <nav
      data-testid="barra-categorias"
      aria-label="Categorías"
      className="bg-[var(--card)] border-b border-[var(--border-default)] overflow-x-auto"
    >
      <div className="mx-auto px-3 py-2 flex gap-2 w-max min-w-full" style={{ maxWidth: '1152px' }}>
        <button type="button" onClick={() => onCategoria(null)} className={botonCategoria(categoria === null)}>
          Todas
        </button>
        {categorias.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onCategoria(categoria === c.nombre ? null : c.nombre)}
            className={botonCategoria(categoria === c.nombre)}
          >
            {c.nombre}
          </button>
        ))}
      </div>
    </nav>
  );
}

export function botonCategoria(activo: boolean): string {
  return [
    'shrink-0 rounded-full px-3.5 h-8 text-sm font-medium border transition-colors',
    activo
      ? 'bg-[var(--primary)] text-[var(--primary-foreground)] border-[var(--primary)]'
      : 'bg-[var(--card)] text-[var(--body)] border-[var(--border-default)] hover:border-[var(--primary)]',
  ].join(' ');
}
