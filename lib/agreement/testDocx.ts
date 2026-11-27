/** Test helper: a minimal .docx built from paragraph XML (tracked changes and comments written as Word does). */
import { strToU8, zipSync } from 'fflate';

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

export function makeDocx(paragraphsXml: string[], comments: Array<{ id: string; author: string; text: string }> = []): Uint8Array {
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>${comments.length ? '<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>' : ''}</Types>`),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    'word/document.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?><w:document ${NS}><w:body>${paragraphsXml.join('')}</w:body></w:document>`),
    'word/settings.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?><w:settings ${NS}><w:trackRevisions/></w:settings>`),
  };
  if (comments.length) files['word/comments.xml'] = strToU8(`<?xml version="1.0" encoding="UTF-8"?><w:comments ${NS}>${comments.map((c) => `<w:comment w:id="${c.id}" w:author="${c.author}" w:date="2026-03-07T10:00:00Z"><w:p><w:r><w:t>${c.text}</w:t></w:r></w:p></w:comment>`).join('')}</w:comments>`);
  return zipSync(files);
}

export const r = (t: string) => `<w:r><w:t xml:space="preserve">${t}</w:t></w:r>`;
export const ins = (id: number, author: string, t: string, date = '2026-03-07T10:00:00Z') => `<w:ins w:id="${id}" w:author="${author}" w:date="${date}"><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:ins>`;
export const del = (id: number, author: string, t: string, date = '2026-03-07T10:00:00Z') => `<w:del w:id="${id}" w:author="${author}" w:date="${date}"><w:r><w:delText xml:space="preserve">${t}</w:delText></w:r></w:del>`;
export const p = (...runs: string[]) => `<w:p>${runs.join('')}</w:p>`;
export const h = (t: string) => `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr>${r(t)}</w:p>`;
