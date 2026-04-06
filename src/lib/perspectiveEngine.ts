// Perspective transform engine for building preview
// Uses perspectivejs to overlay a sign design onto a building photo

export interface CornerPoints {
  topLeft: [number, number];
  topRight: [number, number];
  bottomRight: [number, number];
  bottomLeft: [number, number];
}

// Rasterize an SVG string to an offscreen canvas
export async function rasterizeSvg(
  svgString: string,
  width: number,
  height: number
): Promise<HTMLCanvasElement> {
  const { Canvg } = await import("canvg");
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const v = Canvg.fromString(ctx, svgString);
  await v.render();
  return canvas;
}

// Draw the design onto the building photo with perspective correction
export async function drawPerspective(
  targetCanvas: HTMLCanvasElement,
  buildingPhoto: HTMLImageElement,
  designCanvas: HTMLCanvasElement,
  corners: CornerPoints
): Promise<void> {
  const ctx = targetCanvas.getContext("2d")!;

  // Draw building photo as background
  targetCanvas.width = buildingPhoto.naturalWidth;
  targetCanvas.height = buildingPhoto.naturalHeight;
  ctx.drawImage(buildingPhoto, 0, 0);

  // Apply perspective transform using perspectivejs
  const Perspective = (await import("perspectivejs")).default;
  const p = new Perspective(ctx, designCanvas);

  // Set blend mode for realistic look
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = 0.9;

  p.draw([
    corners.topLeft,
    corners.topRight,
    corners.bottomRight,
    corners.bottomLeft,
  ]);

  // Reset blend mode
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1.0;
}

// Calculate scale factor from two reference points and known distance
export function calculatePixelsPerMeter(
  point1: [number, number],
  point2: [number, number],
  distanceMeters: number
): number {
  const dx = point2[0] - point1[0];
  const dy = point2[1] - point1[1];
  const pixelDistance = Math.sqrt(dx * dx + dy * dy);
  return pixelDistance / distanceMeters;
}

// Calculate initial corner positions based on design size and scale
export function calculateInitialCorners(
  centerX: number,
  centerY: number,
  designWidthMm: number,
  designHeightMm: number,
  pixelsPerMeter: number
): CornerPoints {
  const widthPx = (designWidthMm / 1000) * pixelsPerMeter;
  const heightPx = (designHeightMm / 1000) * pixelsPerMeter;
  const halfW = widthPx / 2;
  const halfH = heightPx / 2;

  return {
    topLeft: [centerX - halfW, centerY - halfH],
    topRight: [centerX + halfW, centerY - halfH],
    bottomRight: [centerX + halfW, centerY + halfH],
    bottomLeft: [centerX - halfW, centerY + halfH],
  };
}

// Export the composite canvas as a PNG data URL
export function exportAsImage(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/png");
}

// Download the canvas as a PNG file
export function downloadPreview(
  canvas: HTMLCanvasElement,
  filename: string = "preview.png"
): void {
  const link = document.createElement("a");
  link.download = filename;
  link.href = canvas.toDataURL("image/png");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
