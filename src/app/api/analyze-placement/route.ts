import { Anthropic } from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { getRateLimitKey, checkRateLimit } from "@/lib/rateLimit";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const key = getRateLimitKey(request);
    const { allowed, remaining, resetAt } = checkRateLimit(key);

    if (!allowed) {
      return NextResponse.json(
        { error: `Te veel requests. Max 50 per uur. Probeer later opnieuw.`, resetAt },
        { status: 429 }
      );
    }

    const { photoBase64, mediaType, instruction, photoWidth, photoHeight } =
      await request.json();

    if (!photoBase64 || !instruction || !photoWidth || !photoHeight) {
      return NextResponse.json(
        { error: "Velden ontbreken: foto, instructie, breedte of hoogte" },
        { status: 400 }
      );
    }

    // Validate media type
    const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
    const mt = validTypes.includes(mediaType) ? mediaType : "image/jpeg";

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mt as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
                data: photoBase64,
              },
            },
            {
              type: "text",
              text: `Je ziet een foto van een gebouw/pand. De afbeelding is exact ${photoWidth} pixels breed en ${photoHeight} pixels hoog.

Instructie: "${instruction}"

Analyseer de foto zorgvuldig. Zoek het exacte gebied waar het ontwerp geplaatst moet worden volgens de instructie. Let op teksten, logo's, borden, en gevelelementen.

Geef de 4 hoekpunten van het doelgebied in PIXELS. De coördinaten moeten exact het gebied omlijnen waar het ontwerp moet komen. Links boven is (0,0), rechts onder is (${photoWidth},${photoHeight}).

Antwoord ALLEEN in dit formaat (4 regels, niks anders):
topLeft: X,Y
topRight: X,Y
bottomRight: X,Y
bottomLeft: X,Y`,
            },
          ],
        },
      ],
    });

    const responseText =
      message.content[0].type === "text" ? message.content[0].text : "";

    const corners = parseCorners(responseText, photoWidth, photoHeight);

    return NextResponse.json({ corners, remaining, raw: responseText });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : JSON.stringify(error);
    console.error("Claude API error:", msg);
    return NextResponse.json({ error: `Claude API fout: ${msg}` }, { status: 500 });
  }
}

function parseCorners(
  text: string,
  photoWidth: number,
  photoHeight: number
) {
  const corners = {
    topLeft: [50, 50] as [number, number],
    topRight: [photoWidth - 50, 50] as [number, number],
    bottomRight: [photoWidth - 50, photoHeight - 50] as [number, number],
    bottomLeft: [50, photoHeight - 50] as [number, number],
  };

  // Match patterns like "topLeft: 123,456" or "topLeft: 123, 456"
  const patterns: [string, keyof typeof corners][] = [
    ["topLeft", "topLeft"],
    ["topRight", "topRight"],
    ["bottomRight", "bottomRight"],
    ["bottomLeft", "bottomLeft"],
  ];

  for (const [pattern, key] of patterns) {
    const regex = new RegExp(pattern + "\\s*:\\s*(\\d+)\\s*,\\s*(\\d+)");
    const match = text.match(regex);
    if (match) {
      const x = Math.max(0, Math.min(photoWidth, parseInt(match[1])));
      const y = Math.max(0, Math.min(photoHeight, parseInt(match[2])));
      corners[key] = [x, y];
    }
  }

  return corners;
}
