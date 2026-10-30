import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { sql } from '@/lib/db';
import { TiendaPortada } from '@/components/TiendaPortada';
import flags from '@/config/feature-flags.json';
import { rutaInicio } from '@/lib/ruta-inicio';
import {
  getProductosTienda,
  type CategoriaTienda,
  type OpcionEntregaTienda,
} from '@/lib/tienda-productos';

export const dynamic = 'force-dynamic';

/** Categorías con al menos un producto activo con stock (barra de la portada). */
async function getCategoriasConStock(): Promise<CategoriaTienda[]> {
  const rows = await sql`
    SELECT c.id, c.nombre
    FROM categorias c
    WHERE EXISTS (
      SELECT 1 FROM productos p
      WHERE p.categoria = c.nombre
        AND p.activo = true
        AND p.saldo > 0
    )
    ORDER BY c.nombre ASC
  `;
  return rows as CategoriaTienda[];
}

async function getOpcionesEntregaActivas(): Promise<OpcionEntregaTienda[]> {
  const rows = await sql`
    SELECT codigo, nombre, activa
    FROM opciones_entrega
    WHERE activa = true
    ORDER BY orden ASC, codigo ASC
  `;
  return rows as OpcionEntregaTienda[];
}

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  if (session) {
    redirect(rutaInicio(session.user.rol, flags as Record<string, boolean>));
  }

  const [{ productos, empresaSlug }, categorias, opcionesEntrega] = await Promise.all([
    getProductosTienda(),
    getCategoriasConStock(),
    getOpcionesEntregaActivas(),
  ]);
  return (
    <TiendaPortada
      productos={productos}
      categorias={categorias}
      opcionesEntrega={opcionesEntrega}
      empresaSlug={empresaSlug}
    />
  );
}
