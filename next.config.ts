import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  webpack(config, { webpack }) {
    config.optimization.minimize = false;

    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(
        /^node:/,
        (resource: { request: string }) => {
          resource.request = resource.request.replace(/^node:/, "");
        },
      ),
    );
    config.resolve.fallback = {
      ...config.resolve.fallback,
      crypto: false,
      fs: false,
      module: false,
    };
    return config;
  },
};

export default nextConfig;
