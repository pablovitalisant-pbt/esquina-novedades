/**
 * Tests PBT-IA — Slice 3: getLatestIngresoRealCodigos con topN
 * Estado inicial: ROJO (parámetro topN aún no existe)
 */
import { getLatestIngresoRealCodigos } from './catalogo-ingreso';

function makeSql(responses: any[][]) {
  let call = 0;
  return jest.fn().mockImplementation(() => Promise.resolve(responses[call++] ?? []));
}

describe('getLatestIngresoRealCodigos — topN', () => {
  it('topN=1 (default) retorna códigos del único folio más reciente', async () => {
    const sql = makeSql([
      [{ anio: '2025' }],
      [{ folio: '42' }],
      [{ codigo: 'PROD-A' }, { codigo: 'PROD-B' }],
    ]) as any;

    const result = await getLatestIngresoRealCodigos(sql);
    expect(result).toEqual(new Set(['PROD-A', 'PROD-B']));
    expect(sql).toHaveBeenCalledTimes(3);
  });

  it('topN=2 retorna códigos de los 2 folios más recientes', async () => {
    const sql = makeSql([
      [{ anio: '2025' }],
      [{ folio: '42' }, { folio: '41' }],
      [{ codigo: 'PROD-A' }],
      [{ codigo: 'PROD-C' }],
    ]) as any;

    const result = await getLatestIngresoRealCodigos(sql, 2);
    expect(result).toEqual(new Set(['PROD-A', 'PROD-C']));
    expect(sql).toHaveBeenCalledTimes(4);
  });

  it('retorna Set vacío si no hay ingresos', async () => {
    const sql = makeSql([[]]) as any;
    const result = await getLatestIngresoRealCodigos(sql);
    expect(result).toEqual(new Set());
  });

  it('topN=1 ejecuta las 3 queries (sin filtro empresa, single-tenant)', async () => {
    const sql = makeSql([
      [{ anio: '2025' }],
      [{ folio: '10' }],
      [{ codigo: 'PROD-X' }],
    ]) as any;

    await getLatestIngresoRealCodigos(sql);
    // Verificamos que corrió las 3 queries (anio → folio → codigo)
    expect(sql).toHaveBeenCalledTimes(3);
  });
});
