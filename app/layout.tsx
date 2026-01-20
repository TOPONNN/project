import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KERO",
  description: "WebRTC Real-time Karaoke",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
<!-- auto-deploy test Tue Jan 20 23:48:48 KST 2026 -->
