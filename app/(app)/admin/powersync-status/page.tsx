import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PowerSyncStatusClient } from "./client_page";

export default async function PowerSyncStatusPage() {
  const session = await getServerSession(authOptions);

  if (!session || (session.user as any).rol !== "admin") {
    redirect("/dashboard");
  }

  // Este slice es 100% client-side (naturaleza de PowerSync): no hay fetch
  // de datos en el server, solo el guard de rol.
  return <PowerSyncStatusClient />;
}
