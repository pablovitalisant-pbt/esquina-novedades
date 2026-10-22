import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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

// ponytail: formatUSD/formatArsEquivalente siguen hasta 2e (aún tienen usuarios).
export function formatUSD(value: number, decimals: number = 2): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
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

// Equivalente en ARS de un monto en USD usando el dolar_dia de caja_config.
// Retorna null si dolarDia <= 0 o si algún valor es inválido (evita mostrar
// "≈ AR$ 0" cuando el tipo de cambio no está configurado).
export function formatArsEquivalente(usd: number, dolarDia: number): string | null {
  if (!Number.isFinite(usd) || !Number.isFinite(dolarDia) || dolarDia <= 0) return null;
  const ars = usd * dolarDia;
  return `≈ AR$ ${ars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

