import type { Metadata } from "next";
import { Archivo_Black } from "next/font/google";
import PresenceProvider from "@/components/PresenceProvider";
import { ReduxProvider } from "@/store/provider";
import { Toaster } from "sonner";
import ElasticCursor from "@/components/effects/ElasticCursor";
import RemoteCursors from "@/components/effects/RemoteCursors";
import "./globals.css";

const archivoBlack = Archivo_Black({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-archivo-black",
  display: "swap",
});

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
    <html lang="en" className={archivoBlack.variable}>
      <body className="antialiased">
        <PresenceProvider>
          <RemoteCursors />
          <ReduxProvider>{children}</ReduxProvider>
        </PresenceProvider>
        <Toaster 
          theme="dark" 
          position="top-center"
          toastOptions={{
            style: {
              background: 'rgba(0, 0, 0, 0.8)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: 'white',
              backdropFilter: 'blur(12px)',
            },
          }}
        />
        <ElasticCursor />
      </body>
    </html>
  );
}
