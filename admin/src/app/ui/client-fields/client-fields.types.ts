export type ClientFieldType = 'TEXT' | 'LONG_TEXT' | 'NUMBER' | 'DATE' | 'SINGLE_SELECT' | 'MULTI_SELECT' | 'CHECKBOX';
export type ClientFieldOption = { id: string; label: string };

export type ClientField = { id: string; name: string; type: ClientFieldType; options: ClientFieldOption[] };
/** Settings list: how many organizations have a value. */
export type ClientFieldSetup = ClientField & { valueCount: number };
export type ClientFieldSectionSetup = { id: string; name: string; sensitive: boolean; fields: ClientFieldSetup[] };

/** Organization page: a field with this organization's value. */
export type ClientFieldWithValue = ClientField & { value: unknown };
export type ClientFieldSectionWithValues = { id: string; name: string; sensitive: boolean; fields: ClientFieldWithValue[] };

export const CLIENT_FIELD_TYPE_LABELS: Record<ClientFieldType, string> = {
  TEXT: 'Text',
  LONG_TEXT: 'Long text',
  NUMBER: 'Number',
  DATE: 'Date',
  SINGLE_SELECT: 'Single-select',
  MULTI_SELECT: 'Multi-select',
  CHECKBOX: 'Checkbox',
};

export function isSelectType(type: ClientFieldType): boolean {
  return type === 'SINGLE_SELECT' || type === 'MULTI_SELECT';
}
