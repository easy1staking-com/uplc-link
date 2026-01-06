import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  webpack: (config, { isServer }) => {
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };

    // Exclude problematic MeshSDK dependencies from webpack bundling
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push({
        "@meshsdk/core": "commonjs @meshsdk/core",
        "@meshsdk/core-csl": "commonjs @meshsdk/core-csl",
      });
    } else {
      // Client-side: ignore libsodium issues
      config.resolve.alias = {
        ...config.resolve.alias,
        'libsodium-wrappers-sumo': false,
        'libsodium-wrappers': false,
      };
    }

    // Ignore libsodium WASM module resolution issues
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };

    return config;
  },
};

export default nextConfig;
