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
  title: "Amal Prasad — AGP Enterprises",
  description: "Amal Prasad, AGP Enterprises. Marketing, design and tech solutions. Freelance, GMT+5:30.",
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
