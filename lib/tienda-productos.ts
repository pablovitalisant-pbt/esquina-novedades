import { sql } from '@/lib/db';
import { EMPRESA } from '@/lib/empresa';
import { liberarReservasVencidas } from '@/lib/pedidos/liberar-reservas';

/** Producto público de la tienda: un renglón por código con stock. */
export type ProductoTienda = {
  codigo: string;
  id: number;
  detalle: string | null;
  imagen_url: string | null;
  categoria: string | null;
  precio: number;
  precio_mayor: number | null;
  minimo_mayor: number | null;
  saldo: number;
  es_nuevo: boolean;
};

export type CategoriaTienda = { id: string; nombre: string };

export type OpcionEntregaTienda = {
  codigo: string;
  nombre: string;
  activa?: boolean;
};

type ProductoRow = {
  codigo: string;
  id: number;
  detalle: string | null;
  imagen_url: string | null;
  categoria: string | null;
  precio: string;
  precio_mayor: string | null;
  minimo_mayor: string | null;
  saldo: string;
  es_nuevo: boolean;
};

/**
 * Consulta compartida por "/" (portada v2) y "/productos": liberación perezosa
 * de reservas + productos activos con stock agregado por código.
 */
export async function getProductosTienda(): Promise<{
  productos: ProductoTienda[];
  empresaSlug: string;
}> {
  // Slice 8c: una falla de liberación no puede tumbar la tienda.
  try {
    await liberarReservasVencidas();
  } catch (error) {
    console.error('liberarReservasVencidas (tienda):', error);
  }

  const [empresa] = await sql`SELECT slug FROM empresas WHERE id = 1 LIMIT 1`;
  const empresaSlug: string = (empresa as { slug?: string } | undefined)?.slug ?? EMPRESA.slug;

  const rows = await sql`
    SELECT
      codigo,
      MAX(id) as id,
      MAX(detalle) as detalle,
      MAX(imagen_url) as imagen_url,
      MAX(categoria) as categoria,
      MAX(prcventa) as precio,
      MAX(precio_mayor) as precio_mayor,
      MAX(minimo_mayor) as minimo_mayor,
      SUM(saldo) as saldo,
      BOOL_OR(es_nuevo) as es_nuevo
    FROM productos
    WHERE empresa_id = 1
      AND activo = true
    GROUP BY codigo
    HAVING SUM(saldo) > 0
    ORDER BY codigo ASC
  `;

  const productos = (rows as ProductoRow[]).map((r) => ({
    ...r,
    saldo: parseInt(r.saldo),
    precio: parseFloat(r.precio),
    precio_mayor: r.precio_mayor == null ? null : parseFloat(r.precio_mayor),
    minimo_mayor: r.minimo_mayor == null ? null : parseInt(r.minimo_mayor),
    es_nuevo: Boolean(r.es_nuevo),
  }));

  return { productos, empresaSlug };
}
