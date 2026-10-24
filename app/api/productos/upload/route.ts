import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";
import { NextResponse } from "next/server";
import type { UserSession } from "@/types";
import { uploadImage } from "@/lib/cloudinary";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  
  const user = session.user as UserSession;
  if (!['admin'].includes(user.rol)) {
    return NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 });
  }

  try {
    const { imageBase64, codigo } = await request.json();

    if (!imageBase64 || !codigo) {
      return NextResponse.json({ error: "Faltan datos (imageBase64, codigo)" }, { status: 400 });
    }

    // 1. Upload to Cloudinary. Use folder 'productos/' and public_id = codigo as requested.
    // Cloudinary will overwrite if public_id is the same.
    const uploadResult = await uploadImage(imageBase64, 'productos', codigo);
    if (!uploadResult || !uploadResult.secure_url) {
      throw new Error("Fallo al subir imagen a Cloudinary");
    }

    const imageUrl = uploadResult.secure_url;
    const publicId = uploadResult.public_id;

    // 2. Update all product variants with this code
    // We update imagen_url and if public_id column exists we update it too.
    // Based on user request, they want to return it, so we store it if possible.
    await sql`
      UPDATE productos 
      SET imagen_url = ${imageUrl}, public_id = ${publicId}, updated_at = NOW()
      WHERE codigo = ${codigo}
    `;

    return NextResponse.json({ imagen_url: imageUrl, public_id: publicId });
  } catch (error) {
    console.error(`POST /api/productos/upload error:`, error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
