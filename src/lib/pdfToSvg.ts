import * as mupdf from "mupdf";

// Convert the first page of a vector PDF to SVG. Text is converted to paths,
// so letters are measured and cut like any other shape. Server-side only.
export function pdfToSvg(data: Uint8Array): string {
  const doc = mupdf.Document.openDocument(data, "application/pdf");
  if (doc.countPages() < 1) throw new Error("PDF heeft geen pagina's");

  const page = doc.loadPage(0);
  const buffer = new mupdf.Buffer();
  const writer = new mupdf.DocumentWriter(buffer, "svg", "text=path");
  const device = writer.beginPage(page.getBounds());
  page.run(device, mupdf.Matrix.identity);
  writer.endPage();
  writer.close();
  return buffer.asString();
}
