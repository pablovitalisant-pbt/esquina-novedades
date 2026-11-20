/**
 * Fase B — S2a: cálculo puro del historial de movimientos.
 *
 * Intenta romper: conversión cajas/unidades (R1), notas anuladas (R2),
 * residual negativo (R13), truncado (R10) y fila inicial inferida.
 */

import {
  normalizarMovimiento,
  calcularResumen,
  armarHistorial,
  type MovimientoCrudo,
  type ProductoHistorial,
} from '@/lib/historial';

const producto: ProductoHistorial = {
  codigo: 'JS-1640',
  detalle: 'Set de prueba',
  saldo: 0,
  cantcaja: 12,
  fecha_ingreso: '2026-10-30T14:22:05.000Z',
};

function crudo(over: Partial<MovimientoCrudo>): MovimientoCrudo {
  return {
    fecha: '2026-11-02T16:10:00.000Z',
    tipo: 'venta',
    cantidad: -1,
    detalle: null,
    usuario: null,
    ref_tipo: null,
    ref_id: null,
    estado: 'activa',
    ...over,
  };
}

describe('normalizarMovimiento', () => {
  it('B5: conserva el código con que se registró el movimiento', () => {
    const m = normalizarMovimiento(crudo({ codigo: 'JS-VIEJO' }));
    expect(m.codigo).toBe('JS-VIEJO');
  });

  it('B5: sin código (fila inferida o fila legada) queda null, no undefined', () => {
    const m = normalizarMovimiento(crudo({}));
    expect(m.codigo).toBeNull();
  });

  it('R1: usa las unidades tal cual, sin multiplicar por cantcaja', () => {
    // La nota guarda cajas=0 y unidades=10 (app/api/notas-venta/[id]/items/route.ts:128).
    const m = normalizarMovimiento(crudo({ tipo: 'venta', cantidad: '-10', estado: 'activa' }));
    expect(m.cantidad).toBe(-10);
    expect(m.efecto).toBe(-10);
  });

  it('R1: la conciliación usa la diferencia registrada, no recalcula cajas', () => {
    const m = normalizarMovimiento(crudo({
      tipo: 'conciliacion', cantidad: '-11', estado: null, detalle: 'Conteo físico',
    }));
    expect(m.cantidad).toBe(-11);
    expect(m.efecto).toBe(-11);
  });

  it('R2: una nota anulada conserva la cantidad histórica pero su efecto es 0', () => {
    const m = normalizarMovimiento(crudo({ tipo: 'venta', cantidad: -4, estado: 'anulada' }));
    expect(m.cantidad).toBe(-4);
    expect(m.efecto).toBe(0);
  });

  it('R2: una reserva expirada conserva la cantidad pero su efecto es 0', () => {
    const m = normalizarMovimiento(crudo({
      tipo: 'reserva', cantidad: -2, estado: 'expirado', ref_tipo: 'pedido', ref_id: 'uuid-1',
    }));
    expect(m.cantidad).toBe(-2);
    expect(m.efecto).toBe(0);
  });

  it('una reserva vigente sí descuenta', () => {
    const m = normalizarMovimiento(crudo({ tipo: 'reserva', cantidad: -3, estado: 'vigente' }));
    expect(m.efecto).toBe(-3);
  });

  it('un ingreso suma', () => {
    const m = normalizarMovimiento(crudo({ tipo: 'ingreso', cantidad: 40, estado: null }));
    expect(m.efecto).toBe(40);
  });

  it('arma la referencia de la nota con enlace a /notas-venta/:id', () => {
    const m = normalizarMovimiento(crudo({ ref_tipo: 'nota', ref_id: 12 }));
    expect(m.referencia).toEqual({ tipo: 'nota', id: 12, href: '/notas-venta/12' });
  });

  it('R5: devuelve ISO estricto cuando la fecha llega como Date', () => {
    const m = normalizarMovimiento(crudo({ fecha: new Date('2026-11-19T02:30:00.000Z') }));
    expect(m.fecha).toBe('2026-11-19T02:30:00.000Z');
    expect(m.fecha).not.toMatch(/\+00| /);
  });
});

describe('calcularResumen', () => {
  it('caso JS-1640: 40 iniciales inferidos, 29 vendidos, −11 de conciliación', () => {
    const movs = [
      normalizarMovimiento(crudo({ tipo: 'venta', cantidad: -8, estado: 'activa' })),
      normalizarMovimiento(crudo({ tipo: 'venta', cantidad: -1, estado: 'activa' })),
      normalizarMovimiento(crudo({ tipo: 'venta', cantidad: -10, estado: 'activa' })),
      normalizarMovimiento(crudo({ tipo: 'venta', cantidad: -10, estado: 'activa' })),
      normalizarMovimiento(crudo({ tipo: 'venta', cantidad: -4, estado: 'anulada' })),
      normalizarMovimiento(crudo({ tipo: 'reserva', cantidad: -2, estado: 'expirado' })),
      normalizarMovimiento(crudo({ tipo: 'conciliacion', cantidad: -11, estado: null })),
    ];
    const r = calcularResumen(movs, 0);
    expect(r.vendido).toBe(29);
    expect(r.ajustes).toBe(-11);
    expect(r.reservado).toBe(0);
    expect(r.stock_inicial_inferido).toBe(40);
    expect(r.stock_esperado).toBe(0);
    expect(r.diferencia).toBe(0);
  });

  it('R13: residual negativo no se disfraza de stock inicial', () => {
    // Ajuste +10 registrado pero el saldo real es 2: faltan 8 unidades.
    const movs = [normalizarMovimiento(crudo({ tipo: 'conciliacion', cantidad: 10, estado: null }))];
    const r = calcularResumen(movs, 2);
    expect(r.stock_inicial_inferido).toBe(0);
    expect(r.stock_esperado).toBe(10);
    expect(r.diferencia).toBe(-8);
  });

  it('R10: truncado no inventa resumen', () => {
    const r = calcularResumen([], 5, true);
    expect(r.truncado).toBe(true);
    expect(r.stock_inicial_inferido).toBeNull();
    expect(r.stock_esperado).toBeNull();
    expect(r.diferencia).toBeNull();
  });
});

describe('armarHistorial', () => {
  it('agrega la fila inicial inferida AL FINAL (es lo más antiguo) y la marca', () => {
    const ventas = [
      normalizarMovimiento(crudo({ tipo: 'venta', cantidad: -8, estado: 'activa' })),
    ];
    // saldo 32 => residual 40 con una venta de 8
    const { movimientos, resumen } = armarHistorial({ ...producto, saldo: 32 }, [
      crudo({ tipo: 'venta', cantidad: -8, estado: 'activa' }),
    ]);
    expect(resumen.stock_inicial_inferido).toBe(40);
    expect(movimientos[0].tipo).toBe('venta');
    expect(movimientos[movimientos.length - 1]).toMatchObject({
      tipo: 'stock_inicial',
      cantidad: 40,
      efecto: 40,
      estado: 'inferido',
      inferido: true,
      fecha: producto.fecha_ingreso,
      queda: 40,
    });
    expect(movimientos[movimientos.length - 1].detalle).toContain('sin registro de ingreso');
    expect(ventas).toHaveLength(1); // el fixture no se muta por accidente
  });

  it('no agrega fila inicial cuando el saldo cuadra con los movimientos', () => {
    const { movimientos } = armarHistorial({ ...producto, saldo: 40 }, [
      crudo({ tipo: 'ingreso', cantidad: 40, estado: null }),
    ]);
    expect(movimientos.some((m) => m.tipo === 'stock_inicial')).toBe(false);
  });
});

describe('armarHistorial — DESC y "queda" hacia atrás', () => {
  // Misma historia que el caso JS-1640, ahora del más reciente al más antiguo.
  const crudosJS1640: MovimientoCrudo[] = [
    crudo({ tipo: 'conciliacion', cantidad: -11, estado: null }),
    crudo({ tipo: 'reserva', cantidad: -2, estado: 'expirado' }),
    crudo({ tipo: 'venta', cantidad: -4, estado: 'anulada' }),
    crudo({ tipo: 'venta', cantidad: -10, estado: 'activa' }),
    crudo({ tipo: 'venta', cantidad: -10, estado: 'activa' }),
    crudo({ tipo: 'venta', cantidad: -1, estado: 'activa' }),
    crudo({ tipo: 'venta', cantidad: -8, estado: 'activa' }),
  ];

  it('caso JS-1640: queda de la fila más reciente es el saldo y cierra en 40 al final', () => {
    const { movimientos } = armarHistorial({ ...producto, saldo: 0 }, crudosJS1640);
    expect(movimientos.map((m) => m.queda)).toEqual([0, 11, 11, 11, 21, 31, 32, 40]);
    expect(movimientos[0].tipo).toBe('conciliacion');
    expect(movimientos[movimientos.length - 1].tipo).toBe('stock_inicial');
  });

  it('las filas con efecto 0 no alteran el queda de la anterior', () => {
    const { movimientos } = armarHistorial({ ...producto, saldo: 0 }, crudosJS1640);
    // anulada (efecto 0) y reserva expirada (efecto 0) conservan el queda.
    expect(movimientos[1].efecto).toBe(0);
    expect(movimientos[2].efecto).toBe(0);
    expect(movimientos[1].queda).toBe(11);
    expect(movimientos[2].queda).toBe(11);
  });

  it('R10: truncado (500 de 501) es exacto: la primera fila deja el saldo actual', () => {
    // 500 movimientos visibles de -1 cada uno; hay historia más antigua que no
    // se ve. Anclado en el saldo actual, "queda" no depende de esa historia.
    const visibles = Array.from({ length: 500 }, () =>
      crudo({ tipo: 'venta', cantidad: -1, estado: 'activa' }),
    );
    const { movimientos, resumen } = armarHistorial({ ...producto, saldo: 100 }, visibles, true);
    expect(resumen.truncado).toBe(true);
    expect(movimientos).toHaveLength(500);
    expect(movimientos[0].queda).toBe(100);
    expect(movimientos[499].queda).toBe(599);
    // Cada queda = saldo actual menos los efectos de las filas más recientes.
    const resto = movimientos.slice(0, -1).reduce((acc, m) => acc + m.efecto, 0);
    expect(movimientos[movimientos.length - 1].queda).toBe(100 - resto);
  });

  it('R10: truncado no agrega fila inicial', () => {
    const { movimientos } = armarHistorial(
      { ...producto, saldo: 100 },
      Array.from({ length: 500 }, () => crudo({ tipo: 'venta', cantidad: -1 })),
      true,
    );
    expect(movimientos.some((m) => m.tipo === 'stock_inicial')).toBe(false);
  });
});
