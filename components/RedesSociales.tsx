import { EMPRESA } from '@/lib/empresa';

const NOMBRES = { facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok' } as const;

/** Renderiza solo las redes con URL; vacío = no se muestra nada. */
export function RedesSociales({
  redes = EMPRESA.redes,
  className,
}: {
  redes?: { facebook: string; instagram: string; tiktok: string };
  className?: string;
}) {
  const activas = (Object.keys(NOMBRES) as (keyof typeof NOMBRES)[]).filter((k) => redes[k]);
  if (activas.length === 0) return null;
  return (
    <div className={className}>
      {activas.map((k) => (
        <a
          key={k}
          href={redes[k]}
          target="_blank"
          rel="noopener noreferrer"
          className="transition-colors hover:text-white"
        >
          {NOMBRES[k]}
        </a>
      ))}
    </div>
  );
}
