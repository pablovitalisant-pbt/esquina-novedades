'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { urlCloudinary } from '@/lib/cloudinary-url';

interface ImageWithFallbackProps {
  src?: string | null;
  codigo: string;
  alt?: string;
  fill?: boolean;
  width?: number;
  height?: number;
  className?: string;
  /** Ancho de entrega para la transformacion de Cloudinary (default 600). */
  ancho?: number;
}

export function ImageWithFallback({ 
  src, 
  codigo, 
  alt, 
  fill = false,
  width,
  height,
  className,
  ancho = 600
}: ImageWithFallbackProps) {
  const [error, setError] = useState(false);

  useEffect(() => {
    setError(false);
  }, [src]);

  // Sin foto se muestra el placeholder directo (no se adivina una url).
  if (error || !src) {
    return (
      <div className={`flex flex-col items-center justify-center bg-[var(--muted)] border border-[var(--border)] rounded-md overflow-hidden ${className}`} style={{ width: fill ? '100%' : width, height: fill ? '100%' : height }}>
         <span className="text-sm font-mono text-[var(--body)] dark:text-[var(--body)] tracking-wider break-all px-2 text-center">{codigo}</span>
      </div>
    );
  }

  const imgSrc = urlCloudinary(src, ancho);

  return (
    <div className={`relative overflow-hidden ${className}`} style={{ width: fill ? '100%' : width, height: fill ? '100%' : height }}>
      <Image
        src={imgSrc}
        alt={alt || codigo}
        fill={fill}
        width={!fill ? width : undefined}
        height={!fill ? height : undefined}
        className="object-cover"
        onError={() => setError(true)}
        unoptimized // We use pure URLs for Cloudinary direct sourcing if needed
      />
    </div>
  );
}
