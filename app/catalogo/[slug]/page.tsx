import { notFound } from "next/navigation";
import { PublicCatalogoClient } from "./client_page";
import { EMPRESA } from "@/lib/empresa";
import { getCatalogData } from "./data";

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data } = await getCatalogData(slug);
  return { title: `${EMPRESA.nombre} - ${data?.titulo || 'Catálogo'}` };
}

export default async function PublicCatalogoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { status, data } = await getCatalogData(slug);
  if (status === 404) return notFound();
  if (status !== 200 || !data) {
    return <div className="p-8 text-center mt-20 font-bold text-[var(--destructive)]">Error cargando el catálogo.</div>;
  }

  return <PublicCatalogoClient data={data} slug={slug} />;
}
