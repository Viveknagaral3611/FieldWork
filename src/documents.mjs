import { inflateRawSync } from 'node:zlib';
import { plainText } from './sources.mjs';
export async function extractDocument(name, bytes) {
  if (bytes.length > 10 * 1024 * 1024) throw new Error('Please use a document smaller than 10 MB.');
  const ext = name.toLowerCase().split('.').pop();
  if (['txt','md'].includes(ext)) return bytes.toString('utf8');
  if (ext === 'docx') return extractDocx(bytes);
  if (ext === 'pdf') {
    const { getDocument } = await import('../vendor/pdf.mjs');
    const task = getDocument({data:new Uint8Array(bytes), isEvalSupported:false, useSystemFonts:true, useWorkerFetch:false, stopAtErrors:true});
    let document;
    try {
      document = await task.promise;
      if (document.numPages > 100) throw new Error('Please use a PDF with 100 pages or fewer.');
      const pages = [];
      for (let i=1; i<=document.numPages; i++) {
        const page = await document.getPage(i);
        const content = await page.getTextContent();
        pages.push(content.items.map(item => item.str + (item.hasEOL ? '\n' : ' ')).join(''));
      }
      const text = pages.join('\n\n').trim();
      if (text.length < 20) throw new Error('This PDF has little extractable text. Paste its text instead; scanned PDFs need OCR.');
      return text;
    } finally { await task.destroy(); }
  }
  throw new Error('Supported formats: PDF, DOCX, TXT, and Markdown.');
}
function extractDocx(bytes) {
  // Read the central directory instead of trusting local-header sizes (DOCX commonly uses descriptors).
  let end = -1;
  for (let i=bytes.length-22; i>=Math.max(0,bytes.length-65557); i--) if (bytes.readUInt32LE(i)===0x06054b50) {end=i;break;}
  if (end < 0) throw new Error('Invalid DOCX archive.');
  const entries = bytes.readUInt16LE(end+10); let offset = bytes.readUInt32LE(end+16);
  for (let i=0; i<entries; i++) {
    if (offset+46>bytes.length || bytes.readUInt32LE(offset)!==0x02014b50) throw new Error('Invalid DOCX directory.');
    const method=bytes.readUInt16LE(offset+10), size=bytes.readUInt32LE(offset+20), expanded=bytes.readUInt32LE(offset+24), nameLength=bytes.readUInt16LE(offset+28), extra=bytes.readUInt16LE(offset+30), comment=bytes.readUInt16LE(offset+32), local=bytes.readUInt32LE(offset+42);
    const filename=bytes.subarray(offset+46,offset+46+nameLength).toString('utf8');
    if (filename==='word/document.xml') {
      if(expanded>8*1024*1024 || local+30>bytes.length) throw new Error('DOCX text exceeds the supported size.');
      const start=local+30+bytes.readUInt16LE(local+26)+bytes.readUInt16LE(local+28);
      if(start+size>bytes.length) throw new Error('Truncated DOCX file.');
      const compressed=bytes.subarray(start,start+size);
      const xml=(method===8 ? inflateRawSync(compressed,{maxOutputLength:8*1024*1024}) : method===0 ? compressed : Buffer.alloc(0)).toString('utf8');
      const text=plainText(xml.replace(/<\/w:p>/g,'\n').replace(/<w:tab\b[^>]*\/>/g,' '));
      if(!text.trim()) throw new Error('No text could be read from this DOCX.');
      return text;
    }
    offset+=46+nameLength+extra+comment;
  }
  throw new Error('No main document found in DOCX.');
}
