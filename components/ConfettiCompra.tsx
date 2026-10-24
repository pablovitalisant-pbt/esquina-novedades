'use client';

import { useEffect } from 'react';
import { EMPRESA } from '@/lib/empresa';

// Colores de marca + pastel del design-skill.
const COLORES = [EMPRESA.colores.primario, EMPRESA.colores.acento, '#F2D9DC', '#D9F2D8', '#E0D9F1', '#DAEFF8'];

/** Dos ráfagas desde las esquinas inferiores, hacia arriba a 45° (90° = vertical). */
export function ConfettiCompra() {
  useEffect(() => {
    let activo = true;
    import('canvas-confetti')
      .then(({ default: confetti }) => {
        if (!activo) return;
        const base = { particleCount: 90, spread: 50, startVelocity: 60, ticks: 250, colors: COLORES, disableForReducedMotion: true };
        confetti({ ...base, angle: 45, origin: { x: 0, y: 1 } });
        confetti({ ...base, angle: 135, origin: { x: 1, y: 1 } });
      })
      .catch(() => {});
    return () => {
      activo = false;
    };
  }, []);
  return <span data-confetti="" hidden aria-hidden="true" />;
}
