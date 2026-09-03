/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next.js 16+ requires this to be an ESM file (note: the file still uses
  // .js because Next compiles it via SWC, but the export must be `default`).
  output: 'standalone',
  reactStrictMode: true,
  // The dashboard fetches the live API on the client. This list must contain
  // any external host that the browser will hit from the client.
  // (GitHub Actions API + the Azure Container Instance FQDN for the API.)
  images: {
    remotePatterns: [],
  },
}

export default nextConfig
