'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const MIMES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_BYTES = 2 * 1024 * 1024;

/** N12d3 — adjunta una imagen a una transferencia ya registrada. */
export function SubirComprobantePago({ pagoId }: { pagoId: string }) {
  const router = useRouter();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [error, setError] = useState('');
  const enviando = useRef(false);

  function elegir(file: File | undefined) {
    setError('');
    setArchivo(null);
    if (!file) return;
    if (!MIMES.includes(file.type)) return setError('Solo se aceptan imágenes PNG, JPEG o WebP.');
    if (file.size > MAX_BYTES) return setError('La imagen no puede superar los 2 MiB.');
    setArchivo(file);
  }

  async function enviar() {
    if (!archivo || enviando.current) return;
    enviando.current = true;
    setError('');
    try {
      const res = await fetch(`/api/admin/pagos-app/${pagoId}/comprobante`, {
        method: 'POST',
        body: archivo,
      });
      if (!res.ok) throw new Error('subida fallida');
      router.refresh();
    } catch {
      setError('No se pudo adjuntar el comprobante.');
    } finally {
      enviando.current = false;
    }
  }

  const id = `comprobante-${pagoId}`;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <label htmlFor={id} className="text-sm font-medium text-[var(--heading)]">
        Comprobante
      </label>
      <input
        id={id}
        type="file"
        accept={MIMES.join(',')}
        onChange={(e) => elegir(e.target.files?.[0])}
        className="rounded-full border border-[var(--border-default)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--heading)] file:mr-3 file:rounded-full file:border-0 file:bg-[var(--primary)] file:px-4 file:py-1.5 file:text-sm file:font-medium file:text-[var(--primary-foreground)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
      />
      <button
        type="button"
        onClick={enviar}
        disabled={!archivo}
        className="rounded-full border border-[var(--border-default)] bg-[var(--muted)] px-5 py-2.5 text-sm font-medium text-[var(--heading)] shadow-sm transition-colors hover:bg-[var(--card)] disabled:cursor-not-allowed disabled:bg-[var(--disabled)] disabled:text-[var(--fg-disabled)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
      >
        Adjuntar comprobante
      </button>
      {error && (
        <p role="alert" className="w-full rounded-3xl border border-[var(--border-danger-subtle)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--fg-danger-strong)]">
          {error}
        </p>
      )}
    </div>
  );
}
