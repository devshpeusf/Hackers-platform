/**
 * The tiny formatting language for announcements (/admin/email). Organizers
 * write plain text; a few marks become formatting:
 *
 *   **bold**             -> bold
 *   - item  /  * item    -> a bullet list (consecutive lines)
 *   https://…            -> a clickable link
 *   blank line           -> new paragraph
 *
 * It parses into plain data (blocks of text runs), never HTML, so nothing an
 * organizer types can inject markup into the email. The email template and
 * the page preview both render from these blocks.
 *
 * No server-only imports: the compose page uses it too, for the hints.
 */

export const SUBJECT_MAX = 120;
export const BODY_MAX = 5000;

export type Run = { kind: "text"; text: string } | { kind: "bold"; text: string } | { kind: "link"; href: string };
export type Block = { kind: "paragraph"; lines: Run[][] } | { kind: "list"; items: Run[][] };

/** Links are only http(s), so no javascript: or data: URLs ever get a link. */
const URL_PATTERN = /https?:\/\/[^\s<>"')\]]+[^\s<>"')\].,;:!?]/g;

function linkify(text: string): Run[] {
  const runs: Run[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    if (start > last) runs.push({ kind: "text", text: text.slice(last, start) });
    runs.push({ kind: "link", href: match[0] });
    last = start + match[0].length;
  }
  if (last < text.length) runs.push({ kind: "text", text: text.slice(last) });
  return runs;
}

/** One line of text -> runs, handling **bold** then links inside plain parts. */
export function parseInline(line: string): Run[] {
  const runs: Run[] = [];
  const parts = line.split(/(\*\*[^*\n]+\*\*)/g);
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      runs.push({ kind: "bold", text: part.slice(2, -2) });
    } else {
      runs.push(...linkify(part));
    }
  }
  return runs;
}

const BULLET = /^\s*[-*]\s+(.*)$/;

export function parseMessage(body: string): Block[] {
  const blocks: Block[] = [];
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  let paragraph: Run[][] = [];
  let list: Run[][] = [];

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ kind: "paragraph", lines: paragraph });
    paragraph = [];
  };
  const flushList = () => {
    if (list.length) blocks.push({ kind: "list", items: list });
    list = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    const bullet = BULLET.exec(line);
    if (bullet) {
      flushParagraph();
      list.push(parseInline(bullet[1]));
    } else {
      flushList();
      paragraph.push(parseInline(line.trim()));
    }
  }
  flushParagraph();
  flushList();
  return blocks;
}

/** For the subject line, and anywhere plain text is needed. */
export function validateMessage(subject: unknown, body: unknown): { ok: true; subject: string; body: string } | { ok: false; error: string } {
  const s = typeof subject === "string" ? subject.replace(/\s+/g, " ").trim() : "";
  const b = typeof body === "string" ? body.replace(/\r\n?/g, "\n").trim() : "";
  if (!s) return { ok: false, error: "Add a subject." };
  if (s.length > SUBJECT_MAX) return { ok: false, error: `Keep the subject under ${SUBJECT_MAX} characters.` };
  if (!b) return { ok: false, error: "Write a message." };
  if (b.length > BODY_MAX) return { ok: false, error: `Keep the message under ${BODY_MAX} characters.` };
  return { ok: true, subject: s, body: b };
}
