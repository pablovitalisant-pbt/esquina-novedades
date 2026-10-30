'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export type ClientePos = { id: string; nombre: string };

const LS_RECIENTES = 'pos-clientes-recientes';

function leerRecientes(): ClientePos[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_RECIENTES) ?? '[]');
    return Array.isArray(raw) ? raw.filter(c => c?.id && c?.nombre).slice(0, 5) : [];
  } catch {
    return [];
  }
}

function guardarReciente(c: ClientePos) {
  try {
    const lista = [c, ...leerRecientes().filter(x => x.id !== c.id)].slice(0, 5);
    localStorage.setItem(LS_RECIENTES, JSON.stringify(lista));
  } catch {
    /* sin storage: la lista es un atajo, no un requisito */
  }
}

/** pos3 — selector de cliente del POS (F4 / botón "Cambiar cliente"). */
export function PosClienteDialog({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (cliente: ClientePos) => void;
}) {
  const [query, setQuery] = useState('');
  const [resultados, setResultados] = useState<ClientePos[]>([]);
  const [recientes, setRecientes] = useState<ClientePos[]>([]);
  const [highlighted, setHighlighted] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setResultados([]);
    setRecientes(leerRecientes());
    setHighlighted(0);
    setTimeout(() => searchRef.current?.focus(), 0);
  }, [open]);

  // Búsqueda con debounce sobre la API de clientes existente.
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setResultados([]);
      setHighlighted(0);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/clientes?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        if (res.ok) {
          const { data } = await res.json();
          setResultados(((data ?? []) as ClientePos[]).map(c => ({ id: c.id, nombre: c.nombre })));
          setHighlighted(0);
        }
      } catch (err) {
        if (!(err instanceof Error && err.name === 'AbortError')) setResultados([]);
      }
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, open]);

  const visibles = query.trim().length >= 2 ? resultados : recientes;

  const elegir = (c: ClientePos | undefined) => {
    if (!c) return;
    guardarReciente(c);
    onSelect(c);
    onOpenChange(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onOpenChange(false); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted(i => Math.min(i + 1, visibles.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlighted(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); elegir(visibles[Math.min(highlighted, visibles.length - 1)]); }
  };

  const botonCliente = (c: ClientePos, i: number) => (
    <button
      key={c.id}
      type="button"
      data-testid={`pos-cliente-opcion-${c.id}`}
      onClick={() => elegir(c)}
      className={`flex items-center gap-3 h-14 w-full rounded-pill border px-4 text-left font-bold truncate transition ${
        i === highlighted
          ? 'border-[var(--primary)] ring-2 ring-[var(--primary)] bg-[var(--primary)]/10'
          : 'border-[var(--border)] hover:bg-[var(--muted)]'
      }`}
    >
      <UserRound className="w-5 h-5 shrink-0 text-[var(--body-subtle)]" />
      <span className="truncate">{c.nombre}</span>
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="pos-cliente-dialogo">
        <DialogHeader>
          <DialogTitle className="text-xl font-extrabold">Cambiar cliente</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3" onKeyDown={onKeyDown}>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--body-subtle)]" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar cliente por nombre…"
              className="w-full h-14 pl-12 pr-4 rounded-full border border-[var(--border)] bg-[var(--card)] text-lg font-medium focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
          </div>

          {visibles.length === 0 ? (
            <p className="text-sm text-[var(--body-subtle)] py-3">
              {query.trim().length >= 2 ? 'Sin resultados.' : 'Sin clientes recientes. Busca uno por nombre.'}
            </p>
          ) : (
            <>
              <p className="text-xs uppercase tracking-wide text-[var(--body-subtle)]">
                {query.trim().length >= 2 ? 'Resultados' : 'Últimos usados'}
              </p>
              <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
                {visibles.map(botonCliente)}
              </div>
            </>
          )}

          <Button variant="outline" className="h-12" onClick={() => onOpenChange(false)}>
            Cancelar (Esc)
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
