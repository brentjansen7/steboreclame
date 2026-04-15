import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { getRateLimitKey, checkRateLimit } from "@/lib/rateLimit";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const maxDuration = 45;

const SYSTEM_PROMPT = `Je bent een precisie-assistent voor een vinylreclame-bedrijf. Je bepaalt waar een reclameontwerp op een gevelfoto geplaatst moet worden.
You are a precision assistant for a vinyl sign company. You determine where a sign design should be placed on a building photo.

COÖRDINATEN-GRID / COORDINATE GRID:
- IMAGE 1 heeft een geel coördinaten-grid (0-100) zichtbaar over de foto heen.
- IMAGE 1 has a yellow coordinate grid (0-100) visible over the photo.
- X-labels (links→rechts) staan BOVENAAN de foto. / X-labels (left→right) are at the TOP.
- Y-labels (boven→onder) staan aan de LINKERKANT. / Y-labels (top→bottom) are on the LEFT.
- Lees de gridlijnen af om EXACTE percentages te bepalen. / Read the grid lines to determine EXACT percentages.
- Een punt halverwege tussen gridlijn 30 en 40 = 35. / A point halfway between gridlines 30 and 40 = 35.

REGELS / RULES:
- IMAGE 1 is altijd de GEVELFOTO (building photo). Jij geeft ALLEEN coördinaten van IMAGE 1.
- IMAGE 1 is always the BUILDING PHOTO. You ONLY return coordinates from IMAGE 1.
- IMAGE 2 (indien aanwezig) is het ontwerp ter referentie. Geef NOOIT coördinaten van IMAGE 2.
- IMAGE 2 (if present) is the design for reference only. NEVER return coordinates from IMAGE 2.
- Gebruik het zichtbare grid om precieze coördinaten af te lezen — geen gokwerk.
- Use the visible grid to read precise coordinates — no guessing.

Veelgebruikte Nederlandse instructies / Common Dutch instructions:
- "plaats / zet op" = place on
- "vervang / over ... heen / in plaats van" = replace / cover existing sign
- "het logo van X / het X-bord" = the X sign/logo visible on the building
- "boven / onder / naast de deur/raam" = above / below / next to the door/window
- "op de gevel / aan de gevel" = on the facade
- "de etalage / de winkelruit" = the shop window
- "het uithangbord / de lichtreclame" = the hanging sign / illuminated sign

Je antwoord is ALTIJD geldig JSON, geen markdown, geen uitleg erbuiten.
Your response is ALWAYS valid JSON, no markdown fences, no extra prose.`;

const buildUserPrompt = (
  instruction: string,
  hasDesign: boolean,
  previousCorners?: Record<string, [number, number]>
) => {
  let prompt = `Gebruikersinstructie / User instruction: "${instruction}"

${hasDesign ? "IMAGE 1 = gevelfoto, IMAGE 2 = ontwerp (alleen ter referentie voor wat er geplaatst wordt).\n" : "IMAGE 1 = gevelfoto.\n"}
Taak / Task:
1. Identificeer de doellocatie op IMAGE 1 op basis van de instructie.
   Als de gebruiker zegt "vervang het Blokker logo" → zoek het Blokker bord/logo op de foto.
   Als de gebruiker zegt "boven de deur" → zoek het gebied boven de ingang.
2. Geef de bounding quad van de volledige locatie (inclusief het hele paneel/bord, niet alleen de tekst), rekening houdend met perspectief.
3. De vier hoeken moeten met de klok mee, startend linksboven.
4. Indien je de locatie niet kunt vinden, stel "found": false in.`;

  if (previousCorners) {
    prompt += `\n\nVorige plaatsing (voor verfijning) / Previous placement (for refinement):
topLeftPct: [${previousCorners.topLeft[0]}, ${previousCorners.topLeft[1]}]
topRightPct: [${previousCorners.topRight[0]}, ${previousCorners.topRight[1]}]
bottomRightPct: [${previousCorners.bottomRight[0]}, ${previousCorners.bottomRight[1]}]
bottomLeftPct: [${previousCorners.bottomLeft[0]}, ${previousCorners.bottomLeft[1]}]
Pas aan op basis van de verfijningsinstructie.`;
  }

  prompt += `

Stap 1: Lees het gele coördinaten-grid af op IMAGE 1 om de locatie te bepalen.
Step 1: Read the yellow coordinate grid on IMAGE 1 to determine the location.
Stap 2: Geef de exacte hoekcoördinaten als percentages van het grid.
Step 2: Return exact corner coordinates as percentages read from the grid.

Geef ALLEEN dit JSON-object terug (geen markdown, geen uitleg):
{
  "found": true,
  "confidence": 0.85,
  "reasoning": "Korte NL-uitleg max 150 tekens",
  "targetDescription": "Wat je hebt gevonden, bijv. 'Blokker logo boven de ingang'",
  "topLeftPct":     [X, Y],
  "topRightPct":    [X, Y],
  "bottomRightPct": [X, Y],
  "bottomLeftPct":  [X, Y]
}

X = 0-100 (links naar rechts), Y = 0-100 (boven naar onder), als percentage van IMAGE 1.
Gebruik reële getallen (bijv. 42.7), geen strings.`;

  return prompt;
};

const validImageTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type ValidImageType = typeof validImageTypes[number];

export async function POST(request: NextRequest) {
  try {
    const key = getRateLimitKey(request);
    const { allowed, remaining, resetAt } = checkRateLimit(key);
    if (!allowed) {
      return NextResponse.json(
        { error: `Te veel requests. Max 50 per uur. Probeer later opnieuw.`, resetAt },
        { status: 429 }
      );
    }

    const {
      photoBase64,
      mediaType,
      instruction,
      photoWidth,
      photoHeight,
      designBase64,
      designMediaType,
      previousCorners,
    } = await request.json();

    if (!photoBase64 || !instruction || !photoWidth || !photoHeight) {
      return NextResponse.json(
        { error: "Velden ontbreken: foto, instructie, breedte of hoogte" },
        { status: 400 }
      );
    }

    const mt: ValidImageType = validImageTypes.includes(mediaType) ? mediaType : "image/jpeg";
    const dmt: ValidImageType =
      designMediaType && validImageTypes.includes(designMediaType)
        ? designMediaType
        : "image/png";

    // Build content array: photo first, then optional design, then instruction
    const userContent: Anthropic.MessageParam["content"] = [
      { type: "text", text: "IMAGE 1 — GEVELFOTO (building photo):" },
      {
        type: "image",
        source: { type: "base64", media_type: mt, data: photoBase64 },
      },
    ];

    if (designBase64) {
      userContent.push({ type: "text", text: "IMAGE 2 — ONTWERP (design, alleen ter referentie):" });
      userContent.push({
        type: "image",
        source: { type: "base64", media_type: dmt, data: designBase64 },
      });
    }

    userContent.push({
      type: "text",
      text: buildUserPrompt(instruction, !!designBase64, previousCorners),
    });

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 800,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    });

    const responseText =
      message.content[0].type === "text" ? message.content[0].text : "";

    const parsed = parseResponse(responseText, photoWidth, photoHeight);

    return NextResponse.json({
      corners: parsed.corners,
      found: parsed.found,
      confidence: parsed.confidence,
      reasoning: parsed.reasoning,
      targetDescription: parsed.targetDescription,
      remaining,
      raw: responseText,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : JSON.stringify(error);
    console.error("Claude API error:", msg);
    return NextResponse.json({ error: `Claude API fout: ${msg}` }, { status: 500 });
  }
}

interface ParsedResult {
  corners: {
    topLeft: [number, number];
    topRight: [number, number];
    bottomRight: [number, number];
    bottomLeft: [number, number];
  };
  found: boolean;
  confidence: number;
  reasoning: string;
  targetDescription: string;
}

function parseResponse(text: string, photoWidth: number, photoHeight: number): ParsedResult {
  const defaultCorners = {
    topLeft: [Math.round(photoWidth * 0.2), Math.round(photoHeight * 0.2)] as [number, number],
    topRight: [Math.round(photoWidth * 0.8), Math.round(photoHeight * 0.2)] as [number, number],
    bottomRight: [Math.round(photoWidth * 0.8), Math.round(photoHeight * 0.6)] as [number, number],
    bottomLeft: [Math.round(photoWidth * 0.2), Math.round(photoHeight * 0.6)] as [number, number],
  };

  const defaultResult: ParsedResult = {
    corners: defaultCorners,
    found: false,
    confidence: 0,
    reasoning: "Kon JSON niet parsen",
    targetDescription: "",
  };

  // Strip markdown code fences
  const clean = text.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();

  // Try strict JSON parse
  const jsonMatch = clean.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const obj = JSON.parse(jsonMatch[0]);
      const pctToCorner = (arr: [number, number], w: number, h: number): [number, number] => {
        const x = Math.round((arr[0] / 100) * w);
        const y = Math.round((arr[1] / 100) * h);
        return [Math.max(0, Math.min(w, x)), Math.max(0, Math.min(h, y))];
      };

      if (obj.topLeftPct && obj.topRightPct && obj.bottomRightPct && obj.bottomLeftPct) {
        const tl = obj.topLeftPct;
        const tr = obj.topRightPct;
        const br = obj.bottomRightPct;
        const bl = obj.bottomLeftPct;

        const toArr = (v: [number, number] | { x: number; y: number }): [number, number] =>
          Array.isArray(v) ? v : [v.x, v.y];

        const corners = {
          topLeft: pctToCorner(toArr(tl), photoWidth, photoHeight),
          topRight: pctToCorner(toArr(tr), photoWidth, photoHeight),
          bottomRight: pctToCorner(toArr(br), photoWidth, photoHeight),
          bottomLeft: pctToCorner(toArr(bl), photoWidth, photoHeight),
        };

        // Sanity: ensure top < bottom
        if (corners.topLeft[1] > corners.bottomLeft[1]) {
          [corners.topLeft, corners.bottomLeft] = [corners.bottomLeft, corners.topLeft];
          [corners.topRight, corners.bottomRight] = [corners.bottomRight, corners.topRight];
        }

        // Sanity: ensure left < right
        if (corners.topLeft[0] > corners.topRight[0]) {
          [corners.topLeft, corners.topRight] = [corners.topRight, corners.topLeft];
          [corners.bottomLeft, corners.bottomRight] = [corners.bottomRight, corners.bottomLeft];
        }

        return {
          corners,
          found: obj.found !== false,
          confidence: typeof obj.confidence === "number" ? obj.confidence : 0.7,
          reasoning: obj.reasoning || "",
          targetDescription: obj.targetDescription || obj.target_description || "",
        };
      }
    } catch {
      // fall through to legacy parsing
    }
  }

  // Legacy fallback: percentage line format "topLeftPct: X,Y"
  const pctPatterns: [string, keyof typeof defaultCorners][] = [
    ["topLeftPct", "topLeft"],
    ["topRightPct", "topRight"],
    ["bottomRightPct", "bottomRight"],
    ["bottomLeftPct", "bottomLeft"],
  ];
  const corners = { ...defaultCorners };
  let foundAny = false;
  for (const [pattern, key] of pctPatterns) {
    const regex = new RegExp(pattern + "\\s*:\\s*([\\d.]+)%?\\s*,\\s*([\\d.]+)%?");
    const match = text.match(regex);
    if (match) {
      const xPct = parseFloat(match[1]);
      const yPct = parseFloat(match[2]);
      const x = Math.round((xPct / 100) * photoWidth);
      const y = Math.round((yPct / 100) * photoHeight);
      corners[key] = [Math.max(0, Math.min(photoWidth, x)), Math.max(0, Math.min(photoHeight, y))];
      foundAny = true;
    }
  }

  if (foundAny) {
    return { corners, found: true, confidence: 0.5, reasoning: "Plaatsing gevonden (legacy formaat)", targetDescription: "" };
  }

  return defaultResult;
}
