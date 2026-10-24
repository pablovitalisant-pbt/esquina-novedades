import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";
import { CajaMayorClient } from "./client_page";
import { redirect } from "next/navigation";
import { Cuenta, UserSession } from "@/types";

export default async function CajaMayorPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  // Caja Mayor es solo admin (vendedor tiene el resto de ventas)
  const user = session.user as UserSession & { name?: string | null };
  if (user.rol !== "admin") {
    redirect("/dashboard");
  }

  // Fetch active accounts for the dropdown
  const cuentas = await sql`
    SELECT id, nombre, activa, orden, created_at::text
    FROM caja_cuentas
    WHERE activa = true
    ORDER BY orden ASC, id ASC
  `;

  return (
    <CajaMayorClient
      cuentas={cuentas as Cuenta[]}
      userName={user.nombre || user.name || ""}
      userRol={user.rol || ""}
      userId={parseInt(user.id, 10)}
    />
  );
}
