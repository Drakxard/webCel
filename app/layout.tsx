import type { Metadata, Viewport } from "next"

import "./globals.css"

export const metadata: Metadata = {
  title: "Repaso movil",
  description: "Mini app instalable para repaso movil",
  applicationName: "Repaso movil",
  manifest: "/mobile-review.webmanifest",
  icons: {
    icon: [
      { url: "/mobile-review-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/mobile-review-icon-512.png", sizes: "512x512", type: "image/png" },
      { url: "/mobile-review-icon.svg", type: "image/svg+xml" },
      { url: "/mobile-review-icon-maskable.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/mobile-review-icon-192.png", sizes: "192x192", type: "image/png" }],
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f1e4a9",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
