import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { BodegaClient } from "./client_page";

export default async function BodegaPage() {
  const session = await getServerSession(authOptions);
  if (!session) return null;

  return (
    <BodegaClient
      session={session}
    />
  );
}
