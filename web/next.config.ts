import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The web app talks to the NestJS API only. It never opens a database
  // connection, so no database driver or DATABASE_URL belongs in this project.
  env: {},
};

export default nextConfig;
