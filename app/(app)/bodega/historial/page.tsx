import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import flags from "@/config/feature-flags.json";
import { authOptions } from "@/lib/auth";
import { HistorialClient } from "./client_page";

export default async function HistorialPage({
  searchParams,
}: {
  searchParams: Promise<{ codigo?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if ((flags as Record<string, boolean>)["producto-historial"] !== true) redirect("/bodega");
  if (session.user?.rol !== "admin") redirect("/bodega");

  const { codigo } = await searchParams;
  return <HistorialClient codigoInicial={typeof codigo === "string" ? codigo : ""} />;
}
