"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Search, X, Pencil, Trash2, ChevronLeft, ChevronRight, Save, Download } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatCLP } from "@/lib/utils";
import type { ResumenClienteResponse, MovimientoConCuenta, SaldoCuenta, NotaVentaConSaldo, NotaBusquedaResult, MovimientoOCierre, CierrePeriodo } from "@/docs/specs/caja-mayor.spec";

import type { Cuenta } from '@/types';

type FormaPago = MovimientoConCuenta["forma_pago"];

interface ClienteOption {
  cliente_id: string; // UUID desde 13a
  nombre: string;
  total_compras: number;
  ultima_compra: string;
}

// El guard de rol lo hace el middleware (bodeguero no tiene acceso a /caja-mayor).
export function CajaMayorClient({
  cuentas,
  userName,
  userRol,
  userId,
}: {
  cuentas: Cuenta[];
  userName: string;
  userRol: string;
  userId: number;
}) {
  // BUG-054 (Parte 3): estado de conexión en vivo. "Cierre de caja" requiere
  // red (escribe a Postgres), así que se bloquea offline. Se actualiza con
  // listeners online/offline, sin recargar.
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // ─── Form state ──────────────────────────────────────
  const [tipo, setTipo] = useState<"cobro" | "gasto">("cobro");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [cliente, setCliente] = useState<ClienteOption | null>(null);
  const [empresa, setEmpresa] = useState<string>("");
  const [monto, setMonto] = useState("");
  const [cuentaId, setCuentaId] = useState("");
  const [formaPago, setFormaPago] = useState<"efectivo" | "cheque" | "transferencia">("transferencia");
  const [observaciones, setObservaciones] = useState("");
  const [esCredito, setEsCredito] = useState(false);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  // ─── Imputación manual ─────────────────────────────────
  const [imputacionManual, setImputacionManual] = useState(false);
  const [notaSeleccionada, setNotaSeleccionada] = useState<NotaVentaConSaldo | null>(null);
  const [notasPendientes, setNotasPendientes] = useState<NotaVentaConSaldo[]>([]);
  const [notasPendientesLoading, setNotasPendientesLoading] = useState(false);

  // ─── Búsqueda unificada ───────────────────────────────
  type ResultadoBusqueda =
    | { tipo: "cliente"; cliente: ClienteOption }
    | { tipo: "nota"; nota: NotaBusquedaResult };
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ResultadoBusqueda[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // ─── Resumen de notas del cliente ───────────────────
  const [resumen, setResumen] = useState<ResumenClienteResponse | null>(null);
  const [resumenLoading, setResumenLoading] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState<"todas" | "pendiente" | "pagada">("todas");
  const [notaExpandida, setNotaExpandida] = useState<string | null>(null);

  // ─── Movimientos table state ──────────────────────────
  const [movimientos, setMovimientos] = useState<MovimientoOCierre[]>([]);
  const [movsLoading, setMovsLoading] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [filtros, setFiltros] = useState({ cuenta_id: "", tipo: "", empresa: "", desde: "", hasta: "" });
  const [saldos, setSaldos] = useState<SaldoCuenta[]>([]);

  // ─── Cierre de período ────────────────────────────────
  const [cierreModalOpen, setCierreModalOpen] = useState(false);
  const [cierreLoading, setCierreLoading] = useState(false);

  // ─── Edit modal state ─────────────────────────────────
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editMov, setEditMov] = useState<MovimientoConCuenta | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  // Edit form fields (reuse same structure as create form)
  const [editTipo, setEditTipo] = useState<"cobro" | "gasto">("cobro");
  const [editFecha, setEditFecha] = useState("");
  const [editClienteQuery, setEditClienteQuery] = useState("");
  const [editCliente, setEditCliente] = useState<ClienteOption | null>(null);
  const [editEmpresa, setEditEmpresa] = useState<"bazar-naty" | "">("");
  const [editMonto, setEditMonto] = useState("");
  const [editCuentaId, setEditCuentaId] = useState("");
  const [editFormaPago, setEditFormaPago] = useState<FormaPago>("transferencia");
  const [editObs, setEditObs] = useState("");
  const [editEsCredito, setEditEsCredito] = useState(false);
  const [editDeleteConfirm, setEditDeleteConfirm] = useState(false);

  // ─── Edición inline de cierre ─────────────────────────
  const [cierreEditId, setCierreEditId] = useState<number | null>(null);
  const [cierreEditDesde, setCierreEditDesde] = useState("");
  const [cierreEditHasta, setCierreEditHasta] = useState("");
  const [cierreEditSaving, setCierreEditSaving] = useState(false);

  // ─── Fetch movimientos ────────────────────────────────
  const fetchMovimientos = useCallback((page = 1) => {
    setMovsLoading(true);

    const params = new URLSearchParams({ page: String(page), limit: "50" });
    if (filtros.cuenta_id) params.set("cuenta_id", filtros.cuenta_id);
    if (filtros.tipo) params.set("tipo", filtros.tipo);
    if (filtros.empresa) params.set("empresa", filtros.empresa);
    if (filtros.desde) params.set("desde", filtros.desde);
    if (filtros.hasta) params.set("hasta", filtros.hasta);
    fetch(`/api/caja/movimientos?${params}`)
      .then((r) => r.json())
      .then((json) => {
        setMovimientos((json.data || []) as MovimientoOCierre[]);
        setPagination(json.pagination || { page: 1, limit: 50, total: 0, totalPages: 0 });
      })
      .catch(() => {})
      .finally(() => setMovsLoading(false));
  }, [filtros]);

  // ─── Fetch saldos ─────────────────────────────────────
  const fetchSaldos = useCallback(() => {
    fetch("/api/caja/resumen-cuentas")
      .then((r) => r.json())
      .then((json) => setSaldos(json.data || []))
      .catch(() => {});
  }, []);

  useEffect(() => { fetchMovimientos(1); fetchSaldos(); }, [fetchMovimientos, fetchSaldos]);

  useEffect(() => { if (!cliente) fetchMovimientos(1); }, [cliente, fetchMovimientos]);

  useEffect(() => {
    if (!cliente) {
      setResumen(null);
      return;
    }
    setResumenLoading(true);
    fetch(`/api/caja/resumen/${cliente.cliente_id}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.data) setResumen(json.data);
        else setResumen(null);
      })
      .catch(() => setResumen(null))
      .finally(() => setResumenLoading(false));
  }, [cliente]);

  const notasFiltradas = useMemo(() => {
    if (!resumen) return [];
    if (filtroEstado === "todas") return resumen.notas;
    if (filtroEstado === "pendiente") return resumen.notas.filter((n) => n.saldo_pendiente > 0.005);
    return resumen.notas.filter((n) => n.saldo_pendiente <= 0.005);
  }, [resumen, filtroEstado]);

  // ─── Derived ─────────────────────────────────────────
  const montoNum = useMemo(() => {
    const n = parseFloat(monto);
    return isNaN(n) || n <= 0 ? null : n;
  }, [monto]);

  const canSubmit =
    !saving &&
    fecha &&
    cuentaId &&
    parseFloat(monto) > 0;

  // ─── Búsqueda unificada (cliente o nota) ──────────────
  useEffect(() => {
    const isDigits = /^\d+$/.test(searchQuery);

    if ((isDigits && searchQuery.length < 3) || (!isDigits && searchQuery.length < 2)) {
      setSearchResults([]);
      setSearchOpen(false);
      return;
    }

    const endpoint = isDigits
      ? `/api/caja/nota-busqueda?q=${encodeURIComponent(searchQuery)}`
      : `/api/caja/clientes?q=${encodeURIComponent(searchQuery)}`;

    const timer = setTimeout(async () => {
      setSearchLoading(true);
      const res = await fetch(endpoint);
      if (res.ok) {
        const json = await res.json();
        const data: any[] = json.data || [];
        const results: ResultadoBusqueda[] = isDigits
          ? data.map((n) => ({ tipo: "nota" as const, nota: n as NotaBusquedaResult }))
          : data.map((c) => ({ tipo: "cliente" as const, cliente: c as ClienteOption }));
        setSearchResults(results);
        setSearchOpen(results.length > 0);
      }
      setSearchLoading(false);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Auto-select first available cuenta
  useEffect(() => {
    setCuentaId(cuentas.length > 0 ? String(cuentas[0].id) : "");
  }, [cuentas]);

  const selectCliente = (c: ClienteOption) => {
    setCliente(c);
    setSearchQuery(c.nombre);
    setSearchOpen(false);
  };

  const selectNota = (n: NotaBusquedaResult) => {
    const clienteOpt: ClienteOption = {
      cliente_id: n.cliente_id,
      nombre: n.nombre_cliente,
      total_compras: 0,
      ultima_compra: "",
    };
    setCliente(clienteOpt);
    setSearchQuery("");
    setEmpresa(n.origen);
    setNotaSeleccionada({
      id: n.id,
      fecha: n.fecha,
      total: n.total,
      total_pagado: n.total - n.saldo_pendiente,
      saldo_pendiente: n.saldo_pendiente,
      origen: n.origen,
      empresa: n.origen,
    });
    setImputacionManual(true);
    setSearchResults([]);
    setSearchOpen(false);
  };

  // ─── Fetch notas pendientes para imputación manual ───
  useEffect(() => {
    if (!imputacionManual || !cliente) {
      setNotasPendientes([]);
      setNotaSeleccionada(null);
      return;
    }
    setNotasPendientesLoading(true);

    fetch(`/api/caja/notas/${cliente.cliente_id}`)
      .then((r) => r.json())
      .then((json) => {
        const todas: NotaVentaConSaldo[] = json.data || [];
        const pendientes = todas.filter((n) => {
          if (n.saldo_pendiente <= 0.005) return false;
          if (empresa && n.origen !== empresa) return false;
          return true;
        });
        setNotasPendientes(pendientes);
        setNotaSeleccionada((actual) =>
          actual && pendientes.some(n => n.origen === actual.origen && n.id === actual.id)
            ? actual
            : null
        );
      })
      .catch(() => setNotasPendientes([]))
      .finally(() => setNotasPendientesLoading(false));
  }, [imputacionManual, cliente, empresa]);

  const clearCliente = () => {
    setCliente(null);
    setSearchQuery("");
    setSearchOpen(false);
    setEmpresa("");
    setImputacionManual(false);
    setNotaSeleccionada(null);
    setNotasPendientes([]);
  };

  // ─── Edit modal ──────────────────────────────────────
  const openEditModal = (mov: MovimientoConCuenta) => {
    setEditMov(mov);
    setEditTipo(mov.tipo as "cobro" | "gasto");
    setEditFecha(mov.fecha);
    setEditMonto(String(mov.monto));
    setEditCuentaId(String(mov.cuenta_id));
    setEditFormaPago(mov.forma_pago as FormaPago);
    setEditObs(mov.observaciones || "");
    setEditEsCredito(mov.es_credito ?? false);
    setEditEmpresa((mov.empresa as "bazar-naty" | "") || "");
    if (mov.cliente_id) {
      setEditCliente({ cliente_id: mov.cliente_id, nombre: mov.nombre_cliente || "", total_compras: 0, ultima_compra: "" });
      setEditClienteQuery(mov.nombre_cliente || "");
    } else {
      setEditCliente(null);
      setEditClienteQuery("");
    }
    setEditDeleteConfirm(false);
    setEditModalOpen(true);
  };

  const handleEditSave = async () => {
    if (!editMov || !editFecha || !editCuentaId || !parseFloat(editMonto)) return;
    setEditSaving(true);
    try {
      const body: Record<string, unknown> = {
        fecha: editFecha,
        tipo: editTipo,
        cliente_id: editCliente?.cliente_id ? Number(editCliente.cliente_id) : null,
        nombre_cliente: editCliente?.nombre ?? null,
        cuenta_id: parseInt(editCuentaId, 10),
        monto: parseFloat(editMonto),
        forma_pago: editFormaPago,
        observaciones: editObs.trim() || null,
        empresa: editEmpresa || null,
        es_credito: editTipo === "cobro" ? editEsCredito : false,
      };

      const res = await fetch(`/api/caja/movimientos/${editMov.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.ajuste_requerido) {
          toast(json.ajuste_requerido.mensaje, {
            style: { background: "#FEF3C7", color: "#92400E", border: "1px solid #FCD34D" },
          });
        } else {
          toast.success("Movimiento actualizado");
        }
        setEditModalOpen(false);
        fetchMovimientos(pagination.page);
        fetchSaldos();
      } else {
        const err = await res.json();
        toast.error(err.error || "Error al actualizar");
      }
    } catch (e) {
      // BUG-054: catch que faltaba — una excepción (red o db local) no debe
      // fallar en silencio.
      console.error("handleEditSave error:", e);
      toast.error("No se pudo actualizar el movimiento");
    } finally {
      setEditSaving(false);
    }
  };

  const handleEditDelete = async () => {
    if (!editMov) return;
    try {
      const res = await fetch(`/api/caja/movimientos/${editMov.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        toast.error(err?.error || "Error al eliminar");
        return;
      }
      toast.success("Movimiento eliminado");
      setEditModalOpen(false);
      fetchMovimientos(1);
      fetchSaldos();
    } catch (e) {
      // BUG-054: catch que faltaba — no fallar en silencio.
      console.error("handleEditDelete error:", e);
      toast.error("No se pudo eliminar el movimiento");
    }
  };

  // ─── Submit ──────────────────────────────────────────
  const handleSubmit = async () => {
    setSaving(true);

    const body: Record<string, unknown> = {
      fecha,
      tipo,
      cliente_id: cliente?.cliente_id ?? null, // UUID (string) desde 13a
      nombre_cliente: cliente?.nombre ?? null,
      cuenta_id: parseInt(cuentaId, 10),
      monto: parseFloat(monto),
      forma_pago: formaPago,
      observaciones: observaciones.trim() || null,
      empresa: empresa || null,
      es_credito: tipo === "cobro" ? esCredito : false,
    };

    const res = await fetch("/api/caja/movimientos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const created = await res.json();
      const movimientoId = created.data?.id;

      // Imputación manual a nota específica
      if (movimientoId && imputacionManual && notaSeleccionada && tipo === "cobro" && montoNum) {
        let remaining = montoNum;
        const notasParaImputar: { empresa: string; prenota_id: number; monto_aplicado: number }[] = [];

        // Aplicar a la nota seleccionada
        const aplicado = Math.min(remaining, notaSeleccionada.saldo_pendiente);
        if (aplicado > 0.005) {
          notasParaImputar.push({
            empresa: notaSeleccionada.empresa ?? "",
            prenota_id: notaSeleccionada.id,
            monto_aplicado: aplicado,
          });
          remaining -= aplicado;
        }

        // Excedente → siguientes notas más antiguas
        if (remaining > 0.005) {
          const sorted = [...notasPendientes].sort((a, b) => a.fecha.localeCompare(b.fecha));
          for (const nota of sorted) {
            if (nota.id === notaSeleccionada.id && nota.empresa === notaSeleccionada.empresa) continue;
            if (remaining <= 0.005) break;
            const aplicar = Math.min(remaining, nota.saldo_pendiente);
            if (aplicar > 0.005) {
              notasParaImputar.push({ empresa: nota.empresa ?? "", prenota_id: nota.id, monto_aplicado: aplicar });
              remaining -= aplicar;
            }
          }
        }

        if (notasParaImputar.length > 0) {
          await fetch(`/api/caja/movimientos/${movimientoId}/notas`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ notas: notasParaImputar }),
          });
        }
      }

      toast.success(`Movimiento registrado — ${tipo === "cobro" ? "Cobro" : "Gasto"} por ${formatCLP(parseFloat(monto))}`);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
      // Reset form (fecha persiste entre registros; solo se resetea al cerrar período)
      clearCliente();
      setMonto("");
      setObservaciones("");
      setFormaPago("transferencia");
      fetchMovimientos(1);
      fetchSaldos();
    } else {
      const err = await res.json();
      const msg = err.error?.fieldErrors
        ? Object.values(err.error.fieldErrors).flat().join(", ")
        : err.error || "Error al registrar";
      toast.error(msg);
    }
    setSaving(false);
  };

  // ─── Cierre de período ────────────────────────────────
  const handleCierre = async () => {
    setCierreLoading(true);
    const res = await fetch("/api/caja/cierres", { method: "POST" });
    if (res.ok) {
      const json = await res.json();
      toast.success(`Cierre creado — ${json.data.fecha_desde} al ${json.data.fecha_hasta}`);
      setCierreModalOpen(false);
      setFecha(new Date().toISOString().slice(0, 10));
      fetchMovimientos(1);
      fetchSaldos();
    } else {
      const err = await res.json();
      toast.error(err.error || "Error al crear cierre");
    }
    setCierreLoading(false);
  };

  const handleDeleteCierre = async (id: number) => {
    if (!confirm("¿Eliminar este cierre? Los movimientos no se borrarán, solo el snapshot del cierre.")) return;
    const res = await fetch(`/api/caja/cierres/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Cierre eliminado");
      fetchMovimientos(pagination.page);
      fetchSaldos();
    } else {
      const err = await res.json();
      toast.error(err.error || "Error al eliminar cierre");
    }
  };

  const handleOpenCierreEdit = (cierre: CierrePeriodo) => {
    setCierreEditId(cierre.id);
    setCierreEditDesde(cierre.fecha_desde);
    setCierreEditHasta(cierre.fecha_hasta);
  };

  const handleCierreEditSave = async () => {
    if (!cierreEditId || !cierreEditDesde || !cierreEditHasta) return;
    setCierreEditSaving(true);
    const res = await fetch(`/api/caja/cierres/${cierreEditId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fecha_desde: cierreEditDesde, fecha_hasta: cierreEditHasta }),
    });
    if (res.ok) {
      toast.success("Cierre actualizado");
      setCierreEditId(null);
      fetchMovimientos(pagination.page);
      fetchSaldos();
    } else {
      const err = await res.json();
      toast.error(err.error || "Error al actualizar cierre");
    }
    setCierreEditSaving(false);
  };

  // ─── Exportar a Excel ────────────────────────────────
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (filtros.cuenta_id) params.set("cuenta_id", filtros.cuenta_id);
      if (filtros.tipo) params.set("tipo", filtros.tipo);
      if (filtros.empresa) params.set("empresa", filtros.empresa);
      if (filtros.desde) params.set("desde", filtros.desde);
      if (filtros.hasta) params.set("hasta", filtros.hasta);

      const res = await fetch(`/api/caja/export?${params}`);
      if (!res.ok) { toast.error("Error al exportar"); return; }
      const json = await res.json();
      const items: MovimientoOCierre[] = json.data || [];

      const ExcelJS = await import("exceljs");
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Caja Mayor");

      // Column definitions with widths
      ws.columns = [
        { header: "Fecha", key: "Fecha", width: 14 },
        { header: "Tipo", key: "Tipo", width: 9 },
        { header: "Cliente", key: "Cliente", width: 30 },
        { header: "Org.", key: "Org.", width: 10 },
        { header: "Nota(s)", key: "Nota(s)", width: 13 },
        { header: "Monto", key: "Monto", width: 16 },
        { header: "Cuenta", key: "Cuenta", width: 12 },
        { header: "Observación", key: "Observación", width: 32 },
        { header: "Crédito", key: "Crédito", width: 8 },
      ];

      // Style: header row — orange bg, black bold text
      const headerRow = ws.getRow(1);
      headerRow.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFF9900" } };
        cell.font = { color: { argb: "FF000000" }, bold: true };
      });

      // Build data rows
      for (const item of items) {
        if (item.tipo_fila === "cierre") {
          const c = item.data as CierrePeriodo;
          // Title row — blue bg, gray bold text
          const titleRow = ws.addRow({
            Fecha: `CIERRE DE PERÍODO — ${c.fecha_desde} al ${c.fecha_hasta}`,
            Tipo: "", Cliente: "", "Org.": "", "Nota(s)": "", Monto: "", Cuenta: "", Observación: "", Crédito: "",
          });
          titleRow.eachCell((cell) => {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC9DAF8" } };
            cell.font = { color: { argb: "FF666666" }, bold: true };
          });
          // Resumen rows — blue bg, normal text
          const activas = c.resumen.filter((r) => r.saldo_final !== 0 || r.total_cobros !== 0 || r.total_gastos !== 0);
          for (const r of activas) {
            const resumenRow = ws.addRow({
              Fecha: "", Tipo: "", Cliente: "", "Org.": "", "Nota(s)": r.cuenta_nombre,
              Monto: r.saldo_final,
              Cuenta: "",
              Observación: `Depósito ${formatCLP(r.total_cobros)} · Gasto ${formatCLP(r.total_gastos)}`,
              Crédito: "",
            });
            resumenRow.eachCell((cell) => {
              cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC9DAF8" } };
            });
          }
        } else {
          const m = item.data as MovimientoConCuenta;
          const movRow = ws.addRow({
            Fecha: m.fecha,
            Tipo: m.tipo === "cobro" ? "Cobro" : m.tipo === "reembolso" ? "Reembolso" : "Gasto",
            Cliente: m.nombre_cliente || "",
            "Org.": m.empresa ? "La Esquina" : "",
            "Nota(s)": m.notas_imputadas?.join(", ") || "",
            Monto: m.monto,
            Cuenta: m.cuenta_nombre,
            Observación: m.observaciones || "",
            Crédito: m.es_credito ? "Sí" : "No",
          });
          // Color the Tipo cell (column B, index 2)
          const tipoCell = movRow.getCell(2);
          tipoCell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: m.tipo === "cobro" ? "FFE2EFDA" : "FFFCE4D6" }, // cobro=verde, gasto/reembolso=rojo
          };
        }
      }

      // Freeze first row (header always visible on scroll)
      ws.views = [{ state: "frozen", ySplit: 1 }];

      // Download as .xlsx
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "caja-mayor-export.xlsx";
      a.click();
      URL.revokeObjectURL(url);

      toast.success("Excel descargado");
    } catch (e) {
      toast.error("Error al generar Excel");
    } finally {
      setExporting(false);
    }
  };

  // ─── Render ──────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6 w-full fade-in p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Caja Mayor</h1>
          <p className="text-sm text-[var(--body)] mt-1">
            Registrar cobro o gasto {userName ? `— ${userName}` : ""}
          </p>
        </div>
        {userRol === "admin" && (
          <Button
            onClick={() => setCierreModalOpen(true)}
            variant="default"
            disabled={!online}
            title={!online ? "Necesitás conexión para cerrar caja" : undefined}
          >
            🔒 Cierre de Período
          </Button>
        )}
      </div>

      <div className="border rounded-card p-5 space-y-5">
        {/* ─── Tipo toggle ──────────────────────────── */}
        <div className="flex rounded-lg border p-1 bg-muted/50">
          {(["cobro", "gasto"] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                setTipo(t);
                if (t === "gasto") {
                  clearCliente();
                  setImputacionManual(false);
                  setNotaSeleccionada(null);
                }
              }}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                tipo === t
                  ? "bg-background shadow-sm text-foreground"
                  : "text-[var(--body)] hover:text-foreground"
              }`}
            >
              {t === "cobro" ? "💰 Cobro" : "📤 Gasto"}
            </button>
          ))}
        </div>

        {/* ─── Fecha ────────────────────────────────── */}
        <div className="space-y-1">
          <label className="text-sm font-medium">Fecha</label>
          <Input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
        </div>

        {/* ─── Búsqueda unificada (solo cobro) ────── */}
        {tipo === "cobro" ? (
          <div className="space-y-1 relative">
            <label className="text-sm font-medium">
              {cliente ? (notaSeleccionada ? "Nota de venta" : "Cliente") : "Buscar"}{" "}
              <span className="text-[var(--destructive)]">*</span>
            </label>
            {cliente ? (
              notaSeleccionada ? (
                /* Nota seleccionada — info card verde */
                <div className="flex items-center gap-2 border rounded-lg px-3 py-2 bg-[var(--success)] dark:bg-[var(--success)] border-[var(--success)]/30 dark:border-[var(--success)]/30">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      📄 Nota #{notaSeleccionada.id} — {cliente.nombre}
                    </div>
                    <div className="text-xs text-[var(--body)]">
                      {notaSeleccionada.fecha} · {"La Esquina"} · Total: {formatCLP(notaSeleccionada.total)} · Pend: {formatCLP(notaSeleccionada.saldo_pendiente)}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon-sm" onClick={clearCliente}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                /* Cliente seleccionado — card gris */
                <div className="flex items-center gap-2 border rounded-lg px-3 py-2 bg-muted/30">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{cliente.nombre}</div>
                    <div className="text-xs text-[var(--body)]">
                      La Esquina · {cliente.total_compras} compras · última {cliente.ultima_compra}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon-sm" onClick={clearCliente}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              )
            ) : (
              /* Input unificado + dropdown */
              <div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--body-subtle)]" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar por nombre de cliente o número de nota..."
                    className="pl-9"
                    autoComplete="off"
                  />
                  {searchLoading && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-[var(--body-subtle)]" />
                  )}
                </div>
                {searchOpen && searchResults.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full border rounded-lg bg-background shadow-lg max-h-72 overflow-y-auto">
                    {searchResults.map((r) =>
                      r.tipo === "cliente" ? (
                        <button
                          key={`cliente-${r.cliente.cliente_id}`}
                          onClick={() => selectCliente(r.cliente)}
                          className="w-full text-left px-3 py-2 hover:bg-muted transition-colors border-b last:border-0"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-base shrink-0">👤</span>
                            <span className="text-sm font-medium truncate">{r.cliente.nombre}</span>
                          </div>
                          <div className="text-xs text-[var(--body)] flex items-center gap-1 ml-7">
                            <Badge variant="outline" className="text-[10px] px-1 py-0">
                              La Esquina
                            </Badge>
                            <span>· {r.cliente.total_compras} compras · {r.cliente.ultima_compra}</span>
                          </div>
                        </button>
                      ) : (
                        <button
                          key={`nota-${r.nota.origen}:${r.nota.id}`}
                          onClick={() => selectNota(r.nota)}
                          className={`w-full text-left px-3 py-2 hover:bg-muted transition-colors border-b last:border-0 ${
                            r.nota.saldo_pendiente <= 0.005 ? "opacity-60" : ""
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-base shrink-0">📄</span>
                              <span className="text-sm font-medium">#{r.nota.id}</span>
                            </div>
                            <Badge variant="outline" className="text-[10px] px-1 py-0">
                              {"La Esquina"}
                            </Badge>
                          </div>
                          <div className="text-xs text-[var(--body)] mt-0.5 ml-7">
                            {r.nota.fecha} · {r.nota.nombre_cliente} · Total: {formatCLP(r.nota.total)}
                            {" · "}
                            <span className={r.nota.saldo_pendiente <= 0.005 ? "text-[var(--success)]600" : "text-[var(--destructive)] font-medium"}>
                              Pend: {formatCLP(r.nota.saldo_pendiente)}
                            </span>
                          </div>
                        </button>
                      )
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : null}

        {/* ─── Imputación manual ────────────────────── */}
        {tipo === "cobro" && cliente && (
          <div className="space-y-3 border rounded-lg p-4 bg-muted/20">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={imputacionManual}
                onChange={(e) => setImputacionManual(e.target.checked)}
                className="w-4 h-4 rounded border-[var(--border)]"
              />
              <span className="text-sm font-medium">¿Imputar a nota específica?</span>
            </label>

            {imputacionManual && (
              <div className="space-y-1">
                <label className="text-sm font-medium">Seleccionar nota de venta</label>
                {notasPendientesLoading ? (
                  <div className="text-sm text-[var(--body-subtle)] py-2">
                    <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                    Cargando notas pendientes...
                  </div>
                ) : notasPendientes.length === 0 ? (
                  <p className="text-sm text-[var(--body-subtle)] italic">No hay notas pendientes para este cliente.</p>
                ) : (
                  <select
                    value={notaSeleccionada ? `${notaSeleccionada.empresa}:${notaSeleccionada.id}` : ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!val) { setNotaSeleccionada(null); return; }
                      const idx = val.lastIndexOf(":");
                      const emp = val.slice(0, idx);
                      const knum = val.slice(idx + 1);
                      setNotaSeleccionada(notasPendientes.find((n) => n.origen === emp && n.id === Number(knum)) || null);
                    }}
                    className="w-full h-9 rounded-md border border-[var(--border)] border-[var(--border)]700 bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)] bg-[var(--muted)]900"
                  >
                    <option value="">— Seleccionar nota —</option>
                    {notasPendientes.map((n) => (
                      <option key={`${n.origen}:${n.id}`} value={`${n.origen}:${n.id}`}>
                        #{n.id} · {n.fecha} · {formatCLP(n.total)} · Pend: {formatCLP(n.saldo_pendiente)}
                      </option>
                    ))}
                  </select>
                )}

                {/* Preview de imputación */}
                {notaSeleccionada && montoNum !== null && (
                  <div className="bg-[var(--success)]50 dark:bg-[var(--success)] border border-[var(--success)]/30 dark:border-[var(--success)]/30 rounded-lg px-3 py-2 text-sm text-[var(--success)] dark:text-[var(--success)] mt-2">
                    {montoNum <= notaSeleccionada.saldo_pendiente ? (
                      <>Se imputarán <strong>{formatCLP(montoNum)}</strong> a la nota #{notaSeleccionada.id}.</>
                    ) : (
                      <div>
                        <p>Se imputarán <strong>{formatCLP(notaSeleccionada.saldo_pendiente)}</strong> a la nota #{notaSeleccionada.id}.</p>
                        <p className="mt-0.5">Excedente de <strong>{formatCLP(montoNum - notaSeleccionada.saldo_pendiente)}</strong> → siguiente nota más antigua.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ─── Monto ───────────────────────────────── */}
        <div className="space-y-1">
          <label className="text-sm font-medium">Monto</label>
          <Input
            type="number"
            min="0"
            step="1"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            placeholder="0"
          />
        </div>

        {/* ─── Cuenta bancaria ──────────────────────── */}
        <div className="space-y-1">
          <label className="text-sm font-medium">Cuenta bancaria</label>
          <select
            value={cuentaId}
            onChange={(e) => setCuentaId(e.target.value)}
            className="w-full h-9 rounded-md border border-[var(--border)] border-[var(--border)]700 bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)] bg-[var(--muted)]900"
          >
            {cuentas.length === 0 ? (
              <option value="">No hay cuentas</option>
            ) : (
              cuentas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))
            )}
          </select>
        </div>

        {/* ─── Forma de pago ────────────────────────── */}
        <div className="space-y-1">
          <label className="text-sm font-medium">Forma de pago</label>
          <div className="flex rounded-lg border p-1 bg-muted/50">
            {(["efectivo", "cheque", "transferencia"] as const).map((fp) => (
              <button
                key={fp}
                onClick={() => setFormaPago(fp)}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  formaPago === fp
                    ? "bg-background shadow-sm text-foreground"
                    : "text-[var(--body)] hover:text-foreground"
                }`}
              >
                {fp === "efectivo" ? "💵 Efectivo" : fp === "cheque" ? "📝 Cheque" : "🏦 Transferencia"}
              </button>
            ))}
          </div>
        </div>

        {/* ─── Venta a crédito (solo cobro) ─────────── */}
        {tipo === "cobro" && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={esCredito}
              onChange={(e) => setEsCredito(e.target.checked)}
              className="w-4 h-4 rounded border-[var(--border)]"
            />
            <span className="text-sm font-medium">Venta a crédito</span>
          </label>
        )}

        {/* ─── Observaciones ────────────────────────── */}
        <div className="space-y-1">
          <label className="text-sm font-medium">Observaciones (opcional)</label>
          <Input
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            placeholder="Ej: Abono factura 2648"
          />
        </div>

        {/* ─── Submit ────────────────────────────────── */}
        <Button
          onClick={handleSubmit}
          disabled={!canSubmit || saving || justSaved}
          className={`w-full ${justSaved ? "bg-[var(--success)] hover:bg-[var(--success)] text-white" : ""}`}
          size="lg"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : null}
          {justSaved
            ? "✅ Pago registrado"
            : tipo === "cobro" ? "💰 Registrar cobro" : "📤 Registrar gasto"}
        </Button>
      </div>

      {/* ─── Saldos por cuenta ─────────────────────────── */}
      {!cliente && saldos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {saldos.map((s) => (
            <div key={`${s.cuenta_id}`} className="border rounded-lg p-3 text-center">
              <div className="text-xs text-[var(--body)] truncate">{s.cuenta_nombre}</div>
              <div className={`text-sm font-bold mt-1 ${s.saldo_neto >= 0 ? "text-[var(--success)]700 dark:text-[var(--success)]" : "text-[var(--destructive)] dark:text-[var(--destructive)]"}`}>
                {formatCLP(s.saldo_neto)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── Filtros + Tabla de movimientos ────────────── */}
      {!cliente && (
        <div className="border rounded-card p-5 space-y-4">
          <h2 className="font-semibold text-sm uppercase tracking-wide text-[var(--body)]">Movimientos</h2>

          {/* Exportar + filtros */}
          <div className="flex items-center justify-between">
            <div className="flex flex-wrap gap-2">
              <select value={filtros.tipo} onChange={(e) => setFiltros((f) => ({ ...f, tipo: e.target.value }))} className="h-8 rounded-md border border-[var(--border)] border-[var(--border)]700 bg-transparent px-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--ring)] bg-[var(--muted)]900">
                <option value="">Todos tipos</option><option value="cobro">Cobro</option><option value="gasto">Gasto</option><option value="reembolso">Reembolso</option>
              </select>
              <Input type="date" value={filtros.desde} onChange={(e) => setFiltros((f) => ({ ...f, desde: e.target.value }))} className="h-8 w-[140px] text-xs" />
              <Input type="date" value={filtros.hasta} onChange={(e) => setFiltros((f) => ({ ...f, hasta: e.target.value }))} className="h-8 w-[140px] text-xs" />
              <select value={filtros.cuenta_id} onChange={(e) => setFiltros((f) => ({ ...f, cuenta_id: e.target.value }))} className="h-8 rounded-md border border-[var(--border)] border-[var(--border)]700 bg-transparent px-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--ring)] bg-[var(--muted)]900">
                <option value="">Todas cuentas</option>
                {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={exporting}
              className="shrink-0"
            >
              {exporting ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1" />}
              Exportar Excel
            </Button>
          </div>

          {/* Tabla */}
          {movsLoading ? (
            <div className="text-sm text-[var(--body-subtle)] text-center py-8"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Cargando...</div>
          ) : movimientos.length === 0 ? (
            <p className="text-sm text-[var(--body-subtle)] italic text-center py-4">Sin movimientos.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-[var(--body)] uppercase">
                    <th className="py-2 pr-2 font-medium w-[90px]">Fecha</th>
                    <th className="py-2 pr-2 font-medium w-[32px]">Tipo</th>
                    <th className="py-2 pr-2 font-medium">Cliente</th>
                    <th className="py-2 pr-2 font-medium w-[36px]">Emp.</th>
                    <th className="py-2 pr-2 font-medium">Nota(s)</th>
                    <th className="py-2 pr-2 font-medium text-right w-[110px]">Monto</th>
                    <th className="py-2 pr-2 font-medium">Cuenta</th>
                    <th className="py-2 pr-2 font-medium">Observación</th>
                    <th className="py-2 pr-2 font-medium w-[70px]">Forma pago</th>
                    <th className="py-2 pr-2 font-medium w-[50px]">Crédito</th>
                    <th className="py-2 w-[60px]"></th>
                  </tr>
                </thead>
                <tbody>
                  {movimientos.map((item) =>
                    item.tipo_fila === "cierre" ? (
                      <tr key={`cierre-${item.data.id}`} className="bg-[var(--primary)] dark:bg-[var(--primary)]/40 border-b">
                        <td colSpan={11} className="py-3 px-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-[var(--primary)] dark:text-[var(--primary)] text-sm">
                                🔒 CIERRE DE PERÍODO
                              </span>
                              {cierreEditId === item.data.id ? (
                                <>
                                  <Input
                                    type="date"
                                    value={cierreEditDesde}
                                    onChange={(e) => setCierreEditDesde(e.target.value)}
                                    className="h-7 w-[140px] text-xs"
                                  />
                                  <span className="text-xs text-[var(--body)]">al</span>
                                  <Input
                                    type="date"
                                    value={cierreEditHasta}
                                    onChange={(e) => setCierreEditHasta(e.target.value)}
                                    className="h-7 w-[140px] text-xs"
                                  />
                                  <Button size="icon-sm" onClick={handleCierreEditSave} disabled={cierreEditSaving || !online} className="h-7 w-7">
                                    {cierreEditSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                  </Button>
                                  <Button size="icon-sm" variant="ghost" onClick={() => setCierreEditId(null)} className="h-7 w-7">
                                    <X className="w-3 h-3" />
                                  </Button>
                                </>
                              ) : (
                                <span>— {item.data.fecha_desde} al {item.data.fecha_hasta}</span>
                              )}
                              <span className="text-xs text-[var(--primary)] dark:text-[var(--primary)] ml-3">
                                por {item.data.usuario_nombre}
                              </span>
                            </div>
                            {userRol === "admin" && (
                              <div className="flex gap-1">
                                {cierreEditId !== item.data.id && (
                                  <Button variant="ghost" size="icon-sm" onClick={() => handleOpenCierreEdit(item.data as CierrePeriodo)} title={!online ? "Necesitás conexión para cerrar caja" : "Editar fechas"} disabled={!online}>
                                    <Pencil className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                                <Button variant="ghost" size="icon-sm" onClick={() => handleDeleteCierre(item.data.id)} title={!online ? "Necesitás conexión para cerrar caja" : "Eliminar cierre"} disabled={!online}>
                                  <Trash2 className="w-3.5 h-3.5 text-[var(--destructive)]" />
                                </Button>
                              </div>
                            )}
                          </div>
                          {(() => {
                            const activas = item.data.resumen.filter(
                              (c) => c.saldo_final !== 0 || c.total_cobros !== 0 || c.total_gastos !== 0
                            );
                            return (
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-2">
                                {activas.map((c) => (
                                  <div key={c.cuenta_id} className="text-xs bg-white/60 bg-[var(--muted)]800/60 rounded p-1.5">
                                    <div className="font-medium truncate">{c.cuenta_nombre}</div>
                                    <div>Depósito total: {formatCLP(c.total_cobros)}</div>
                                    <div>Gasto total: {formatCLP(c.total_gastos)}</div>
                                    <div className={c.saldo_final >= 0 ? "text-[var(--success)]700 dark:text-[var(--success)]" : "text-[var(--destructive)] dark:text-[var(--destructive)]"}>
                                      Saldo: {formatCLP(c.saldo_final)}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            );
                          })()}
                        </td>
                      </tr>
                    ) : (
                      <tr key={item.data.id} className="border-b hover:bg-muted/50">
                        <td className="py-1.5 pr-2 whitespace-nowrap w-[90px]">{item.data.fecha}</td>
                        <td className="py-1.5 pr-2 w-[32px]">{item.data.tipo === "cobro" ? "💰" : item.data.tipo === "reembolso" ? "📥" : "📤"}</td>
                        <td className="py-1.5 pr-2 max-w-[140px] truncate" title={item.data.nombre_cliente || undefined}>{item.data.nombre_cliente || "—"}</td>
                        <td className="py-1.5 pr-2">
                          {item.data.empresa ? <Badge variant="outline" className="text-[10px] px-1 py-0">BN</Badge> : "—"}
                        </td>
                        <td className="py-1.5 pr-2 text-xs text-[var(--body)] max-w-[100px] truncate" title={item.data.notas_imputadas?.length ? item.data.notas_imputadas.join(", ") : undefined}>
                          {item.data.notas_imputadas?.length ? item.data.notas_imputadas.join(", ") : "—"}
                        </td>
                        <td className={`py-1.5 pr-2 text-right font-medium whitespace-nowrap w-[110px] ${item.data.tipo === "cobro" ? "text-[var(--success)]700 dark:text-[var(--success)]" : "text-[var(--destructive)] dark:text-[var(--destructive)]"}`}>
                          {item.data.tipo !== "cobro" ? "-" : ""}{formatCLP(item.data.monto)}
                        </td>
                        <td className="py-1.5 pr-2 text-xs text-[var(--body)] max-w-[100px] truncate" title={item.data.cuenta_nombre}>{item.data.cuenta_nombre}</td>
                        <td className="py-1.5 pr-2 text-xs text-[var(--body)] max-w-[120px] truncate" title={item.data.observaciones || undefined}>
                          {item.data.observaciones || "—"}
                        </td>
                        <td className="py-1.5 pr-2 text-xs w-[70px]">
                          {item.data.forma_pago === "efectivo" ? "💵 Efectivo" : item.data.forma_pago === "cheque" ? "🔖 Cheque" : item.data.forma_pago === "mercadopago" ? "💳 Mercado Pago" : "🏦 Transf."}
                        </td>
                        <td className="py-1.5 pr-2 w-[50px]">
                          {item.data.es_credito ? (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 bg-[var(--primary)] text-primary-foreground border-[var(--primary)]/30">C</Badge>
                          ) : "—"}
                        </td>
                        <td className="py-1.5 flex gap-1">
                          <Button variant="ghost" size="icon-sm" onClick={() => openEditModal(item.data as MovimientoConCuenta)} title="Editar"><Pencil className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="icon-sm" onClick={() => { openEditModal(item.data as MovimientoConCuenta); setEditDeleteConfirm(true); }} title="Eliminar"><Trash2 className="w-3.5 h-3.5 text-[var(--destructive)]" /></Button>
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Paginación */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between text-xs text-[var(--body)] pt-2">
              <span>{pagination.total} movimientos</span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={pagination.page <= 1} onClick={() => fetchMovimientos(pagination.page - 1)}>
                  <ChevronLeft className="w-3.5 h-3.5" />
                </Button>
                <span className="px-2 py-1">{pagination.page} / {pagination.totalPages}</span>
                <Button variant="outline" size="sm" disabled={pagination.page >= pagination.totalPages} onClick={() => fetchMovimientos(pagination.page + 1)}>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Tabla de notas del cliente ────────────────── */}
      {cliente && (
        <div className="border rounded-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm uppercase tracking-wide text-[var(--body)]">
              Notas de {cliente.nombre}
            </h2>
            {resumenLoading && (
              <Loader2 className="w-4 h-4 animate-spin text-[var(--body-subtle)]" />
            )}
          </div>

          {/* Filtros */}
          <div className="flex rounded-lg border p-1 bg-muted/50 w-fit">
            {(["todas", "pendiente", "pagada"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFiltroEstado(f)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  filtroEstado === f
                    ? "bg-background shadow-sm text-foreground"
                    : "text-[var(--body)] hover:text-foreground"
                }`}
              >
                {f === "todas" ? "Todas" : f === "pendiente" ? "Pendientes" : "Pagadas"}
              </button>
            ))}
          </div>

          {/* Tabla */}
          {!resumen ? (
            <p className="text-sm text-[var(--body-subtle)] italic">Sin datos de notas.</p>
          ) : notasFiltradas.length === 0 ? (
            <p className="text-sm text-[var(--body-subtle)] italic">
              {filtroEstado === "pendiente" ? "Sin notas pendientes." : "Sin notas pagadas."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-[var(--body)] uppercase">
                    <th className="py-2 pr-2 font-medium">Nota</th>
                    <th className="py-2 pr-2 font-medium">Fecha</th>
                    <th className="py-2 pr-2 font-medium">Emp.</th>
                    <th className="py-2 pr-2 font-medium text-right">Total</th>
                    <th className="py-2 pr-2 font-medium text-right">Pagado</th>
                    <th className="py-2 font-medium text-right">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {notasFiltradas.map((n) => {
                    const key = `${n.origen}:${n.id}`;
                    const expanded = notaExpandida === key;
                    const saldado = n.saldo_pendiente <= 0.005;
                    return (
                      <tr key={key}>
                        <td colSpan={6} className="p-0">
                          <button
                            onClick={() => setNotaExpandida(expanded ? null : key)}
                            className={`w-full text-left border-b transition-colors ${
                              saldado
                                ? "bg-[var(--success)]50 dark:bg-[var(--success)]/30 hover:bg-[var(--success)] dark:hover:bg-[var(--success)]/50"
                                : "bg-[var(--destructive)]/1050 dark:bg-[var(--destructive)]/10/30 hover:bg-[var(--destructive)]/10 dark:hover:bg-[var(--destructive)]/10/50"
                            }`}
                          >
                            <div className="flex items-center px-2 py-2 gap-2">
                              <span className="font-medium min-w-[60px]">{n.id}</span>
                              <span className="text-[var(--body)] min-w-[80px]">{n.fecha}</span>
                              <Badge variant="outline" className="text-[10px] px-1 py-0 min-w-[40px]">
                                BN
                              </Badge>
                              <span className="text-right min-w-[70px]">{formatCLP(n.total)}</span>
                              <span className="text-right min-w-[70px]">{formatCLP(n.total_pagado)}</span>
                              <span className={`text-right min-w-[70px] font-semibold ${saldado ? "text-[var(--success)]700 dark:text-[var(--success)]" : "text-[var(--destructive)] dark:text-[var(--destructive)]"}`}>
                                {formatCLP(n.saldo_pendiente)}
                              </span>
                            </div>

                            {/* Expanded: payment detail */}
                            {expanded && n.pagos.length > 0 && (
                              <div className="px-3 pb-3 pt-1 border-t border-dashed">
                                {n.pagos.map((p, i) => (
                                  <div key={i} className="text-xs text-[var(--body)] mt-1">
                                    Mov #{p.movimiento_id} — {p.fecha} — {p.forma_pago}
                                    {" · "}
                                    {formatCLP(p.monto)}
                                  </div>
                                ))}
                              </div>
                            )}
                            {expanded && n.pagos.length === 0 && (
                              <div className="px-3 pb-3 pt-1 border-t border-dashed text-xs text-[var(--body-subtle)] italic">
                                Sin pagos registrados
                              </div>
                            )}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {/* Totales */}
                <tfoot>
                  <tr className="border-t-2 text-xs font-semibold">
                    <td className="py-2 pr-2" colSpan={3}>TOTALES</td>
                    <td className="py-2 pr-2 text-right">{formatCLP(resumen.totales.total_vendido)}</td>
                    <td className="py-2 pr-2 text-right">{formatCLP(resumen.totales.total_pagado)}</td>
                    <td className={`py-2 text-right ${resumen.totales.total_pendiente > 0 ? "text-[var(--destructive)] dark:text-[var(--destructive)]" : "text-[var(--success)]700 dark:text-[var(--success)]"}`}>
                      {formatCLP(resumen.totales.total_pendiente)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── Modal cierre de período ────────────────── */}
      <Dialog open={cierreModalOpen} onOpenChange={setCierreModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>🔒 Cierre de Período</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-[var(--body)]">
              Se calculará automáticamente el resumen por cuenta desde el último cierre hasta hoy.
              Los movimientos no se eliminan — solo se guarda un snapshot con los saldos al día de hoy.
            </p>
            <div className="bg-[var(--warning)]/1050 dark:bg-[var(--warning)]/10 border border-[var(--warning)]/30 dark:border-[var(--warning)]/30 rounded-lg px-3 py-2 text-sm text-[var(--warning)] dark:text-[var(--warning)]">
              ⚠️ Esta acción no se puede deshacer fácilmente. Asegúrate de que todos los
              movimientos del período estén registrados.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCierreModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCierre} disabled={cierreLoading}>
              {cierreLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Confirmar cierre
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Modal editar movimiento ──────────────────── */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Movimiento #{editMov?.id}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Tipo */}
            <div className="flex rounded-lg border p-1 bg-muted/50">
              {(["cobro", "gasto"] as const).map((t) => (
                <button key={t} onClick={() => setEditTipo(t)} className={`flex-1 py-1.5 text-xs font-medium rounded-md ${editTipo === t ? "bg-background shadow-sm" : "text-[var(--body)]"}`}>
                  {t === "cobro" ? "💰 Cobro" : "📤 Gasto"}
                </button>
              ))}
            </div>
            {/* Fecha */}
            <div className="space-y-1"><label className="text-xs font-medium">Fecha</label><Input type="date" value={editFecha} onChange={(e) => setEditFecha(e.target.value)} /></div>
            {/* Cliente */}
            {editTipo === "cobro" && (
              <div className="space-y-1">
                <label className="text-xs font-medium">Cliente</label>
                <Input value={editClienteQuery} onChange={(e) => setEditClienteQuery(e.target.value)} placeholder="Nombre del cliente" />
              </div>
            )}
            {/* Empresa */}
            <div className="space-y-1">
              <label className="text-xs font-medium">Empresa</label>
              <select value={editEmpresa} onChange={(e) => setEditEmpresa(e.target.value as "bazar-naty" | "")} className="w-full h-9 rounded-md border border-[var(--border)] border-[var(--border)]700 bg-transparent px-3 text-sm">
                <option value="">—</option><option value="bazar-naty">La Esquina</option>
              </select>
            </div>
            {/* Monto */}
            <div className="space-y-1"><label className="text-xs font-medium">Monto</label><Input type="number" min="0" step="1" value={editMonto} onChange={(e) => setEditMonto(e.target.value)} /></div>
            {/* Cuenta */}
            <div className="space-y-1">
              <label className="text-xs font-medium">Cuenta bancaria</label>
              <select value={editCuentaId} onChange={(e) => setEditCuentaId(e.target.value)} className="w-full h-9 rounded-md border border-[var(--border)] border-[var(--border)]700 bg-transparent px-3 text-sm">
                {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            {/* Forma de pago */}
            <div className="space-y-1"><label className="text-xs font-medium">Forma de pago</label>
              <select value={editFormaPago} onChange={(e) => setEditFormaPago(e.target.value as FormaPago)} className="w-full h-9 rounded-md border border-[var(--border)] border-[var(--border)]700 bg-transparent px-3 text-sm">
                <option value="efectivo">Efectivo</option><option value="cheque">Cheque</option><option value="transferencia">Transferencia</option><option value="mercadopago">Mercado Pago</option>
              </select>
            </div>
            {/* Venta a crédito (solo cobro) */}
            {editTipo === "cobro" && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editEsCredito}
                  onChange={(e) => setEditEsCredito(e.target.checked)}
                  className="w-4 h-4 rounded border-[var(--border)]"
                />
                <span className="text-sm font-medium">Venta a crédito</span>
              </label>
            )}

            {/* Observaciones */}
            <div className="space-y-1"><label className="text-xs font-medium">Observaciones</label><Input value={editObs} onChange={(e) => setEditObs(e.target.value)} placeholder="Opcional" /></div>

            {/* Delete confirmation */}
            {editDeleteConfirm && (
              <div className="border border-[var(--destructive)]/30 dark:border-[var(--destructive)]/30 rounded-lg p-3 bg-[var(--destructive)]/10 dark:bg-[var(--destructive)]/10/30">
                <p className="text-sm text-[var(--destructive)] dark:text-[var(--destructive)] mb-2">¿Eliminar este movimiento permanentemente?</p>
                <Button variant="outline" size="sm" className="w-full text-[var(--destructive)] hover:bg-[var(--destructive)]/10" onClick={handleEditDelete}>⚠ Eliminar movimiento</Button>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleEditSave} disabled={editSaving}>
              {editSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Guardar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
