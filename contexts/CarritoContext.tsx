'use client';

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';

export type ContactoCarrito = { nombre: string; telefono: string };

export type ItemCarrito = {
  producto_id: number;
  codigo: string;
  detalle: string | null;
  cantidad: number; // cantidad de CAJAS (no unidades)
  precio_referencia: number | null; // precio por unidad
  cantcaja: number; // unidades por caja, para precio/caja y equivalencia
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
  dolarDia: number;
  totalItems: number;
  setContacto: (c: ContactoCarrito) => void;
  agregarItem: (item: ItemCarrito) => void;
  quitarItem: (producto_id: number) => void;
  actualizarCantidad: (producto_id: number, cantidad: number) => void;
  limpiar: () => void;
};

const STORAGE_KEY = 'bazarnaty:pedido';

const CarritoContext = createContext<CarritoContextValue | null>(null);

function leerPersistido(): CarritoPersistido | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.items)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function CarritoProvider({
  children,
  origen,
  origen_slug,
  dolarDia,
}: {
  children: ReactNode;
  origen: 'productos' | 'catalogo';
  origen_slug?: string | null;
  dolarDia: number;
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
      const existente = prev.find((i) => i.producto_id === item.producto_id);
      if (existente) {
        return prev.map((i) =>
          i.producto_id === item.producto_id ? { ...i, cantidad: i.cantidad + item.cantidad } : i
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
        dolarDia,
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
