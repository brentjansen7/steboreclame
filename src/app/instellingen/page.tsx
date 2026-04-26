"use client";

import { useEffect, useState } from "react";
import {
  loadColorPrices,
  saveColorPrices,
  normalizeHex,
  type ColorPrice,
} from "@/lib/colorPrices";

export default function SettingsPage() {
  const [prices, setPrices] = useState<ColorPrice[]>([]);
  const [hexInput, setHexInput] = useState("");
  const [priceInput, setPriceInput] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setPrices(loadColorPrices());
  }, []);

  function persist(next: ColorPrice[]) {
    setPrices(next);
    saveColorPrices(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  function addColor() {
    setError(null);
    const hex = normalizeHex(hexInput);
    const price = parseFloat(priceInput);
    if (!hex) {
      setError("Vul een geldige hex-kleur in (bijv. #FF0000 of FF0000)");
      return;
    }
    if (!price || price <= 0) {
      setError("Vul een prijs > 0 in");
      return;
    }
    const next = prices.filter((p) => p.hex !== hex);
    next.push({ hex, pricePerM: price, name: nameInput.trim() || undefined });
    next.sort((a, b) => a.hex.localeCompare(b.hex));
    persist(next);
    setHexInput("");
    setPriceInput("");
    setNameInput("");
  }

  function updatePrice(hex: string, value: string) {
    const price = parseFloat(value);
    if (!price || price <= 0) return;
    persist(prices.map((p) => (p.hex === hex ? { ...p, pricePerM: price } : p)));
  }

  function updateName(hex: string, name: string) {
    persist(prices.map((p) => (p.hex === hex ? { ...p, name: name || undefined } : p)));
  }

  function removeColor(hex: string) {
    persist(prices.filter((p) => p.hex !== hex));
  }

  return (
    <div className="max-w-3xl">
      <header className="mb-8 flex items-end justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-[var(--color-stebo-blue-700)] uppercase mb-2">
            <span className="inline-block w-6 h-px bg-[var(--color-stebo-yellow)] align-middle mr-2" />
            Configuratie
          </p>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-[var(--color-stebo-ink)]">
            Instellingen
          </h1>
        </div>
        {saved && (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-stebo-blue-900)] bg-[var(--color-stebo-yellow-50)] border border-[var(--color-stebo-yellow-200)] rounded-full px-3 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-stebo-yellow)]" /> Opgeslagen
          </span>
        )}
      </header>

      <div className="card p-6 mb-6">
        <h2 className="section-title text-lg mb-2">Folieprijs per kleur</h2>
        <p className="text-sm text-[var(--color-stebo-mute)] mb-6 mt-3 leading-relaxed">
          De calculator gebruikt automatisch deze prijs voor elke kleur in je ontwerp
          (matching binnen kleurenafstand). Niet gevonden? Dan wordt de algemene
          prijs uit de upload-pagina gebruikt.
        </p>

        <div className="grid grid-cols-12 gap-3 items-end mb-4 p-4 bg-[var(--color-stebo-paper)] border border-[var(--color-stebo-line)] rounded-lg">
          <div className="col-span-12 md:col-span-3">
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-stebo-mute)] mb-1.5">
              Hex
            </label>
            <input
              type="text"
              value={hexInput}
              onChange={(e) => setHexInput(e.target.value)}
              placeholder="#FF0000"
              className="input-stebo text-sm font-mono"
            />
          </div>
          <div className="col-span-12 md:col-span-4">
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-stebo-mute)] mb-1.5">
              Naam (optioneel)
            </label>
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="bijv. RAL 9005 Zwart"
              className="input-stebo text-sm"
            />
          </div>
          <div className="col-span-8 md:col-span-3">
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-stebo-mute)] mb-1.5">
              € / meter
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
              placeholder="4.50"
              className="input-stebo text-sm"
            />
          </div>
          <div className="col-span-4 md:col-span-2">
            <button onClick={addColor} className="btn-primary w-full">
              Toevoegen
            </button>
          </div>
        </div>
        {error && (
          <p className="text-sm text-red-700 bg-red-50 border-l-4 border-red-500 rounded-r p-3 mb-4">
            {error}
          </p>
        )}

        {prices.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-[var(--color-stebo-line)] rounded-lg">
            <p className="text-sm text-[var(--color-stebo-mute)] italic">
              Nog geen kleuren toegevoegd
            </p>
          </div>
        ) : (
          <div className="overflow-hidden border border-[var(--color-stebo-line)] rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-stebo-mute)] bg-[var(--color-stebo-paper)] border-b border-[var(--color-stebo-line)]">
                  <th className="px-4 py-3">Kleur</th>
                  <th className="px-4 py-3">Naam</th>
                  <th className="px-4 py-3">€ / meter</th>
                  <th className="px-4 py-3 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {prices.map((p) => (
                  <tr key={p.hex} className="border-b border-[var(--color-stebo-line)] last:border-0 hover:bg-[var(--color-stebo-paper)] transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-7 h-7 rounded-md border border-[var(--color-stebo-line)] shadow-inner"
                          style={{ backgroundColor: p.hex }}
                        />
                        <span className="font-mono text-xs text-[var(--color-stebo-ink)]">{p.hex}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        defaultValue={p.name || ""}
                        onBlur={(e) => updateName(p.hex, e.target.value)}
                        placeholder="—"
                        className="w-full px-2 py-1 border border-transparent hover:border-[var(--color-stebo-line)] rounded focus:outline-none focus:border-[var(--color-stebo-blue-600)] text-sm bg-transparent"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        defaultValue={p.pricePerM}
                        onBlur={(e) => updatePrice(p.hex, e.target.value)}
                        className="w-24 px-2 py-1 border border-[var(--color-stebo-line)] rounded text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-stebo-blue-600)]/20 focus:border-[var(--color-stebo-blue-600)]"
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => removeColor(p.hex)}
                        className="text-[var(--color-stebo-mute)] hover:text-red-600 text-xs font-medium transition-colors"
                      >
                        Verwijder
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
