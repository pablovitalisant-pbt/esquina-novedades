import { z } from "zod";

export const KardexQuerySchema = z.object({
  codigo: z.string().min(1),
  empresaSlug: z.string().min(1),
});

export const KardexResponseSchema = z.object({
  precio_minimo: z.number().nullable(),
  precio_maximo: z.number().nullable(),
  total_ventas: z.number().int(),
});

export type KardexQuery = z.infer<typeof KardexQuerySchema>;
export type KardexResponse = z.infer<typeof KardexResponseSchema>;
