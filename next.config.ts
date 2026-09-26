import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Let the dev server be used through an ngrok tunnel — Slack OAuth needs an HTTPS
  // redirect URL, so local Slack testing goes through one. Dev-only; ignored in production.
  allowedDevOrigins: ["*.ngrok-free.app", "*.ngrok-free.dev", "*.ngrok.app"],
};

export default nextConfig;
