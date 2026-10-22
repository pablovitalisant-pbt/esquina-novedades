'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Search, Camera, MessageCircle } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import Image from 'next/image';

type Despacho = {
  id: number;
  folio: string;
  imagen_url: string;
  empresa_nombre: string;
  created_at: string;
  subido_por: string;
};

export function DespachosClient({
  session,
  empresaId,
}: {
  session: any;
  empresaId: number;
}) {
  const rol = session?.user?.rol as string;
  const puedeSubir = ['admin', 'bodeguero'].includes(rol);

  const [folio, setFolio] = useState('');
  const [resultados, setResultados] = useState<Despacho[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queueRef = useRef<File[]>([]);
  const processingRef = useRef(false);
  const [queueCount, setQueueCount] = useState(0);

  const handleBuscar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (folio.trim().length < 2) return;
    setBuscando(true);
    try {
      const res = await fetch(`/api/despachos/buscar?folio=${encodeURIComponent(folio.trim())}`);
      const { data } = await res.json();
      setResultados(data || []);
    } catch {
      toast.error('Error al buscar');
    } finally {
      setBuscando(false);
    }
  };

  const processNext = useCallback(async () => {
    if (processingRef.current || queueRef.current.length === 0) return;
    processingRef.current = true;

    const file = queueRef.current[0];
    try {
      const compressed = await compressImage(file, 1200, 0.75);
      const base64 = compressed.split(',')[1];
      const res = await fetch('/api/despachos/procesar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64,
          mimeType: 'image/jpeg',
          empresaId,
        }),
      });
      const body = await res.json();
      if (res.ok) {
        toast.success(`✅ Folio ${body.folio} registrado`);
      } else {
        toast.error(`❌ No se pudo identificar el folio en "${file.name}"`, { duration: Infinity });
      }
    } catch {
      toast.error(`❌ Error procesando "${file.name}"`, { duration: Infinity });
    } finally {
      queueRef.current.shift();
      setQueueCount(queueRef.current.length);
      processingRef.current = false;
      if (queueRef.current.length > 0) {
        processNext();
      }
    }
  }, [empresaId]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    queueRef.current.push(...files);
    setQueueCount(queueRef.current.length);
    if (fileInputRef.current) fileInputRef.current.value = '';
    processNext();
  };

  const handleShareWhatsApp = async (despacho: Despacho) => {
    const texto = `Despacho Nota N° ${despacho.folio}\nFecha: ${format(new Date(despacho.created_at), 'dd MMM yyyy, HH:mm', { locale: es })}`;
    try {
      const response = await fetch(despacho.imagen_url);
      const blob = await response.blob();
      const file = new File([blob], `despacho_${despacho.folio}.jpg`, { type: 'image/jpeg' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text: texto });
      } else {
        // Fallback: compartir solo texto con link
        await navigator.share({ text: `${texto}\n${despacho.imagen_url}` });
      }
    } catch (error: any) {
      if (error?.name !== 'AbortError') {
        toast.error('No se pudo compartir la imagen');
      }
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full fade-in zoom-in-95 duration-200">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Despachos de Bodega</h1>
        <p className="text-[var(--body)]500 mt-1">Verifica si una nota de venta fue despachada</p>
      </div>

      {/* Buscador */}
      <form role="form" onSubmit={handleBuscar} className="flex gap-2 max-w-lg">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--body)]" />
          <Input
            type="text"
            placeholder="Número de nota de venta..."
            className="pl-9"
            value={folio}
            onChange={e => setFolio(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={buscando || folio.trim().length < 2}>
          {buscando ? 'Buscando...' : 'Buscar'}
        </Button>
      </form>

      {/* Resultado búsqueda */}
      {resultados !== null && (
        <div>
          {resultados.length === 0 ? (
            <div className="py-12 text-center text-[var(--body)]">
              <p className="text-lg font-medium">No se encontró despacho para este folio</p>
              <p className="text-sm mt-1">La nota N° {folio} aún no ha sido registrada como despachada</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4 max-w-lg">
              {resultados.map(d => (
                <div key={d.id} className="border rounded-xl overflow-hidden bg-white bg-[var(--muted)]900 shadow-sm">
                  <div className="p-4 border-b">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-[var(--body)] uppercase tracking-wide">Nota de Venta</p>
                        <p className="text-2xl font-black text-[var(--success)]">{d.folio}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-[var(--body)]">{d.empresa_nombre}</p>
                        <p className="text-sm font-medium">
                          {format(new Date(d.created_at), 'dd MMM yyyy, HH:mm', { locale: es })}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="relative aspect-[4/3] bg-[var(--muted)] bg-[var(--muted)]800">
                    <Image
                      src={d.imagen_url}
                      alt={`Despacho nota ${d.folio}`}
                      fill
                      className="object-contain"
                    />
                  </div>
                  <div className="p-3">
                    <button
                      type="button"
                      onClick={() => handleShareWhatsApp(d)}
                      aria-label="Compartir por WhatsApp"
                      className="flex items-center justify-center gap-2 w-full bg-[var(--success)]/10 hover:bg-[var(--success)]/10 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                    >
                      <MessageCircle className="w-4 h-4" />
                      Compartir imagen
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {queueCount > 0 && (
        <div className="fixed bottom-40 right-4 md:bottom-28 md:right-8 z-50 bg-[var(--primary)] text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-white animate-pulse" />
          {queueCount} en cola
        </div>
      )}

      {/* Botón flotante cámara — solo bodeguero y admin */}
      {puedeSubir && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            type="button"
            aria-label="Registrar nuevo despacho con foto"
            onClick={() => fileInputRef.current?.click()}
            className="fixed bottom-20 right-4 md:bottom-8 md:right-8 z-50 w-16 h-16 bg-[var(--primary)] hover:bg-[var(--primary)] text-white rounded-full shadow-2xl flex items-center justify-center transition-colors"
          >
            <Camera className="w-7 h-7" />
          </button>
        </>
      )}
    </div>
  );
}

// Comprime imagen a maxWidth px y calidad dada (0-1)
async function compressImage(file: File, maxWidth: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas error'));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    img.src = url;
  });
}
