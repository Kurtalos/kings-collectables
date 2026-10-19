import type { NextConfig } from "next";

const nextConfig: NextConfig = { outputFileTracingIncludes: { "/api/orders/picklist": ["./src/assets/fonts/**/*"] }, allowedDevOrigins: ["127.0.0.1", "localhost", "*.e2b.app"] };

export default nextConfig;
