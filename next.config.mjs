/** @type {import('next').NextConfig} */
const nextConfig = {
  // Evita el warning de workspace root inferido (hay un lockfile en C:\Users\pablo).
  outputFileTracingRoot: import.meta.dirname,
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
};

export default nextConfig;
