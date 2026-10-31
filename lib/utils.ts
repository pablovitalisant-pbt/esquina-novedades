import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Contador de ítems del POS: "0 ítems", "1 ítem", "N ítems" (con tilde).
export function formatItems(value: number): string {
  const n = Number(value);
  return `${n} ${n === 1 ? 'ítem' : 'ítems'}`;
}

export function formatCLP(value: number): string {
  const n = Number(value);
  if (value == null || !Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(n);
}

// Saldo pendiente formateado para la lista de Notas de Venta. Retorna el
// string SOLO si hay pago parcial (total_pagado > 0 y saldo_pendiente > 0).
// Sin pago → null (redundante con el Total); pagada completa → null. El guard
// > 0.005 evita mostrar "Pendiente: $0" por ruido de punto flotante.
export function formatSaldoPendiente(total_pagado?: number, saldo_pendiente?: number): string | null {
  const pagado = Number(total_pagado ?? 0);
  const pendiente = Number(saldo_pendiente ?? 0);
  if (pagado > 0.005 && pendiente > 0.005) {
    return formatCLP(pendiente);
  }
  return null;
}

