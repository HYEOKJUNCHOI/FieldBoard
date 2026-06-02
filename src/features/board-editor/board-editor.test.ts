import { describe, expect, it } from 'vitest';

import {
  appendValueSet,
  applyValueSetValuesToRows,
  buildValueSetWriteInput,
  clampOverlayPreviewPosition,
  clampOverlayPreviewState,
  createDefaultValueSets,
  createGridBoard,
  deleteBlockByDrop,
  deleteBlockFromRow,
  insertBlankCellAt,
  defaultOverlayPreviewState,
  extractInputKeys,
  getActiveValueSet,
  insertBlankRowAt,
  mergeBlocksInSameRow,
  moveBlockInSameRow,
  moveOverlayPreviewByPixelDelta,
  pixelDeltaToBoardUnits,
  renameValueSet,
  resizeBlockBoundary,
  resizeRowBoundary,
  resizeRowHeight,
  snapBlockBoundaryDeltaToRowGuide,
  snapBoardUnitDelta,
  syncValueSetsToInputKeys,
  updateSelectedBlock,
  updateValueSetValue,
  toListenerStatusText,
} from './index.js';

describe('board-editor pure state and geometry helpers', () => {
  it('creates a 4x5 grid board of blank input blocks', () => {
    const rows = createGridBoard(4, 5);

    expect(rows).toHaveLength(4);
    expect(rows.every((row) => row.blocks.length === 5)).toBe(true);
    expect(rows[0]?.blocks[0]?.type).toBe('input');
    expect(rows[0]?.blocks[0] && 'key' in rows[0].blocks[0] ? rows[0].blocks[0].key : undefined).toBe('');
  });

  it('deletes row 4 block 5 without changing other rows', () => {
    const rows = createGridBoard(4, 5);

    const nextRows = deleteBlockFromRow(rows, 3, 4);

    expect(nextRows[3]?.blocks).toHaveLength(4);
    expect(nextRows[3]?.blocks.map((block) => block.width)).toEqual([1.25, 1.25, 1.25, 1.25]);
    expect(nextRows[0]?.blocks).toHaveLength(5);
    expect(nextRows[1]?.blocks).toHaveLength(5);
    expect(nextRows[2]?.blocks).toHaveLength(5);
    expect(rows[3]?.blocks).toHaveLength(5);
  });

  it('redistributes remaining sibling blocks across the original row width after deleting an uneven block', () => {
    const rows = createGridBoard(2, 3);
    const unevenRows = resizeBlockBoundary(resizeBlockBoundary(rows, 0, 0, 2, 1), 0, 1, 1, 3);

    const nextRows = deleteBlockFromRow(unevenRows, 0, 1);

    expect(nextRows[0]?.blocks).toHaveLength(2);
    expect(nextRows[0]?.blocks.map((block) => block.width)).toEqual([3, 3]);
    expect(nextRows[1]?.blocks.map((block) => block.width)).toEqual([1, 1, 1]);
    expect(unevenRows[0]?.blocks.map((block) => block.width)).toEqual([2, 1, 3]);
  });

  it('keeps a dropped last row cell when drag-delete would remove the final block', () => {
    const rows = createGridBoard(1, 1);

    const nextRows = deleteBlockByDrop(rows, { rowIndex: 0, blockIndex: 0 });

    expect(nextRows).toBe(rows);
    expect(nextRows[0]?.blocks).toHaveLength(1);
  });

  it('merges two cells in the same row by adding source width to the target and reindexing ids', () => {
    const rows = createGridBoard(2, 3);
    const withSourceText = updateSelectedBlock(rows, { rowIndex: 0, blockIndex: 0 }, { text: '현장명' });

    const nextRows = mergeBlocksInSameRow(withSourceText, { rowIndex: 0, blockIndex: 0 }, { rowIndex: 0, blockIndex: 2 });

    expect(nextRows[0]?.blocks).toHaveLength(2);
    expect(nextRows[0]?.blocks.map((block) => block.width)).toEqual([1, 2]);
    expect(nextRows[0]?.blocks[1]?.text).toBe('현장명');
    expect(nextRows[0]?.blocks[0]?.id).toBe('row-1-block-1');
    expect(nextRows[0]?.blocks[1]?.id).toBe('row-1-block-2');
    expect(nextRows[1]).toBe(withSourceText[1]);
    expect(withSourceText[0]?.blocks).toHaveLength(3);
  });

  it('preserves target text when merging and ignores invalid cross-row drops', () => {
    const rows = createGridBoard(2, 2);
    const withSourceText = updateSelectedBlock(rows, { rowIndex: 0, blockIndex: 0 }, { text: '소스' });
    const withTargetText = updateSelectedBlock(withSourceText, { rowIndex: 0, blockIndex: 1 }, { text: '타깃' });

    const mergedRows = mergeBlocksInSameRow(withTargetText, { rowIndex: 0, blockIndex: 0 }, { rowIndex: 0, blockIndex: 1 });
    const crossRowRows = mergeBlocksInSameRow(withTargetText, { rowIndex: 0, blockIndex: 0 }, { rowIndex: 1, blockIndex: 0 });

    expect(mergedRows[0]?.blocks[0]?.text).toBe('타깃');
    expect(mergedRows[0]?.blocks[0]?.width).toBe(2);
    expect(crossRowRows).toBe(withTargetText);
  });

  it('moves a same-row block before the target and reindexes ids', () => {
    const rows = ['A', 'B', 'C', 'D'].reduce(
      (currentRows, text, blockIndex) => updateSelectedBlock(currentRows, { rowIndex: 0, blockIndex }, { text }),
      createGridBoard(1, 4),
    );

    const nextRows = moveBlockInSameRow(rows, { rowIndex: 0, blockIndex: 3 }, { rowIndex: 0, blockIndex: 1 }, 'before');

    expect(nextRows[0]?.blocks.map((block) => block.text)).toEqual(['A', 'D', 'B', 'C']);
    expect(nextRows[0]?.blocks.map((block) => block.id)).toEqual([
      'row-1-block-1',
      'row-1-block-2',
      'row-1-block-3',
      'row-1-block-4',
    ]);
    expect(nextRows[0]?.blocks.map((block) => block.width)).toEqual([1, 1, 1, 1]);
    expect(rows[0]?.blocks.map((block) => block.text)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('moves a same-row block after the target while preserving uneven widths', () => {
    const resizedRows = resizeBlockBoundary(createGridBoard(1, 3), 0, 0, 2, 0.5);
    const rows = ['A', 'B', 'C'].reduce(
      (currentRows, text, blockIndex) => updateSelectedBlock(currentRows, { rowIndex: 0, blockIndex }, { text }),
      resizedRows,
    );

    const nextRows = moveBlockInSameRow(rows, { rowIndex: 0, blockIndex: 0 }, { rowIndex: 0, blockIndex: 2 }, 'after');

    expect(nextRows[0]?.blocks.map((block) => block.text)).toEqual(['B', 'C', 'A']);
    expect(nextRows[0]?.blocks.map((block) => block.width)).toEqual([0.5, 1, 2]);
    expect(nextRows[0]?.blocks[2]?.id).toBe('row-1-block-3');
  });

  it('returns the original rows for invalid cross-row moves', () => {
    const rows = createGridBoard(2, 2);

    const nextRows = moveBlockInSameRow(rows, { rowIndex: 0, blockIndex: 0 }, { rowIndex: 1, blockIndex: 0 }, 'before');

    expect(nextRows).toBe(rows);
  });

  it('updates selected input block key, text, type and style', () => {
    const rows = createGridBoard(4, 5);

    const withInputPatch = updateSelectedBlock(rows, { rowIndex: 0, blockIndex: 1 }, {
      key: 'site_name',
      text: '현장명',
      style: { fontWeight: 700, color: '#111111' },
    });

    const inputBlock = withInputPatch[0]?.blocks[1];
    expect(inputBlock?.text).toBe('현장명');
    expect(inputBlock?.style.fontWeight).toBe(700);
    expect(inputBlock?.style.color).toBe('#111111');
    expect(inputBlock && 'key' in inputBlock ? inputBlock.key : undefined).toBe('site_name');

    const withTypeChange = updateSelectedBlock(withInputPatch, { rowIndex: 0, blockIndex: 1 }, { type: 'title' });
    const titleBlock = withTypeChange[0]?.blocks[1];

    expect(titleBlock?.type).toBe('title');
    expect(titleBlock && 'key' in titleBlock).toBe(false);
  });

  it('resizes a block boundary in one row only', () => {
    const rows = createGridBoard(4, 5);

    const nextRows = resizeBlockBoundary(rows, 1, 1, 2.25, 0.75);

    expect(nextRows[1]?.blocks[1]?.width).toBe(2.25);
    expect(nextRows[1]?.blocks[2]?.width).toBe(0.75);
    expect(nextRows[0]?.blocks[1]?.width).toBe(1);
    expect(nextRows[2]?.blocks[1]?.width).toBe(1);
  });

  it('resizes row boundary and individual row height', () => {
    const rows = createGridBoard(4, 5);

    const resizedBoundary = resizeRowBoundary(rows, 0, 1.5, 0.5);
    expect(resizedBoundary[0]?.height).toBe(1.5);
    expect(resizedBoundary[1]?.height).toBe(0.5);
    expect(resizedBoundary[2]?.height).toBe(1);

    const resizedSingle = resizeRowHeight(rows, 3, 2);
    expect(resizedSingle[3]?.height).toBe(2);
    expect(resizedSingle[2]?.height).toBe(1);
  });

  it('resizes geometry helpers without mutating the source rows', () => {
    const rows = createGridBoard(4, 5);
    const originalRow = rows[1];
    const originalLeftBlock = rows[1]?.blocks[1];
    const originalRightBlock = rows[1]?.blocks[2];

    const blockResized = resizeBlockBoundary(rows, 1, 1, 2.25, 0.75);
    const rowBoundaryResized = resizeRowBoundary(rows, 1, 1.75, 0.25);
    const rowHeightResized = resizeRowHeight(rows, 1, 2);

    expect(blockResized).not.toBe(rows);
    expect(rowBoundaryResized).not.toBe(rows);
    expect(rowHeightResized).not.toBe(rows);
    expect(rows[1]).toBe(originalRow);
    expect(rows[1]?.blocks[1]).toBe(originalLeftBlock);
    expect(rows[1]?.blocks[2]).toBe(originalRightBlock);
    expect(rows[1]?.height).toBe(1);
    expect(rows[2]?.height).toBe(1);
    expect(rows[1]?.blocks[1]?.width).toBe(1);
    expect(rows[1]?.blocks[2]?.width).toBe(1);
  });

  it('converts pointer pixel delta to board units', () => {
    expect(pixelDeltaToBoardUnits(24, 8)).toBe(3);
    expect(pixelDeltaToBoardUnits(-12, 8)).toBe(-1.5);
  });

  it('snaps and clamps resize deltas to valid adjacent sizes', () => {
    expect(snapBoardUnitDelta(0.74, 1, 1, 0.25, 0.25)).toBe(0.75);
    expect(snapBoardUnitDelta(1.2, 1, 1, 0.25, 0.25)).toBe(0.75);
    expect(snapBoardUnitDelta(-0.74, 1, 1, 0.25, 0.25)).toBe(-0.75);
    expect(snapBoardUnitDelta(-1.2, 1, 1, 0.25, 0.25)).toBe(-0.75);
  });

  it('snaps block boundaries to normalized boundaries from other rows before quarter-unit snapping', () => {
    const rows = [
      createGridBoard(1, 2)[0],
      resizeBlockBoundary(createGridBoard(1, 2), 0, 0, 2, 2)[0],
    ].filter((row) => row !== undefined);

    const result = snapBlockBoundaryDeltaToRowGuide({
      rows,
      activeRowIndex: 0,
      activeBoundaryStart: 3,
      activeRowTotal: 8,
      boardUnitDelta: 0.87,
      leadingSize: 2,
      trailingSize: 6,
      pixelsPerBoardUnit: 10,
      guideThresholdPixels: 8,
      snapSize: 0.25,
      minSize: 0.25,
    });

    expect(result.snappedDelta).toBe(1);
    expect(result.guide).toMatchObject({ kind: 'boundary', targetPosition: 4, sourceRowIndex: 1 });
  });

  it('snaps block boundaries to normalized centers from other rows', () => {
    const rows = [
      createGridBoard(1, 2)[0],
      resizeBlockBoundary(createGridBoard(1, 2), 0, 0, 4, 4)[0],
    ].filter((row) => row !== undefined);

    const result = snapBlockBoundaryDeltaToRowGuide({
      rows,
      activeRowIndex: 0,
      activeBoundaryStart: 3,
      activeRowTotal: 8,
      boardUnitDelta: -0.9,
      leadingSize: 3,
      trailingSize: 5,
      pixelsPerBoardUnit: 10,
      guideThresholdPixels: 8,
      snapSize: 0.25,
      minSize: 0.25,
    });

    expect(result.snappedDelta).toBe(-1);
    expect(result.guide).toMatchObject({ kind: 'center', targetPosition: 2, sourceRowIndex: 1 });
  });

  it('snaps to the local equal-width point and ignores guides blocked by min-size constraints', () => {
    const rows = [createGridBoard(1, 2)[0]].filter((row) => row !== undefined);

    const equalWidthResult = snapBlockBoundaryDeltaToRowGuide({
      rows,
      activeRowIndex: 0,
      activeBoundaryStart: 1,
      activeRowTotal: 4,
      boardUnitDelta: 0.88,
      leadingSize: 1,
      trailingSize: 3,
      pixelsPerBoardUnit: 10,
      guideThresholdPixels: 8,
      snapSize: 0.25,
      minSize: 0.25,
    });

    const blockedGuideResult = snapBlockBoundaryDeltaToRowGuide({
      rows: [createGridBoard(1, 2)[0], resizeBlockBoundary(createGridBoard(1, 2), 0, 0, 3, 1)[0]].filter((row) => row !== undefined),
      activeRowIndex: 0,
      activeBoundaryStart: 0.5,
      activeRowTotal: 2,
      boardUnitDelta: 0.9,
      leadingSize: 0.5,
      trailingSize: 0.5,
      pixelsPerBoardUnit: 10,
      guideThresholdPixels: 4,
      snapSize: 0.25,
      minSize: 0.25,
    });

    expect(equalWidthResult.snappedDelta).toBe(1);
    expect(equalWidthResult.guide).toMatchObject({ kind: 'equal-width', targetPosition: 2 });
    expect(blockedGuideResult.snappedDelta).toBe(0.25);
    expect(blockedGuideResult.guide).toBeNull();
  });

  it('inserts one blank row above the anchor and reindexes row and block ids', () => {
    const rows = deleteBlockFromRow(createGridBoard(4, 5), 0, 4);

    const withAbove = insertBlankRowAt(rows, 2, 'above', 3);

    expect(withAbove).toHaveLength(5);
    expect(withAbove[0]?.blocks).toHaveLength(4);
    expect(withAbove[1]?.blocks).toHaveLength(5);
    expect(withAbove[2]?.blocks).toHaveLength(3);
    expect(withAbove[2]?.blocks.every((block) => block.type === 'input' && block.text === '')).toBe(true);
    expect(withAbove[2]?.id).toBe('row-3');
    expect(withAbove[2]?.blocks[0]?.id).toBe('row-3-block-1');
    expect(withAbove[3]?.id).toBe('row-4');
    expect(withAbove[3]?.blocks[0]?.id).toBe('row-4-block-1');
  });

  it('inserts one blank row below the anchor and preserves unrelated row block counts', () => {
    const rows = deleteBlockFromRow(createGridBoard(4, 5), 3, 4);

    const withBelow = insertBlankRowAt(rows, 1, 'below', 2);

    expect(withBelow).toHaveLength(5);
    expect(withBelow[0]?.blocks).toHaveLength(5);
    expect(withBelow[1]?.blocks).toHaveLength(5);
    expect(withBelow[2]?.blocks).toHaveLength(2);
    expect(withBelow[2]?.blocks.every((block) => block.type === 'input' && block.text === '')).toBe(true);
    expect(withBelow[2]?.id).toBe('row-3');
    expect(withBelow[2]?.blocks[1]?.id).toBe('row-3-block-2');
    expect(withBelow[4]?.blocks).toHaveLength(4);
    expect(withBelow[4]?.id).toBe('row-5');
    expect(withBelow[4]?.blocks[0]?.id).toBe('row-5-block-1');
  });

  it('inserts one blank cell to the left and redistributes only right-side cells with preserved left width', () => {
    const rows = [
      {
        id: 'row-1',
        height: 1,
        blocks: [
          { id: 'row-1-block-1', type: 'input' as const, key: 'a', text: 'A', width: 1, style: { fontSize: 16, fontWeight: 500, align: 'left' as const, backgroundColor: '#ffffff', borderColor: '#000000', color: '#000000' } },
          { id: 'row-1-block-2', type: 'input' as const, key: 'b', text: 'B', width: 2, style: { fontSize: 16, fontWeight: 500, align: 'left' as const, backgroundColor: '#ffffff', borderColor: '#000000', color: '#000000' } },
          { id: 'row-1-block-3', type: 'input' as const, key: 'c', text: 'C', width: 1, style: { fontSize: 16, fontWeight: 500, align: 'left' as const, backgroundColor: '#ffffff', borderColor: '#000000', color: '#000000' } },
        ],
      },
      {
        id: 'row-2',
        height: 1,
        blocks: [
          { id: 'row-2-block-1', type: 'input' as const, key: 'd', text: 'D', width: 1, style: { fontSize: 16, fontWeight: 500, align: 'left' as const, backgroundColor: '#ffffff', borderColor: '#000000', color: '#000000' } },
        ],
      },
    ];

    const nextRows = insertBlankCellAt(rows, { rowIndex: 0, blockIndex: 1 }, 'left');

    expect(nextRows[0]?.blocks.map((block) => block.width)).toEqual([1, 1, 1, 1]);
    expect(nextRows[0]?.blocks[1]?.type).toBe('input');
    expect(nextRows[0]?.blocks[1]?.key).toBe('');
    expect(nextRows[1]).toBe(rows[1]);
    expect(rows[0]?.blocks.map((block) => block.width)).toEqual([1, 2, 1]);
    expect(nextRows[0]?.id).toBe('row-1');
    expect(nextRows[0]?.blocks[1]?.id).toBe('row-1-block-2');
  });

  it('inserts one blank cell to the right and redistributes right-side cells only', () => {
    const rows = [
      {
        id: 'row-1',
        height: 1,
        blocks: [
          { id: 'row-1-block-1', type: 'input' as const, key: 'a', text: 'A', width: 1, style: { fontSize: 16, fontWeight: 500, align: 'left' as const, backgroundColor: '#ffffff', borderColor: '#000000', color: '#000000' } },
          { id: 'row-1-block-2', type: 'input' as const, key: 'b', text: 'B', width: 2, style: { fontSize: 16, fontWeight: 500, align: 'left' as const, backgroundColor: '#ffffff', borderColor: '#000000', color: '#000000' } },
          { id: 'row-1-block-3', type: 'input' as const, key: 'c', text: 'C', width: 1, style: { fontSize: 16, fontWeight: 500, align: 'left' as const, backgroundColor: '#ffffff', borderColor: '#000000', color: '#000000' } },
        ],
      },
      {
        id: 'row-2',
        height: 1,
        blocks: [
          { id: 'row-2-block-1', type: 'input' as const, key: 'd', text: 'D', width: 1, style: { fontSize: 16, fontWeight: 500, align: 'left' as const, backgroundColor: '#ffffff', borderColor: '#000000', color: '#000000' } },
        ],
      },
    ];

    const nextRows = insertBlankCellAt(rows, { rowIndex: 0, blockIndex: 1 }, 'right');

    expect(nextRows[0]?.blocks.map((block) => block.width)).toEqual([1, 2, 0.5, 0.5]);
    expect(nextRows[0]?.blocks[3]?.type).toBe('input');
    expect(nextRows[0]?.blocks[3]?.key).toBe('');
    expect(nextRows[0]?.blocks[2]?.id).toBe('row-1-block-3');
    expect(nextRows[0]?.blocks[3]?.id).toBe('row-1-block-4');
    expect(nextRows[0]?.id).toBe('row-1');
    expect(rows[0]?.id).toBe('row-1');
  });

  it('uses fallback equal redistribution when right insertion has no movable right block', () => {
    const rows = [
      {
        id: 'row-1',
        height: 1,
        blocks: [
          { id: 'row-1-block-1', type: 'input' as const, key: 'a', text: 'A', width: 1, style: { fontSize: 16, fontWeight: 500, align: 'left' as const, backgroundColor: '#ffffff', borderColor: '#000000', color: '#000000' } },
          { id: 'row-1-block-2', type: 'input' as const, key: 'b', text: 'B', width: 1, style: { fontSize: 16, fontWeight: 500, align: 'left' as const, backgroundColor: '#ffffff', borderColor: '#000000', color: '#000000' } },
        ],
      },
    ];

    const nextRows = insertBlankCellAt(rows, { rowIndex: 0, blockIndex: 1 }, 'right');

    expect(nextRows[0]?.blocks.map((block) => block.width)).toEqual([0.6666666666666666, 0.6666666666666666, 0.6666666666666666]);
    expect(nextRows[0]?.blocks[2]?.type).toBe('input');
    expect(nextRows[0]?.blocks[2]?.key).toBe('');
    expect(nextRows[0]?.blocks[2]?.id).toBe('row-1-block-3');
  });

  it('preserves long Korean text without truncation', () => {
    const rows = createGridBoard(4, 5);
    const longKorean = '안전관리계획서 현장점검 항목을 상세하게 기록하기 위한 매우 긴 텍스트 데이터입니다. '.repeat(10).trim();

    const nextRows = updateSelectedBlock(rows, { rowIndex: 2, blockIndex: 4 }, { text: longKorean, key: 'site_name' });
    const block = nextRows[2]?.blocks[4];

    expect(block?.text).toBe(longKorean);
    expect(block?.text.length).toBe(longKorean.length);
  });

  it('clamps overlay preview values below the minimum limits', () => {
    const nextState = clampOverlayPreviewState({ x: -12, y: -1, scale: 0.1 });

    expect(nextState).toEqual({ x: 0, y: 0, scale: 0.25 });
  });

  it('clamps overlay preview values above the maximum limits', () => {
    const nextState = clampOverlayPreviewState({ x: 120, y: 180, scale: 2 });

    expect(nextState).toEqual({ x: 100, y: 100, scale: 1.5 });
  });

  it('preserves in-range overlay preview values and does not mutate board rows', () => {
    const rows = createGridBoard(4, 5);
    const originalRows = rows;
    const originalRow = rows[1];
    const originalBlock = rows[1]?.blocks[2];

    const nextState = clampOverlayPreviewState(defaultOverlayPreviewState);

    expect(nextState).toEqual(defaultOverlayPreviewState);
    expect(rows).toBe(originalRows);
    expect(rows[1]).toBe(originalRow);
    expect(rows[1]?.blocks[2]).toBe(originalBlock);
    expect(rows[1]?.height).toBe(1);
    expect(rows[1]?.blocks[2]?.width).toBe(1);
  });

  it('converts overlay preview drag pixels into clamped percentages', () => {
    const nextState = moveOverlayPreviewByPixelDelta({
      state: { x: 50, y: 40, scale: 0.75 },
      photoSize: { width: 400, height: 800 },
      overlaySize: { width: 200, height: 160 },
      deltaX: 40,
      deltaY: -80,
    });

    expect(nextState).toEqual({ x: 60, y: 30, scale: 0.75 });
  });

  it('clamps dragged overlay position so its scaled edges stay inside the photo surface', () => {
    const nextState = moveOverlayPreviewByPixelDelta({
      state: { x: 50, y: 50, scale: 1 },
      photoSize: { width: 400, height: 800 },
      overlaySize: { width: 200, height: 160 },
      deltaX: 400,
      deltaY: -800,
    });

    expect(nextState).toEqual({ x: 75, y: 10, scale: 1 });
  });

  it('keeps a 72% scaled board overlay inside the 4:3 photo preview while dragging by percentages', () => {
    const nextState = moveOverlayPreviewByPixelDelta({
      state: { x: 66, y: 72, scale: 0.72 },
      photoSize: { width: 400, height: 300 },
      overlaySize: { width: 236, height: 124 },
      deltaX: 180,
      deltaY: 260,
    });

    expect(nextState.x).toBe(70.5);
    expect(nextState.y).toBeCloseTo(79.33333333333334);
    expect(nextState.scale).toBe(0.72);
  });

  it('recenters an oversized scaled overlay on the constrained axis', () => {
    const nextState = clampOverlayPreviewPosition(
      { x: 10, y: 95, scale: 1.5 },
      { width: 400, height: 800 },
      { width: 520, height: 160 },
    );

    expect(nextState).toEqual({ x: 50, y: 90, scale: 1.5 });
  });

  it('extracts unique non-empty input keys in row order', () => {
    const rows = createGridBoard(2, 3);
    const withKeys = updateSelectedBlock(rows, { rowIndex: 0, blockIndex: 0 }, { key: 'site_name' });
    const withDuplicate = updateSelectedBlock(withKeys, { rowIndex: 0, blockIndex: 1 }, { key: 'site_name' });
    const withEmpty = updateSelectedBlock(withDuplicate, { rowIndex: 0, blockIndex: 2 }, { key: ' ' });
    const withSecondKey = updateSelectedBlock(withEmpty, { rowIndex: 1, blockIndex: 0 }, { key: 'location' });

    const keys = extractInputKeys(withSecondKey);

    expect(keys).toEqual(['site_name', 'location']);
  });

  it('applies value-set values to input blocks without mutating source rows or title blocks', () => {
    const rows = createGridBoard(2, 2);
    const keyed = updateSelectedBlock(rows, { rowIndex: 0, blockIndex: 0 }, { key: 'site_name', text: '기존값' });
    const titled = updateSelectedBlock(keyed, { rowIndex: 0, blockIndex: 1 }, { type: 'title', text: '현장명' });
    const renderedRows = applyValueSetValuesToRows(titled, { site_name: '신규 현장명' });

    expect(renderedRows).not.toBe(titled);
    expect(renderedRows[0]?.blocks[0]?.text).toBe('신규 현장명');
    expect(renderedRows[1]?.blocks[0]?.text).toBe('');
    expect(renderedRows[0]?.blocks[1]?.text).toBe('현장명');
    expect(titled[0]?.blocks[0]?.text).toBe('기존값');
    expect(titled[0]?.blocks[1]?.text).toBe('현장명');
  });

  it('renders value-set text from a trimmed key when input block key has surrounding whitespace', () => {
    const rows = createGridBoard(1, 1);
    const paddedKeyRows = updateSelectedBlock(rows, { rowIndex: 0, blockIndex: 0 }, { key: ' site_name ' });

    const renderedRows = applyValueSetValuesToRows(paddedKeyRows, { site_name: '공백 키 매핑 성공' });

    expect(renderedRows[0]?.blocks[0]?.text).toBe('공백 키 매핑 성공');
    expect(paddedKeyRows[0]?.blocks[0]?.text).toBe('');
  });

  it('switches local value sets without mutating rows or overwriting inactive set values', () => {
    const rows = createGridBoard(1, 2);
    const withSiteKey = updateSelectedBlock(rows, { rowIndex: 0, blockIndex: 0 }, { key: 'site_name' });
    const keyedRows = updateSelectedBlock(withSiteKey, { rowIndex: 0, blockIndex: 1 }, { key: 'inspector' });
    const inputKeys = extractInputKeys(keyedRows);

    let valueSets = createDefaultValueSets(inputKeys);
    valueSets = updateValueSetValue(valueSets, 'value-set-1', 'site_name', '1차 현장', inputKeys);
    valueSets = updateValueSetValue(valueSets, 'value-set-1', 'inspector', '김감독', inputKeys);
    valueSets = updateValueSetValue(valueSets, 'value-set-2', 'site_name', '2차 현장', inputKeys);
    valueSets = updateValueSetValue(valueSets, 'value-set-2', 'inspector', '박감독', inputKeys);

    const firstValueSet = getActiveValueSet(valueSets, 'value-set-1');
    const secondValueSet = getActiveValueSet(valueSets, 'value-set-2');
    const firstRenderedRows = applyValueSetValuesToRows(keyedRows, firstValueSet?.values ?? {});
    const secondRenderedRows = applyValueSetValuesToRows(keyedRows, secondValueSet?.values ?? {});

    expect(firstRenderedRows[0]?.blocks[0]?.text).toBe('1차 현장');
    expect(firstRenderedRows[0]?.blocks[1]?.text).toBe('김감독');
    expect(secondRenderedRows[0]?.blocks[0]?.text).toBe('2차 현장');
    expect(secondRenderedRows[0]?.blocks[1]?.text).toBe('박감독');
    expect(keyedRows[0]?.blocks[0]?.text).toBe('');
    expect(keyedRows[0]?.blocks[1]?.text).toBe('');
    expect(secondValueSet?.values).toEqual({ site_name: '2차 현장', inspector: '박감독' });
  });

  it('adds and renames value sets while syncing values to the current input keys', () => {
    const inputKeys = ['site_name', 'location'];
    let valueSets = createDefaultValueSets(inputKeys);

    valueSets = updateValueSetValue(valueSets, 'value-set-1', 'site_name', '남양주 현장', inputKeys);
    valueSets = appendValueSet(valueSets, inputKeys);

    const addedValueSet = getActiveValueSet(valueSets, 'value-set-4');
    expect(valueSets.map((valueSet) => valueSet.name)).toEqual(['1차', '2차', '3차', '4차']);
    expect(addedValueSet?.values).toEqual({ site_name: '', location: '' });

    valueSets = renameValueSet(valueSets, 'value-set-1', 'W1', inputKeys);
    const renamedValueSet = getActiveValueSet(valueSets, 'value-set-1');

    expect(renamedValueSet?.name).toBe('W1');
    expect(renamedValueSet?.values).toEqual({ site_name: '남양주 현장', location: '' });

    const syncedValueSets = syncValueSetsToInputKeys(valueSets, ['location', 'work_date']);
    const syncedRenamedValueSet = getActiveValueSet(syncedValueSets, 'value-set-1');

    expect(syncedRenamedValueSet?.values).toEqual({ location: '', work_date: '' });
  });

  it('builds a firestore value-set write input from an active local value set', () => {
    const nowIso = '2026-06-02T14:00:00.000Z';
    const activeValueSet = {
      id: 'value-set-2',
      name: '2차 점검',
      values: {
        site_name: '남양주 현장',
        inspector: '박감독',
      },
    };

    const writeInput = buildValueSetWriteInput({
      activeValueSet,
      templateId: 'local-board-editor-template',
      valueSetId: 'local-board-editor-template-value-set-2',
      nowIso,
      templateVersion: 1,
      templateUpdatedAt: nowIso,
    });

    expect(writeInput).toEqual({
      schemaVersion: 1,
      id: 'local-board-editor-template-value-set-2',
      templateId: 'local-board-editor-template',
      templateVersion: 1,
      templateUpdatedAt: nowIso,
      name: '2차 점검',
      values: {
        site_name: '남양주 현장',
        inspector: '박감독',
      },
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  });

  it('returns Korean listener status text for loaded state with detail', () => {
    const message = toListenerStatusText({
      status: 'loaded',
      label: '템플릿 리스너',
      detail: '2건 로드',
    });

    expect(message).toBe('템플릿 리스너 불러옴: 2건 로드');
  });

  it('returns Korean listener status text for unavailable state without detail', () => {
    const message = toListenerStatusText({
      status: 'unavailable',
      label: '값세트 리스너',
    });

    expect(message).toBe('값세트 리스너 사용 불가');
  });
});
