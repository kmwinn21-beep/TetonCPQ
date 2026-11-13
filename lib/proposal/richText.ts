/**
 * Server-side cleaning of rich text from added proposal sections: only the
 * formatting the editor offers survives (bold, italic, underline, lists,
 * indents, font size and color). No links, images, scripts or event handlers.
 */
import sanitizeHtml from 'sanitize-html';

const SIZE = /^\d{1,2}(\.\d+)?px$/;
const COLOR = /^(#[0-9a-f]{3,8}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\))$/i;
const MARGIN = /^\d{1,3}px$/;

export function cleanRichText(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ['p', 'div', 'br', 'b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'span', 'blockquote', 'font'],
    allowedAttributes: { span: ['style'], p: ['style'], div: ['style'], li: ['style'], blockquote: ['style'], font: ['color', 'size'] },
    allowedStyles: {
      '*': {
        color: [COLOR],
        'font-size': [SIZE],
        'font-weight': [/^(bold|normal|[1-9]00)$/],
        'font-style': [/^(italic|normal)$/],
        'text-decoration': [/^(underline|none)$/],
        'text-decoration-line': [/^(underline|none)$/],
        'margin-left': [MARGIN],
        'padding-left': [MARGIN],
      },
    },
    allowedSchemes: [],
    disallowedTagsMode: 'discard',
  });
}
