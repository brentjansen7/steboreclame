import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, mediaType } = await req.json();

    const apiKey = process.env.STABILITY_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "STABILITY_API_KEY niet geconfigureerd in .env.local" },
        { status: 500 }
      );
    }

    const imageBuffer = Buffer.from(imageBase64, "base64");
    const mimeType = (mediaType as string) || "image/jpeg";

    const form = new FormData();
    form.append(
      "image",
      new Blob([imageBuffer], { type: mimeType }),
      "input.jpg"
    );
    form.append(
      "prompt",
      "photorealistic vinyl sign mounted on building facade, professional photography, natural lighting, realistic shadows, high definition, real photo"
    );
    form.append(
      "negative_prompt",
      "CGI, digital overlay, fake, blurry, watermark, text artifacts, low quality"
    );
    form.append("mode", "image-to-image");
    form.append("strength", "0.30");
    form.append("output_format", "jpeg");

    const res = await fetch(
      "https://api.stability.ai/v2beta/stable-image/generate/sd3",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "image/*",
        },
        body: form,
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        { error: `Stability AI fout ${res.status}: ${errText}` },
        { status: 500 }
      );
    }

    const buf = await res.arrayBuffer();
    const b64 = Buffer.from(buf).toString("base64");

    return NextResponse.json({ imageBase64: b64, mediaType: "image/jpeg" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
