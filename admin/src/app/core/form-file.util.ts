import { parseFormDefinition, type FormDefinition } from '@upstart/back-office/shared';

/** Save a form file (name.ubo-form.json) that another UBO can import. Used by Forms and Care setup. */
export function downloadFormFile(def: FormDefinition): void {
  const blob = new Blob([JSON.stringify(def, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${def.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'form'}.ubo-form.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Read a dropped form file. Throws an Error with a message people can act on. */
export async function readFormFile(file: File): Promise<FormDefinition> {
  try {
    return parseFormDefinition(JSON.parse(await file.text()));
  } catch (err) {
    throw new Error(err instanceof SyntaxError ? 'That file is not a form file.' : err instanceof Error ? err.message : 'That file could not be read.');
  }
}
