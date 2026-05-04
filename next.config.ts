import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/playground",
  trailingSlash: true,
};

export default nextConfig;
