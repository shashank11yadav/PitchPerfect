/** A tiny, valid one-page PDF built at runtime, so no document is ever committed. */
export function tinyPdf(): Buffer {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets = objects.map((object, index) => {
    const offset = body.length;
    body += `${String(index + 1)} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xrefAt = body.length;
  const entries = offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`);
  body += `xref\n0 4\n0000000000 65535 f \n${entries.join("")}`;
  body += `trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${String(xrefAt)}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

/** The 8-byte PNG signature followed by padding: a real image format, not a PDF. */
export function fakePdf(): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([signature, Buffer.alloc(64)]);
}

/** A PDF header followed by zeros, padded to exactly `size` bytes. */
export function pdfOfSize(size: number): Buffer {
  const header = Buffer.from("%PDF-1.4\n", "latin1");
  return Buffer.concat([header, Buffer.alloc(size - header.length)]);
}
