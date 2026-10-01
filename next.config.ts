import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // mupdf ships WebAssembly; load it with plain Node instead of bundling
  serverExternalPackages: ["mupdf"],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
