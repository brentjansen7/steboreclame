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
      model: "claude-sonnet-4-6",
      max_tokens: 500,
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
              text: `Look at this building photo. Task: "${instruction}"

Find the bounding box of that element (logo, sign, or text). Include the full sign/board it is on, not just the letters. Give coordinates as percentage of image size.

Respond with EXACTLY 4 lines, no other text:
topLeftPct: X,Y
topRightPct: X,Y
bottomRightPct: X,Y
bottomLeftPct: X,Y

Where X is left-to-right percentage (0=left, 100=right) and Y is top-to-bottom percentage (0=top, 100=bottom).`,
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

  // Try percentage format first: "topLeftPct: 57.5%,13.2%"
  const pctPatterns: [string, keyof typeof corners][] = [
    ["topLeftPct", "topLeft"],
    ["topRightPct", "topRight"],
    ["bottomRightPct", "bottomRight"],
    ["bottomLeftPct", "bottomLeft"],
  ];

  let foundPct = false;
  for (const [pattern, key] of pctPatterns) {
    const regex = new RegExp(pattern + "\\s*:\\s*([\\d.]+)%?\\s*,\\s*([\\d.]+)%?");
    const match = text.match(regex);
    if (match) {
      const xPct = parseFloat(match[1]);
      const yPct = parseFloat(match[2]);
      const x = Math.round((xPct / 100) * photoWidth);
      const y = Math.round((yPct / 100) * photoHeight);
      corners[key] = [Math.max(0, Math.min(photoWidth, x)), Math.max(0, Math.min(photoHeight, y))];
      foundPct = true;
    }
  }

  if (!foundPct) {
    // Fallback: pixel format "topLeft: 123,456"
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
  }

  return corners;
}
