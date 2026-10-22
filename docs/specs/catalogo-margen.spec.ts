import { z } from "zod";

export const CatalogoUpdateSchema = z.object({
  titulo: z.string().min(1).optional(),
  descripcion: z.string().optional(),
  activo: z.boolean().optional(),
  palabras_excluir: z.string().optional(),
  margen_precio: z.number().min(0).max(999.99).optional(),
});
