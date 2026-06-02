import type { BoardRow } from '../../shared/schema/index.js';
import type { OverlayPreviewState } from './state.js';

interface OverlayPreviewSize {
  width: number;
  height: number;
}

interface MoveOverlayPreviewByPixelDeltaOptions {
  state: OverlayPreviewState;
  photoSize: OverlayPreviewSize;
  overlaySize: OverlayPreviewSize;
  deltaX: number;
  deltaY: number;
}

export type RowLocalSnapGuideKind = 'boundary' | 'center' | 'equal-width';

export interface RowLocalSnapGuide {
  kind: RowLocalSnapGuideKind;
  targetPosition: number;
  label: string;
  sourceRowIndex?: number;
}

interface RowLocalSnapCandidate extends RowLocalSnapGuide {
  priority: number;
}

interface SnapBlockBoundaryDeltaToRowGuideOptions {
  rows: BoardRow[];
  activeRowIndex: number;
  activeBoundaryStart: number;
  activeRowTotal: number;
  boardUnitDelta: number;
  leadingSize: number;
  trailingSize: number;
  pixelsPerBoardUnit: number;
  guideThresholdPixels?: number;
  snapSize?: number;
  minSize?: number;
}

interface SnapBlockBoundaryDeltaToRowGuideResult {
  snappedDelta: number;
  guide: RowLocalSnapGuide | null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getContainedAxisPosition(value: number, surfaceSize: number, overlaySize: number): number {
  const edgeInset = (overlaySize / surfaceSize) * 50;
  const min = Math.min(edgeInset, 50);
  const max = Math.max(100 - edgeInset, 50);

  return clamp(value, min, max);
}

export function pixelDeltaToBoardUnits(pixelDelta: number, pixelsPerBoardUnit: number): number {
  return pixelDelta / pixelsPerBoardUnit;
}

export function clampOverlayPreviewPosition(
  state: OverlayPreviewState,
  photoSize: OverlayPreviewSize,
  overlaySize: OverlayPreviewSize,
): OverlayPreviewState {
  return {
    ...state,
    x: getContainedAxisPosition(state.x, photoSize.width, overlaySize.width),
    y: getContainedAxisPosition(state.y, photoSize.height, overlaySize.height),
  };
}

export function moveOverlayPreviewByPixelDelta({
  state,
  photoSize,
  overlaySize,
  deltaX,
  deltaY,
}: MoveOverlayPreviewByPixelDeltaOptions): OverlayPreviewState {
  const nextState = {
    ...state,
    x: state.x + (deltaX / photoSize.width) * 100,
    y: state.y + (deltaY / photoSize.height) * 100,
  };

  return clampOverlayPreviewPosition(nextState, photoSize, overlaySize);
}

export function snapBoardUnitDelta(
  boardUnitDelta: number,
  leadingSize: number,
  trailingSize: number,
  snapSize = 0.25,
  minSize = 0.25,
): number {
  const snappedDelta = Math.round(boardUnitDelta / snapSize) * snapSize;
  const minimumDelta = minSize - leadingSize;
  const maximumDelta = trailingSize - minSize;

  return Math.min(maximumDelta, Math.max(minimumDelta, snappedDelta));
}

function getRowWidth(row: BoardRow): number {
  return row.blocks.reduce((sum, block) => sum + block.width, 0);
}

function isDeltaWithinSizeConstraints(delta: number, leadingSize: number, trailingSize: number, minSize: number): boolean {
  return leadingSize + delta >= minSize && trailingSize - delta >= minSize;
}

function createRowLocalSnapGuideCandidates(
  rows: BoardRow[],
  activeRowIndex: number,
  activeBoundaryStart: number,
  activeRowTotal: number,
  leadingSize: number,
  trailingSize: number,
): RowLocalSnapCandidate[] {
  const candidates: RowLocalSnapCandidate[] = [];
  const equalWidthTarget = activeBoundaryStart + (trailingSize - leadingSize) / 2;

  candidates.push({
    kind: 'equal-width',
    targetPosition: equalWidthTarget,
    label: 'Equal width',
    priority: 0,
  });

  rows.forEach((row, rowIndex) => {
    if (rowIndex === activeRowIndex) {
      return;
    }

    const sourceRowTotal = getRowWidth(row);

    if (sourceRowTotal <= 0) {
      return;
    }

    let cumulativeWidth = 0;

    row.blocks.forEach((block, blockIndex) => {
      const blockStart = cumulativeWidth;
      cumulativeWidth += block.width;

      const centerFraction = (blockStart + block.width / 2) / sourceRowTotal;

      candidates.push({
        kind: 'center',
        targetPosition: centerFraction * activeRowTotal,
        label: `R${rowIndex + 1} center`,
        sourceRowIndex: rowIndex,
        priority: 2,
      });

      if (blockIndex < row.blocks.length - 1) {
        const boundaryFraction = cumulativeWidth / sourceRowTotal;

        candidates.push({
          kind: 'boundary',
          targetPosition: boundaryFraction * activeRowTotal,
          label: `R${rowIndex + 1} boundary`,
          sourceRowIndex: rowIndex,
          priority: 1,
        });
      }
    });
  });

  return candidates;
}

export function snapBlockBoundaryDeltaToRowGuide({
  rows,
  activeRowIndex,
  activeBoundaryStart,
  activeRowTotal,
  boardUnitDelta,
  leadingSize,
  trailingSize,
  pixelsPerBoardUnit,
  guideThresholdPixels = 16,
  snapSize = 0.25,
  minSize = 0.25,
}: SnapBlockBoundaryDeltaToRowGuideOptions): SnapBlockBoundaryDeltaToRowGuideResult {
  const quarterSnappedDelta = snapBoardUnitDelta(boardUnitDelta, leadingSize, trailingSize, snapSize, minSize);

  if (activeRowTotal <= 0 || pixelsPerBoardUnit <= 0) {
    return { snappedDelta: quarterSnappedDelta, guide: null };
  }

  const thresholdBoardUnits = guideThresholdPixels / pixelsPerBoardUnit;
  const tentativeBoundaryPosition = activeBoundaryStart + boardUnitDelta;
  const candidates = createRowLocalSnapGuideCandidates(
    rows,
    activeRowIndex,
    activeBoundaryStart,
    activeRowTotal,
    leadingSize,
    trailingSize,
  );
  let closestCandidate: RowLocalSnapCandidate | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const guideDelta = candidate.targetPosition - activeBoundaryStart;

    if (!isDeltaWithinSizeConstraints(guideDelta, leadingSize, trailingSize, minSize)) {
      continue;
    }

    const distance = Math.abs(candidate.targetPosition - tentativeBoundaryPosition);

    if (distance > thresholdBoardUnits) {
      continue;
    }

    if (
      distance < closestDistance
      || (distance === closestDistance && closestCandidate !== null && candidate.priority < closestCandidate.priority)
    ) {
      closestCandidate = candidate;
      closestDistance = distance;
    }
  }

  if (!closestCandidate) {
    return { snappedDelta: quarterSnappedDelta, guide: null };
  }

  const guide: RowLocalSnapGuide = closestCandidate.sourceRowIndex === undefined
    ? {
        kind: closestCandidate.kind,
        targetPosition: closestCandidate.targetPosition,
        label: closestCandidate.label,
      }
    : {
        kind: closestCandidate.kind,
        targetPosition: closestCandidate.targetPosition,
        label: closestCandidate.label,
        sourceRowIndex: closestCandidate.sourceRowIndex,
      };

  return {
    snappedDelta: guide.targetPosition - activeBoundaryStart,
    guide,
  };
}

export function resizeBlockBoundary(
  rows: BoardRow[],
  rowIndex: number,
  leftBlockIndex: number,
  leftWidth: number,
  rightWidth: number,
): BoardRow[] {
  const nextRows = structuredClone(rows);
  const row = nextRows[rowIndex];

  if (!row) {
    return nextRows;
  }

  const leftBlock = row.blocks[leftBlockIndex];
  const rightBlock = row.blocks[leftBlockIndex + 1];

  if (!leftBlock || !rightBlock) {
    return nextRows;
  }

  leftBlock.width = leftWidth;
  rightBlock.width = rightWidth;
  return nextRows;
}

export function resizeRowBoundary(rows: BoardRow[], upperRowIndex: number, upperHeight: number, lowerHeight: number): BoardRow[] {
  const nextRows = structuredClone(rows);
  const upperRow = nextRows[upperRowIndex];
  const lowerRow = nextRows[upperRowIndex + 1];

  if (!upperRow || !lowerRow) {
    return nextRows;
  }

  upperRow.height = upperHeight;
  lowerRow.height = lowerHeight;
  return nextRows;
}

export function resizeRowHeight(rows: BoardRow[], rowIndex: number, height: number): BoardRow[] {
  const nextRows = structuredClone(rows);
  const row = nextRows[rowIndex];

  if (!row) {
    return nextRows;
  }

  row.height = height;
  return nextRows;
}
