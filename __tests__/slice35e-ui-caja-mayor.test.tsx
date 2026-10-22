/**
 * @jest-environment jsdom
 *
 * Fase B — Slice 35e (UI Caja Mayor + Nota detalle)
 *
 * Riesgos:
 * R1 — Badge Anulada + Pagada contradictorios (mutuamente excluyentes)
 * R2 — Boton Reembolsar visible solo con pagos y estado activa
 * R3 — Boton "Marcar como pagada" oculto en nota anulada
 * R4-R6 — Caja mayor: filtro reembolso, icono, signo negativo
 *
 * TT1  — estado='anulada': badge Anulada visible, Pagada ausente
 * TT2  — total_pagado=0: Reembolsar ausente; total_pagado>0: Reembolsar visible
 * TT3  — estado='anulada': Marcar como pagada ausente
 * TT4  — caja-mayor: filtro incluye Reembolso
 * TT5  — caja-mayor: reembolso con icono 📥
 * TT6  — caja-mayor: reembolso con signo negativo
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { PrenotaDetallePage } from '@/app/(app)/notas-venta/[id]/client_page';

// jspdf requiere TextEncoder que no existe en jsdom
jest.mock('jspdf', () => ({}));
jest.mock('jspdf-autotable', () => ({}));
jest.mock('xlsx', () => ({}));

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { rol: 'vendedor' } } }),
}));

const push = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useParams: () => ({ id: '1' }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/notas-venta/1',
}));

function buildPrenota(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    titulo: 'Pre-nota #1',
    titulo_base: 'Pre-nota #1',
    items: [{ id: 1, codigo: 'T1', descripcion: 'Item', cajas: 1, unidades: 1, precio: 100 }],
    total: 100,
    total_pagado: 0,
    saldo_pendiente: 100,
    estado: 'activa',
    nombre_cliente: 'Juan',
    cliente_nombre: 'Juan',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════
// TT1 — Badge Anulada vs Pagada (mutuamente excluyentes)
// ═══════════════════════════════════════════════════════════════════════
describe('TT1 — Badge Anulada y Pagada', () => {
  it('ROJO: nota anulada y pagada debe mostrar "Anulada" y NO "Pagada"', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => buildPrenota({ estado: 'anulada', saldo_pendiente: 0, total_pagado: 100 }),
    });

    render(<PrenotaDetallePage session={{ user: { rol: 'vendedor' } }} params={{ id: '1' }} />);

    await waitFor(() => {
      expect(screen.getByText('Anulada')).toBeInTheDocument();
    });

    // Pagada NO debe estar — son mutuamente excluyentes
    expect(screen.queryByText('Pagada')).not.toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// TT2 — Boton Reembolsar segun total_pagado
// ═══════════════════════════════════════════════════════════════════════
describe('TT2 — Boton Reembolsar', () => {
  it('ROJO: con total_pagado=0 NO debe mostrar boton Reembolsar', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => buildPrenota({ total_pagado: 0, saldo_pendiente: 100 }),
    });

    render(<PrenotaDetallePage session={{ user: { rol: 'vendedor' } }} params={{ id: '1' }} />);

    await waitFor(() => {
      expect(screen.getByText('Pre-nota #1')).toBeInTheDocument();
    });

    expect(screen.queryByText('Reembolsar')).not.toBeInTheDocument();
  });

  it('ROJO: con total_pagado=1500 y estado=activa DEBE mostrar boton Reembolsar', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => buildPrenota({ total_pagado: 1500, saldo_pendiente: 0 }),
    });

    render(<PrenotaDetallePage session={{ user: { rol: 'vendedor' } }} params={{ id: '1' }} />);

    await waitFor(() => {
      expect(screen.getByText('Reembolsar')).toBeInTheDocument();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// TT3 — Marcar como pagada oculto en nota anulada
// ═══════════════════════════════════════════════════════════════════════
describe('TT3 — Marcar como pagada oculto en anulada', () => {
  it('ROJO: nota anulada con saldo pendiente NO debe mostrar "Marcar como pagada"', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => buildPrenota({ estado: 'anulada', total_pagado: 0, saldo_pendiente: 100, nombre_cliente: 'Juan' }),
    });

    render(<PrenotaDetallePage session={{ user: { rol: 'vendedor' } }} params={{ id: '1' }} />);

    await waitFor(() => {
      expect(screen.getByText('Anulada')).toBeInTheDocument();
    });

    expect(screen.queryByText('Marcar como pagada')).not.toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// TT4-TT6 — Caja mayor: filtro, icono y signo (verificacion estructural)
// ═══════════════════════════════════════════════════════════════════════
describe('TT4-TT6 — Caja mayor: reembolso en UI', () => {
  it('ROJO: filtro incluye option Reembolso', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '..', 'app', '(app)', 'caja-mayor', 'client_page.tsx'),
      'utf-8'
    );
    expect(source).toContain('value="reembolso"');
    expect(source).toContain('>Reembolso<');
  });

  it('ROJO: reembolso muestra icono 📥 en tabla', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '..', 'app', '(app)', 'caja-mayor', 'client_page.tsx'),
      'utf-8'
    );
    expect(source).toContain('📥');
  });

  it('ROJO: reembolso usa signo negativo (!== "cobro")', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '..', 'app', '(app)', 'caja-mayor', 'client_page.tsx'),
      'utf-8'
    );
    expect(source).toContain('!== "cobro"');
  });
});
