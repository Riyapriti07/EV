import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "EV Drive HUD",
  description: "EV charging slot booking & range alert dashboard"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.className} bg-background text-foreground antialiased`}
      >
        <div className="min-h-screen bg-gradient-to-b from-slate-950 to-background">
          <main className="mx-auto flex max-w-6xl flex-col px-4 py-6">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}

