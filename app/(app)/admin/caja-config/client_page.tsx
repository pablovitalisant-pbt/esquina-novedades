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
import { Pencil, Plus, Loader2, Trash2 } from "lucide-react";
import { formatMonto } from "@/docs/specs/caja-mayor.spec";

import type { Cuenta } from '@/types';

interface SaldoInicial {
  id: number;
  cuenta_id: number;
  cuenta_nombre: string;
  fecha: string;
  saldo: number;
  observaciones: string | null;
}

interface OpcionEntrega {
  codigo: string;
  nombre: string;
  costo: number;
}

export function CajaConfigClient({ currentUserNombre }: { currentUserNombre: string }) {
  // ─── Carga inicial (2 fetch) ───
  useEffect(() => {
    (async () => {
      try {
        const [cuentasRes, saldosRes, entregaRes] = await Promise.all([
          fetch("/api/caja/cuentas"),
          fetch("/api/caja/saldos-iniciales"),
          fetch("/api/entrega/opciones"),
        ]);
        if (cuentasRes.ok) {
          const json = await cuentasRes.json();
          setCuentas(json.data || []);
        }
        if (saldosRes.ok) {
          const json = await saldosRes.json();
          setSaldos(json.data || []);
        }
        if (entregaRes.ok) {
          const json = await entregaRes.json();
          setOpciones(json.data || []);
        }
      } catch { /* mantener vacío */ }
    })();
  }, []);

  // ─── Opciones de entrega (admin de costos) ──────────────
  const [opciones, setOpciones] = useState<OpcionEntrega[]>([]);
  const [costos, setCostos] = useState<Record<string, string>>({});

  const guardarCosto = async (o: OpcionEntrega) => {
    const costo = parseInt(costos[o.codigo] ?? String(o.costo), 10) || 0;
    const res = await fetch(`/api/entrega/opciones/${o.codigo}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ costo }),
    });
    if (!res.ok) {
      const err = await res.json();
      toast.error(err.error || "Error al guardar el costo");
      return;
    }
    const json = await res.json();
    setOpciones((prev) => prev.map((x) => (x.codigo === o.codigo ? json.data : x)));
    toast.success("Costo de entrega actualizado");
  };

  // ─── Cuentas ────────────────────────────────────────────
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCuenta, setEditingCuenta] = useState<Cuenta | null>(null);
  const [formNombre, setFormNombre] = useState("");
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
    setFormOrden(String(cuentas.length + 1));
    setModalOpen(true);
  };

  const openEdit = (c: Cuenta) => {
    setEditingCuenta(c);
    setFormNombre(c.nombre);
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

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Caja Mayor — Configuración</h1>
        <p className="text-sm text-[var(--body)] mt-1">
          Cuentas y saldos iniciales. Solo visible para administradores.
        </p>
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
                  <TableCell>{s.fecha}</TableCell>
                  <TableCell className="text-right">${formatMonto(s.saldo)}</TableCell>
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

      {/* ─── Opciones de entrega ────────────────────────── */}
      <div className="border rounded-card p-5 space-y-4">
        <h2 className="font-semibold text-sm uppercase tracking-wide text-[var(--body)]">
          Opciones de entrega
        </h2>
        {opciones.length === 0 ? (
          <p className="text-sm text-[var(--body-subtle)] italic">
            No hay opciones de entrega configuradas.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Opción</TableHead>
                <TableHead>Costo (CLP)</TableHead>
                <TableHead className="w-[100px]">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {opciones.map((o) => (
                <TableRow key={o.codigo}>
                  <TableCell className="font-medium">{o.nombre}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="0"
                      aria-label={`Costo de ${o.nombre}`}
                      value={costos[o.codigo] ?? String(o.costo)}
                      onChange={(e) => setCostos((prev) => ({ ...prev, [o.codigo]: e.target.value }))}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      aria-label={`Guardar costo de ${o.nombre}`}
                      onClick={() => guardarCosto(o)}
                    >
                      Guardar
                    </Button>
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
                      {c.nombre}{yaTieneSaldo ? " — ya tiene saldo" : ""}
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
