import { readFileSync } from 'fs';
import { join } from 'path';

let cachedLogoDataUri: string | null | undefined;

/** UpStart logo as a data URI for inline HTML/PDF (SVG from api/assets/images). */
export function getUpstartLogoDataUri(): string | null {
  if (cachedLogoDataUri !== undefined) {
    return cachedLogoDataUri;
  }

  const candidates = [
    join(__dirname, 'assets/images/upstart-logo-dark.svg'),
    join(process.cwd(), 'api/assets/images/upstart-logo-dark.svg'),
    join(process.cwd(), 'dist/api/assets/images/upstart-logo-dark.svg'),
  ];

  for (const filePath of candidates) {
    try {
      const svg = readFileSync(filePath, 'utf8');
      cachedLogoDataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
      return cachedLogoDataUri;
    } catch {
      // try next path
    }
  }

  cachedLogoDataUri = null;
  return null;
}
