import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { InversionMercaderiaClient } from "./client_page";

export default async function InversionMercaderiaPage() {
  const session = await getServerSession(authOptions);

  // Guard SSR admin-only (dato financiero, más restrictivo que /admin/categorias).
  // El middleware ya bloquea no-admin en /admin/*.
  if (!session || session.user.rol !== "admin") {
    redirect("/dashboard");
  }

  return <InversionMercaderiaClient />;
}
