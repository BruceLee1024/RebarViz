import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === 'production';
const basePath = isProd ? '/RebarViz' : '';

const nextConfig: NextConfig = {
  output: 'export',
  basePath,
  assetPrefix: basePath,
  images: { unoptimized: true },
  reactCompiler: true,
};

export default nextConfig;
