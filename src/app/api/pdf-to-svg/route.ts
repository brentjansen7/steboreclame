import { pdfToSvg } from "@/lib/pdfToSvg";

export const runtime = "nodejs";

const MAX_BYTES = 20 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.length === 0) {
      return Response.json({ error: "Geen bestand ontvangen" }, { status: 400 });
    }
    if (bytes.length > MAX_BYTES) {
      return Response.json({ error: "PDF is groter dan 20 MB" }, { status: 413 });
    }
    // Every PDF starts with "%PDF"
    if (String.fromCharCode(...bytes.slice(0, 4)) !== "%PDF") {
      return Response.json({ error: "Dit is geen PDF-bestand" }, { status: 400 });
    }

    const svg = pdfToSvg(bytes);
    return new Response(svg, { headers: { "Content-Type": "image/svg+xml; charset=utf-8" } });
  } catch (error) {
    console.error("POST /api/pdf-to-svg error:", error);
    return Response.json({ error: "PDF kon niet gelezen worden" }, { status: 500 });
  }
}
