import { puedeVenderMayor } from '@/lib/precio-mayor';
import type { ProductoTienda } from '@/lib/tienda-productos';

export const TEXTO_BANNER_FIJO = 'Hogar, regalos, juguetes y más · Por mayor y por menor';

export type SeccionCategoria = { nombre: string; productos: ProductoTienda[] };

export type PortadaAuto = {
  novedades: ProductoTienda[];
  secciones: SeccionCategoria[];
  porMayor: ProductoTienda[];
  destacados: ProductoTienda[];
  tituloBanner: string;
};

const tiempo = (p: { fecha_ingreso: string | null }) =>
  p.fecha_ingreso ? new Date(p.fecha_ingreso).getTime() : -Infinity;

/** Más recientes primero; sin fecha al final; desempate id DESC (siempre). */
export function compararRecientes<T extends { id: number; fecha_ingreso: string | null }>(a: T, b: T): number {
  const ta = tiempo(a);
  const tb = tiempo(b);
  if (ta !== tb) return tb - ta;
  return b.id - a.id;
}

export const ordenRecientes = <T extends { id: number; fecha_ingreso: string | null }>(items: T[]): T[] =>
  [...items].sort(compararRecientes);

/** Novedades: Destacados primero, luego orden de recientes. */
export const compararNovedades = <T extends { id: number; fecha_ingreso: string | null; es_nuevo: boolean }>(
  a: T,
  b: T,
): number => Number(b.es_nuevo) - Number(a.es_nuevo) || compararRecientes(a, b);

export const ordenNovedades = <T extends { id: number; fecha_ingreso: string | null; es_nuevo: boolean }>(
  items: T[],
): T[] => [...items].sort(compararNovedades);

/** Ahorro por mayor: precio por mayor válido + mínimo entero > 0. */
export const esOfertaMayor = (p: ProductoTienda): boolean =>
  puedeVenderMayor(p) && Number.isInteger(p.minimo_mayor) && (p.minimo_mayor as number) > 0;

/** Arma todas las secciones de la portada. Recibe productos ya filtrados con stock. */
export function armarPortada(productos: ProductoTienda[]): PortadaAuto {
  const recientes = ordenRecientes(productos);

  // Secciones por categoría (solo categorías con productos con stock).
  const porCategoria = new Map<string, ProductoTienda[]>();
  for (const p of recientes) {
    if (!p.categoria) continue;
    porCategoria.set(p.categoria, [...(porCategoria.get(p.categoria) ?? []), p]);
  }
  const secciones = [...porCategoria.entries()]
    .map(([nombre, items]) => ({ nombre, total: items.length, productos: items.slice(0, 10) }))
    .sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre, 'es'))
    .map(({ nombre, productos }) => ({ nombre, productos }));

  const conFoto = recientes.filter((p) => p.imagen_url);
  const sinFoto = recientes.filter((p) => !p.imagen_url);
  const destacados = [...conFoto, ...sinFoto].slice(0, 3);

  const nombres = secciones.slice(0, 3).map((s) => s.nombre);
  const tituloBanner = nombres.length
    ? `${nombres.join(', ')} y más · Por mayor y por menor`
    : TEXTO_BANNER_FIJO;

  return {
    novedades: ordenNovedades(productos).slice(0, 12),
    secciones,
    porMayor: recientes.filter(esOfertaMayor),
    destacados,
    tituloBanner,
  };
}
