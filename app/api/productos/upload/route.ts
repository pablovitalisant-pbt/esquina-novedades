import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/db";
import { NextResponse } from "next/server";
import { uploadImage } from "@/lib/cloudinary";
import { sanearCodigo } from "@/lib/cloudinary-url";
import { mensajeError } from '@/lib/errores';

export const runtime = "nodejs";

// fotos-1: el cliente ya manda < 3 MB; 4 MB es el limite duro del servidor.
const MAX_BASE64_BYTES = 4 * 1024 * 1024;

function fotosConfiguradas(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  
  const user = session.user;
  if (!['admin'].includes(user.rol)) {
    return NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 });
  }

  // fotos-1: sin credenciales no se intenta subir.
  if (!fotosConfiguradas()) {
    return NextResponse.json({ error: "Fotos no configuradas" }, { status: 503 });
  }

  try {
    const { imageBase64, codigo: codigoRaw } = await request.json();
    const codigo = typeof codigoRaw === 'string' ? codigoRaw.trim() : '';

    if (!imageBase64 || !codigo) {
      return NextResponse.json({ error: "Faltan datos (imageBase64, codigo)" }, { status: 400 });
    }

    // fotos-1: rechazar antes de llamar a Cloudinary.
    if (Buffer.byteLength(String(imageBase64), 'utf8') > MAX_BASE64_BYTES) {
      return NextResponse.json({ error: "La foto es muy pesada" }, { status: 413 });
    }

    const empresaId = Number(user.empresas?.[0]);
    if (!empresaId) {
      return NextResponse.json({ error: "Sin empresa asignada" }, { status: 400 });
    }

    // fotos-1: public_id estable por codigo saneado -> overwrite real.
    const publicId = `productos/${sanearCodigo(codigo)}`;
    const uploadResult = await uploadImage(String(imageBase64), publicId);
    if (!uploadResult || !uploadResult.secure_url) {
      throw new Error("Fallo al subir imagen a Cloudinary");
    }

    const imageUrl = uploadResult.secure_url;
    const publicIdSubido = uploadResult.public_id;

    // fotos-1: el UPDATE solo toca la empresa de la sesion.
    await sql`
      UPDATE productos 
      SET imagen_url = ${imageUrl}, public_id = ${publicIdSubido}, updated_at = NOW()
      WHERE codigo = ${codigo} AND empresa_id = ${empresaId}
    `;

    return NextResponse.json({ imagen_url: imageUrl, public_id: publicIdSubido });
  } catch (error) {
    console.error(`POST /api/productos/upload error:`, error);
    const message = mensajeError(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
