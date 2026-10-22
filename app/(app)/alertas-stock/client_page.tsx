"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ImageWithFallback } from "@/components/ImageWithFallback";
import { Loader2, AlertTriangle, EyeOff, Ban } from "lucide-react";
import { toast } from "sonner";
import { useAlertas } from "@/contexts/AlertasContext";

interface AlertaProducto {
  producto_id: number;
  codigo: string;
  detalle: string;
  imagen_url: string | null;
  saldo: number;
  stock_minimo: number;
  cantcaja: number;
  deficit: number;
}

function severidadLabel(ratio: number): { label: string; variant: "success" | "warning" | "danger" } {
  if (ratio < 0.25) return { label: "Bajo", variant: "success" };
  if (ratio < 0.50) return { label: "Medio", variant: "warning" };
  return { label: "Crítico", variant: "danger" };
}

function badgeVariant(v: "success" | "warning" | "danger"): string {
  if (v === "success") return "bg-[var(--success)]100 text-[var(--success)] border-[var(--success)]/30 dark:bg-[var(--success)] dark:text-[var(--success)] dark:border-[var(--success)]/30";
  if (v === "warning") return "bg-[var(--warning)]/10100 text-[var(--warning)] border-[var(--warning)]/30 dark:bg-[var(--warning)]/10 dark:text-[var(--warning)] dark:border-[var(--warning)]/30";
  return "bg-[var(--destructive)]/10100 text-[var(--destructive)] border-[var(--destructive)]/30 dark:bg-[var(--destructive)]/10 dark:text-[var(--destructive)] dark:border-[var(--destructive)]/30";
}

export function AlertasStockClient() {
  const { refreshStockBajo } = useAlertas();

  const [productos, setProductos] = useState<AlertaProducto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);

  const fetchAlertas = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/alertas-stock/lista");
      if (!res.ok) {
        if (res.status === 401) {
          setError("No tienes permiso para ver esta página.");
        } else {
          setError("Error al cargar alertas de stock.");
        }
        setProductos([]);
        return;
      }
      const { data } = await res.json();
      setProductos(data || []);
    } catch {
      setError("No se pudo conectar con el servidor.");
      setProductos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlertas();
  }, [fetchAlertas]);

  const handleAccion = async (productoId: number, accion: "ignorar" | "no_reponer") => {
    setSavingId(productoId);
    try {
      const res = await fetch(`/api/alertas-stock/${productoId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion }),
      });
      if (res.ok) {
        setProductos((prev) => prev.filter((p) => p.producto_id !== productoId));
        refreshStockBajo();
        toast.success(accion === "ignorar" ? "Producto silenciado" : "Marcado como no reponer");
      } else {
        toast.error("No se pudo completar la acción");
      }
    } catch {
      toast.error("Error de conexión");
    } finally {
      setSavingId(null);
    }
  };

  // ─── Loading ──────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--body-subtle)]" role="status" />
        <p className="text-sm text-[var(--body)]">Cargando alertas...</p>
      </div>
    );
  }

  // ─── Error ────────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <AlertTriangle className="w-8 h-8 text-[var(--warning)]" />
        <p className="text-sm text-[var(--body)] dark:text-[var(--body-subtle)]">{error}</p>
        <Button variant="outline" size="sm" onClick={fetchAlertas}>
          Reintentar
        </Button>
      </div>
    );
  }

  // ─── Empty ────────────────────────────────────────────────
  if (productos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-2 fade-in">
        <div className="w-12 h-12 rounded-full bg-[var(--success)] dark:bg-[var(--success)] flex items-center justify-center">
          <AlertTriangle className="w-6 h-6 text-[var(--success)] dark:text-[var(--success)]" />
        </div>
        <p className="text-sm font-medium text-[var(--body)] dark:text-[var(--body-subtle)]">
          No hay productos bajo stock mínimo
        </p>
        <p className="text-xs text-[var(--body-subtle)]">Todos los productos están dentro del umbral configurado.</p>
      </div>
    );
  }

  // ─── Table ────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6 w-full fade-in p-6">
      <div>
        <h1 className="text-2xl font-bold">Alertas de stock bajo</h1>
        <p className="text-sm text-[var(--body)] mt-1">
          {productos.length} producto{productos.length !== 1 ? "s" : ""} por debajo del stock mínimo
        </p>
      </div>

      <div className="border rounded-3xl overflow-hidden bg-[var(--card)] shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[var(--muted)]50 bg-[var(--muted)]950/50 text-[var(--body)] border-b border-border">
              <tr>
                <th className="text-left px-6 py-3 font-medium w-12">Imagen</th>
                <th className="text-left px-6 py-3 font-medium">Código</th>
                <th className="text-left px-6 py-3 font-medium">Detalle</th>
                <th className="text-right px-6 py-3 font-medium">Saldo</th>
                <th className="text-right px-6 py-3 font-medium">Cajas</th>
                <th className="text-right px-6 py-3 font-medium">Stock mín.</th>
                <th className="text-right px-6 py-3 font-medium">Déficit</th>
                <th className="text-center px-6 py-3 font-medium">Severidad</th>
                <th className="text-right px-6 py-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {productos.map((p) => {
                const ratio = p.deficit / p.stock_minimo;
                const sev = severidadLabel(ratio);
                const isSaving = savingId === p.producto_id;
                return (
                  <tr
                    key={p.producto_id}
                    className="border-b border-border last:border-0 hover:bg-[var(--muted)] dark:hover:bg-[var(--muted)]/50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <ImageWithFallback
                        src={p.imagen_url}
                        codigo={p.codigo}
                        empresaSlug="bazar-naty"
                        className="w-10 h-10 rounded-lg object-cover"
                      />
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-[var(--body)] dark:text-[var(--body)]">
                      {p.codigo}
                    </td>
                    <td className="px-6 py-4 font-medium">{p.detalle}</td>
                    <td className="px-6 py-4 text-right">{p.saldo}</td>
                    <td className="px-6 py-4 text-right">
                      {Math.floor(p.saldo / p.cantcaja)} cj{p.saldo % p.cantcaja > 0 ? ` + ${p.saldo % p.cantcaja}` : ''}
                    </td>
                    <td className="px-6 py-4 text-right">{p.stock_minimo}</td>
                    <td className="px-6 py-4 text-right font-semibold text-[var(--destructive)] dark:text-[var(--destructive)]">
                      -{p.deficit}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <Badge className={`text-[11px] px-2 py-0.5 border ${badgeVariant(sev.variant)}`}>
                        {sev.label} ({Math.round(ratio * 100)}%)
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isSaving}
                          onClick={() => handleAccion(p.producto_id, "ignorar")}
                          className="text-xs h-8"
                        >
                          {isSaving ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <EyeOff className="w-3 h-3" />
                          )}
                          <span className="ml-1">Ignorar</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isSaving}
                          onClick={() => handleAccion(p.producto_id, "no_reponer")}
                          className="text-xs h-8 text-[var(--destructive)] hover:text-[var(--destructive)] hover:bg-[var(--destructive)]/10 dark:hover:bg-[var(--destructive)]/10"
                        >
                          <Ban className="w-3 h-3" />
                          <span className="ml-1">No reponer</span>
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
