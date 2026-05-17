import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow accessing Next.js from another device on the same WiFi (like a phone)
  allowedDevOrigins: ["192.168.1.3", "localhost", "127.0.0.1"],
};

export default nextConfig;
