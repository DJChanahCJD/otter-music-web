import type React from "react";
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { GlobalMusicPlayer } from "@/components/GlobalMusicPlayer";
import { SyncManager } from "@/components/SyncManager";

export const APP_NAME = "Otter Music";
export const metadata: Metadata = {
  title: APP_NAME,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`font-sans antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster
            position="top-center"
            richColors
            expand={true}
            visibleToasts={3}
            gap={12}
            toastOptions={{
              duration: 3000,
              closeButton: true,
            }}
          />
          <GlobalMusicPlayer />
          <SyncManager />
        </ThemeProvider>
      </body>
    </html>
  );
}
