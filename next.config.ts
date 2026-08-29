import type { NextConfig } from 'next';

const config: NextConfig = {
  // The conversion engine in src/lib is plain TypeScript with no dependencies,
  // imported straight from app code — no build step, no copy, no duplication.
  reactStrictMode: true,
};

export default config;
