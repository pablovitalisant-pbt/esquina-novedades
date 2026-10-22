'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';

function addCloudinaryTransform(url: string | null | undefined): string {
  if (!url || !url.includes('res.cloudinary.com')) return url || '';
  return url.replace('/image/upload/', '/image/upload/q_auto,w_1200,c_limit/');
}

interface ImageWithFallbackProps {
  src?: string | null;
  codigo: string;
  empresaSlug: string;
  alt?: string;
  fill?: boolean;
  width?: number;
  height?: number;
  className?: string;
}

export function ImageWithFallback({ 
  src, 
  codigo, 
  empresaSlug, 
  alt, 
  fill = false,
  width,
  height,
  className 
}: ImageWithFallbackProps) {
  const [error, setError] = useState(false);

  // If no DB URL is provided and we haven't errored yet, try the predictable Cloudinary path
  const cloudinaryFallbackUrl = `https://res.cloudinary.com/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload/q_auto,w_1200,c_limit/${empresaSlug}/${codigo}.jpeg`;
  const [imgSrc, setImgSrc] = useState(addCloudinaryTransform(src) || cloudinaryFallbackUrl);

  useEffect(() => {
    if (src) {
      setImgSrc(addCloudinaryTransform(src));
      setError(false);
    }
  }, [src]);

  const handleError = () => {
    setError(true);
  };

  if (error) {
    return (
      <div className={`flex flex-col items-center justify-center bg-[var(--muted)] bg-[var(--muted)]900 border border-[var(--border)] border-[var(--border)]800 rounded-md overflow-hidden ${className}`} style={{ width: fill ? '100%' : width, height: fill ? '100%' : height }}>
         <span className="text-sm font-mono text-[var(--body)] dark:text-[var(--body)] tracking-wider break-all px-2 text-center">{codigo}</span>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden ${className}`} style={{ width: fill ? '100%' : width, height: fill ? '100%' : height }}>
      <Image
        src={imgSrc}
        alt={alt || codigo}
        fill={fill}
        width={!fill ? width : undefined}
        height={!fill ? height : undefined}
        className="object-cover"
        onError={handleError}
        unoptimized // We use pure URLs for Cloudinary direct sourcing if needed
      />
    </div>
  );
}
