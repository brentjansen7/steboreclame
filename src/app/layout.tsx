import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import Link from "next/link";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Stebo Reclame — Folie Tool",
  description: "Automatische folie-calculator, pand-preview & snij-workflow",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="nl" className={`${geist.className} h-full`}>
      <body className="min-h-full bg-gray-50 text-gray-900">
        <nav className="bg-white border-b border-gray-200 px-6 py-3">
          <div className="max-w-7xl mx-auto flex items-center gap-8">
            <Link href="/" className="font-bold text-xl text-blue-600">
              Stebo Reclame
            </Link>
            <div className="flex gap-6 text-sm">
              <Link href="/" className="text-gray-600 hover:text-gray-900">
                Projecten
              </Link>
              <Link
                href="/upload"
                className="text-gray-600 hover:text-gray-900"
              >
                Nieuw ontwerp
              </Link>
              <Link
                href="/instellingen"
                className="text-gray-600 hover:text-gray-900"
              >
                Instellingen
              </Link>
            </div>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
