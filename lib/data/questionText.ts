/** How question answers read as comments (shared by the server and the comments UI). */

/** The answer in words: the button, then what they wrote. */
export const answerWords = (choice: string | null, txt: string | null) => [choice, txt].filter(Boolean).join(' — ');

/** A question-answer comment: the question and the answer, or a changed answer. Null for any other comment. */
export function parseAnswerBody(body: string): { question: string | null; answer: string; changed: boolean } | null {
  const m = /^Question: ([\s\S]*?)\nAnswer: ([\s\S]*)$/.exec(body);
  if (m) return { question: m[1], answer: m[2], changed: false };
  const c = /^Changed the answer to: ([\s\S]*)$/.exec(body);
  return c ? { question: null, answer: c[1], changed: true } : null;
}
