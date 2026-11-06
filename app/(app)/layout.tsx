import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { rolPagosApp } from "@/lib/pagos-app/acceso";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  return (
    <AppShell session={session} puedeVerPagosApp={rolPagosApp(session) !== null}>
      {children}
    </AppShell>
  );
}
