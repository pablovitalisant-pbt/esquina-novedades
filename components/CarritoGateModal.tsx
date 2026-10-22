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
 * Gate obligatorio: pide nombre+teléfono la primera vez (patrón Form Modal
 * de design-skill/modals.md). Al confirmar llama onConfirm; la validación
 * replica la del backend (ambos campos no vacíos tras trim).
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
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const n = nombre.trim();
    const t = telefono.trim();
    if (!n || !t) {
      setError('Completá tu nombre y teléfono para continuar.');
      return;
    }
    onConfirm({ nombre: n, telefono: t });
    setNombre('');
    setTelefono('');
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
