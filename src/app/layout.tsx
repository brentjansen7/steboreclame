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
            <Link href="/" className="flex items-center gap-3 group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/stebo-logo.svg"
                alt="Stebo Reclame"
                className="h-9 w-auto"
              />
              <span className="hidden md:inline-block text-xs font-medium tracking-widest uppercase text-[var(--color-stebo-mute)] border-l border-[var(--color-stebo-line)] pl-3">
                Folie Tool
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

        {/* Footer */}
        <footer className="mt-auto border-t border-[var(--color-stebo-line)] bg-white">
          <div className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/stebo-logo.svg"
                alt="Stebo Reclame"
                className="h-8 w-auto mb-3"
              />
              <p className="text-[var(--color-stebo-mute)] leading-relaxed">
                Full service sign- en reclamebureau.
                <br />
                Nieuw in de Stormpolder.
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-stebo-blue-700)] mb-2">
                Werkplaats
              </p>
              <p className="text-[var(--color-stebo-ink)]">
                Van Utrechtweg 36B
                <br />
                2921 LN Krimpen aan den IJssel
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-stebo-blue-700)] mb-2">
                Contact
              </p>
              <p className="text-[var(--color-stebo-ink)]">
                <a href="tel:0683223375" className="hover:text-[var(--color-stebo-blue-700)]">
                  06 — 83 22 33 75
                </a>
                <br />
                <a href="mailto:info@steboreclame.nl" className="hover:text-[var(--color-stebo-blue-700)]">
                  info@steboreclame.nl
                </a>
              </p>
            </div>
          </div>
          <div className="border-t border-[var(--color-stebo-line)]">
            <div className="max-w-7xl mx-auto px-6 py-3 text-xs text-[var(--color-stebo-mute)] flex justify-between">
              <span>© {new Date().getFullYear()} Stebo Reclame</span>
              <span className="font-mono">Folie Tool</span>
            </div>
          </div>
        </footer>
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
