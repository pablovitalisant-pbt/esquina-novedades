import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { CategoriasClient, type Categoria } from "./client_page";
import { UserSession } from "@/types";

export default async function CategoriasPage() {
  const session = await getServerSession(authOptions);

  if (!session || !['admin', 'vendedor'].includes((session.user as UserSession).rol)) {
    redirect('/dashboard');
  }

  const categorias = await sql`
    SELECT c.id, c.nombre, c.created_at,
           COUNT(DISTINCT p.codigo)::int as total_productos
    FROM categorias c
    LEFT JOIN productos p ON p.categoria = c.nombre AND p.activo = true
    GROUP BY c.id, c.nombre, c.created_at
    ORDER BY c.nombre ASC
  `;

  return <CategoriasClient categorias={categorias as Categoria[]} />;
}
