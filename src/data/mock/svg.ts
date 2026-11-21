// Generated placeholder photos for mock fixtures: a colored rectangle with the title.
// No files and no licenses; replaced by real photos once Supabase Storage is in.

const BACKGROUNDS = ['#C2185B', '#F28C28', '#2E9E5B', '#1E5AA8', '#8E5A3C', '#6A6275'];

function escapeXml(text: string): string {
  return text.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);
}

function wrap(text: string, maxLine = 18, maxLines = 3): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of text.split(/\s+/)) {
    if ((current + ' ' + word).trim().length > maxLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = (current + ' ' + word).trim();
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, maxLines);
}

/** Returns an SVG data URL (4:3) with the title on a colored background. */
export function placeholderPhoto(title: string, seed: number): string {
  const background = BACKGROUNDS[seed % BACKGROUNDS.length];
  const lines = wrap(title);
  const startY = 150 - (lines.length - 1) * 22;
  const text = lines
    .map((line, i) => `<text x="200" y="${startY + i * 44}" text-anchor="middle">${escapeXml(line)}</text>`)
    .join('');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">` +
    `<rect width="400" height="300" fill="${background}"/>` +
    `<g fill="#FFFFFF" font-family="Arial, sans-serif" font-size="32" font-weight="700">${text}</g>` +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
