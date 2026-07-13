/**
 * Text extraction from uploaded business documents.
 * Extracted text is stored with the project and fed to the AI analyst as
 * context alongside the user's instructions.
 */
import path from 'node:path';

export async function extractText(filename, mime, buffer) {
  const ext = path.extname(filename).toLowerCase();
  try {
    if (ext === '.txt' || ext === '.md' || mime.startsWith('text/plain')) {
      return { text: buffer.toString('utf8'), note: '' };
    }
    if (ext === '.csv' || mime === 'text/csv') {
      return { text: buffer.toString('utf8'), note: '' };
    }
    if (ext === '.pdf' || mime === 'application/pdf') {
      const { default: pdfParse } = await import('pdf-parse/lib/pdf-parse.js');
      const data = await pdfParse(buffer);
      return { text: data.text || '', note: `${data.numpages} pages` };
    }
    if (ext === '.docx' || mime.includes('wordprocessingml')) {
      const mammoth = await import('mammoth');
      const out = await mammoth.extractRawText({ buffer });
      return { text: out.value || '', note: '' };
    }
    if (ext === '.xlsx' || ext === '.xls' || mime.includes('spreadsheetml') || mime.includes('ms-excel')) {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(buffer, { type: 'buffer' });
      let text = '';
      for (const name of wb.SheetNames) {
        text += `# Sheet: ${name}\n${XLSX.utils.sheet_to_csv(wb.Sheets[name])}\n`;
      }
      return { text, note: `${wb.SheetNames.length} sheets` };
    }
    if (ext === '.pptx' || mime.includes('presentationml')) {
      const { default: JSZip } = await import('jszip');
      const zip = await JSZip.loadAsync(buffer);
      const slideFiles = Object.keys(zip.files)
        .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
        .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
      let text = '';
      for (const f of slideFiles) {
        const xml = await zip.files[f].async('string');
        const runs = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]);
        text += `# Slide ${f.match(/\d+/)[0]}\n${runs.join(' ')}\n`;
      }
      return { text, note: `${slideFiles.length} slides` };
    }
    if (/^\.(png|jpe?g|gif|webp)$/.test(ext) || mime.startsWith('image/')) {
      return {
        text: '',
        note: 'Image stored. Text extraction from images (OCR) requires an AI provider with vision — describe the diagram to the analyst in chat instead.',
      };
    }
    if (ext === '.doc' || ext === '.ppt') {
      return { text: '', note: 'Legacy Office format — please save as .docx/.pptx and re-upload.' };
    }
    return { text: '', note: `Unsupported file type "${ext || mime}".` };
  } catch (err) {
    return { text: '', note: `Extraction failed: ${err.message}` };
  }
}
