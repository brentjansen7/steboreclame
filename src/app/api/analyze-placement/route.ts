import { Anthropic } from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { getRateLimitKey, checkRateLimit } from "@/lib/rateLimit";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const key = getRateLimitKey(request);
    const { allowed, remaining, resetAt } = checkRateLimit(key);

    if (!allowed) {
      return NextResponse.json(
        {
          error: `Te veel requests. Max 50 per uur. Probeer later opnieuw.`,
          resetAt,
        },
        { status: 429 }
      );
    }

    const { photoUrl, instruction, photoWidth, photoHeight } =
      await request.json();

    if (!photoUrl || !instruction) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Build image source — base64 dataUrl or remote URL
    type MediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";
    type ImageSource =
      | { type: "base64"; media_type: MediaType; data: string }
      | { type: "url"; url: string };

    let imageSource: ImageSource;
    if (photoUrl.startsWith("data:")) {
      const [header, data] = photoUrl.split(",");
      let mediaType = header.replace("data:", "").replace(";base64", "") as MediaType;
      // Default to jpeg if unknown format
      if (!["image/jpeg", "image/png", "image/gif", "image/webp"].includes(mediaType)) {
        mediaType = "image/jpeg";
      }
      imageSource = { type: "base64", media_type: mediaType, data };
    } else {
      imageSource = { type: "url", url: photoUrl };
    }

    // Call Claude with vision to analyze placement
    // Note: Claude doesn't need the SVG — it analyzes the photo and uses the instruction
    const message = await anthropic.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 256,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: imageSource,
            },
            {
              type: "text",
              text: `Je ziet een foto van een gebouw/pand. Iemand wil een ontwerp erop plaatsen met deze instructie: "${instruction}"

Analyseer de foto en bepaal de beste locatie voor het ontwerp.
Geef de coördinaten van 4 hoekpunten in dit formaat (ALLEEN deze 4 regels, niks anders):
topLeft: x,y
topRight: x,y
bottomRight: x,y
bottomLeft: x,y

De foto is ${photoWidth}px breed en ${photoHeight}px hoog.
Zorg dat alle coördinaten tussen 0 en die grenzen liggen.`,
            },
          ],
        },
      ],
    });

    // Parse Claude's response
    const responseText =
      message.content[0].type === "text" ? message.content[0].text : "";

    const corners = parseCorners(responseText, photoWidth, photoHeight);

    return NextResponse.json({
      corners,
      remaining,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : JSON.stringify(error);
    console.error("Claude API error:", msg);
    return NextResponse.json(
      { error: `Claude API fout: ${msg}` },
      { status: 500 }
    );
  }
}

function parseCorners(
  text: string,
  photoWidth: number,
  photoHeight: number
): { topLeft: [number, number]; topRight: [number, number]; bottomRight: [number, number]; bottomLeft: [number, number] } {
  const lines = text.split("\n");
  const corners = {
    topLeft: [50, 50] as [number, number],
    topRight: [photoWidth - 50, 50] as [number, number],
    bottomRight: [photoWidth - 50, photoHeight - 50] as [number, number],
    bottomLeft: [50, photoHeight - 50] as [number, number],
  };

  for (const line of lines) {
    const match = line.match(/(topLeft|topRight|bottomRight|bottomLeft):\s*(\d+)\s*,\s*(\d+)/);
    if (match) {
      const key = match[1] as keyof typeof corners;
      const x = Math.max(0, Math.min(photoWidth, parseInt(match[2])));
      const y = Math.max(0, Math.min(photoHeight, parseInt(match[3])));
      corners[key] = [x, y];
    }
  }

  return corners;
}
