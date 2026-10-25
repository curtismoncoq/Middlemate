import path from 'node:path';
import type { NextConfig } from 'next';

process.env.TB_REPO_ROOT ??= path.resolve(__dirname, '../..');

const config: NextConfig = {
  transpilePackages: ['@tb/config', '@tb/registry-client'],
  serverExternalPackages: ['@stellar/stellar-sdk'],
  typescript: { ignoreBuildErrors: false },
};

export default config;
