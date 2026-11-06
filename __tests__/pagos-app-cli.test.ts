import { parseArgs, validarDatosPago } from '@/scripts/registrar-pago-app';

const UUID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const UUID_REVERSA = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';

const valido = () => ({
  clave: UUID,
  fecha: '2026-10-01',
  medio: 'transferencia',
  monto_clp: 60000,
  detalle: 'Abono inicial',
});

const invalidos: Array<[string, Record<string, unknown>]> = [
  ['fecha imposible', { fecha: '2026-02-30' }],
  ['fecha mal formada', { fecha: '2026-1-1' }],
  ['clave no UUID', { clave: 'no-es-uuid' }],
  ['reversa no UUID', { reversa_de: 'original' }],
  ['monto cero', { monto_clp: 0 }],
  ['monto negativo', { monto_clp: -1 }],
  ['monto decimal', { monto_clp: 10.5 }],
  ['monto fuera de int4', { monto_clp: 2_147_483_648 }],
  ['medio desconocido', { medio: 'tarjeta' }],
  ['detalle vacío', { detalle: '   ' }],
  ['detalle mayor a 500', { detalle: 'x'.repeat(501) }],
  ['año 0000', { fecha: '0000-01-01' }],
];

describe('validarDatosPago', () => {
  it('acepta un pago válido con y sin reversa', () => {
    expect(validarDatosPago(valido())).toMatchObject(valido());
    expect(() => validarDatosPago({ ...valido(), medio: 'efectivo' })).not.toThrow();
    expect(() => validarDatosPago({ ...valido(), monto_clp: 1, reversa_de: UUID_REVERSA })).not.toThrow();
  });

  it.each(invalidos)('rechaza %s', (_nombre, cambio) => {
    expect(() => validarDatosPago({ ...valido(), ...cambio })).toThrow();
  });

  it('rechaza datos extra', () => {
    expect(() => validarDatosPago({ ...valido(), creado_en: '2026-10-01' })).toThrow();
    expect(() => validarDatosPago({ ...valido(), host: 'otro' })).toThrow();
  });

  it('normaliza clave y reversa a minúsculas', () => {
    const datos = validarDatosPago({
      ...valido(),
      clave: UUID.toUpperCase(),
      reversa_de: UUID_REVERSA.toUpperCase(),
    });
    expect(datos.clave).toBe(UUID);
    expect(datos.reversa_de).toBe(UUID_REVERSA);
  });
});

describe('parseArgs', () => {
  it('acepta archivo y host una sola vez', () => {
    expect(parseArgs(['--archivo', 'pago.json', '--host', 'ep-x.neon.tech'])).toEqual({
      archivo: 'pago.json',
      host: 'ep-x.neon.tech',
    });
  });

  it('rechaza argumentos duplicados', () => {
    expect(() => parseArgs(['--archivo', 'a.json', '--archivo', 'b.json', '--host', 'h'])).toThrow();
    expect(() => parseArgs(['--archivo', 'a.json', '--host', 'h', '--host', 'otro'])).toThrow();
  });
});
