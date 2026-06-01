import type { BoardBlock, BoardRow, BoardTemplate, OverlaySettings, ValueSet } from './types.js';

export interface ValidationIssue {
  path: string;
  message: string;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: ValidationIssue[] };

const success = <T>(value: T): ValidationResult<T> => ({ ok: true, value });
const failure = <T>(errors: ValidationIssue[]): ValidationResult<T> => ({ ok: false, errors });

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isString = (value: unknown): value is string => typeof value === 'string';
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isPositiveNumber = (value: unknown): value is number => isNumber(value) && value > 0;

const isAlign = (value: unknown): value is BoardBlock['style']['align'] =>
  value === 'left' || value === 'center' || value === 'right';

const isBlockType = (value: unknown): value is BoardBlock['type'] => value === 'title' || value === 'input';

export const validateOverlaySettings = (value: unknown): ValidationResult<OverlaySettings> => {
  if (!isObject(value)) {
    return failure([{ path: 'defaultOverlay', message: 'defaultOverlay must be an object' }]);
  }

  const errors: ValidationIssue[] = [];
  let x: number | undefined;
  let y: number | undefined;
  let scale: number | undefined;

  if (!isNumber(value.x)) {
    errors.push({ path: 'defaultOverlay.x', message: 'x must be a number' });
  } else {
    x = value.x;
  }

  if (!isNumber(value.y)) {
    errors.push({ path: 'defaultOverlay.y', message: 'y must be a number' });
  } else {
    y = value.y;
  }

  if (!isPositiveNumber(value.scale)) {
    errors.push({ path: 'defaultOverlay.scale', message: 'scale must be a positive number' });
  } else {
    scale = value.scale;
  }

  if (errors.length > 0 || x === undefined || y === undefined || scale === undefined) {
    return failure(errors);
  }

  return success({ x, y, scale });
};

const validateStyle = (value: unknown, path: string): ValidationResult<BoardBlock['style']> => {
  if (!isObject(value)) {
    return failure([{ path, message: 'style must be an object' }]);
  }

  const errors: ValidationIssue[] = [];
  let fontSize: number | undefined;
  let fontWeight: number | undefined;
  let align: BoardBlock['style']['align'] | undefined;
  let backgroundColor: string | undefined;
  let borderColor: string | undefined;
  let color: string | undefined;

  if (!isNumber(value.fontSize)) {
    errors.push({ path: `${path}.fontSize`, message: 'fontSize must be a number' });
  } else {
    fontSize = value.fontSize;
  }

  if (!isNumber(value.fontWeight)) {
    errors.push({ path: `${path}.fontWeight`, message: 'fontWeight must be a number' });
  } else {
    fontWeight = value.fontWeight;
  }

  if (!isAlign(value.align)) {
    errors.push({ path: `${path}.align`, message: 'align must be left, center, or right' });
  } else {
    align = value.align;
  }

  if (!isString(value.backgroundColor)) {
    errors.push({ path: `${path}.backgroundColor`, message: 'backgroundColor must be a string' });
  } else {
    backgroundColor = value.backgroundColor;
  }

  if (!isString(value.borderColor)) {
    errors.push({ path: `${path}.borderColor`, message: 'borderColor must be a string' });
  } else {
    borderColor = value.borderColor;
  }

  if (!isString(value.color)) {
    errors.push({ path: `${path}.color`, message: 'color must be a string' });
  } else {
    color = value.color;
  }

  if (
    errors.length > 0 ||
    fontSize === undefined ||
    fontWeight === undefined ||
    align === undefined ||
    backgroundColor === undefined ||
    borderColor === undefined ||
    color === undefined
  ) {
    return failure(errors);
  }

  return success({
    fontSize,
    fontWeight,
    align,
    backgroundColor,
    borderColor,
    color,
  });
};

export const validateBoardBlock = (value: unknown, path = 'rows[].blocks[]'): ValidationResult<BoardBlock> => {
  if (!isObject(value)) {
    return failure([{ path, message: 'block must be an object' }]);
  }

  const errors: ValidationIssue[] = [];
  let id: string | undefined;
  let type: BoardBlock['type'] | undefined;
  let text: string | undefined;
  let width: number | undefined;
  let key: string | undefined;
  let style: BoardBlock['style'] | undefined;

  if (!isString(value.id)) {
    errors.push({ path: `${path}.id`, message: 'id must be a string' });
  } else {
    id = value.id;
  }

  if (!isBlockType(value.type)) {
    errors.push({ path: `${path}.type`, message: 'type must be title or input' });
  } else {
    type = value.type;
  }

  if (!isString(value.text)) {
    errors.push({ path: `${path}.text`, message: 'text must be a string' });
  } else {
    text = value.text;
  }

  if (!isNumber(value.width)) {
    errors.push({ path: `${path}.width`, message: 'width must be a number' });
  } else {
    width = value.width;
  }

  const styleResult = validateStyle(value.style, `${path}.style`);
  if (styleResult.ok) {
    style = styleResult.value;
  } else {
    errors.push(...styleResult.errors);
  }

  if (type === 'input') {
    if (!isString(value.key)) {
      errors.push({ path: `${path}.key`, message: 'key must be a string for input blocks' });
    } else {
      key = value.key;
    }
  } else if ('key' in value && value.key !== undefined) {
    errors.push({ path: `${path}.key`, message: 'title blocks must not define key' });
  }

  if (
    errors.length > 0 ||
    id === undefined ||
    type === undefined ||
    text === undefined ||
    width === undefined ||
    style === undefined ||
    (type === 'input' && key === undefined)
  ) {
    return failure(errors);
  }

  if (type === 'input') {
    if (key === undefined) {
      return failure(errors);
    }

    return success({ id, type, text, width, key, style });
  }

  return success({ id, type, text, width, style });
};

export const validateBoardRow = (value: unknown, path = 'rows[]'): ValidationResult<BoardRow> => {
  if (!isObject(value)) {
    return failure([{ path, message: 'row must be an object' }]);
  }

  const errors: ValidationIssue[] = [];
  let id: string | undefined;
  let height: number | undefined;
  const blocks: BoardBlock[] = [];

  if (!isString(value.id)) {
    errors.push({ path: `${path}.id`, message: 'id must be a string' });
  } else {
    id = value.id;
  }

  if (!isNumber(value.height)) {
    errors.push({ path: `${path}.height`, message: 'height must be a number' });
  } else {
    height = value.height;
  }

  if (!Array.isArray(value.blocks)) {
    errors.push({ path: `${path}.blocks`, message: 'blocks must be an array' });
  } else {
    value.blocks.forEach((block, index) => {
      const result = validateBoardBlock(block, `${path}.blocks[${index}]`);
      if (result.ok) {
        blocks.push(result.value);
      } else {
        errors.push(...result.errors);
      }
    });
  }

  if (errors.length > 0 || id === undefined || height === undefined) {
    return failure(errors);
  }

  return success({ id, height, blocks });
};

export const validateBoardTemplate = (value: unknown): ValidationResult<BoardTemplate> => {
  if (!isObject(value)) {
    return failure([{ path: 'template', message: 'template must be an object' }]);
  }

  const errors: ValidationIssue[] = [];
  let id: string | undefined;
  let ownerId: string | undefined;
  let name: string | undefined;
  let createdAt: string | undefined;
  let updatedAt: string | undefined;
  let defaultOverlay: OverlaySettings | undefined;
  const rows: BoardRow[] = [];

  if (value.schemaVersion !== 1) {
    errors.push({ path: 'schemaVersion', message: 'schemaVersion must be 1' });
  }

  if (!isString(value.id)) {
    errors.push({ path: 'id', message: 'id must be a string' });
  } else {
    id = value.id;
  }

  if (!isString(value.ownerId)) {
    errors.push({ path: 'ownerId', message: 'ownerId must be a string' });
  } else {
    ownerId = value.ownerId;
  }

  if (!isString(value.name)) {
    errors.push({ path: 'name', message: 'name must be a string' });
  } else {
    name = value.name;
  }

  if (!isString(value.createdAt)) {
    errors.push({ path: 'createdAt', message: 'createdAt must be a string' });
  } else {
    createdAt = value.createdAt;
  }

  if (!isString(value.updatedAt)) {
    errors.push({ path: 'updatedAt', message: 'updatedAt must be a string' });
  } else {
    updatedAt = value.updatedAt;
  }

  const overlayResult = validateOverlaySettings(value.defaultOverlay);
  if (overlayResult.ok) {
    defaultOverlay = overlayResult.value;
  } else {
    errors.push(...overlayResult.errors);
  }

  if (!Array.isArray(value.rows)) {
    errors.push({ path: 'rows', message: 'rows must be an array' });
  } else {
    value.rows.forEach((row, index) => {
      const result = validateBoardRow(row, `rows[${index}]`);
      if (result.ok) {
        rows.push(result.value);
      } else {
        errors.push(...result.errors);
      }
    });
  }

  if (
    errors.length > 0 ||
    id === undefined ||
    ownerId === undefined ||
    name === undefined ||
    createdAt === undefined ||
    updatedAt === undefined ||
    defaultOverlay === undefined
  ) {
    return failure(errors);
  }

  return success({
    schemaVersion: 1,
    id,
    ownerId,
    name,
    createdAt,
    updatedAt,
    defaultOverlay,
    rows,
  });
};

export const validateValueSet = (value: unknown): ValidationResult<ValueSet> => {
  if (!isObject(value)) {
    return failure([{ path: 'valueSet', message: 'valueSet must be an object' }]);
  }

  const errors: ValidationIssue[] = [];
  let id: string | undefined;
  let ownerId: string | undefined;
  let templateId: string | undefined;
  let name: string | undefined;
  let values: Record<string, string> | undefined;
  let createdAt: string | undefined;
  let updatedAt: string | undefined;
  let templateVersion: number | undefined;
  let templateUpdatedAt: string | undefined;
  const templateVersionCandidate = value.templateVersion;
  const templateUpdatedAtCandidate = value.templateUpdatedAt;
  const hasTemplateVersion =
    typeof templateVersionCandidate === 'number' && Number.isFinite(templateVersionCandidate);
  const hasTemplateUpdatedAt = typeof templateUpdatedAtCandidate === 'string';

  if (value.schemaVersion !== 1) {
    errors.push({ path: 'schemaVersion', message: 'schemaVersion must be 1' });
  }

  if (!isString(value.id)) {
    errors.push({ path: 'id', message: 'id must be a string' });
  } else {
    id = value.id;
  }

  if (!isString(value.ownerId)) {
    errors.push({ path: 'ownerId', message: 'ownerId must be a string' });
  } else {
    ownerId = value.ownerId;
  }

  if (!isString(value.templateId)) {
    errors.push({ path: 'templateId', message: 'templateId must be a string' });
  } else {
    templateId = value.templateId;
  }

  if (!hasTemplateVersion && !hasTemplateUpdatedAt) {
    errors.push({
      path: 'templateVersion',
      message: 'templateVersion or templateUpdatedAt must be provided',
    });
  }

  if (hasTemplateVersion) {
    templateVersion = templateVersionCandidate;
  }

  if (hasTemplateUpdatedAt) {
    templateUpdatedAt = templateUpdatedAtCandidate;
  }

  if (!isString(value.name)) {
    errors.push({ path: 'name', message: 'name must be a string' });
  } else {
    name = value.name;
  }

  if (!isObject(value.values)) {
    errors.push({ path: 'values', message: 'values must be an object' });
  } else {
    const mappedValues: Record<string, string> = {};
    for (const [entryKey, entryValue] of Object.entries(value.values)) {
      if (!isString(entryValue)) {
        errors.push({ path: `values.${entryKey}`, message: 'value must be a string' });
      } else {
        mappedValues[entryKey] = entryValue;
      }
    }
    values = mappedValues;
  }

  if (!isString(value.createdAt)) {
    errors.push({ path: 'createdAt', message: 'createdAt must be a string' });
  } else {
    createdAt = value.createdAt;
  }

  if (!isString(value.updatedAt)) {
    errors.push({ path: 'updatedAt', message: 'updatedAt must be a string' });
  } else {
    updatedAt = value.updatedAt;
  }

  if (
    errors.length > 0 ||
    id === undefined ||
    ownerId === undefined ||
    templateId === undefined ||
    name === undefined ||
    values === undefined ||
    createdAt === undefined ||
    updatedAt === undefined
  ) {
    return failure(errors);
  }

  return success({
    schemaVersion: 1,
    id,
    ownerId,
    templateId,
    templateVersion,
    templateUpdatedAt,
    name,
    values,
    createdAt,
    updatedAt,
  });
};
