import type { Metadata } from "next";
import type { ReactNode } from "react";
import { archivo, inter, plexMono } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Bunsho", template: "%s · Bunsho" },
  description: "Authoring and control for controlled documents — git inside, Google-Docs outside.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${inter.variable} ${plexMono.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
