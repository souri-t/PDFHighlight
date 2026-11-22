export function multiPagePdf({ cropSecondPage = false, secondText = 'Second page selectable text' } = {}) {
  const stream = (text) => {
    const contents = `BT /F1 24 Tf 55 710 Td (${text}) Tj ET\n`;
    return `<< /Length ${contents.length} >>\nstream\n${contents}endstream`;
  };
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 560 760]${cropSecondPage ? ' /CropBox [15 20 540 740]' : ''} /Rotate 90 /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    stream('First page selectable text'),
    stream(secondText),
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = objects.map((object, index) => {
    const offset = pdf.length;
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'ascii');
}
