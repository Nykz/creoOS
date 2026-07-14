import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    const scriptPolicy = process.env.NODE_ENV === "development" ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self' 'unsafe-inline'";
    const insforgeUrl = process.env.NEXT_PUBLIC_INSFORGE_URL ?? "https://fcmvv87e.ap-southeast.insforge.app";
    const insforgeOrigin = new URL(insforgeUrl).origin;
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        { key: "Content-Security-Policy", value: `default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; connect-src 'self' ${insforgeOrigin} wss:${insforgeOrigin.replace(/^https?:/, "")}; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; ${scriptPolicy}` },
      ],
    }];
  },
};

export default nextConfig;
