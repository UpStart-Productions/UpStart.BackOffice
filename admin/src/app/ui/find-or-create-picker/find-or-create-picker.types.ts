export type FindOrCreatePick = { id: string } | { name: string };

export type FindOrCreateOption = {
  id: string;
  name: string;
  color?: string | null;
};
