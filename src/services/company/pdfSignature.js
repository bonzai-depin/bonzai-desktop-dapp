import { PDFDocument } from "pdf-lib";

/** A new local PDF copy; never alter the received purchase order. */
export async function applyPdfSignature(
  bytes,
  { pageIndex, x, y, width, height, png },
) {
  const source = await PDFDocument.load(bytes);
  if (
    !Number.isInteger(pageIndex) ||
    pageIndex < 0 ||
    pageIndex >= source.getPageCount()
  )
    throw new Error("Page invalide.");
  const page = source.getPage(pageIndex),
    size = page.getSize();
  if (
    ![x, y, width, height].every(Number.isFinite) ||
    x < 0 ||
    y < 0 ||
    width <= 0 ||
    height <= 0 ||
    x + width > size.width + 0.1 ||
    y + height > size.height + 0.1
  )
    throw new Error("Placez la signature dans la page.");
  const image = await source.embedPng(png);
  page.drawImage(image, { x, y, width, height });
  return source.save();
}
