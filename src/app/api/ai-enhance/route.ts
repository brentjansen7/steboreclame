import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { photoBase64, photoMediaType, designBase64, designMediaType, instruction } =
      await req.json();

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY niet geconfigureerd in .env.local" },
        { status: 500 }
      );
    }

    const parts: object[] = [
      {
        inlineData: {
          mimeType: photoMediaType || "image/jpeg",
          data: photoBase64,
        },
      },
    ];

    if (designBase64) {
      parts.push({
        inlineData: {
          mimeType: designMediaType || "image/png",
          data: designBase64,
        },
      });
    }

    parts.push({
      text:
        instruction ||
        "Vervang het uithangbord op dit pand met het logo/ontwerp uit de tweede afbeelding. Maak het fotorealistisch alsof het echt een vinyl reclame is op het gebouw.",
    });

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
        }),
      }
    );

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        { error: `Gemini fout: ${JSON.stringify(data.error || data)}` },
        { status: 500 }
      );
    }

    const imagePart = data.candidates?.[0]?.content?.parts?.find(
      (p: { inlineData?: { data: string; mimeType: string } }) => p.inlineData
    ) as { inlineData: { data: string; mimeType: string } } | undefined;

    if (!imagePart) {
      return NextResponse.json(
        { error: "Gemini gaf geen afbeelding terug. Probeer opnieuw." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      imageBase64: imagePart.inlineData.data,
      mediaType: imagePart.inlineData.mimeType,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
