"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Pencil, Plus, Save, Loader2, Trash2 } from "lucide-react";
import { formatMonto } from "@/docs/specs/caja-mayor.spec";

import type { Cuenta } from '@/types';

interface ConfigData {
  dolar_dia: number;
  updated_at: string | null;
  updated_por: string;
}

interface SaldoInicial {
  id: number;
  cuenta_id: number;
  cuenta_nombre: string;
  cuenta_moneda: "USD" | "ARS";
  fecha: string;
  saldo: number;
  observaciones: string | null;
}

export function CajaConfigClient({ currentUserNombre }: { currentUserNombre: string }) {
  // ─── Dólar del día ──────────────────────────────────────
  const [dolarDia, setDolarDia] = useState("");
  const [dolarSaving, setDolarSaving] = useState(false);
  const [dolarInfo, setDolarInfo] = useState<ConfigData>({ dolar_dia: 0, updated_at: null, updated_por: "" });

  // ─── Carga inicial (3 fetch) ───
  useEffect(() => {
    (async () => {
      try {
        const [cfgRes, cuentasRes, saldosRes] = await Promise.all([
          fetch("/api/caja/config"),
          fetch("/api/caja/cuentas"),
          fetch("/api/caja/saldos-iniciales"),
        ]);
        if (cfgRes.ok) {
          const json = await cfgRes.json();
          const v = parseFloat(json.data?.valor);
          if (v > 0) setDolarDia(String(v));
          setDolarInfo({ dolar_dia: v, updated_at: json.data?.updated_at ?? null, updated_por: json.data?.updated_por ?? "" });
        }
        if (cuentasRes.ok) {
          const json = await cuentasRes.json();
          setCuentas(json.data || []);
        }
        if (saldosRes.ok) {
          const json = await saldosRes.json();
          setSaldos(json.data || []);
        }
      } catch { /* mantener vacío */ }
    })();
  }, []);

  const handleSaveDolar = async () => {
    const num = parseFloat(dolarDia);
    if (isNaN(num) || num < 0) {
      toast.error("Ingresa un valor válido para el dólar");
      return;
    }
    setDolarSaving(true);
    const res = await fetch("/api/caja/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dolar_dia: num }),
    });
    if (res.ok) {
      const json = await res.json();
      setDolarInfo({
        dolar_dia: parseFloat(json.data.valor),
        updated_at: json.data.updated_at,
        updated_por: json.data.updated_por,
      });
      toast.success(`Dólar actualizado a $${num}`);
    } else {
      const err = await res.json();
      toast.error(err.error?.fieldErrors?.dolar_dia?.[0] || err.error || "Error al guardar");
    }
    setDolarSaving(false);
  };

  // ─── Cuentas ────────────────────────────────────────────
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCuenta, setEditingCuenta] = useState<Cuenta | null>(null);
  const [formNombre, setFormNombre] = useState("");
  const [formMoneda, setFormMoneda] = useState<"USD" | "ARS">("USD");
  const [formOrden, setFormOrden] = useState("0");
  const [formSaving, setFormSaving] = useState(false);

  // ─── Saldos Iniciales ───────────────────────────────────
  const [saldos, setSaldos] = useState<SaldoInicial[]>([]);
  const [saldoModalOpen, setSaldoModalOpen] = useState(false);
  const [editingSaldo, setEditingSaldo] = useState<SaldoInicial | null>(null);
  const [saldoFormCuentaId, setSaldoFormCuentaId] = useState("");
  const [saldoFormFecha, setSaldoFormFecha] = useState(new Date().toISOString().slice(0, 10));
  const [saldoFormSaldo, setSaldoFormSaldo] = useState("");
  const [saldoFormObs, setSaldoFormObs] = useState("");
  const [saldoFormSaving, setSaldoFormSaving] = useState(false);

  const openSaldoCreate = () => {
    setEditingSaldo(null);
    setSaldoFormCuentaId("");
    setSaldoFormFecha(new Date().toISOString().slice(0, 10));
    setSaldoFormSaldo("");
    setSaldoFormObs("");
    setSaldoModalOpen(true);
  };

  const openSaldoEdit = (s: SaldoInicial) => {
    setEditingSaldo(s);
    setSaldoFormCuentaId(String(s.cuenta_id));
    setSaldoFormFecha(s.fecha);
    setSaldoFormSaldo(String(s.saldo));
    setSaldoFormObs(s.observaciones || "");
    setSaldoModalOpen(true);
  };

  const handleSaveSaldo = async () => {
    if (!saldoFormCuentaId || !saldoFormFecha) {
      toast.error("Cuenta y fecha son requeridos");
      return;
    }
    // Crear un saldo nuevo offline → bloqueado (nueva fila con id server-generado).
    if (!editingSaldo && !navigator.onLine) {
      toast.error("Crear un saldo inicial nuevo requiere conexión a internet.");
      return;
    }
    setSaldoFormSaving(true);
    const body = {
      cuenta_id: parseInt(saldoFormCuentaId, 10),
      fecha: saldoFormFecha,
      saldo: parseFloat(saldoFormSaldo) || 0,
      observaciones: saldoFormObs.trim() || null,
    };

    const res = await fetch("/api/caja/saldos-iniciales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const json = await res.json();
      setSaldos((prev) => {
        const existing = prev.findIndex((s) => s.cuenta_id === json.data.cuenta_id);
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = json.data;
          return updated;
        }
        return [...prev, json.data];
      });
      toast.success(editingSaldo ? "Saldo inicial actualizado" : "Saldo inicial creado");
      setSaldoModalOpen(false);
    } else {
      const err = await res.json();
      toast.error(err.error?.fieldErrors?.saldo?.[0] || err.error || "Error al guardar");
    }
    setSaldoFormSaving(false);
  };

  const handleDeleteSaldo = async (id: number) => {
    if (!confirm("¿Eliminar este saldo inicial?")) return;
    const res = await fetch(`/api/caja/saldos-iniciales/${id}`, { method: "DELETE" });
    if (res.ok) {
      setSaldos((prev) => prev.filter((s) => s.id !== id));
      toast.success("Saldo inicial eliminado");
    } else {
      const err = await res.json();
      toast.error(err.error || "Error al eliminar");
    }
  };

  const openCreate = () => {
    setEditingCuenta(null);
    setFormNombre("");
    setFormMoneda("USD");
    setFormOrden(String(cuentas.length + 1));
    setModalOpen(true);
  };

  const openEdit = (c: Cuenta) => {
    setEditingCuenta(c);
    setFormNombre(c.nombre);
    setFormMoneda(c.moneda);
    setFormOrden(String(c.orden));
    setModalOpen(true);
  };

  const handleSaveCuenta = async () => {
    if (!formNombre.trim()) {
      toast.error("El nombre es requerido");
      return;
    }
    // Crear una cuenta nueva offline → bloqueado con mensaje claro (evita
    // migrar caja_cuentas.id a UUID para una acción de configuración inicial).
    if (!editingCuenta && !navigator.onLine) {
      toast.error("Crear una cuenta nueva requiere conexión a internet.");
      return;
    }
    setFormSaving(true);

    const body = {
      nombre: formNombre.trim(),
      moneda: formMoneda,
      orden: parseInt(formOrden, 10) || 0,
    };

    const url = editingCuenta
      ? `/api/caja/cuentas/${editingCuenta.id}`
      : "/api/caja/cuentas";
    const method = editingCuenta ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const json = await res.json();
      if (editingCuenta) {
        setCuentas((prev) =>
          prev.map((c) => (c.id === editingCuenta.id ? json.data : c))
        );
        toast.success("Cuenta actualizada");
      } else {
        setCuentas((prev) => [...prev, json.data]);
        toast.success("Cuenta creada");
      }
      setModalOpen(false);
    } else {
      const err = await res.json();
      toast.error(err.error?.fieldErrors?.nombre?.[0] || err.error || "Error al guardar");
    }
    setFormSaving(false);
  };

  const handleToggleActiva = async (cuenta: Cuenta) => {
    if (cuenta.activa) {
      // Desactivar
      const res = await fetch(`/api/caja/cuentas/${cuenta.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        const json = await res.json();
        setCuentas((prev) =>
          prev.map((c) => (c.id === cuenta.id ? json.data : c))
        );
        toast.success(`Cuenta "${cuenta.nombre}" desactivada`);
      } else {
        const err = await res.json();
        toast.error(err.error || "Error al desactivar");
      }
    } else {
      // Reactivar (usando PATCH)
      const res = await fetch(`/api/caja/cuentas/${cuenta.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activa: true }),
      });
      if (res.ok) {
        const json = await res.json();
        setCuentas((prev) =>
          prev.map((c) => (c.id === cuenta.id ? json.data : c))
        );
        toast.success(`Cuenta "${cuenta.nombre}" reactivada`);
      } else {
        const err = await res.json();
        toast.error(err.error || "Error al reactivar");
      }
    }
  };

  const monedaBadge = (m: string) =>
    m === "USD" ? (
      <Badge variant="default" className="text-xs">
        USD
      </Badge>
    ) : (
      <Badge variant="secondary" className="text-xs">
        ARS
      </Badge>
    );

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Caja Mayor — Configuración</h1>
        <p className="text-sm text-[var(--body)] mt-1">
          Dólar del día y cajas. Solo visible para administradores.
        </p>
      </div>

      {/* ─── Dólar del día ──────────────────────────────── */}
      <div className="border rounded-card p-5 space-y-3">
        <h2 className="font-semibold text-sm uppercase tracking-wide text-[var(--body)]">
          Dólar del día
        </h2>
        <div className="flex gap-2 items-end">
          <div className="flex-1 space-y-1">
            <label className="text-xs text-[var(--body)]">Valor USD a ARS</label>
            <div className="flex gap-2">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={dolarDia}
                onChange={(e) => setDolarDia(e.target.value)}
                placeholder="Ej: 980.50"
                className="flex-1"
              />
            </div>
          </div>
          <Button onClick={handleSaveDolar} disabled={dolarSaving}>
            {dolarSaving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Guardar
          </Button>
        </div>
        {dolarInfo.updated_at && (
          <p className="text-xs text-[var(--body-subtle)]">
            Última actualización:{" "}
            {new Date(dolarInfo.updated_at).toLocaleString("es-BO")} por{" "}
            {dolarInfo.updated_por}
          </p>
        )}
      </div>

      {/* ─── Cuentas bancarias ───────────────────────────── */}
      <div className="border rounded-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm uppercase tracking-wide text-[var(--body)]">
            Cuentas bancarias
          </h2>
          <Button size="sm" onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" /> Nueva cuenta
          </Button>
        </div>

        {cuentas.length === 0 ? (
          <p className="text-sm text-[var(--body-subtle)] italic">
            No hay cuentas configuradas.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Moneda</TableHead>
                <TableHead>Orden</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-[80px]">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cuentas.map((c) => (
                <TableRow
                  key={c.id}
                  className={c.activa ? "" : "opacity-50"}
                >
                  <TableCell className="font-medium">{c.nombre}</TableCell>
                  <TableCell>{monedaBadge(c.moneda)}</TableCell>
                  <TableCell className="text-[var(--body)]">{c.orden}</TableCell>
                  <TableCell>
                    <button
                      onClick={() => handleToggleActiva(c)}
                      className="cursor-pointer"
                      title={
                        c.activa
                          ? "Click para desactivar"
                          : "Click para reactivar"
                      }
                    >
                      <Badge
                        variant={c.activa ? "default" : "outline"}
                        className="text-xs"
                      >
                        {c.activa ? "Activa" : "Inactiva"}
                      </Badge>
                    </button>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => openEdit(c)}
                      title="Editar cuenta"
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* ─── Saldos Iniciales ───────────────────────────── */}
      <div className="border rounded-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm uppercase tracking-wide text-[var(--body)]">
            Saldos Iniciales
          </h2>
          <Button size="sm" onClick={openSaldoCreate}>
            <Plus className="w-4 h-4 mr-2" /> Agregar saldo inicial
          </Button>
        </div>

        {saldos.length === 0 ? (
          <p className="text-sm text-[var(--body-subtle)] italic">
            No hay saldos iniciales registrados. Configúralos para poder crear cierres de período.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cuenta</TableHead>
                <TableHead>Moneda</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead>Obs.</TableHead>
                <TableHead className="w-[80px]">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {saldos.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.cuenta_nombre}</TableCell>
                  <TableCell>{monedaBadge(s.cuenta_moneda)}</TableCell>
                  <TableCell>{s.fecha}</TableCell>
                  <TableCell className="text-right">
                    {s.cuenta_moneda === "ARS" ? "$" : ""}
                    {formatMonto(s.saldo, s.cuenta_moneda)}
                  </TableCell>
                  <TableCell className="text-[var(--body)] max-w-[120px] truncate">
                    {s.observaciones || "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon-sm" onClick={() => openSaldoEdit(s)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => handleDeleteSaldo(s.id)}>
                        <Trash2 className="w-3.5 h-3.5 text-[var(--destructive)]" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* ─── Modal saldo inicial ────────────────────────── */}
      <Dialog open={saldoModalOpen} onOpenChange={setSaldoModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingSaldo ? "Editar saldo inicial" : "Nuevo saldo inicial"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">Cuenta</label>
              <select
                value={saldoFormCuentaId}
                onChange={(e) => setSaldoFormCuentaId(e.target.value)}
                disabled={!!editingSaldo}
                className="w-full h-9 rounded-md border border-[var(--border)] border-[var(--border)]700 bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)] bg-[var(--muted)]900 disabled:opacity-50"
              >
                <option value="">Seleccionar cuenta</option>
                {cuentas.filter((c) => c.activa).map((c) => {
                  const yaTieneSaldo = saldos.find((s) => s.cuenta_id === c.id && s.id !== editingSaldo?.id);
                  return (
                    <option key={c.id} value={c.id} disabled={!!yaTieneSaldo}>
                      {c.nombre} ({c.moneda}){yaTieneSaldo ? " — ya tiene saldo" : ""}
                    </option>
                  );
                })}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Fecha</label>
              <Input
                type="date"
                value={saldoFormFecha}
                onChange={(e) => setSaldoFormFecha(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Saldo</label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={saldoFormSaldo}
                onChange={(e) => setSaldoFormSaldo(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Observaciones (opcional)</label>
              <Input
                value={saldoFormObs}
                onChange={(e) => setSaldoFormObs(e.target.value)}
                placeholder="Ej: Saldo inicial enero 2024"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaldoModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveSaldo} disabled={saldoFormSaving}>
              {saldoFormSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {editingSaldo ? "Guardar cambios" : "Crear saldo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Modal crear/editar cuenta ───────────────────── */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingCuenta ? "Editar cuenta" : "Nueva cuenta"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">Nombre</label>
              <Input
                value={formNombre}
                onChange={(e) => setFormNombre(e.target.value)}
                placeholder="Ej: Caja chica"
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Moneda</label>
              <select
                value={formMoneda}
                onChange={(e) => setFormMoneda(e.target.value as "USD" | "ARS")}
                className="w-full h-9 rounded-md border border-[var(--border)] border-[var(--border)]700 bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)] bg-[var(--muted)]900"
              >
                <option value="USD">USD — Dólares</option>
                <option value="ARS">ARS — Pesos argentinos</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Orden</label>
              <Input
                type="number"
                min="0"
                value={formOrden}
                onChange={(e) => setFormOrden(e.target.value)}
                placeholder="0 = primero"
              />
              <p className="text-xs text-[var(--body-subtle)]">
                Define la posición en listas y dropdowns
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveCuenta} disabled={formSaving}>
              {formSaving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              {editingCuenta ? "Guardar cambios" : "Crear cuenta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
