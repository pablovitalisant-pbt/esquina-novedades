import { NextResponse } from 'next/server';
import type { Session } from 'next-auth';
import type { CuentaCierreResumen } from '@/docs/specs/caja-mayor.spec';

// Guard admin compartido: mismos 401/403 que tenían las copias locales.
export function requiereAdmin(session: Session | null, mensaje = 'Acceso denegado'): NextResponse | null {
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (session.user.rol !== 'admin') {
    return NextResponse.json({ error: mensaje }, { status: 403 });
  }
  return null;
}

export interface CierreRow {
  id: number;
  fecha_desde: string;
  fecha_hasta: string;
  resumen: CuentaCierreResumen[] | string;
  usuario_id: number;
  usuario_nombre: string;
  created_at: string;
}

export interface MovimientoFechaRow {
  fecha: string;
}

export interface NotaRow {
  id: number;
  fecha: string;
  total: string;
  total_pagado: string;
  cliente_id: string;
  nombre_cliente: string;
}
