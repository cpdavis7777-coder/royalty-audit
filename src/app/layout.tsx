import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Nav } from "@/components/nav";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "True Barrel — Royalty Audit",
  description:
    "Upload your royalty check stub and find out if you're being paid what you're owed. Plain-English audit reports powered by public production data.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen`}>
        <Nav />
        <main>{children}</main>
        <footer className="border-t border-border mt-24 py-8 text-center text-sm text-muted-foreground">
          <p>True Barrel is informational only — not legal or financial advice.</p>
          <p className="mt-1">© {new Date().getFullYear()} True Barrel Royalty Audit</p>
        </footer>
      </body>
    </html>
  );
}
