import { CRM_TAG_SUGGESTIONS } from './types';

/** Record types that support platform-defined dimension fields. */
export type DimensionEntity = 'CLIENT' | 'CONTACT' | 'TASK';

export const DIMENSION_ENTITIES = ['CLIENT', 'CONTACT', 'TASK'] as const satisfies readonly DimensionEntity[];

/** Shared key for tag dimensions on every entity that uses tags. */
export const DIMENSION_TAG_KEY = 'tags';

export const CLIENT_DIMENSION_KEYS = {
  tags: 'tags',
  services: 'services',
  products: 'products',
  focus: 'focus',
} as const;

export type ClientDimensionKey = (typeof CLIENT_DIMENSION_KEYS)[keyof typeof CLIENT_DIMENSION_KEYS];

const FOCUS_PRESET_LABELS = [
  'Recovery',
  'Family',
  'Youth',
  'Faith',
  'Health',
  'Disability',
  'Education',
  'Jobs / Workforce',
  'Pets',
  'Funding',
  'Hunger',
  'Violence',
  'Activities',
  'Other',
] as const;

export type DimensionDefinitionDto = {
  entity: DimensionEntity;
  key: string;
  label: string;
  sortOrder: number;
  presets: string[];
  searchInGlobal: boolean;
};

export type DimensionCatalogItemDto = {
  name: string;
  recordCount: number;
  hiddenFromSuggestions: boolean;
};

export type DimensionCatalogGroupDto = {
  entity: DimensionEntity;
  key: string;
  label: string;
  items: DimensionCatalogItemDto[];
};

const TAG_DEFINITION = {
  key: DIMENSION_TAG_KEY,
  label: 'Tags',
  sortOrder: 1,
  presets: [] as string[],
  searchInGlobal: true,
};

/** Platform defaults for organization dimensions (seeded per tenant). */
export const DEFAULT_CLIENT_DIMENSION_DEFINITIONS: Omit<DimensionDefinitionDto, 'entity'>[] = [
  { ...TAG_DEFINITION, presets: [...CRM_TAG_SUGGESTIONS] },
  {
    key: CLIENT_DIMENSION_KEYS.services,
    label: 'Services',
    sortOrder: 2,
    presets: [],
    searchInGlobal: true,
  },
  {
    key: CLIENT_DIMENSION_KEYS.products,
    label: 'Products',
    sortOrder: 3,
    presets: [],
    searchInGlobal: true,
  },
  {
    key: CLIENT_DIMENSION_KEYS.focus,
    label: 'Focus areas',
    sortOrder: 4,
    presets: [...FOCUS_PRESET_LABELS],
    searchInGlobal: true,
  },
];

export const DEFAULT_CONTACT_DIMENSION_DEFINITIONS: Omit<DimensionDefinitionDto, 'entity'>[] = [
  { ...TAG_DEFINITION, presets: [...CRM_TAG_SUGGESTIONS] },
];

export const DEFAULT_TASK_DIMENSION_DEFINITIONS: Omit<DimensionDefinitionDto, 'entity'>[] = [TAG_DEFINITION];

export const DEFAULT_DIMENSION_DEFINITIONS: Record<
  DimensionEntity,
  Omit<DimensionDefinitionDto, 'entity'>[]
> = {
  CLIENT: DEFAULT_CLIENT_DIMENSION_DEFINITIONS,
  CONTACT: DEFAULT_CONTACT_DIMENSION_DEFINITIONS,
  TASK: DEFAULT_TASK_DIMENSION_DEFINITIONS,
};

/** Map legacy OrgCategory enum values to focus dimension labels. */
export const LEGACY_FOCUS_ENUM_TO_LABEL: Record<string, string> = {
  RECOVERY: 'Recovery',
  FAMILY: 'Family',
  YOUTH: 'Youth',
  FAITH: 'Faith',
  HEALTH: 'Health',
  DISABILITY: 'Disability',
  EDUCATION: 'Education',
  JOBS_WORKFORCE: 'Jobs / Workforce',
  PETS: 'Pets',
  FUNDING: 'Funding',
  HUNGER: 'Hunger',
  VIOLENCE: 'Violence',
  ACTIVITIES: 'Activities',
  OTHER: 'Other',
};

/** @deprecated use recordCount */
export type DimensionCatalogItemDtoLegacy = DimensionCatalogItemDto & { organizationCount?: number };
