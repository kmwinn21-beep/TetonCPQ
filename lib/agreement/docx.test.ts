import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { acceptedText, applyDecisions, parseDocx, titleOf, untrackedChanges } from './docx';
import { del, h, ins, makeDocx, p, r } from './testDocx';

const round1 = makeDocx([h('Master Services Agreement'), p(r('2. Term. The initial term is thirty-six (36) months.')), p(r('4. Fees. Invoices are due within thirty (30) days.')), p(r('11. Governing law. Delaware.'))]);

const round2 = makeDocx(
  [
    h('Master Services Agreement'),
    p(r('2. Term. The initial term is '), del(1, 'Alex Smith', 'thirty-six (36)'), ins(2, 'Alex Smith', 'twenty-four (24)'), r(' months.')),
    p(r('4. Fees. Invoices are due within '), del(3, 'Alex Smith', 'thirty (30)'), r(' '), ins(4, 'Alex Smith', 'forty-five (45)'), r(' days.')),
    // Changed without Track Changes: Delaware → Ohio.
    p(r('11. Governing law. Ohio.')),
    p('<w:commentRangeStart w:id="9"/>', r('5. Pilot. Three months.'), '<w:commentRangeEnd w:id="9"/>', '<w:r><w:commentReference w:id="9"/></w:r>', ins(5, 'Alex Smith', ' Customer may exit at the end of the pilot.')),
  ],
  [{ id: '9', author: 'Smith & Lee LLP', text: 'Can the pilot be four months?' }],
);

describe('reading a Word round', () => {
  it('reads paragraphs, tracked changes (a delete then insert as one replace) and comments', () => {
    const d = parseDocx(round2);
    expect(titleOf(d)).toBe('Master Services Agreement');
    expect(d.paragraphs[0].heading).toBe(true);
    expect(d.changes.map((c) => [c.id, c.kind, c.deleted, c.inserted])).toEqual([
      ['c1', 'replace', 'thirty-six (36)', 'twenty-four (24)'],
      ['c2', 'del', 'thirty (30)', ''],
      ['c3', 'ins', '', 'forty-five (45)'],
      ['c4', 'ins', '', ' Customer may exit at the end of the pilot.'],
    ]);
    expect(d.changes[0]).toMatchObject({ author: 'Alex Smith', paragraph: 1, before: '2. Term. The initial term is ', after: ' months.' });
    expect(d.comments).toEqual([expect.objectContaining({ id: 'k9', author: 'Smith & Lee LLP', text: 'Can the pilot be four months?', paragraph: 4, anchor: '5. Pilot. Three months.' })]);
    expect(acceptedText(d.paragraphs[1])).toBe('2. Term. The initial term is twenty-four (24) months.');
  });

  it('finds edits made with Track Changes off, compared with the previous round', () => {
    const u = untrackedChanges(parseDocx(round1), parseDocx(round2));
    expect(u.map((c) => [c.kind, c.deleted, c.inserted, c.paragraph])).toEqual([
      ['untracked', 'Delaware.', 'Ohio.', 3],
      ['untracked', '', '5. Pilot. Three months.', 4],
    ]);
  });

  it('carries over tracked changes that were already in the previous round', () => {
    // Teton's response keeps an earlier tracked change of its own; the prospect leaves it alone.
    const teton = makeDocx([p(r('Term: '), ins(7, 'Kevin', '36 months'))]);
    const back = makeDocx([p(r('Term: '), ins(7, 'Kevin', '36 months'), ins(8, 'Alex', ' with a price lock'))]);
    expect(untrackedChanges(parseDocx(teton), parseDocx(back))).toEqual([]);
  });

  it('rejects files that aren’t Word documents', () => {
    expect(() => parseDocx(new Uint8Array([1, 2, 3]))).toThrow(/Word document/);
  });
});

describe('writing decisions back', () => {
  it('shows rejections as the responder\'s own tracked changes', () => {
    const out = applyDecisions(round2, { c1: 'rejected', c2: 'accepted', c3: 'accepted' }, { counterAs: { author: 'Kevin (Teton)', date: '2026-03-09T10:00:00Z' } });
    const d = parseDocx(out);
    // Term: their "twenty-four" is struck and "thirty-six" re-inserted, both by Kevin; the accepted fees change is plain
    // text; the undecided pilot insertion stays Alex's.
    expect(d.changes.map((c) => [c.author, c.kind, c.deleted, c.inserted])).toEqual([
      ['Kevin (Teton)', 'replace', 'twenty-four (24)', 'thirty-six (36)'],
      ['Alex Smith', 'ins', '', ' Customer may exit at the end of the pilot.'],
    ]);
    expect(acceptedText(d.paragraphs[1])).toBe('2. Term. The initial term is thirty-six (36) months.');
    expect(d.paragraphs[2].segments.some((s) => s.change)).toBe(false);
  });
  it('applies accept / reject and leaves undecided changes tracked', () => {
    const out = applyDecisions(round2, { c1: 'rejected', c2: 'accepted', c3: 'accepted' });
    const d = parseDocx(out);
    expect(acceptedText(d.paragraphs[1])).toBe('2. Term. The initial term is thirty-six (36) months.');
    expect(acceptedText(d.paragraphs[2])).toBe('4. Fees. Invoices are due within  forty-five (45) days.');
    expect(d.changes.map((c) => c.inserted)).toEqual([' Customer may exit at the end of the pilot.']); // c4 still open
    expect(d.comments).toHaveLength(1);
  });

  it('makes a clean copy only when everything is decided: no tracked changes, no comments, Track Changes off', () => {
    expect(() => applyDecisions(round2, { c1: 'accepted' }, { clean: true })).toThrow(/still open/);
    const out = applyDecisions(round2, { c1: 'accepted', c2: 'accepted', c3: 'accepted', c4: 'rejected' }, { clean: true });
    const d = parseDocx(out);
    expect(d.changes).toEqual([]);
    expect(d.comments).toEqual([]);
    expect(acceptedText(d.paragraphs[4])).toBe('5. Pilot. Three months.');
    const files = unzipSync(out);
    expect(strFromU8(files['word/document.xml'])).not.toMatch(/commentReference|w:ins|w:del/);
    expect(strFromU8(files['word/settings.xml'])).not.toMatch(/trackRevisions/);
  });
});
