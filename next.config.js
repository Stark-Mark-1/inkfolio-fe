/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const backend =
      process.env.NEXT_PUBLIC_BACKEND_URL?.trim() || "http://localhost:3001";

    return [
      {
        // All /api/backend/* requests are proxied to the backend server-side.
        // The browser never sees a cross-origin request, so CORS is not an issue.
        source: "/api/backend/:path*",
        destination: `${backend}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
