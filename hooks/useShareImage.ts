'use client';
import { useCallback } from 'react';
import { toast } from 'sonner';

export function useShareImage() {
  const shareImage = useCallback(async (imageUrl: string, filename: string, title: string, text?: string) => {
    try {
      const proxyUrl = `/api/share-image?url=${encodeURIComponent(imageUrl)}`;
      const response = await fetch(proxyUrl);
      if (!response.ok) throw new Error('No se pudo cargar la imagen');
      const blob = await response.blob();
      const file = new File([blob], filename, { type: blob.type });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title, text });
      } else {
        // Fallback: download the image
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.info(text
          ? `Imagen descargada — ${text} — ábrela desde tu galería para compartir`
          : 'Imagen descargada — ábrela desde tu galería para compartir');
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        toast.error('No se pudo compartir la imagen');
      }
    }
  }, []);

  return { shareImage };
}
