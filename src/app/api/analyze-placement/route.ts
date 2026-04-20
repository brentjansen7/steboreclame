import { NextRequest, NextResponse } from "next/server";
import { getRateLimitKey, checkRateLimit } from "@/lib/rateLimit";

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
  previousCorners?: Record<string, [number, number]>,
  isCrop?: boolean
) => {
  let prompt = `Gebruikersinstructie / User instruction: "${instruction}"

${hasDesign ? "IMAGE 1 = gevelfoto, IMAGE 2 = ontwerp (alleen ter referentie).\n" : "IMAGE 1 = gevelfoto.\n"}${isCrop ? "⚠️ OPGELET: Dit is een INZOOM van het pand (crop). Het grid 0-100% dekt ALLEEN dit uitvergrote gedeelte.\n\n" : ""}
ALGORITME: Identificeer de 4 GRENZEN van het object, dan construeer corners.

Stap 1: FIND object
   Zoek het object dat de gebruiker noemt. Scan systematisch.

Stap 2: MEASURE edges — lees PRECIES van het gele grid
   - LINKERRAND (LEFT): Welke X-waarde? (0-100, precies)
   - RECHTERRAND (RIGHT): Welke X-waarde? (0-100, precies)
   - BOVENKANT (TOP): Welke Y-waarde? (0-100, precies)
   - ONDERKANT (BOTTOM): Welke Y-waarde? (0-100, precies)

Stap 3: VERIFY jouw antwoord
   □ Dekt de rechthoek ONLY het object? JA
   □ Andere elementen buiten de box? JA
   □ Gridlijn-nauwkeurig gemeten? JA

Stap 4: CONSTRUCT corners
   topLeftPct     = [LEFT, TOP]
   topRightPct    = [RIGHT, TOP]
   bottomRightPct = [RIGHT, BOTTOM]
   bottomLeftPct  = [LEFT, BOTTOM]

⚠️ VEEL WAARSCHUWINGEN:
❌ Gegeven grens die groter is dan het object zelf = FOUT
❌ Grens includes andere elementen (deur, raam, etc) = FOUT
❌ "Ik schat ongeveer" zonder grid = FOUT

✓ Edges zijn EXACT waar het object eindigt
✓ Geen extra spatie, geen overlap
✓ Gelezen rechtstreeks van gridlijnen

Geef ALLEEN dit JSON-object terug (geen markdown, geen extra tekst):
{
  "found": true,
  "confidence": 0.95,
  "reasoning": "Korte uitleg (max 100 chars)",
  "targetDescription": "Wat je gevonden hebt",
  "topLeftPct":     [X, Y],
  "topRightPct":    [X, Y],
  "bottomRightPct": [X, Y],
  "bottomLeftPct":  [X, Y]
}

X = 0-100, Y = 0-100 (percentages van IMAGE 1 / deze crop).
Gebruik getallen, geen strings. Decimalen OK (bijv. 42.7).`;

  if (previousCorners && !isCrop) {
    prompt = prompt.replace("Stap 1: FIND object", `VORIGE POGING WAS FOUT:
topLeftPct: [${previousCorners.topLeft[0]}, ${previousCorners.topLeft[1]}]
topRightPct: [${previousCorners.topRight[0]}, ${previousCorners.topRight[1]}]
bottomRightPct: [${previousCorners.bottomRight[0]}, ${previousCorners.bottomRight[1]}]
bottomLeftPct: [${previousCorners.bottomLeft[0]}, ${previousCorners.bottomLeft[1]}]

⚠️ DEZE KEER: VEEL KLEINER! Het vorige was 40-50% te groot.

Stap 1: FIND object`);
  }

  return prompt;
};

async function callGeminiPlacement(
  photoBase64: string,
  photoMimeType: string,
  userPrompt: string,
  designBase64?: string,
  designMimeType?: string
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY niet geconfigureerd");

  const parts: object[] = [
    { text: "IMAGE 1 — GEVELFOTO (building photo):" },
    { inlineData: { mimeType: photoMimeType, data: photoBase64 } },
  ];

  if (designBase64) {
    parts.push({ text: "IMAGE 2 — ONTWERP (design, alleen ter referentie):" });
    parts.push({ inlineData: { mimeType: designMimeType || "image/png", data: designBase64 } });
  }

  parts.push({ text: userPrompt });

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts }],
        generationConfig: { temperature: 0.1 },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini placement error ${res.status}: ${err.substring(0, 200)}`);
  }

  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

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
      isCrop,
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

    const userPrompt = buildUserPrompt(instruction, !!designBase64, previousCorners, isCrop);

    const responseText = await callGeminiPlacement(
      photoBase64, mt, userPrompt,
      designBase64, dmt
    );

    const parsed = parseResponse(responseText, photoWidth, photoHeight);

    return NextResponse.json({
      corners: parsed.corners,
      found: parsed.found,
      confidence: parsed.confidence,
      reasoning: parsed.reasoning,
      targetDescription: parsed.targetDescription,
      remaining,
      raw: responseText,
      provider: "gemini-2.5-flash",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : JSON.stringify(error);
    return NextResponse.json({ error: `Gemini API fout: ${msg}` }, { status: 500 });
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

function applyInwardTightening(
  corners: {
    topLeft: [number, number];
    topRight: [number, number];
    bottomRight: [number, number];
    bottomLeft: [number, number];
  },
  factor: number
) {
  const centerX = (corners.topLeft[0] + corners.topRight[0] + corners.bottomRight[0] + corners.bottomLeft[0]) / 4;
  const centerY = (corners.topLeft[1] + corners.topRight[1] + corners.bottomRight[1] + corners.bottomLeft[1]) / 4;
  const tighten = (point: [number, number]): [number, number] => [
    Math.round(centerX + (point[0] - centerX) * factor),
    Math.round(centerY + (point[1] - centerY) * factor),
  ];
  return {
    topLeft: tighten(corners.topLeft),
    topRight: tighten(corners.topRight),
    bottomRight: tighten(corners.bottomRight),
    bottomLeft: tighten(corners.bottomLeft),
  };
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

  const clean = text.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();
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
        const toArr = (v: [number, number] | { x: number; y: number }): [number, number] =>
          Array.isArray(v) ? v : [v.x, v.y];

        const corners = {
          topLeft: pctToCorner(toArr(obj.topLeftPct), photoWidth, photoHeight),
          topRight: pctToCorner(toArr(obj.topRightPct), photoWidth, photoHeight),
          bottomRight: pctToCorner(toArr(obj.bottomRightPct), photoWidth, photoHeight),
          bottomLeft: pctToCorner(toArr(obj.bottomLeftPct), photoWidth, photoHeight),
        };

        if (corners.topLeft[1] > corners.bottomLeft[1]) {
          [corners.topLeft, corners.bottomLeft] = [corners.bottomLeft, corners.topLeft];
          [corners.topRight, corners.bottomRight] = [corners.bottomRight, corners.topRight];
        }
        if (corners.topLeft[0] > corners.topRight[0]) {
          [corners.topLeft, corners.topRight] = [corners.topRight, corners.topLeft];
          [corners.bottomLeft, corners.bottomRight] = [corners.bottomRight, corners.bottomLeft];
        }

        const tightened = applyInwardTightening(corners, 0.985);

        return {
          corners: tightened,
          found: obj.found !== false,
          confidence: typeof obj.confidence === "number" ? obj.confidence : 0.7,
          reasoning: obj.reasoning || "",
          targetDescription: obj.targetDescription || obj.target_description || "",
        };
      }
    } catch { /* fall through */ }
  }

  return defaultResult;
}
