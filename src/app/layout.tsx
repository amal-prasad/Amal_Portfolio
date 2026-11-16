import type { Metadata } from "next";
import { Playfair_Display } from "next/font/google";
import "./globals.css";

// Upright only: the source never loads the italic face, so the "o" swap is a synthesized slant.
const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: "400",
  style: "normal",
});

export const metadata: Metadata = {
  title: "Amal Prasad | Tech Solutions & Web Design",
  description: "Amal Prasad, freelancer working with AGP Enterprises. Practical tech solutions and thoughtful web design to help businesses work better and look sharp online.",
  icons: { icon: "/sites/tomdekoning/logo.png" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={playfair.variable}>
      <body>{children}</body>
    </html>
  );
}
