'use client';

import { useState, FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ContactoCarrito } from '@/contexts/CarritoContext';

/**
 * Gate obligatorio: pide nombre+teléfono+email la primera vez (patrón Form
 * Modal de design-skill/modals.md). Al confirmar llama onConfirm; la
 * validación replica la del backend (campos no vacíos y email con @).
 */
export function CarritoGateModal({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (contacto: ContactoCarrito) => void;
}) {
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const n = nombre.trim();
    const t = telefono.trim();
    const m = email.trim();
    if (!n || !t || !m) {
      setError('Completá tu nombre, teléfono y email para continuar.');
      return;
    }
    if (!m.includes('@')) {
      setError('Ingresá un email válido.');
      return;
    }
    onConfirm({ nombre: n, telefono: t, email: m });
    setNombre('');
    setTelefono('');
    setEmail('');
    setError(null);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>¿A qué nombre armamos el pedido?</DialogTitle>
            <DialogDescription>
              Lo usamos para identificarte al confirmar. Se guarda en tu navegador para tus próximos pedidos.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="gate-nombre">Nombre</Label>
              <Input
                id="gate-nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Tu nombre"
                autoComplete="name"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="gate-telefono">Teléfono</Label>
              <Input
                id="gate-telefono"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="+591 700 12345"
                inputMode="tel"
                autoComplete="tel"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="gate-email">Email</Label>
              <Input
                id="gate-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                autoComplete="email"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit">Continuar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
