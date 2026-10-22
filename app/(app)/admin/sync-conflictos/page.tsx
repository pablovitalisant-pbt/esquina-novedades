import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SyncConflictosClient } from "./client_page";

export default async function SyncConflictosPage() {
  const session = await getServerSession(authOptions);

  // Guard SSR admin-only (mismo patrón que /admin/usuarios); el middleware
  // ya bloquea el acceso no-admin a /admin/*.
  if (!session || (session.user as any).rol !== "admin") {
    redirect("/dashboard");
  }

  return <SyncConflictosClient />;
}
