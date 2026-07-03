import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Source-mode workspace packages.
  transpilePackages: ["@cipher/ui", "@cipher/fhe-client", "@cipher/registry-sdk"],
  // Reserved knobs for the Zama SDK's WASM, only if install-time verification
  // shows the SDK imports .wasm directly instead of fetching at runtime:
  //   webpack: (config) => { config.experiments = { ...config.experiments, asyncWebAssembly: true }; return config; }
  // and COOP/COEP headers via headers() if SharedArrayBuffer errors appear.
};

export default nextConfig;
