import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function KardexPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="text-center max-w-md px-4">
        <h1 className="text-xl font-bold text-[var(--body)] dark:text-[var(--body)] mb-3">
          Kardex Cliente
        </h1>
        <p className="text-[var(--body)]500 dark:text-[var(--body)]">
          Este módulo no está disponible en esta versión. Será reactivado cuando
          haya historial de ventas real en Bazar Naty.
        </p>
      </div>
    </div>
  );
}
