import type { Metadata, Viewport } from "next";
import "./globals.css";

import { AuthProvider } from "@/features/auth/auth-store";
import { ServiceWorkerRegistration } from "@/lib/pwa/service-worker-registration";

export const metadata: Metadata = {
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
  },
  title: "FamilyChat",
  description: "Приватный семейный мессенджер.",
  icons: {
    apple: "/icons/familychat-192.png",
    icon: "/icons/familychat-192.png",
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#ffffff",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>
        <AuthProvider>
          <ServiceWorkerRegistration />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
