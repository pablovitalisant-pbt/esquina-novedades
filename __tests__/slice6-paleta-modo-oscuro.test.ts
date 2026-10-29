import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const CSS_PATH = path.join(ROOT, 'app', 'globals.css');

function readCss(): string {
  return fs.readFileSync(CSS_PATH, 'utf-8');
}

function parseTokens(block: string): Record<string, string> {
  const tokens: Record<string, string> = {};
  const re = /--([\w-]+)\s*:\s*([^;]+);/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) tokens[m[1]] = m[2].trim();
  return tokens;
}

function cssBlocks(): { light: Record<string, string>; dark: Record<string, string> } {
  const css = readCss();
  const darkIdx = css.indexOf('@media (prefers-color-scheme: dark)');
  if (darkIdx === -1) throw new Error('No existe @media (prefers-color-scheme: dark) en globals.css');
  const lightBlock = css.slice(0, darkIdx).match(/:root\s*\{([^}]*)\}/)?.[1] ?? '';
  const darkBlock = css.slice(darkIdx).match(/:root\s*\{([^}]*)\}/)?.[1] ?? '';
  return { light: parseTokens(lightBlock), dark: parseTokens(darkBlock) };
}

function rgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').trim();
  if (!/^[0-9a-f]{6}$/i.test(clean)) throw new Error(`Hex no soportado: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance(hex: string): number {
  return rgb(hex)
    .map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    })
    .reduce((acc, c, i) => acc + c * [0.2126, 0.7152, 0.0722][i], 0);
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__' || entry.name.startsWith('.')) continue;
      walk(full, out);
    } else if (/\.(tsx?|jsx?|css|mdx)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const LIGHT = {
  background: '#FFFCF6',
  foreground: '#3B2A45',
  card: '#FFFFFF',
  'card-foreground': '#21002F',
  primary: '#590078',
  'primary-foreground': '#FFF8EA',
  secondary: '#F2B936',
  muted: '#F5EEF8',
  'muted-foreground': '#6B5A75',
  accent: '#F2B936',
  destructive: '#B42318',
  border: '#E4D8EA',
  input: '#D6C7DE',
  ring: '#D83AE8',
  heading: '#21002F',
  body: '#3B2A45',
  'border-default': '#E4D8EA',
  'border-brand': '#F2B936',
  'brand-soft': '#FFF3D1',
  'fg-brand-strong': '#7A5200',
};

const DARK = {
  background: '#140019',
  foreground: '#E9DFF0',
  card: '#24082F',
  'card-foreground': '#FFF8EA',
  popover: '#2C0C3A',
  primary: '#F2B936',
  'primary-foreground': '#21002F',
  secondary: '#F2B936',
  'secondary-foreground': '#21002F',
  muted: '#2E1040',
  'muted-foreground': '#C7B5D2',
  accent: '#F2B936',
  border: '#5A3A6E',
  input: '#6B4782',
  ring: '#F2B936',
  heading: '#FFF8EA',
  body: '#E9DFF0',
  'border-default': '#5A3A6E',
  'border-brand': '#F2B936',
  'brand-soft': '#3D2A05',
  'fg-brand-strong': '#FFE6A0',
};

describe('Slice 6 — tokens de la paleta', () => {
  test('modo claro define los tokens clave', () => {
    const { light } = cssBlocks();
    for (const [key, value] of Object.entries(LIGHT)) {
      expect({ token: key, value: light[key]?.toUpperCase() }).toEqual({ token: key, value: value.toUpperCase() });
    }
  });

  test('modo oscuro define los tokens clave', () => {
    const { dark } = cssBlocks();
    for (const [key, value] of Object.entries(DARK)) {
      expect({ token: key, value: dark[key]?.toUpperCase() }).toEqual({ token: key, value: value.toUpperCase() });
    }
  });

  test('landing page usa la nueva paleta', () => {
    const css = readCss();
    const block = css.match(/\.landing-page\s*\{[^}]*\}/)?.[0] ?? '';
    expect(block).toContain('--landing-primary: #590078');
    expect(block).toContain('--landing-surface: #FFF8EA');
    expect(block).toContain('--landing-ink: #21002F');
  });
});

describe('Slice 6 — contraste WCAG', () => {
  const PAIRS: Array<[string, string, string, number]> = [
    ['heading', 'background', 'claro', 4.5],
    ['body', 'card', 'claro', 4.5],
    ['muted-foreground', 'muted', 'claro', 4.5],
    ['primary-foreground', 'primary', 'claro', 4.5],
    ['heading', 'background', 'oscuro', 4.5],
    ['body', 'card', 'oscuro', 4.5],
    ['muted-foreground', 'muted', 'oscuro', 4.5],
    ['primary-foreground', 'primary', 'oscuro', 4.5],
    ['secondary-foreground', 'secondary', 'oscuro', 4.5],
    ['border', 'background', 'oscuro', 1.5],
  ];

  test.each(PAIRS)('%s sobre %s (%s) >= %s', (fg, bg, mode, min) => {
    const block = mode === 'claro' ? cssBlocks().light : cssBlocks().dark;
    const ratio = contrast(block[fg], block[bg]);
    expect(ratio).toBeGreaterThanOrEqual(min);
  });

  test('texto #FFF8EA sobre los extremos del degradado de marca >= 4.5', () => {
    const config = fs.readFileSync(path.join(ROOT, 'tailwind.config.ts'), 'utf-8');
    const gradient = config.match(/'gradient-brand':\s*'([^']+)'/)?.[1] ?? '';
    const stops = gradient.match(/#[0-9A-Fa-f]{6}/g) ?? [];
    expect(stops.length).toBeGreaterThanOrEqual(2);
    for (const stop of stops) {
      expect(contrast('#FFF8EA', stop)).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('texto sobre fondos soft tiene contraste >= 4.5 en ambos modos', () => {
    const { light, dark } = cssBlocks();
    const pairs: Array<[string, string]> = [
      ['fg-success-strong', 'success-soft'],
      ['fg-danger-strong', 'danger-soft'],
      ['fg-warning', 'warning-soft'],
      ['fg-brand-strong', 'brand-soft'],
    ];
    for (const block of [light, dark]) {
      for (const [fg, bg] of pairs) {
        expect(contrast(block[fg], block[bg])).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe('Slice 6 — sin colores fijos que rompan el modo oscuro', () => {
  test('no quedan bg-white / text-gray- / bg-gray- / text-zinc- / bg-zinc- en app/ ni components/', () => {
    const forbidden = /(?:bg-white|text-gray-|bg-gray-|text-zinc-|bg-zinc-)/;
    const offenders: string[] = [];
    for (const file of [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'components'))]) {
      const lines = fs.readFileSync(file, 'utf-8').split('\n');
      lines.forEach((line, i) => {
        if (forbidden.test(line)) offenders.push(`${path.relative(ROOT, file)}:${i + 1} → ${line.trim()}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
