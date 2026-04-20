import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

const PROMPT =
  "This building photo has a new sign design placed on it. The sign looks flat and pasted on. Make it completely photorealistic: add natural lighting matching the building environment, cast shadows on the wall below the sign, slight depth and material texture (vinyl/aluminium). The sign should look like it has been professionally installed on this building. Keep the exact design, logo, text and colors intact — do not change or replace the design.";

async function callGemini(apiKey: string, compositeBase64: string, mimeType: string) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: PROMPT },
              { inlineData: { mimeType, data: compositeBase64 } },
            ],
          },
        ],
        generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
      }),
    }
  );
  return res;
}

export async function POST(req: NextRequest) {
  try {
    const { compositeBase64, photoMediaType } = await req.json();

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY niet geconfigureerd" },
        { status: 500 }
      );
    }

    const mimeType = photoMediaType || "image/jpeg";

    // Try up to 2 times
    let lastError = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await callGemini(apiKey, compositeBase64, mimeType);
      const data = await res.json();

      if (!res.ok) {
        lastError = `Gemini fout: ${JSON.stringify(data.error || data)}`;
        // Only retry on 503 (unavailable/timeout)
        if (res.status !== 503) break;
        continue;
      }

      const parts = data?.candidates?.[0]?.content?.parts || [];
      const imagePart = parts.find(
        (p: { inlineData?: { data: string; mimeType: string } }) => p.inlineData
      );

      if (!imagePart) {
        lastError = "Gemini gaf geen afbeelding terug. Probeer opnieuw.";
        break;
      }

      return NextResponse.json({
        imageBase64: imagePart.inlineData.data,
        mediaType: imagePart.inlineData.mimeType || "image/png",
      });
    }

    return NextResponse.json({ error: lastError }, { status: 503 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
