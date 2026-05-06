import type { NextConfig } from "next";

const isGithubPages =
  process.env.GITHUB_PAGES === "true" || process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  output: "export",
  basePath: isGithubPages ? "/playground" : "",
  assetPrefix: isGithubPages ? "/playground/" : "",
  trailingSlash: true,
};

export default nextConfig;
