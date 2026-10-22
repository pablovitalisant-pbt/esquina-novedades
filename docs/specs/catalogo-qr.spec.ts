import { z } from "zod";

export const QRCatalogoSchema = z.object({
  slug: z.string().min(1),
  baseUrl: z.string().url(),
  publicUrl: z.string().url(),
});
