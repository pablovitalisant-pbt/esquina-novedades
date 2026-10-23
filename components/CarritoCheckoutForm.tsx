'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCLP } from '@/lib/utils';
import type { ContactoCarrito } from '@/contexts/CarritoContext';
export type OpcionEntrega = {
  codigo: string;
  nombre: string;
  costo: number;
  requiere_direccion: boolean;
  nota: string | null;
};
export type DatosCheckout = {
  nombre: string;
  telefono: string;
  email: string;
  entrega_codigo: string;
  direccion_entrega: string;
  opcion: OpcionEntrega | null;
};

/**
 * Checkout (design-skill/inputs.md + modals.md Form Modal): contacto, opción
 * de entrega desde la API y dirección solo si la opción la exige. Valida en
 * el cliente; el servidor vuelve a validar y calcula el total real (7e).
 */
export function CarritoCheckoutForm({
  contacto, opciones, onCambio, onSubmit,
}: {
  contacto: ContactoCarrito | null;
  opciones: OpcionEntrega[];
  onCambio: (datos: DatosCheckout) => void;
  onSubmit: (datos: DatosCheckout) => void;
}) {
  const [nombre, setNombre] = useState(contacto?.nombre ?? '');
  const [telefono, setTelefono] = useState(contacto?.telefono ?? '');
  const [email, setEmail] = useState(contacto?.email ?? '');
  const [entregaCodigo, setEntregaCodigo] = useState('');
  const [direccion, setDireccion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const opcion = opciones.find((o) => o.codigo === entregaCodigo) ?? null;
  const datos: DatosCheckout = {
    nombre: nombre.trim(), telefono: telefono.trim(), email: email.trim(),
    entrega_codigo: entregaCodigo, direccion_entrega: direccion.trim(), opcion,
  };
  useEffect(() => {
    onCambio(datos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nombre, telefono, email, entregaCodigo, direccion, opciones]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!datos.nombre || !datos.telefono) return setError('Completa tu nombre y teléfono.');
    if (!datos.email.includes('@')) return setError('Ingresa un email válido.');
    if (!opcion) return setError('Elige una opción de entrega.');
    if (opcion.requiere_direccion && !datos.direccion_entrega) return setError('Ingresa la dirección de entrega.');
    setError(null);
    onSubmit(datos);
  }

  return (
    <form id="checkout-form" onSubmit={handleSubmit} className="flex flex-col gap-4 border-t border-[var(--border-default)] pt-4">
      <h3 className="text-sm font-bold text-[var(--heading)]">Datos de contacto y entrega</h3>
      <div className="grid gap-2">
        <Label htmlFor="checkout-nombre">Nombre</Label>
        <Input id="checkout-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="checkout-telefono">Teléfono</Label>
        <Input id="checkout-telefono" value={telefono} onChange={(e) => setTelefono(e.target.value)} inputMode="tel" autoComplete="tel" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="checkout-email">Email</Label>
        <Input id="checkout-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="checkout-entrega">Opción de entrega</Label>
        <select
          id="checkout-entrega"
          value={entregaCodigo}
          onChange={(e) => setEntregaCodigo(e.target.value)}
          className="h-10 w-full rounded-pill border border-[var(--border-default)] bg-[var(--neutral-primary-soft)] px-3 text-sm text-[var(--heading)] outline-none focus-visible:border-[var(--brand-strong)]"
        >
          <option value="">Elige una opción</option>
          {opciones.map((o) => (
            <option key={o.codigo} value={o.codigo}>{o.nombre} — {formatCLP(o.costo)}</option>
          ))}
        </select>
        {opcion?.nota && <p className="text-xs text-[var(--body-subtle)]">{opcion.nota}</p>}
      </div>
      {opcion?.requiere_direccion && (
        <div className="grid gap-2">
          <Label htmlFor="checkout-direccion">Dirección de entrega</Label>
          <Input id="checkout-direccion" value={direccion} onChange={(e) => setDireccion(e.target.value)} autoComplete="street-address" />
        </div>
      )}
      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
    </form>
  );
}
