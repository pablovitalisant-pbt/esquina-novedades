import { sql } from '@/lib/db';
import { ProductosPublicos } from './client_page';

export const dynamic = 'force-dynamic';

async function getProductos() {
  const [empresa] = await sql`SELECT slug FROM empresas WHERE id = 1 LIMIT 1`;
  const empresaSlug: string = empresa?.slug ?? 'bazar-naty';

  const rows = await sql`
    SELECT
      codigo,
      MAX(id) as id,
      MAX(detalle) as detalle,
      MAX(imagen_url) as imagen_url,
      MAX(cantcaja) as cantcaja,
      MAX(umed) as umed,
      MAX(prcventa) as precio,
      SUM(saldo) as saldo,
      BOOL_OR(es_nuevo) as es_nuevo
    FROM productos
    WHERE empresa_id = 1
      AND activo = true
    GROUP BY codigo
    HAVING SUM(saldo) > 0
    ORDER BY codigo ASC
  `;
  const productos = rows.map((r: any) => ({
    ...r,
    saldo: parseInt(r.saldo),
    precio: parseFloat(r.precio),
    cantcaja: parseInt(r.cantcaja),
    es_nuevo: Boolean(r.es_nuevo),
  }));
  return { productos, empresaSlug };
}

export default async function ProductosPage() {
  const { productos, empresaSlug } = await getProductos();
  return <ProductosPublicos productos={productos} empresaSlug={empresaSlug} />;
}
