import fs from 'fs';

export type DatosPago = {
  clave: string;
  fecha: string;
  medio: 'efectivo' | 'transferencia';
  monto_clp: number;
  detalle: string;
  reversa_de?: string;
};

const CAMPOS = new Set(['clave', 'fecha', 'medio', 'monto_clp', 'detalle', 'reversa_de']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INT4_MAX = 2_147_483_647;

function fechaValida(fecha: string): boolean {
  if (!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const d = new Date(`${fecha}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === fecha;
}

/** N12e2 — valida el JSON antes de tocar la base. Rechaza campos extra. */
export function validarDatosPago(datos: unknown): DatosPago {
  if (typeof datos !== 'object' || datos === null || Array.isArray(datos)) throw new Error('se espera un objeto JSON');
  const d = datos as Record<string, unknown>;
  for (const campo of Object.keys(d)) if (!CAMPOS.has(campo)) throw new Error(`campo no permitido: ${campo}`);
  const { clave, fecha, medio, monto_clp, detalle, reversa_de } = d;
  if (typeof clave !== 'string' || !UUID.test(clave)) throw new Error('clave debe ser UUID');
  if (typeof fecha !== 'string' || !fechaValida(fecha)) throw new Error('fecha ISO inválida');
  if (medio !== 'efectivo' && medio !== 'transferencia') throw new Error('medio inválido');
  if (typeof monto_clp !== 'number' || !Number.isInteger(monto_clp) || monto_clp < 1 || monto_clp > INT4_MAX) throw new Error('monto_clp fuera de rango');
  if (typeof detalle !== 'string' || detalle !== detalle.trim() || detalle.length < 1 || detalle.length > 500) throw new Error('detalle inválido');
  if (reversa_de !== undefined && (typeof reversa_de !== 'string' || !UUID.test(reversa_de))) throw new Error('reversa_de debe ser UUID');
  const salida: DatosPago = { clave: clave.toLowerCase(), fecha, medio, monto_clp, detalle };
  if (typeof reversa_de === 'string') salida.reversa_de = reversa_de.toLowerCase();
  return salida;
}

export function parseArgs(argv: string[]): { archivo: string; host: string } {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    const [clave, valor] = [argv[i], argv[i + 1]];
    if ((clave !== '--archivo' && clave !== '--host') || !valor) throw new Error(`argumento inválido: ${clave}`);
    if (args.has(clave)) throw new Error(`argumento duplicado: ${clave}`);
    args.set(clave, valor);
  }
  const archivo = args.get('--archivo');
  const host = args.get('--host');
  if (!archivo || !host) throw new Error('uso: --archivo <json> --host <host>');
  return { archivo, host };
}

async function main() {
  const { archivo, host } = parseArgs(process.argv.slice(2));
  const destino = process.env.DATABASE_URL;
  if (!destino) throw new Error('DATABASE_URL no está definida');
  if (new URL(destino).host !== host) throw new Error('--host no coincide con DATABASE_URL');
  const datos = validarDatosPago(JSON.parse(fs.readFileSync(archivo, 'utf8')));
  const { registrarPagoApp } = await import('../lib/pagos-app/registro');
  const { id, nuevo } = await registrarPagoApp(datos);
  console.log(nuevo ? `insertado ${id}` : `ya existía ${id}`);
}

if (process.argv[1]?.endsWith('registrar-pago-app.ts')) {
  main().catch((error) => { console.error((error as Error).message); process.exitCode = 1; });
}
