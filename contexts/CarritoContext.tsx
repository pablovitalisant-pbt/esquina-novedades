'use client';

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';

export type ContactoCarrito = { nombre: string; telefono: string; email?: string };

export type ItemCarrito = {
  producto_id: number;
  codigo: string;
  detalle: string | null;
  cantidad: number; // unidades
  precio: number | null; // precio base (detalle)
  precio_mayor: number | null;
  minimo_mayor: number | null;
};

type CarritoPersistido = {
  contacto: ContactoCarrito | null;
  items: ItemCarrito[];
};

type CarritoContextValue = {
  contacto: ContactoCarrito | null;
  items: ItemCarrito[];
  origen: 'productos' | 'catalogo';
  origen_slug: string | null;
  totalItems: number;
  setContacto: (c: ContactoCarrito) => void;
  agregarItem: (item: ItemCarrito) => void;
  quitarItem: (producto_id: number) => void;
  actualizarCantidad: (producto_id: number, cantidad: number) => void;
  limpiar: () => void;
};

const STORAGE_KEY = 'esquina:pedido';

const CarritoContext = createContext<CarritoContextValue | null>(null);

function numeroONull(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

/**
 * Sanea carritos persistidos de versiones anteriores: descarta líneas de caja/
 * mayor, une líneas del mismo producto y completa precio_mayor/minimo_mayor.
 */
function normalizarItems(raw: unknown[]): ItemCarrito[] {
  const salida: ItemCarrito[] = [];
  for (const bruto of raw) {
    if (!bruto || typeof bruto !== 'object') continue;
    const i = bruto as Record<string, unknown>;
    if (i.modalidad === 'caja' || i.modalidad === 'mayor') continue;
    const producto_id = Number(i.producto_id);
    if (!Number.isFinite(producto_id)) continue;
    const cantidad = Number(i.cantidad);
    const precio = numeroONull(i.precio);
    const existente = salida.find((s) => s.producto_id === producto_id);
    if (existente) {
      existente.cantidad += Number.isInteger(cantidad) && cantidad > 0 ? cantidad : 1;
      continue;
    }
    salida.push({
      producto_id,
      codigo: String(i.codigo ?? ''),
      detalle: typeof i.detalle === 'string' ? i.detalle : null,
      cantidad: Number.isInteger(cantidad) && cantidad > 0 ? cantidad : 1,
      precio,
      precio_mayor: numeroONull(i.precio_mayor),
      minimo_mayor: numeroONull(i.minimo_mayor),
    });
  }
  return salida;
}

function leerPersistido(): CarritoPersistido | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.items)) return null;
    return { contacto: parsed.contacto ?? null, items: normalizarItems(parsed.items) };
  } catch {
    return null;
  }
}

export function CarritoProvider({
  children,
  origen,
  origen_slug,
}: {
  children: ReactNode;
  origen: 'productos' | 'catalogo';
  origen_slug?: string | null;
}) {
  // Hydration-safe: estado inicial vacío en render; localStorage se lee solo
  // en effect (ponytail: leerlo en render rompería la hidratación SSR).
  const [contacto, setContactoState] = useState<ContactoCarrito | null>(null);
  const [items, setItems] = useState<ItemCarrito[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const persistido = leerPersistido();
    if (persistido) {
      setContactoState(persistido.contacto);
      setItems(persistido.items);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    // No sobrescribir el storage con el estado vacío inicial antes de hidratar.
    if (!hydrated || typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ contacto, items }));
    } catch {
      // storage lleno/bloqueado no debe romper el carrito en memoria
    }
  }, [contacto, items, hydrated]);

  const setContacto = useCallback((c: ContactoCarrito) => setContactoState(c), []);

  const agregarItem = useCallback((item: ItemCarrito) => {
    setItems((prev) => {
      // Una línea por producto: agregar el mismo producto suma cantidad y
      // refresca los datos de precio (pueden faltar en carritos viejos).
      const existente = prev.find((i) => i.producto_id === item.producto_id);
      if (existente) {
        return prev.map((i) =>
          i.producto_id === item.producto_id
            ? {
                ...i,
                codigo: item.codigo,
                detalle: item.detalle,
                precio: item.precio,
                precio_mayor: item.precio_mayor,
                minimo_mayor: item.minimo_mayor,
                cantidad: i.cantidad + item.cantidad,
              }
            : i
        );
      }
      return [...prev, item];
    });
  }, []);

  const quitarItem = useCallback((producto_id: number) => {
    setItems((prev) => prev.filter((i) => i.producto_id !== producto_id));
  }, []);

  const actualizarCantidad = useCallback((producto_id: number, cantidad: number) => {
    setItems((prev) => {
      if (cantidad < 1) return prev.filter((i) => i.producto_id !== producto_id);
      return prev.map((i) => (i.producto_id === producto_id ? { ...i, cantidad } : i));
    });
  }, []);

  const limpiar = useCallback(() => {
    setItems([]);
  }, []);

  const totalItems = items.reduce((acc, i) => acc + i.cantidad, 0);

  return (
    <CarritoContext.Provider
      value={{
        contacto,
        items,
        origen,
        origen_slug: origen_slug ?? null,
        totalItems,
        setContacto,
        agregarItem,
        quitarItem,
        actualizarCantidad,
        limpiar,
      }}
    >
      {children}
    </CarritoContext.Provider>
  );
}

export function useCarrito(): CarritoContextValue {
  const ctx = useContext(CarritoContext);
  if (!ctx) throw new Error('useCarrito debe usarse dentro de CarritoProvider');
  return ctx;
}
