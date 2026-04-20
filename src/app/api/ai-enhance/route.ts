import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

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

    const prompt =
      "This building photo has a new sign design placed on it. The sign looks flat and pasted on. Make it completely photorealistic: add natural lighting matching the building environment, cast shadows on the wall below the sign, slight depth and material texture (vinyl/aluminium). The sign should look like it has been professionally installed on this building. Keep the exact design, logo, text and colors intact — do not change or replace the design.";

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    mimeType: photoMediaType || "image/jpeg",
                    data: compositeBase64,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            responseModalities: ["IMAGE", "TEXT"],
          },
        }),
      }
    );

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        { error: `Gemini fout: ${JSON.stringify(data.error || data)}` },
        { status: res.status }
      );
    }

    const parts = data?.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find(
      (p: { inlineData?: { data: string; mimeType: string } }) => p.inlineData
    );

    if (!imagePart) {
      return NextResponse.json(
        { error: "Gemini gaf geen afbeelding terug. Probeer opnieuw." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      imageBase64: imagePart.inlineData.data,
      mediaType: imagePart.inlineData.mimeType || "image/png",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
