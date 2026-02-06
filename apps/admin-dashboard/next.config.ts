import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // typedRoutes: true, — disabled until route types are generated
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.blob.core.windows.net',
      },
    ],
  },
  // TypeScript checking done via vitest + CI — skip during build to avoid
  // Node 25 / tsc deadlock on resource-constrained machines.
  typescript: {
    ignoreBuildErrors: true,
  },
  // Transpile shared workspace packages
  transpilePackages: ['@mosy/shared-types'],
};

export default nextConfig;
