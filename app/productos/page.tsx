import { sql } from '@/lib/db';
import { EMPRESA } from '@/lib/empresa';
import { liberarReservasVencidas } from '@/lib/pedidos/liberar-reservas';
import { ProductosPublicos } from './client_page';

export const dynamic = 'force-dynamic';

async function getProductos() {
  // Slice 8c: liberación perezosa; una falla no puede tumbar la tienda.
  try {
    await liberarReservasVencidas();
  } catch (error) {
    console.error('liberarReservasVencidas (productos):', error);
  }

  const [empresa] = await sql`SELECT slug FROM empresas WHERE id = 1 LIMIT 1`;
  const empresaSlug: string = empresa?.slug ?? EMPRESA.slug;

  const rows = await sql`
    SELECT
      codigo,
      MAX(id) as id,
      MAX(detalle) as detalle,
      MAX(imagen_url) as imagen_url,
      MAX(cantcaja) as cantcaja,
      MAX(umed) as umed,
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
  const productos = (rows as Array<{
    codigo: string;
    id: number;
    detalle: string | null;
    imagen_url: string | null;
    cantcaja: string;
    umed: string;
    precio: string;
    precio_mayor: string | null;
    minimo_mayor: string | null;
    saldo: string;
    es_nuevo: boolean;
  }>).map((r) => ({
    ...r,
    saldo: parseInt(r.saldo),
    precio: parseFloat(r.precio),
    precio_mayor: r.precio_mayor == null ? null : parseFloat(r.precio_mayor),
    minimo_mayor: r.minimo_mayor == null ? null : parseInt(r.minimo_mayor),
    cantcaja: parseInt(r.cantcaja),
    es_nuevo: Boolean(r.es_nuevo),
  }));
  return { productos, empresaSlug };
}

export default async function ProductosPage() {
  const { productos, empresaSlug } = await getProductos();
  return <ProductosPublicos productos={productos} empresaSlug={empresaSlug} />;
}
