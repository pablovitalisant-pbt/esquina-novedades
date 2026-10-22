import { sql as sqlType } from "@/lib/db";

// Single-tenant (migración 018). Sin filtro empresa_id.
export async function getLatestIngresoRealCodigos(
  sql: typeof sqlType,
  topN: number = 1
): Promise<Set<string>> {

  const latestYear = await sql`
    SELECT SPLIT_PART(nroingreso,'-',2) as anio
    FROM productos
    WHERE nroingreso IS NOT NULL
      AND nroingreso NOT LIKE 'INICIAL%'
      AND SPLIT_PART(nroingreso,'-',1) = '101'
    ORDER BY SPLIT_PART(nroingreso,'-',2) DESC
    LIMIT 1
  `;

  const anio = latestYear[0]?.anio as string | undefined;
  if (!anio) return new Set();

  const folioRows = await sql`
    SELECT SPLIT_PART(nroingreso,'-',3) as folio
    FROM productos
    WHERE nroingreso IS NOT NULL
      AND nroingreso NOT LIKE 'INICIAL%'
      AND SPLIT_PART(nroingreso,'-',1) = '101'
      AND SPLIT_PART(nroingreso,'-',2) = ${anio}
    GROUP BY SPLIT_PART(nroingreso,'-',3)
    ORDER BY SPLIT_PART(nroingreso,'-',3)::integer DESC
    LIMIT ${topN}
  `;

  if (folioRows.length === 0) return new Set();

  const resultSet = new Set<string>();
  for (const { folio } of folioRows) {
    const pattern = `101-${anio}-${folio}-%`;
    const codigoRows = await sql`SELECT DISTINCT UPPER(codigo) as codigo FROM productos WHERE nroingreso LIKE ${pattern}`;
    for (const r of codigoRows) {
      resultSet.add(r.codigo as string);
    }
  }

  return resultSet;
}
