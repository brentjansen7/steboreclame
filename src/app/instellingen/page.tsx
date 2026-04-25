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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Instellingen</h1>
        {saved && <span className="text-sm text-green-600">Opgeslagen</span>}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <h2 className="font-semibold mb-1">Folieprijs per kleur</h2>
        <p className="text-sm text-gray-500 mb-4">
          De calculator gebruikt automatisch deze prijs voor elke kleur in je ontwerp
          (matching binnen kleurenafstand). Niet gevonden? Dan wordt de algemene
          prijs uit de upload-pagina gebruikt.
        </p>

        <div className="grid grid-cols-12 gap-3 items-end mb-4 p-4 bg-gray-50 rounded-lg">
          <div className="col-span-3">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Hex
            </label>
            <input
              type="text"
              value={hexInput}
              onChange={(e) => setHexInput(e.target.value)}
              placeholder="#FF0000"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="col-span-4">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Naam (optioneel)
            </label>
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="bijv. RAL 9005 Zwart"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="col-span-3">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Prijs per meter (€)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
              placeholder="4.50"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="col-span-2">
            <button
              onClick={addColor}
              className="w-full px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors"
            >
              Toevoegen
            </button>
          </div>
        </div>
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2 mb-4">
            {error}
          </p>
        )}

        {prices.length === 0 ? (
          <p className="text-sm text-gray-500 italic text-center py-8">
            Nog geen kleuren toegevoegd
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b">
                <th className="px-3 py-2">Kleur</th>
                <th className="px-3 py-2">Naam</th>
                <th className="px-3 py-2">€ / meter</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {prices.map((p) => (
                <tr key={p.hex} className="border-b last:border-0">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-6 h-6 rounded border border-gray-300"
                        style={{ backgroundColor: p.hex }}
                      />
                      <span className="font-mono text-xs">{p.hex}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      defaultValue={p.name || ""}
                      onBlur={(e) => updateName(p.hex, e.target.value)}
                      placeholder="—"
                      className="w-full px-2 py-1 border border-transparent hover:border-gray-300 rounded focus:outline-none focus:border-blue-500 text-sm"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      defaultValue={p.pricePerM}
                      onBlur={(e) => updatePrice(p.hex, e.target.value)}
                      className="w-24 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => removeColor(p.hex)}
                      className="text-red-600 hover:text-red-800 text-xs"
                    >
                      Verwijder
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
