import type { NextConfig } from "next";
import packageJson from './package.json';

// Set APP_VERSION in the release image build. Falling back to package.json keeps
// local builds identifiable without relying on a Git checkout being present.
const appVersion = process.env.APP_VERSION ?? packageJson.version;

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['better-sqlite3'],
  devIndicators: false,
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
  },
};

export default nextConfig;
