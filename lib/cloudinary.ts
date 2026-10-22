import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';

// ponytail: config global, se setea una vez a nivel modulo en vez de en cada llamada
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function uploadImage(base64Data: string, folder: string, publicId?: string): Promise<UploadApiResponse> {
  // cloudinary v2.9 devuelve Promise nativa sin callback.
  return cloudinary.uploader.upload(
    base64Data,
    { folder, public_id: publicId, overwrite: true, transformation: [{ quality: "auto", width: 1200, crop: "limit" }] }
  );
}
