import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import flags from "@/config/feature-flags.json";
import { InversionMercaderiaClient } from "./client_page";

export default async function InversionMercaderiaPage() {
  const session = await getServerSession(authOptions);

  // Guard SSR admin-only (dato financiero, más restrictivo que /admin/categorias).
  // El middleware ya bloquea no-admin en /admin/*.
  if (!session || (session.user as any).rol !== "admin") {
    redirect("/dashboard");
  }

  if (!(flags as any)['inversion-mercaderia']) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center max-w-md px-4">
          <h1 className="text-xl font-bold text-[var(--body)] dark:text-[var(--body)] mb-3">
            Inversión en Mercadería
          </h1>
          <p className="text-[var(--body)] dark:text-[var(--body)]">
            Este módulo no está disponible en esta versión.
          </p>
        </div>
      </div>
    );
  }

  return <InversionMercaderiaClient />;
}
