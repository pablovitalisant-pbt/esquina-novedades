"use client";

import { useStatus, useQuery } from "@powersync/react";
import { PowerSyncProvider } from "@/lib/powersync/PowerSyncProvider";

function ConexionBadge() {
  const status = useStatus();

  let label: string;
  let badgeClass: string;

  if (status.connecting) {
    label = "Conectando…";
    badgeClass = "bg-[#FFF7ED] text-[#C2410C]";
  } else if (status.downloadError) {
    label = "Error de conexión";
    badgeClass = "bg-[#FEF0F2] text-[#BE123C]";
  } else if (status.connected) {
    label = "Conectado";
    badgeClass = "bg-[#ECFDF5] text-[#007A55]";
  } else {
    label = "Desconectado";
    badgeClass = "bg-[#F3F4F6] text-[#6B7280]";
  }

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-pill px-4 py-1.5 text-sm font-medium ${badgeClass}`}
    >
      <span
        className={`h-2 w-2 rounded-full ${
          status.connected ? "bg-[#007A55]" : "bg-current opacity-60"
        }`}
      />
      {label}
      {status.downloadError ? (
        <span className="sr-only">
          : {status.downloadError.message}
        </span>
      ) : null}
    </span>
  );
}

function TablaCard({
  titulo,
  conteo,
  fill,
}: {
  titulo: string;
  conteo: number;
  fill: string;
}) {
  return (
    <div
      className={`flex flex-col gap-2 rounded-card p-6 ${fill}`}
      role="group"
      aria-label={`${titulo}: ${conteo} filas sincronizadas`}
    >
      <h2 className="text-lg font-bold text-[#231F20]">{titulo}</h2>
      <p className="text-sm text-[#4B5563]">
        Filas sincronizadas desde Neon
      </p>
      <p className="text-3xl font-bold text-[#231F20]">{conteo}</p>
    </div>
  );
}

function StatusContent() {
  const productos = useQuery("SELECT * FROM productos");
  const ubicaciones = useQuery("SELECT * FROM ubicaciones_bodega");

  return (
    <div className="mx-auto w-full max-w-[1152px] px-6 py-12">
      <header className="mb-12">
        <h1 className="text-3xl font-bold text-[#231F20] md:text-4xl">
          Estado de sincronización PowerSync
        </h1>
        <p className="mt-4 max-w-[65ch] text-base leading-relaxed text-[#4B5563]">
          Herramienta temporal de verificación de Fase 0. Muestra el estado de
          la conexión contra PowerSync y el conteo de filas sincronizadas en el
          SQLite local del navegador (Bodega piloto).
        </p>
      </header>

      <section className="mb-8 flex items-center gap-3 rounded-card border border-[#E5E7EB] bg-[#FFFFFF] p-6">
        <ConexionBadge />
      </section>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <TablaCard
          titulo="Productos"
          conteo={productos.data?.length ?? 0}
          fill="bg-[#F2D9DC]"
        />
        <TablaCard
          titulo="Ubicaciones de bodega"
          conteo={ubicaciones.data?.length ?? 0}
          fill="bg-[#D9F2D8]"
        />
      </div>
    </div>
  );
}

export function PowerSyncStatusClient() {
  return (
    <PowerSyncProvider>
      <StatusContent />
    </PowerSyncProvider>
  );
}
