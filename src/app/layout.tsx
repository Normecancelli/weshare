import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "WeShare · powered by Me.To.Do for you®",
  description: "Gestione attività WeShare — multi-utente, multi-ruolo",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it" className={`${inter.variable} h-full antialiased`}>
      <body className="h-full overflow-hidden flex">{children}</body>
    </html>
  );
}
