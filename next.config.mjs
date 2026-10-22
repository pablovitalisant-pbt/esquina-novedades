import withSerwistInit from "@serwist/next";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

// Revisión por cambio: el SW se precachea con `revision` para invalidar el
// cache de precache cuando cambia. Se usa el hash de git; fallback a un UUID.
const revision =
  spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout?.trim() ??
  randomUUID();

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    'jose',
    // ESM-only de PowerSync — necesarios para jest (next/jest no transforma
    // node_modules por defecto; mismo fix que jose en Slice 1).
    '@powersync/web',
    '@powersync/react',
    '@powersync/common',
    '@powersync/shared-internals',
    '@journeyapps/wa-sqlite',
    'comlink',
  ],
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
      },
    ],
  },
  // Config legacy de Webpack para PowerSync (Next 14 usa Webpack, no Turbopack).
  // https://docs.powersync.com/client-sdks/frameworks/next-js#webpack-configuration-legacy
  webpack: (config, { isServer }) => {
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      topLevelAwait: true,
    };
    if (!isServer) {
      config.module.rules.push({ test: /\.wasm$/, type: 'asset/resource' });
    }
    return config;
  },
};

// withSerwist compone el webpack() existente (verificado contra el fuente:
// index.mjs llama `nextConfig.webpack(config, options)` antes de inyectar
// sus plugins) — el bloque webpack de PowerSync arriba no se pisa.
const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  additionalPrecacheEntries: [{ url: '/offline', revision }],
});

export default withSerwist(nextConfig);
