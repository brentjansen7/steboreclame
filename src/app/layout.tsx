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
      <body className="min-h-full flex flex-col">
        {/* Brand stripe */}
        <div className="stebo-rule" />

        {/* Top nav */}
        <nav className="bg-white border-b border-[var(--color-stebo-line)]">
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-10">
            <Link href="/" className="flex items-center gap-2 group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/icon-red.svg"
                alt="Stebo Reclame"
                className="h-8 w-8"
              />
              <span className="text-xs font-medium tracking-widest uppercase text-[var(--color-stebo-ink)]">
                Stebo Reclame
              </span>
            </Link>

            <div className="ml-auto flex items-center gap-1 text-sm">
              <NavLink href="/">Projecten</NavLink>
              <NavLink href="/upload">Nieuw ontwerp</NavLink>
              <NavLink href="/instellingen">Instellingen</NavLink>
            </div>
          </div>
        </nav>

        <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-10">
          {children}
        </main>
      </body>
    </html>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="px-3 py-2 rounded-md font-medium text-[var(--color-stebo-ink)] hover:bg-[var(--color-stebo-yellow-50)] hover:text-[var(--color-stebo-blue-700)] transition-colors"
    >
      {children}
    </Link>
  );
}
