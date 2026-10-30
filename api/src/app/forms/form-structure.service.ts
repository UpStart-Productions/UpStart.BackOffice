import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  formProfile, isSelectFieldType, type FormFieldDto, type FormFieldOption, type FormFieldType, type FormProfile, type FormSectionDto,
} from '@upstart/back-office/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFieldDto, UpdateFieldDto } from './form.dto';
import { formFieldOptions } from './form-fields.util';

export const FORM_ORDER = [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }];
const FIELD_SELECT = { id: true, name: true, type: true, options: true, required: true, scoreGroupId: true } as const;

type FieldRow = { id: string; name: string; type: FormFieldType; options: Prisma.JsonValue; required: boolean; scoreGroupId?: string | null };

export function fieldView(f: FieldRow): FormFieldDto {
  return {
    id: f.id, name: f.name, type: f.type, options: (f.options as FormFieldOption[] | null) ?? [], required: f.required,
    scoreGroupId: f.scoreGroupId ?? null,
  };
}

export type FormRow = { id: string; module: string; key: string | null };

/**
 * The form engine's structure: a form's sections and fields, and the builder's changes to them.
 * Every change checks the form's builder profile (a hard rule), and callers pass the module they own,
 * so one module can never change another module's forms. Who may change a form is the caller's check.
 */
@Injectable()
export class FormStructureService {
  constructor(private readonly prisma: PrismaService) {}

  profile(form: FormRow): FormProfile {
    return formProfile(form.module, form.key);
  }

  // ── Reading ────────────────────────────────────────────────────────────────

  /** Sections with their fields, in order. `filledOnly` drops empty sections (for filling in). */
  async sections(formId: string, opts: { filledOnly?: boolean } = {}): Promise<FormSectionDto[]> {
    const rows = await this.prisma.formSection.findMany({
      where: { formId },
      orderBy: FORM_ORDER,
      select: { id: true, name: true, description: true, fields: { orderBy: FORM_ORDER, select: FIELD_SELECT } },
    });
    return rows
      .filter((s) => !opts.filledOnly || s.fields.length)
      .map((s) => ({ id: s.id, name: s.name, description: s.description, fields: s.fields.map(fieldView) }));
  }

  /** Every field of a form, in order. */
  async fields(formId: string): Promise<FormFieldDto[]> {
    return (await this.sections(formId)).flatMap((s) => s.fields);
  }

  /** How many responses have each field filled in (shown in setup before deleting a field). */
  async valueCounts(formId: string): Promise<Map<string, number>> {
    const responses = await this.prisma.formResponse.findMany({ where: { formId }, select: { values: true } });
    const counts = new Map<string, number>();
    for (const r of responses) {
      for (const [k, v] of Object.entries((r.values ?? {}) as Record<string, unknown>)) {
        if (v !== null && v !== undefined) counts.set(k, (counts.get(k) ?? 0) + 1);
      }
    }
    return counts;
  }

  async findForm(id: string, module: string) {
    const f = await this.prisma.form.findFirst({ where: { id, module } });
    if (!f) throw new NotFoundException('Form not found');
    return f;
  }

  async findSection(id: string, module: string) {
    const s = await this.prisma.formSection.findFirst({ where: { id, form: { module } }, include: { form: true } });
    if (!s) throw new NotFoundException('Section not found');
    return s;
  }

  async findField(id: string, module: string) {
    const f = await this.prisma.formField.findFirst({ where: { id, section: { form: { module } } }, include: { section: { include: { form: true } } } });
    if (!f) throw new NotFoundException('Field not found');
    return f;
  }

  // ── Sections ───────────────────────────────────────────────────────────────

  async createSection(formId: string, module: string, rawName: string, description?: string | null): Promise<FormSectionDto> {
    await this.findForm(formId, module);
    const name = rawName.trim();
    if (!name) throw new BadRequestException('Name is required');
    const last = await this.prisma.formSection.findFirst({ where: { formId }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
    const s = await this.prisma.formSection.create({
      data: { formId, name, description: description?.trim() || null, sortOrder: (last?.sortOrder ?? -1) + 1 },
    });
    return { id: s.id, name: s.name, description: s.description, fields: [] };
  }

  /** Rename a section and, when given, change its intro. */
  async renameSection(id: string, module: string, rawName: string, description?: string | null) {
    await this.findSection(id, module);
    const name = rawName.trim();
    if (!name) throw new BadRequestException('Name is required');
    const s = await this.prisma.formSection.update({
      where: { id },
      data: { name, ...(description !== undefined ? { description: description?.trim() || null } : {}) },
    });
    return { id: s.id, name: s.name, description: s.description };
  }

  /** Deletes the section and its fields; their answers disappear from every response. */
  async deleteSection(id: string, module: string) {
    await this.findSection(id, module);
    await this.prisma.formSection.delete({ where: { id } });
    return { deleted: true };
  }

  async moveSection(id: string, module: string, direction: 'up' | 'down') {
    const section = await this.findSection(id, module);
    const rows = await this.prisma.formSection.findMany({ where: { formId: section.formId }, orderBy: FORM_ORDER, select: { id: true } });
    await this.reorder(rows.map((r) => r.id), id, direction, (rid, sortOrder) =>
      this.prisma.formSection.update({ where: { id: rid }, data: { sortOrder } }),
    );
    return { moved: true };
  }

  // ── Fields ─────────────────────────────────────────────────────────────────

  async createField(sectionId: string, module: string, dto: CreateFieldDto): Promise<FormFieldDto> {
    const section = await this.findSection(sectionId, module);
    const profile = this.profile(section.form);
    if (!profile.fieldTypes.includes(dto.type)) throw new BadRequestException('This form does not take that type of field');
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Name is required');
    const options = formFieldOptions(dto.type, dto.options, profile.scoring);
    if (isSelectFieldType(dto.type) && !options.length) throw new BadRequestException('Add at least one option');
    const last = await this.prisma.formField.findFirst({ where: { sectionId }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
    const f = await this.prisma.formField.create({
      data: {
        sectionId,
        name,
        type: dto.type,
        required: profile.required && !!dto.required,
        scoreGroupId: profile.scoring ? dto.scoreGroupId || null : null,
        options: options.length ? (options as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
      select: FIELD_SELECT,
    });
    return fieldView(f);
  }

  async updateField(id: string, module: string, dto: UpdateFieldDto): Promise<FormFieldDto> {
    const field = await this.findField(id, module);
    const profile = this.profile(field.section.form);
    const data: Prisma.FormFieldUpdateInput = {};
    if (dto.name !== undefined) {
      if (!dto.name.trim()) throw new BadRequestException('Name is required');
      data.name = dto.name.trim();
    }
    if (dto.required !== undefined) data.required = profile.required && dto.required;
    if (dto.scoreGroupId !== undefined && profile.scoring) data.scoreGroupId = dto.scoreGroupId || null;
    if (dto.options !== undefined && isSelectFieldType(field.type)) {
      const options = formFieldOptions(field.type, dto.options, profile.scoring);
      if (!options.length) throw new BadRequestException('Add at least one option');
      data.options = options as unknown as Prisma.InputJsonValue;
    }
    const f = await this.prisma.formField.update({ where: { id }, data, select: FIELD_SELECT });
    return fieldView(f);
  }

  /** Deletes the field; its answers disappear from every response. */
  async deleteField(id: string, module: string) {
    await this.findField(id, module);
    await this.prisma.formField.delete({ where: { id } });
    return { deleted: true };
  }

  async moveField(id: string, module: string, direction: 'up' | 'down') {
    const field = await this.findField(id, module);
    const rows = await this.prisma.formField.findMany({ where: { sectionId: field.sectionId }, orderBy: FORM_ORDER, select: { id: true } });
    await this.reorder(rows.map((r) => r.id), id, direction, (rid, sortOrder) =>
      this.prisma.formField.update({ where: { id: rid }, data: { sortOrder } }),
    );
    return { moved: true };
  }

  /** Drag and drop: put a form's sections in this order (every section id, once). */
  async reorderSections(formId: string, module: string, ids: string[]) {
    await this.findForm(formId, module);
    const rows = await this.prisma.formSection.findMany({ where: { formId }, select: { id: true } });
    await this.applyOrder(rows.map((r) => r.id), ids, (id, sortOrder) => this.prisma.formSection.update({ where: { id }, data: { sortOrder } }));
    return { ordered: true };
  }

  /** Drag and drop: put a section's fields in this order (every field id, once). */
  async reorderFields(sectionId: string, module: string, ids: string[]) {
    await this.findSection(sectionId, module);
    const rows = await this.prisma.formField.findMany({ where: { sectionId }, select: { id: true } });
    await this.applyOrder(rows.map((r) => r.id), ids, (id, sortOrder) => this.prisma.formField.update({ where: { id }, data: { sortOrder } }));
    return { ordered: true };
  }

  private async applyOrder(current: string[], ids: string[], write: (id: string, sortOrder: number) => Prisma.PrismaPromise<unknown>) {
    const unique = [...new Set(ids)];
    if (unique.length !== current.length || unique.some((id) => !current.includes(id))) {
      throw new BadRequestException('The list changed. Reload and try again.');
    }
    await this.prisma.$transaction(unique.map((id, index) => write(id, index)));
  }

  /** Swap a row with its neighbour and renumber the list 0..n. */
  private async reorder(
    ids: string[],
    id: string,
    direction: 'up' | 'down',
    write: (id: string, sortOrder: number) => Prisma.PrismaPromise<unknown>,
  ) {
    const i = ids.indexOf(id);
    if (i < 0) throw new NotFoundException('Not found');
    const j = direction === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await this.prisma.$transaction(ids.map((rid, index) => write(rid, index)));
  }
}
