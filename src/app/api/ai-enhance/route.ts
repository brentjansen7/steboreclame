import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const { photoBase64, photoMediaType, designBase64, designMediaType, instruction } =
      await req.json();

    const hasJSONEnv = !!process.env.VERTEX_AI_CREDENTIALS;
    const hasB64Env = !!process.env.VERTEX_AI_CREDENTIALS_B64;
    console.log('[DEBUG] ENV vars present:', { hasJSONEnv, hasB64Env });

    let credentialsJson = process.env.VERTEX_AI_CREDENTIALS;

    // If base64 encoded version exists, use that
    if (!credentialsJson && process.env.VERTEX_AI_CREDENTIALS_B64) {
      console.log('[DEBUG] Decoding VERTEX_AI_CREDENTIALS_B64');
      try {
        const b64Value = process.env.VERTEX_AI_CREDENTIALS_B64.trim();
        console.log('[DEBUG] B64 value length:', b64Value.length);
        credentialsJson = Buffer.from(b64Value, 'base64').toString('utf8');
        console.log('[DEBUG] Decoded successfully, length:', credentialsJson.length);
        console.log('[DEBUG] Decoded first 50 chars:', credentialsJson.substring(0, 50));
      } catch (e) {
        console.error('[DEBUG] B64 decode error:', e);
        return NextResponse.json(
          { error: "VERTEX_AI_CREDENTIALS_B64 decode error: " + (e instanceof Error ? e.message : String(e)) },
          { status: 500 }
        );
      }
    }

    if (!credentialsJson) {
      console.error('[DEBUG] No credentials found in either env var');
      return NextResponse.json(
        { error: "VERTEX_AI_CREDENTIALS niet geconfigureerd" },
        { status: 500 }
      );
    }

    console.log('[DEBUG] Credentials JSON length:', credentialsJson.length);
    console.log('[DEBUG] First 100 chars:', credentialsJson.substring(0, 100));

    let credentials;
    try {
      credentials = JSON.parse(credentialsJson);
      console.log('[DEBUG] JSON parse successful, keys:', Object.keys(credentials));
    } catch (e) {
      console.error('[DEBUG] JSON parse error:', e);
      console.error('[DEBUG] Full credentialsJson:', credentialsJson);
      return NextResponse.json(
        { error: "VERTEX_AI_CREDENTIALS is geen geldige JSON. Zie SETUP_VERTEX_CREDENTIALS.md voor setup instructies." },
        { status: 500 }
      );
    }

    // Check for required fields
    const requiredFields = ['project_id', 'private_key', 'client_email', 'client_id'];
    const missingFields = requiredFields.filter(f => !credentials[f]);
    if (missingFields.length > 0) {
      const msg = `VERTEX_AI_CREDENTIALS ontbreekt velden: ${missingFields.join(', ')}. Download een complete Service Account JSON van Google Cloud Console.`;
      console.error('[DEBUG]', msg);
      return NextResponse.json({ error: msg }, { status: 500 });
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

    const referenceImages: object[] = [
      {
        referenceType: "REFERENCE_TYPE_RAW",
        referenceId: 1,
        referenceImage: { bytesBase64Encoded: photoBase64 },
      },
    ];

    if (designBase64) {
      referenceImages.push({
        referenceType: "REFERENCE_TYPE_SUBJECT",
        referenceId: 2,
        subjectImageConfig: { subjectType: "SUBJECT_TYPE_DEFAULT" },
        referenceImage: { bytesBase64Encoded: designBase64 },
      });
    }

    const prompt = instruction ||
      (designBase64
        ? "Replace the existing sign/billboard on this building facade with the logo from reference image 2. Make it photorealistic as if it is a real vinyl sign on the building."
        : "Vervang het uithangbord/gevelreclame op dit pand met het GDB (Gevel Design Beek) logo. Maak het fotorealistisch alsof het echt een vinyl reclame is op het gebouw.");

    const res = await fetch(
      `https://us-central1-aiplatform.googleapis.com/v1/projects/${projectId}/locations/us-central1/publishers/google/models/imagen-3.0-capability-001:predict`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          instances: [{ prompt, referenceImages }],
          parameters: { sampleCount: 1, editConfig: { editMode: "EDIT_MODE_DEFAULT" } },
        }),
      }
    );

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        { error: `Imagen fout: ${JSON.stringify(data.error || data)}` },
        { status: res.status }
      );
    }

    const predictions = data.predictions;
    if (!predictions || predictions.length === 0) {
      return NextResponse.json(
        { error: "Imagen gaf geen afbeelding terug. Probeer opnieuw." },
        { status: 500 }
      );
    }

    const imageBase64 = predictions[0].bytesBase64Encoded || predictions[0];

    return NextResponse.json({
      imageBase64,
      mediaType: "image/png",
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
