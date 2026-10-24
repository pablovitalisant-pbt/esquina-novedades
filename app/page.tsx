import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { sql } from '@/lib/db';
import { EMPRESA } from '@/lib/empresa';
import { getLatestIngresoRealCodigos } from '@/utils/catalogo-ingreso';
import { LandingPage } from '@/components/LandingPage';

export const dynamic = 'force-dynamic';

type LandingRow = {
  codigo: string;
  id: number;
  detalle: string | null;
  imagen_url: string | null;
  cantcaja: string;
  umed: string;
  precio: string;
  saldo: string;
  es_nuevo: boolean;
};

function mapRows(rows: unknown[]) {
  return (rows as LandingRow[]).map((r) => ({
    ...r,
    saldo: parseInt(r.saldo),
    precio: parseFloat(r.precio),
    cantcaja: parseInt(r.cantcaja),
    es_nuevo: Boolean(r.es_nuevo),
  }));
}

async function getLandingProductos() {
  const [empresa] = await sql`SELECT slug FROM empresas WHERE id = 1 LIMIT 1`;
  const empresaSlug: string = empresa?.slug ?? EMPRESA.slug;

  const latestCodigos = await getLatestIngresoRealCodigos(sql, 1);

  if (latestCodigos.size > 0) {
    const codigos = [...latestCodigos];
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
        AND UPPER(codigo) = ANY(${codigos})
      GROUP BY codigo
      HAVING SUM(saldo) > 0
      ORDER BY codigo ASC
      LIMIT 8
    `;
    return { productos: mapRows(rows), empresaSlug };
  }

  // Fallback: sin ingresos registrados, primeros 8 con stock
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
    LIMIT 8
  `;
  return { productos: mapRows(rows), empresaSlug };
}

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  if (session) {
    redirect('/precios');
  }

  const { productos, empresaSlug } = await getLandingProductos();
  return <LandingPage productos={productos} empresaSlug={empresaSlug} />;
}
