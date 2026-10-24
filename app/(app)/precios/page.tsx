import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PreciosClient } from "./client_page";

export default async function PreciosPage() {
  const session = await getServerSession(authOptions);
  if (!session) return null;
  // bodeguero solo accede a herramientas de bodega
  if (session.user.rol === 'bodeguero') redirect('/dashboard');

  // ponytail: Slice 20 — single-tenant. empresaSlug hardcodeado en client_page.
  return <PreciosClient session={session.user} />;
}
