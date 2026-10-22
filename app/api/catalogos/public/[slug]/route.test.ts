/**
 * Tests PBT-IA — Slice 2: parseKeywords retrocompatible
 * Estado inicial: ROJO (función aún no existe)
 */
import { parseKeywords } from './seleccion';

jest.mock('@/lib/db', () => ({ sql: jest.fn() }));
jest.mock('next/server', () => ({
  NextResponse: { json: jest.fn() },
}));
jest.mock('./filter-products', () => ({ filterProducts: jest.fn() }));
jest.mock('@/utils/catalogo-ingreso', () => ({ getLatestIngresoRealCodigos: jest.fn() }));

describe('parseKeywords — retrocompatibilidad', () => {
  it('string vacío retorna []', () => {
    expect(parseKeywords('')).toEqual([]);
  });

  it('string solo espacios retorna []', () => {
    expect(parseKeywords('   ')).toEqual([]);
  });

  it('string con coma → split por coma', () => {
    expect(parseKeywords('vidrio,tv')).toEqual(['vidrio', 'tv']);
  });

  it('string con coma y espacios → split por coma + trim', () => {
    expect(parseKeywords('vidrio, tv')).toEqual(['vidrio', 'tv']);
  });

  it('string sin coma → se trata como frase completa', () => {
    expect(parseKeywords('vidrio tv')).toEqual(['vidrio tv']);
  });

  it('frase sin coma con espacios extra → un solo token trimmed', () => {
    expect(parseKeywords('  vidrio  tv  ')).toEqual(['vidrio tv']);
  });

  it('frase multi-palabra sin coma → se preserva completa', () => {
    expect(parseKeywords('Hervidor de Agua')).toEqual(['Hervidor de Agua']);
  });

  it('una sola palabra sin coma → array de un elemento', () => {
    expect(parseKeywords('vidrio')).toEqual(['vidrio']);
  });
});
