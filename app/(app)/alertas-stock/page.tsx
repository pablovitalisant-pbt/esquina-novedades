import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AlertasStockClient } from "./client_page";

export default async function AlertasStockPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  return <AlertasStockClient />;
}
