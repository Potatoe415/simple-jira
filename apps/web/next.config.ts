import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@simple-jira/core"],
  // The context download route reads this file from the repo root at runtime.
  outputFileTracingIncludes: {
    "/api/context": ["../../docs/claude-app-context.md"],
  },
};

export default nextConfig;
