import type { BlockStyle, BoardBlock, BoardRow } from '../../shared/schema/index.js';
import type { ValueSetWriteInput } from '../../shared/firebase/firestore.js';

export type RowInsertDirection = 'above' | 'below';
export type BlankCellInsertDirection = 'left' | 'right';
export type BlockMovePlacement = 'before' | 'after';

export interface BlockSelection {
  rowIndex: number;
  blockIndex: number;
}

export interface BlockUpdate {
  text?: string;
  type?: 'title' | 'input';
  key?: string;
  style?: Partial<BlockStyle>;
}

export interface OverlayPreviewState {
  x: number;
  y: number;
  scale: number;
}

export interface LocalValueSet {
  id: string;
  name: string;
  values: Record<string, string>;
}

export type ListenerStatus = 'unavailable' | 'logged-out' | 'loading' | 'loaded' | 'error';

export interface ListenerStatusTextOptions {
  status: ListenerStatus;
  label: string;
  detail?: string;
}

export interface BuildValueSetWriteInputOptions {
  activeValueSet: LocalValueSet;
  templateId: string;
  valueSetId: string;
  nowIso: string;
  templateVersion?: number;
  templateUpdatedAt?: string;
}

export const defaultOverlayPreviewState: OverlayPreviewState = {
  x: 50,
  y: 70,
  scale: 0.75,
};

export const defaultValueSetNames = ['1차', '2차', '3차'] as const;

const overlayPreviewLimits = {
  x: { min: 0, max: 100 },
  y: { min: 0, max: 100 },
  scale: { min: 0.25, max: 1.5 },
} as const;

const defaultBlockStyle: BlockStyle = {
  fontSize: 16,
  fontWeight: 500,
  align: 'left',
  backgroundColor: '#ffffff',
  borderColor: '#000000',
  color: '#000000',
};

function createBlankInputBlock(rowIndex: number, blockIndex: number): BoardBlock {
  return {
    id: `row-${rowIndex + 1}-block-${blockIndex + 1}`,
    type: 'input',
    key: '',
    text: '',
    width: 1,
    style: structuredClone(defaultBlockStyle),
  };
}

function createBlankInputRow(rowIndex: number, blocksPerRow: number): BoardRow {
  return {
    id: `row-${rowIndex + 1}`,
    height: 1,
    blocks: Array.from({ length: blocksPerRow }, (_, blockIndex) => createBlankInputBlock(rowIndex, blockIndex)),
  };
}

const minimumBlankCellWidth = 0.25;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function createValueSetId(index: number) {
  return `value-set-${index + 1}`;
}

function createEmptyValueSetValues(inputKeys: string[]): Record<string, string> {
  return inputKeys.reduce<Record<string, string>>((values, key) => {
    values[key] = '';
    return values;
  }, {});
}

function getNextValueSetId(valueSets: LocalValueSet[]) {
  const nextNumber = valueSets.reduce((maxIdNumber, valueSet) => {
    const match = /^value-set-(\d+)$/.exec(valueSet.id);

    if (!match) {
      return maxIdNumber;
    }

    return Math.max(maxIdNumber, Number.parseInt(match[1], 10));
  }, 0) + 1;

  return `value-set-${nextNumber}`;
}

export function clampOverlayPreviewState(state: OverlayPreviewState): OverlayPreviewState {
  return {
    x: clamp(state.x, overlayPreviewLimits.x.min, overlayPreviewLimits.x.max),
    y: clamp(state.y, overlayPreviewLimits.y.min, overlayPreviewLimits.y.max),
    scale: clamp(state.scale, overlayPreviewLimits.scale.min, overlayPreviewLimits.scale.max),
  };
}

export function createGridBoard(rowCount: number, blocksPerRow: number): BoardRow[] {
  return Array.from({ length: rowCount }, (_, rowIndex) => createBlankInputRow(rowIndex, blocksPerRow));
}

export function normalizeValueSetValues(values: Record<string, string>, inputKeys: string[]): Record<string, string> {
  return inputKeys.reduce<Record<string, string>>((nextValues, key) => {
    nextValues[key] = values[key] ?? '';
    return nextValues;
  }, {});
}

export function createDefaultValueSets(inputKeys: string[]): LocalValueSet[] {
  return defaultValueSetNames.map((name, index) => ({
    id: createValueSetId(index),
    name,
    values: createEmptyValueSetValues(inputKeys),
  }));
}

export function syncValueSetsToInputKeys(valueSets: LocalValueSet[], inputKeys: string[]): LocalValueSet[] {
  const currentValueSets = valueSets.length > 0 ? valueSets : createDefaultValueSets(inputKeys);

  return currentValueSets.map((valueSet) => ({
    ...valueSet,
    values: normalizeValueSetValues(valueSet.values, inputKeys),
  }));
}

export function getActiveValueSet(valueSets: LocalValueSet[], activeValueSetId: string): LocalValueSet | null {
  return valueSets.find((valueSet) => valueSet.id === activeValueSetId) ?? valueSets[0] ?? null;
}

export function appendValueSet(valueSets: LocalValueSet[], inputKeys: string[]): LocalValueSet[] {
  const syncedValueSets = syncValueSetsToInputKeys(valueSets, inputKeys);
  const nextSetNumber = syncedValueSets.length + 1;

  return [
    ...syncedValueSets,
    {
      id: getNextValueSetId(syncedValueSets),
      name: `${nextSetNumber}차`,
      values: createEmptyValueSetValues(inputKeys),
    },
  ];
}

export function renameValueSet(valueSets: LocalValueSet[], valueSetId: string, name: string, inputKeys: string[]): LocalValueSet[] {
  return syncValueSetsToInputKeys(valueSets, inputKeys).map((valueSet) => (
    valueSet.id === valueSetId ? { ...valueSet, name } : valueSet
  ));
}

export function updateValueSetValue(
  valueSets: LocalValueSet[],
  valueSetId: string,
  key: string,
  value: string,
  inputKeys: string[],
): LocalValueSet[] {
  return syncValueSetsToInputKeys(valueSets, inputKeys).map((valueSet) => {
    if (valueSet.id !== valueSetId) {
      return valueSet;
    }

    return {
      ...valueSet,
      values: {
        ...valueSet.values,
        [key]: value,
      },
    };
  });
}

export function deleteBlockFromRow(rows: BoardRow[], rowIndex: number, blockIndex: number): BoardRow[] {
  const nextRows = structuredClone(rows);
  const row = nextRows[rowIndex];

  if (!row || !row.blocks[blockIndex]) {
    return nextRows;
  }

  const originalRowTotal = row.blocks.reduce((sum, block) => sum + block.width, 0);
  row.blocks = row.blocks.filter((_, index) => index !== blockIndex);

  if (row.blocks.length > 0) {
    const redistributedWidth = originalRowTotal / row.blocks.length;
    row.blocks = row.blocks.map((block) => ({ ...block, width: redistributedWidth }));
  }

  return nextRows;
}

function withRowBlockIds(row: BoardRow, rowIndex: number): BoardRow {
  return {
    ...row,
    id: `row-${rowIndex + 1}`,
    blocks: row.blocks.map((block, blockIndex) => ({
      ...block,
      id: `row-${rowIndex + 1}-block-${blockIndex + 1}`,
    })),
  };
}

export function deleteBlockByDrop(rows: BoardRow[], selection: BlockSelection): BoardRow[] {
  const row = rows[selection.rowIndex];

  if (!row || !row.blocks[selection.blockIndex] || row.blocks.length <= 1) {
    return rows;
  }

  const nextRows = deleteBlockFromRow(rows, selection.rowIndex, selection.blockIndex);
  const nextRow = nextRows[selection.rowIndex];

  if (!nextRow) {
    return nextRows;
  }

  return nextRows.map((currentRow, rowIndex) => (
    rowIndex === selection.rowIndex ? withRowBlockIds(nextRow, rowIndex) : currentRow
  ));
}

export function mergeBlocksInSameRow(rows: BoardRow[], source: BlockSelection, target: BlockSelection): BoardRow[] {
  if (source.rowIndex !== target.rowIndex || source.blockIndex === target.blockIndex) {
    return rows;
  }

  const row = rows[source.rowIndex];
  const sourceBlock = row?.blocks[source.blockIndex];
  const targetBlock = row?.blocks[target.blockIndex];

  if (!row || !sourceBlock || !targetBlock) {
    return rows;
  }

  const nextBlocks = row.blocks.flatMap((block, blockIndex) => {
    if (blockIndex === source.blockIndex) {
      return [];
    }

    if (blockIndex !== target.blockIndex) {
      return [{ ...block }];
    }

    return [{
      ...targetBlock,
      text: targetBlock.text.trim() === '' && sourceBlock.text.trim() !== '' ? sourceBlock.text : targetBlock.text,
      width: targetBlock.width + sourceBlock.width,
    }];
  });

  const nextRows = [...rows];
  nextRows[source.rowIndex] = withRowBlockIds({ ...row, blocks: nextBlocks }, source.rowIndex);

  return nextRows;
}

export function moveBlockInSameRow(
  rows: BoardRow[],
  source: BlockSelection,
  target: BlockSelection,
  placement: BlockMovePlacement,
): BoardRow[] {
  if (source.rowIndex !== target.rowIndex || source.blockIndex === target.blockIndex) {
    return rows;
  }

  const row = rows[source.rowIndex];
  const sourceBlock = row?.blocks[source.blockIndex];
  const targetBlock = row?.blocks[target.blockIndex];

  if (!row || !sourceBlock || !targetBlock) {
    return rows;
  }

  const targetIndexAfterRemoval = target.blockIndex - (source.blockIndex < target.blockIndex ? 1 : 0);
  const insertionIndex = placement === 'before' ? targetIndexAfterRemoval : targetIndexAfterRemoval + 1;

  if (insertionIndex === source.blockIndex || insertionIndex < 0 || insertionIndex > row.blocks.length - 1) {
    return rows;
  }

  const nextBlocks = row.blocks.map((block) => ({ ...block }));
  const [movedBlock] = nextBlocks.splice(source.blockIndex, 1);

  if (!movedBlock) {
    return rows;
  }

  nextBlocks.splice(insertionIndex, 0, movedBlock);

  const nextRows = [...rows];
  nextRows[source.rowIndex] = withRowBlockIds({ ...row, blocks: nextBlocks }, source.rowIndex);

  return nextRows;
}

export function swapBlocksBySeat(rows: BoardRow[], source: BlockSelection, target: BlockSelection): BoardRow[] {
  if (source.rowIndex === target.rowIndex && source.blockIndex === target.blockIndex) {
    return rows;
  }

  const sourceRow = rows[source.rowIndex];
  const targetRow = rows[target.rowIndex];
  const sourceBlock = sourceRow?.blocks[source.blockIndex];
  const targetBlock = targetRow?.blocks[target.blockIndex];

  if (!sourceRow || !targetRow || !sourceBlock || !targetBlock) {
    return rows;
  }

  const nextRows = structuredClone(rows);
  const nextSourceBlock = nextRows[source.rowIndex]?.blocks[source.blockIndex];
  const nextTargetBlock = nextRows[target.rowIndex]?.blocks[target.blockIndex];

  if (!nextSourceBlock || !nextTargetBlock) {
    return rows;
  }

  nextRows[source.rowIndex].blocks[source.blockIndex] = {
    ...nextTargetBlock,
    width: nextSourceBlock.width,
  };
  nextRows[target.rowIndex].blocks[target.blockIndex] = {
    ...nextSourceBlock,
    width: nextTargetBlock.width,
  };

  return nextRows.map(withRowBlockIds);
}

export function moveBlockToSeat(rows: BoardRow[], source: BlockSelection, target: BlockSelection): BoardRow[] {
  return swapBlocksBySeat(rows, source, target);
}

export function updateSelectedBlock(rows: BoardRow[], selection: BlockSelection, update: BlockUpdate): BoardRow[] {
  const nextRows = structuredClone(rows);
  const row = nextRows[selection.rowIndex];
  const block = row?.blocks[selection.blockIndex];

  if (!block) {
    return nextRows;
  }

  if (update.text !== undefined) {
    block.text = update.text;
  }

  if (update.type !== undefined) {
    if (update.type === 'title') {
      delete (block as { key?: string }).key;
      block.type = 'title';
    } else {
      block.type = 'input';
      (block as { key: string }).key = update.key ?? ('key' in block && typeof block.key === 'string' ? block.key : '');
    }
  }

  if (update.key !== undefined && block.type === 'input') {
    block.key = update.key;
  }

  if (update.style !== undefined) {
    block.style = {
      ...block.style,
      ...update.style,
    };
  }

  return nextRows;
}

export function insertBlankRowAt(rows: BoardRow[], anchorRowIndex: number, direction: RowInsertDirection, blocksPerRow: number): BoardRow[] {
  const nextRows = structuredClone(rows);
  const insertionIndex = direction === 'above' ? anchorRowIndex : anchorRowIndex + 1;
  nextRows.splice(insertionIndex, 0, createBlankInputRow(insertionIndex, blocksPerRow));

  return nextRows.map((row, rowIndex) => ({
    ...row,
    id: `row-${rowIndex + 1}`,
    blocks: row.blocks.map((block, blockIndex) => ({
      ...block,
      id: `row-${rowIndex + 1}-block-${blockIndex + 1}`,
    })),
  }));
}

interface InsertBlankCellResult {
  row: BoardRow;
  updated: boolean;
}

function redistributeBlocksForBlankCellInsert(
  row: BoardRow,
  insertionIndex: number,
  insertCount: number,
  direction: BlankCellInsertDirection,
): InsertBlankCellResult {
  const rowTotalWidth = row.blocks.reduce((sum, block) => sum + block.width, 0);

  if (rowTotalWidth <= 0 || insertCount <= 0 || insertionIndex < 0 || insertionIndex > row.blocks.length) {
    return {
      row,
      updated: false,
    };
  }

  const fixedBlocks = row.blocks.slice(0, insertionIndex);
  const movedBlocks = row.blocks.slice(insertionIndex);
  const fixedWidth = fixedBlocks.reduce((sum, block) => sum + block.width, 0);
  const blanks = Array.from({ length: insertCount }, (_, blockIndex) => createBlankInputBlock(0, insertionIndex + blockIndex));

  const target = direction === 'left' ? [...blanks, ...movedBlocks] : [...movedBlocks, ...blanks];
  const targetWidth = rowTotalWidth - fixedWidth;
  const evenWidth = targetWidth / target.length;

  if (targetWidth > 0 && evenWidth >= minimumBlankCellWidth) {
    return {
      row: {
        ...row,
        blocks: [
          ...fixedBlocks.map((block) => ({ ...block })),
          ...target.map((block) => ({
            ...block,
            width: evenWidth,
          })),
        ],
      },
      updated: true,
    };
  }

  const allBlocks = row.blocks.length + insertCount;
  const fallbackWidth = rowTotalWidth / allBlocks;

  const nextRowBlocks = row.blocks.map((block) => ({ ...block, width: fallbackWidth }));
  nextRowBlocks.splice(
    insertionIndex,
    0,
    ...blanks.map((block) => ({ ...block, width: fallbackWidth })),
  );

  return {
    row: {
      ...row,
      blocks: nextRowBlocks,
    },
    updated: true,
  };
}

export function insertBlankCellAt(
  rows: BoardRow[],
  selection: BlockSelection,
  direction: BlankCellInsertDirection,
  insertCount = 1,
): BoardRow[] {
  const insertionRow = rows[selection.rowIndex];
  const selectedBlock = insertionRow?.blocks[selection.blockIndex];

  if (!insertionRow || !selectedBlock) {
    return rows;
  }

  const insertionIndex = direction === 'left' ? selection.blockIndex : selection.blockIndex + 1;
  const { row: nextRow, updated } = redistributeBlocksForBlankCellInsert(insertionRow, insertionIndex, insertCount, direction);

  if (!updated) {
    return rows;
  }

  const nextRows = [...rows];
  nextRows[selection.rowIndex] = withRowBlockIds(nextRow, selection.rowIndex);

  return nextRows;
}

export function extractInputKeys(rows: BoardRow[]): string[] {
  const keys: string[] = [];
  const keySet = new Set<string>();

  rows.forEach((row) => {
    row.blocks.forEach((block) => {
      if (block.type !== 'input') {
        return;
      }

      const key = block.key.trim();

      if (!key || keySet.has(key)) {
        return;
      }

      keySet.add(key);
      keys.push(key);
    });
  });

  return keys;
}

export function applyValueSetValuesToRows(rows: BoardRow[], values: Record<string, string>): BoardRow[] {
  return rows.map((row) => ({
    ...row,
    blocks: row.blocks.map((block) => {
      if (block.type !== 'input') {
        return { ...block };
      }

      const normalizedKey = block.key.trim();
      const nextText = normalizedKey ? values[normalizedKey] ?? '' : '';
      return {
        ...block,
        text: nextText,
      };
    }),
  }));
}

export function buildValueSetWriteInput(options: BuildValueSetWriteInputOptions): ValueSetWriteInput {
  return {
    schemaVersion: 1,
    id: options.valueSetId,
    templateId: options.templateId,
    templateVersion: options.templateVersion,
    templateUpdatedAt: options.templateUpdatedAt,
    name: options.activeValueSet.name,
    values: structuredClone(options.activeValueSet.values),
    createdAt: options.nowIso,
    updatedAt: options.nowIso,
  };
}

export function toListenerStatusText(options: ListenerStatusTextOptions): string {
  const prefixByStatus: Record<ListenerStatus, string> = {
    unavailable: '사용 불가',
    'logged-out': '로그아웃',
    loading: '불러오는 중',
    loaded: '불러옴',
    error: '오류',
  };

  const prefix = prefixByStatus[options.status];
  const suffix = options.detail ? `: ${options.detail}` : '';

  return `${options.label} ${prefix}${suffix}`;
}
