import type { Metadata } from "next";
import { ReduxProvider } from "@/store/provider";
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
        <ReduxProvider>{children}</ReduxProvider>
      </body>
    </html>
  );
}
