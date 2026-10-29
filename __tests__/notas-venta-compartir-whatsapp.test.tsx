/**
 * @jest-environment jsdom
 *
 * Fase B — compartirWhatsApp (Slice: enviar PDF por WhatsApp en un click).
 * R1: doble click mientras se genera el PDF → botón deshabilitado (estado de carga).
 * R2: navegador sin soporte de Web Share con archivos → fallback: descarga + aviso, no llama a share().
 * R3: navegador con soporte → llama a navigator.share con un File PDF, no cae al fallback.
 * R4: usuario cancela el selector nativo (AbortError) → no muestra toast.error.
 * R5: navigator.share falla por otro motivo → sí muestra toast.error.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PrenotaDetallePage } from '@/app/(app)/notas-venta/[id]/client_page';
import { toast } from 'sonner';

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() },
}));
jest.mock('jspdf-autotable', () => (_doc: any, _options: any) => {});
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useParams: () => ({ id: '1' }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/notas-venta/1',
}));

jest.mock('@/components/PagarNotaDialog', () => ({ PagarNotaDialog: () => null }));

const save = jest.fn();
const output = jest.fn(() => new Blob(['pdf'], { type: 'application/pdf' }));
jest.mock('jspdf', () => {
  class MockJsPDF {
    internal = { pageSize: { getWidth: () => 200, getHeight: () => 280 } };
    addImage = jest.fn();
    setFont = jest.fn();
    text = jest.fn();
    save = save;
    output = output;
    setFontSize = jest.fn();
    setFillColor = jest.fn();
    rect = jest.fn();
    setTextColor = jest.fn();
    roundedRect = jest.fn();
    setDrawColor = jest.fn();
    setLineWidth = jest.fn();
    line = jest.fn();
    lastAutoTable = { finalY: 100 };
    addPage = jest.fn();
  }
  return MockJsPDF;
});

function mockFetchBase() {
  return jest.fn((url: string, opts?: any) => {
    if (url === '/api/notas-venta/1' && (!opts || opts.method === undefined)) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          id: '1', estado: 'activa', titulo: 'Nota WhatsApp', cliente_nombre: 'Cliente X',
          saldo_pendiente: 0, total_pagado: 0,
          items: [{ id: 1, codigo: 'A', descripcion: 'Item A', imagen_url: null, cajas: 1, unidades: 2, precio: 10 }],
        }),
      });
    }
    if (url === '/api/caja/config') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: { valor: '1200' } }) });
    }
    if (typeof url === 'string' && url === '/marca/logo-nota.png') {
      return Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(['logo'])) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  }) as any;
}

async function renderNota() {
  global.fetch = mockFetchBase();
  render(<PrenotaDetallePage session={{}} params={{ id: '1' }} />);
  await screen.findByText('Nota WhatsApp');
}

describe('compartirWhatsApp — envío directo del PDF', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // @ts-ignore
    delete (navigator as any).share;
    // @ts-ignore
    delete (navigator as any).canShare;
  });

  // R1: doble click → botón deshabilitado mientras se genera el PDF
  it('R1: al hacer click, el botón muestra estado de carga y queda deshabilitado', async () => {
    (navigator as any).canShare = jest.fn(() => true);
    (navigator as any).share = jest.fn(() => new Promise(() => {})); // nunca resuelve, para observar el loading

    await renderNota();
    const boton = screen.getByText('Enviar por WhatsApp');
    fireEvent.click(boton);

    await waitFor(() => {
      const btn = screen.queryByText('Enviar por WhatsApp')?.closest('button')
        ?? screen.getByText(/Enviando/).closest('button');
      expect(btn).toBeDisabled();
    });
  });

  // R2: sin soporte de canShare con archivos → fallback: descarga + aviso, nunca llama share()
  it('R2: navegador sin soporte (canShare ausente) → descarga el PDF y avisa, no llama a share', async () => {
    // navigator.share / canShare no existen (deleted en beforeEach)
    await renderNota();
    fireEvent.click(screen.getByText('Enviar por WhatsApp'));

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(toast.warning).toHaveBeenCalled();
  });

  // R2b: canShare existe pero devuelve false → mismo fallback
  it('R2b: canShare devuelve false → descarga el PDF y avisa, no llama a share', async () => {
    (navigator as any).canShare = jest.fn(() => false);
    (navigator as any).share = jest.fn();

    await renderNota();
    fireEvent.click(screen.getByText('Enviar por WhatsApp'));

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(toast.warning).toHaveBeenCalled();
    expect((navigator as any).share).not.toHaveBeenCalled();
  });

  // R3: con soporte → llama a navigator.share con un File PDF, sin fallback de descarga
  it('R3: navegador con soporte → llama a navigator.share con un File PDF y no descarga', async () => {
    (navigator as any).canShare = jest.fn(() => true);
    (navigator as any).share = jest.fn(() => Promise.resolve());

    await renderNota();
    fireEvent.click(screen.getByText('Enviar por WhatsApp'));

    await waitFor(() => expect((navigator as any).share).toHaveBeenCalled());
    const shareArg = (navigator as any).share.mock.calls[0][0];
    expect(shareArg.files).toHaveLength(1);
    expect(shareArg.files[0]).toBeInstanceOf(File);
    expect(shareArg.files[0].type).toBe('application/pdf');
    expect(save).not.toHaveBeenCalled();
  });

  // R4: usuario cancela el selector nativo (AbortError) → no debe mostrarse como error
  it('R4: cancelación del usuario (AbortError) → no muestra toast.error', async () => {
    (navigator as any).canShare = jest.fn(() => true);
    const abortError = Object.assign(new Error('cancelled'), { name: 'AbortError' });
    (navigator as any).share = jest.fn(() => Promise.reject(abortError));

    await renderNota();
    fireEvent.click(screen.getByText('Enviar por WhatsApp'));

    await waitFor(() => expect((navigator as any).share).toHaveBeenCalled());
    expect(toast.error).not.toHaveBeenCalled();
  });

  // R5: fallo real de share() → sí debe mostrarse el error
  it('R5: fallo real de navigator.share → muestra toast.error', async () => {
    (navigator as any).canShare = jest.fn(() => true);
    (navigator as any).share = jest.fn(() => Promise.reject(new Error('boom')));

    await renderNota();
    fireEvent.click(screen.getByText('Enviar por WhatsApp'));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });

  // R6 (smoke E2E): flujo principal con soporte → comparte el PDF, no descarga,
  // no avisa, y el botón vuelve a su estado normal (no queda en loading).
  it('R6: flujo principal — con soporte, comparte el PDF, no descarga ni avisa, botón se rehabilita', async () => {
    (navigator as any).canShare = jest.fn(() => true);
    (navigator as any).share = jest.fn(() => Promise.resolve());

    await renderNota();
    fireEvent.click(screen.getByText('Enviar por WhatsApp'));

    await waitFor(() => expect((navigator as any).share).toHaveBeenCalled());
    // No cae al fallback de descarga ni avisa nada.
    expect(save).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();

    // El botón se rehabilita tras completar (no queda en "Enviando...").
    await waitFor(() => {
      const btn = screen.getByText('Enviar por WhatsApp').closest('button');
      expect(btn).not.toBeDisabled();
    });
  });
});
