import { normalizar } from './normalizar';

type Filtrable = { codigo: string; detalle?: string | null; categoria?: string | null };

/** Filtro compartido por la portada y el catálogo: categoría + búsqueda por detalle/código. */
export function filtrarProductos<T extends Filtrable>(
  items: T[],
  { categoria, busqueda }: { categoria: string | null; busqueda: string },
): T[] {
  let out = items;
  if (categoria) out = out.filter((p) => p.categoria === categoria);
  const q = normalizar(busqueda);
  if (q) {
    out = out.filter((p) => normalizar(p.detalle ?? '').includes(q) || normalizar(p.codigo).includes(q));
  }
  return out;
}
