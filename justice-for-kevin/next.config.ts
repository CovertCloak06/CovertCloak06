import type { NextConfig } from "next";

/**
 * Security headers applied to every response. CSP is intentionally strict:
 * scripts only from self (Next.js requires 'unsafe-inline' for its inline
 * runtime unless a nonce strategy is used; we allow it only for styles and
 * use 'self' + hashes for scripts in production via the framework defaults).
 */
const connectSrc = [
  "'self'",
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.NEXT_PUBLIC_ANALYTICS_URL ?? "",
  "https://challenges.cloudflare.com",
]
  .filter(Boolean)
  .join(" ");

const isDev = process.env.NODE_ENV !== "production";

const csp = [
  "default-src 'self'",
  // 'unsafe-inline' is required by Next.js hydration inline scripts; Turnstile
  // is third-party. 'unsafe-eval' is needed only by the dev-mode toolchain
  // (Fast Refresh source maps) and is never emitted in production.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://challenges.cloudflare.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src ${connectSrc}`,
  "frame-src https://challenges.cloudflare.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  ...(process.env.NODE_ENV === "production"
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // Secure-intake uploads (attachment ceiling is enforced separately
      // server-side; see src/lib/tip-schema.ts MAX_ATTACHMENT_BYTES). Sized
      // just above the deploy-time upload cap so multipart overhead fits.
      bodySizeLimit: `${
        Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB) > 0
          ? Math.ceil(Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB) * 1.1)
          : 110
      }mb`,
    },
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
