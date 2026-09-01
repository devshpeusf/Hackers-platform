import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  // We hand-write CLAUDE.md ourselves (see project brief); don't let
  // Next regenerate/overwrite it with an auto-generated stub.
  agentRules: false,
};

export default nextConfig;
