import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const { photoBase64, photoMediaType, designBase64, designMediaType, instruction } =
      await req.json();

    let credentialsJson = process.env.VERTEX_AI_CREDENTIALS;

    // If base64 encoded version exists, use that
    if (!credentialsJson && process.env.VERTEX_AI_CREDENTIALS_B64) {
      try {
        credentialsJson = Buffer.from(process.env.VERTEX_AI_CREDENTIALS_B64, 'base64').toString('utf8');
      } catch {
        return NextResponse.json(
          { error: "VERTEX_AI_CREDENTIALS_B64 decode error" },
          { status: 500 }
        );
      }
    }

    if (!credentialsJson) {
      return NextResponse.json(
        { error: "VERTEX_AI_CREDENTIALS niet geconfigureerd" },
        { status: 500 }
      );
    }

    let credentials;
    try {
      credentials = JSON.parse(credentialsJson);
    } catch {
      return NextResponse.json(
        { error: "VERTEX_AI_CREDENTIALS is geen geldige JSON" },
        { status: 500 }
      );
    }

    const projectId = credentials.project_id;
    if (!projectId) {
      return NextResponse.json(
        { error: "project_id ontbreekt in VERTEX_AI_CREDENTIALS" },
        { status: 500 }
      );
    }

    // Get access token
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: await generateJWT(credentials),
      }),
    });

    if (!tokenRes.ok) {
      return NextResponse.json(
        { error: "Kon geen access token krijgen" },
        { status: 500 }
      );
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

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
      `https://us-central1-aiplatform.googleapis.com/v1/projects/${projectId}/locations/us-central1/publishers/google/models/gemini-2.5-flash-001:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
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
        { status: res.status }
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

async function generateJWT(credentials: {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: credentials.client_email,
    sub: credentials.client_email,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const header = { alg: "RS256", typ: "JWT" };
  const headerB64 = Buffer.from(JSON.stringify(header)).toString("base64url");
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const message = `${headerB64}.${payloadB64}`;

  const { sign } = await import("crypto");
  const signature = sign(
    "sha256",
    Buffer.from(message),
    {
      key: credentials.private_key,
      format: "pem",
      type: "pkcs8",
    }
  ).toString("base64url");

  return `${message}.${signature}`;
}
