import type { Session } from 'next-auth';

// Contexto de ruta compartido (PRD §9.23 — antes duplicado en 7 archivos)
export type RouteContext<T extends Record<string, string> = { id: string }> = {
  params: Promise<T>;
};

// Tipos compartidos — antes duplicados en client_page.tsx (PRD §9.24)
export interface Cuenta {
  id: number;
  nombre: string;
  activa: boolean;
  orden: number;
  created_at?: string;
}

export interface Empresa {
  id: number;
  nombre: string;
  slug: string;
  created_at: Date;
}

export interface Producto {
  id: number;
  empresa_id: number;
  codigo: string;
  nroingreso: string | null;
  saldo: number;
  umed: string;
  cif: number;
  costo: number;
  margen_pct: number | null;
  prcventa: number;
  prcminimo: number;
  precio_mayor?: number | null;
  minimo_mayor?: number | null;
  cantcaja: number;
  pesocaja: number;
  cubicaja: number;
  detalle: string | null;
  imagen_url: string | null;
  es_nuevo: boolean;
  categoria: string | null;
  stock_minimo: number | null;
  fecha_ingreso: Date;
  updated_at: Date;
  activo?: boolean; // soft-delete: false = eliminado (POST /api/productos/[id]/eliminar)
}

export interface UbicacionBodega {
  id: number;
  empresa_id: number;
  codigo: string;
  nroingreso: string | null;
  ubicacion: string;
  detalle: string | null;
  cantcaja: number;
  saldo: number;
  saldocajas: number;
  fisico: number | null;
  diferencia: number | null;
  observaciones: string | null;
  updated_at: Date;
}

export interface UbicacionBodegaAgrupada {
  codigo: string;
  detalle: string | null;
  producto_imagen_url: string | null;
  empresa_id: number;
  saldo: number;
  cantcaja: number;
  umed: string;
  fisico: number | null;
  diferencia: number | null;
  fisico_cajas: number | null;
  fisico_unidades: number | null;
  ubicacion: string | null;
  observaciones: string | null;
}

export interface InventarioConteo {
  id: number;
  ubicacion_id: number;
  empresa_id: number;
  fisico: number | null;
  diferencia: number | null;
  observaciones: string | null;
  contado_por: number;
  updated_at: Date;
}

export interface Usuario {
  id: number;
  rut: string;
  nombre: string;
  rol: 'admin' | 'bodeguero' | 'vendedor';
  password?: string;
  activo: boolean;
  created_at: Date;
}

export interface Despacho {
  id: number;
  empresa_id: number;
  folio: string | null;
  imagen_url: string;
  imagen_public_id: string;
  nombre_original: string | null;
  estado: 'ok' | 'sin_folio' | 'revision' | 'error';
  procesado_por: number | null;
  fecha_despacho: Date;
  created_at: Date;
}

export interface Catalogo {
  id: number;
  empresa_id: number;
  nombre: string;
  slug: string;
  descripcion: string | null;
  activo: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CatalogoItem {
  id: number;
  catalogo_id: number;
  producto_id: number;
  orden: number;
  video_url: string | null;
  nota_extra: string | null;
  created_at: Date;
}

// Prop `session` que reciben los client components: estructura laxa a
// propósito para que las páginas puedan pasar la Session de NextAuth y los
// tests un objeto parcial, sin depender de los campos opcionales de NextAuth.
export type SessionProp = {
  user?: {
    id?: string | number;
    rut?: string;
    nombre?: string;
    rol?: string;
    empresas?: number[];
    [key: string]: unknown;
  };
} | null;

export type UserSession = Session['user'];
