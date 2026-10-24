import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { CajaConfigClient } from "./client_page";

export default async function CajaConfigPage() {
  const session = await getServerSession(authOptions);

  if (!session || session.user.rol !== "admin") {
    redirect("/dashboard");
  }

  // Slice 17: la carga inicial (dólar, cuentas, saldos) se movió a useEffect
  // dentro de CajaConfigClient — online vía fetch, offline vía SQLite local.
  return <CajaConfigClient currentUserNombre={session.user.nombre} />;
}
