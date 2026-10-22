/**
 * Contrato de filtrarCatalogos, adaptado a catalogo/admin.
 * La función se movió de catalogos/catalogos-utils (módulo excluido)
 * a catalogo/admin/client_page.tsx (MVP).
 *
 * El campo 'categoria' no existe en el modelo de datos de catalogo/admin
 * (verificado: tipos/index.ts Catalogo y DB schema). Queda fuera del filtro.
 */

import { filtrarCatalogos } from '../app/(app)/catalogo/admin/client_page';

const CATALOGOS = [
  { titulo: 'Pelotas y accesorios', descripcion: 'Todo para deporte' },
  { titulo: 'Máquina para pelo', descripcion: 'Corte profesional' },
  { titulo: 'Set cocina', descripcion: 'Ideal para chef' },
  { titulo: 'Organizador', descripcion: null },
];

describe('filtrarCatalogos', () => {
  test('retorna todos los catálogos si la búsqueda está vacía', () => {
    const result = filtrarCatalogos(CATALOGOS, '');
    expect(result).toEqual(CATALOGOS);
  });

  test('encuentra catálogo cuando la palabra exacta está en el título', () => {
    const result = filtrarCatalogos(CATALOGOS, 'máquina');
    expect(result.map((c: any) => c.titulo)).toContain('Máquina para pelo');
  });

  test('encuentra catálogo cuando la palabra exacta está en la descripción', () => {
    const result = filtrarCatalogos(CATALOGOS, 'chef');
    expect(result.map((c: any) => c.titulo)).toContain('Set cocina');
  });

  test('"pel" encuentra catálogo con título "Pelotas y accesorios"', () => {
    const result = filtrarCatalogos(CATALOGOS, 'pel');
    expect(result.map((c: any) => c.titulo)).toContain('Pelotas y accesorios');
  });

  test('búsqueda case-insensitive ("PELO" encuentra "pelo")', () => {
    const result = filtrarCatalogos(CATALOGOS, 'PELO');
    expect(result.map((c: any) => c.titulo)).toContain('Máquina para pelo');
  });

  test('búsqueda con múltiples palabras retorna catálogos que contengan AL MENOS UNA', () => {
    const result = filtrarCatalogos(CATALOGOS, 'chef profesional');
    const titulos = result.map((c: any) => c.titulo);
    expect(titulos).toContain('Set cocina');
    expect(titulos).toContain('Máquina para pelo');
  });

  test('retorna todos si la búsqueda tiene menos de 2 caracteres', () => {
    const result = filtrarCatalogos(CATALOGOS, 'a');
    expect(result).toEqual(CATALOGOS);
  });

  test('"cafe" encuentra catálogo con título "Café" (accent-insensitive)', () => {
    const conAcento = [
      ...CATALOGOS,
      { titulo: 'Café en grano', descripcion: 'Tueste medio' },
    ];
    const result = filtrarCatalogos(conAcento, 'cafe');
    expect(result.map((c: any) => c.titulo)).toContain('Café en grano');
  });

  test('"maquina" encuentra catálogo con título "Máquina para pelo" (sin tilde → con tilde)', () => {
    const result = filtrarCatalogos(CATALOGOS, 'maquina');
    expect(result.map((c: any) => c.titulo)).toContain('Máquina para pelo');
  });

  test('descripcion null no rompe el filtro', () => {
    const result = filtrarCatalogos(CATALOGOS, 'organizador');
    expect(result.map((c: any) => c.titulo)).toContain('Organizador');
  });
});
