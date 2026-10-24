import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { UsuariosClient } from "./client_page";
import { UserSession } from "@/types";
import { redirect } from "next/navigation";

export default async function UsuariosPage() {
  const session = await getServerSession(authOptions);

  // Strict role guard for SSR
  if (!session || (session.user as UserSession).rol !== 'admin') {
    redirect('/dashboard');
  }

  return (
     <UsuariosClient
       currentUserId={Number((session.user as UserSession).id)}
     />
  );
}
