import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { CatalogoAdminClient } from "./client_page";

export default async function CatalogoAdminPage() {
  const session = await getServerSession(authOptions);
  if (!session) return null;
  // bodeguero solo accede a herramientas de bodega
  if ((session.user as any).rol === 'bodeguero') redirect('/dashboard');

  return <CatalogoAdminClient session={session} />;
}
