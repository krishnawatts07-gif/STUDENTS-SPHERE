import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export const extractPdfText = async (file) => {
  const buffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: buffer }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => item.str).join(' '));
  }
  return pages.join('\n').replace(/\s+/g, ' ').trim().slice(0, 6000);
};
