import { sql } from '@/lib/db';

// Usuario dedicado (migración 044, inactivo: no puede iniciar sesión) que figura
// como autor de las notas creadas por el webhook de Mercado Pago.
export async function usuarioSistema(): Promise<{ id: number; nombre: string }> {
  const rows = await sql`SELECT id, nombre FROM public.usuarios WHERE rut = ${'SISTEMA-MP'} LIMIT 1`;
  if (rows.length === 0) throw new Error('Usuario sistema SISTEMA-MP no existe');
  return { id: Number(rows[0].id), nombre: rows[0].nombre };
}
