/**
 * Fase B — Bugfix Caja Mayor: búsqueda unificada (cliente o nota) offline
 *
 * El bug: el useEffect de búsqueda unificada (línea 402) hacía fetch(endpoint)
 * sin condicional `OFFLINE_READ && db`, a diferencia de todos los demás fetch
 * del archivo. Sin rama offline, un cobro quedaba bloqueado sin red (no se
 * podía seleccionar cliente/nota).
 *
 * El riesgo de regresión es que alguien revierta la rama offline o vuelva a
 * dejar la dependencia del useEffect en `[searchQuery]` (sin OFFLINE_READ/db),
 * que era lo que impedía pasar a modo local cuando db estaba disponible.
 *
 * Es un check estructural (lectura fs del fuente), el patrón ya usado en este
 * repo para client_page.tsx (slice35e TT4-TT6). El gate de ejecución real lo
 * da correr la suite completa (npm test) tras el cambio.
 */

describe('bugfix-caja-mayor-busqueda-offline', () => {
  const fs = require('fs');
  const path = require('path');
  const source = fs.readFileSync(
    path.resolve(__dirname, '..', 'app', '(app)', 'caja-mayor', 'client_page.tsx'),
    'utf-8'
  );

  it('la búsqueda unificada tiene rama offline guardada por OFFLINE_READ && db', () => {
    expect(source).toContain('if (OFFLINE_READ && db) {');
  });

  it('el useEffect de búsqueda depende de OFFLINE_READ y db (para pasar a local cuando db llega)', () => {
    expect(source).toContain('[searchQuery, OFFLINE_READ, db]');
  });

  it('la rama offline replica el merge de total_pagado contra caja_movimiento_notas (patrón notasPendientes)', () => {
    expect(source).toContain('FROM caja_movimiento_notas GROUP BY prenota_id');
  });
});
