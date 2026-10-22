import { z } from "zod";

export const CatalogoCreateSchema = z.object({
  empresaId: z.number(),
  titulo: z.string().min(1),
  descripcion: z.string().optional(),
  mostrar_precio: z.boolean().default(true),
  margen_precio: z.number().min(0).max(500).default(0),
  solo_stock: z.boolean().default(false),
  solo_nuevo: z.boolean().default(false),
  palabras_incluir: z.string().default(""),
  palabras_excluir: z.string().default(""),
});

export const CatalogoProductoPublicoSchema = z.object({
  id: z.number(),
  codigo: z.string(),
  detalle: z.string().nullable(),
  imagen_url: z.string().nullable(),
  cantcaja: z.number(),
  umed: z.string(),
  costo: z.number(),
  precio_catalogo: z.number().nullable(),
  es_nuevo: z.boolean(),
  saldo: z.number(),
});

export const CatalogoPublicoSchema = z.object({
  titulo: z.string(),
  descripcion: z.string().nullable(),
  mostrar_precio: z.boolean(),
  empresa_slug: z.string(),
  productos: z.array(CatalogoProductoPublicoSchema),
});
