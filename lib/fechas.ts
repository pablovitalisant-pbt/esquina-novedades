// Utilidades de fecha del proyecto. America/Santiago explícita siempre:
// el servidor corre en UTC y el navegador puede estar en otra zona (BUG-009).
const TZ = 'America/Santiago';

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// Postgres puede devolver "2026-11-20 11:32:33.928739+00": no es ISO estricto y
// Safari/iOS no lo garantiza. Normaliza espacio, fracción a milisegundos y offset
// con minutos ("+00" -> "+00:00", "+0000" -> "+00:00").
export function normalizarFechaPostgres(value: string): string {
  return value
    .replace(' ', 'T')
    .replace(/(\.\d{3})\d+/, '$1')
    .replace(/([+-]\d{2})(\d{2})$/, '$1:$2')
    .replace(/([+-]\d{2})$/, '$1:00');
}

function aFecha(value: string | Date): Date {
  return value instanceof Date ? value : new Date(normalizarFechaPostgres(String(value)));
}

// Texto visible 'DD mmm AAAA' (es-CL, mes corto). `opciones` permite el mes
// largo de los PDF. Fecha inválida -> el texto original, no lanza.
export function formatFecha(
  value: string | Date,
  opciones: Intl.DateTimeFormatOptions = {},
): string {
  const fecha = aFecha(value);
  if (Number.isNaN(fecha.getTime())) return typeof value === 'string' ? value : '';
  return fecha.toLocaleDateString('es-CL', {
    timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric', ...opciones,
  });
}

// 'DD mmm AAAA, HH:MM' en Chile. Fecha inválida -> el texto original.
export function formatFechaHora(value: string | Date): string {
  const fecha = aFecha(value);
  if (Number.isNaN(fecha.getTime())) return typeof value === 'string' ? value : '';
  return fecha.toLocaleString('es-CL', {
    timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

// Día calendario en Chile como 'YYYY-MM-DD' (en-CA produce ese formato).
// Fecha inválida -> '' (no lanza).
export function claveSantiago(value: string | Date): string {
  const fecha = aFecha(value);
  if (Number.isNaN(fecha.getTime())) return '';
  return fecha.toLocaleDateString('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  });
}

// '2026-11-19' + 2026 -> 'Jueves 19 de noviembre'. Año solo si no es el actual.
export function etiquetaDia(clave: string, anioActual: number): string {
  const [anio, mes, dia] = clave.split('-').map(Number);
  if (!anio || !mes || !dia) return '';
  // Mediodía UTC: ningún huso corre la fecha de calendario.
  const dow = new Date(Date.UTC(anio, mes - 1, dia, 12)).getUTCDay();
  const texto = `${DIAS[dow]} ${dia} de ${MESES[mes - 1]}`;
  const cap = texto.charAt(0).toUpperCase() + texto.slice(1);
  return anio === anioActual ? cap : `${cap} de ${anio}`;
}

export type GrupoDia<T> = {
  clave: string;
  etiqueta: string;
  activas: number;
  total: number;
  notas: T[];
};

// Agrupa notas por día calendario chileno, de más reciente a más antiguo.
// Ordena por created_at desc; el conteo y el total son SOLO de activas
// (una anulada se lista pero no suma). Fecha inválida: grupo final sin etiqueta.
export function agruparPorDia<
  T extends { created_at: string | Date; total?: number; estado?: string },
>(notas: T[], hoyClave: string): GrupoDia<T>[] {
  const anioActual = Number(hoyClave.slice(0, 4));
  const ordenadas = [...notas].sort(
    (a, b) => (aFecha(b.created_at).getTime() || 0) - (aFecha(a.created_at).getTime() || 0),
  );

  const grupos: GrupoDia<T>[] = [];
  for (const nota of ordenadas) {
    const clave = claveSantiago(nota.created_at);
    let grupo = grupos[grupos.length - 1];
    if (!grupo || grupo.clave !== clave) {
      grupo = { clave, etiqueta: etiquetaDia(clave, anioActual), activas: 0, total: 0, notas: [] };
      grupos.push(grupo);
    }
    grupo.notas.push(nota);
    if (nota.estado !== 'anulada') {
      grupo.activas += 1;
      grupo.total += Number(nota.total ?? 0);
    }
  }
  return grupos;
}
