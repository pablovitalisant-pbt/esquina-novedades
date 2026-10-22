import type { Metadata } from 'next';
import { Public_Sans } from 'next/font/google';
import './globals.css';
import { Toaster } from '@/components/ui/sonner';
import { EMPRESA } from '@/lib/empresa';

const publicSans = Public_Sans({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: EMPRESA.nombre,
  description: `Venta mayorista y al detalle en ${EMPRESA.ciudad}`,
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: EMPRESA.nombre,
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '32x32' },
      { url: '/icon-192.png', sizes: '192x192' },
    ],
    apple: '/icon-192.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <head>
        <meta name="theme-color" content="#1565C0" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body className={publicSans.className}>
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
