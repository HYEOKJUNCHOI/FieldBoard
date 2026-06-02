import { Fragment, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import type { BoardBlock, BoardRow } from '../../shared/schema/index.js';
import {
  moveOverlayPreviewByPixelDelta,
  pixelDeltaToBoardUnits,
  snapBlockBoundaryDeltaToRowGuide,
  snapBoardUnitDelta,
  type BlockMovePlacement,
  type BlockSelection,
  type BlankCellInsertDirection,
  type OverlayPreviewState,
  type RowLocalSnapGuide,
  type RowInsertDirection,
} from './index.js';

const resizeSnapSize = 0.25;
const resizeMinSize = 0.25;
const cellMoveBeforeRatio = 1 / 3;
const cellMoveAfterRatio = 2 / 3;

type ResizeDraft =
  | {
      kind: 'block';
      pointerId: number;
      rowIndex: number;
      leftBlockIndex: number;
      startPointerX: number;
      pixelsPerBoardUnit: number;
      leadingSize: number;
      trailingSize: number;
      activeRowTotal: number;
      activeBoundaryStart: number;
      snappedDelta: number;
      activeGuide: RowLocalSnapGuide | null;
    }
  | {
      kind: 'row';
      pointerId: number;
      upperRowIndex: number;
      startPointerY: number;
      pixelsPerBoardUnit: number;
      leadingSize: number;
      trailingSize: number;
      snappedDelta: number;
    };

interface BlankRowPreview {
  anchorRowIndex: number;
  direction: RowInsertDirection;
  blocksPerRow: number;
}

interface OverlayPreviewSize {
  width: number;
  height: number;
}

interface OverlayDragDraft {
  pointerId: number;
  startPointerX: number;
  startPointerY: number;
  startState: OverlayPreviewState;
  photoSize: OverlayPreviewSize;
  overlaySize: OverlayPreviewSize;
}

interface CellDragDraft {
  pointerId: number;
  source: BlockSelection;
  startPointerX: number;
  startPointerY: number;
  isDragging: boolean;
  dropIntent: CellDropIntent | null;
  isOverDeleteZone: boolean;
}

type CellDropIntent =
  | { kind: 'merge'; target: BlockSelection }
  | { kind: 'move'; target: BlockSelection; placement: BlockMovePlacement }
  | { kind: 'seat'; target: BlockSelection };

interface CellDropTarget {
  selection: BlockSelection;
  element: HTMLElement;
}

interface BoardCanvasProps {
  rows: BoardRow[];
  renderedRows: BoardRow[];
  selection: BlockSelection | null;
  blankRowPreview: BlankRowPreview | null;
  overlayPreviewState: OverlayPreviewState;
  onSelectBlock: (selection: BlockSelection) => void;
  onResizeBlockBoundary: (rowIndex: number, leftBlockIndex: number, leftWidth: number, rightWidth: number) => void;
  onResizeRowBoundary: (upperRowIndex: number, upperHeight: number, lowerHeight: number) => void;
  onOverlayPreviewXChange: (x: number) => void;
  onOverlayPreviewYChange: (y: number) => void;
  onInsertBlankCell: (selection: BlockSelection, direction: BlankCellInsertDirection) => void;
  onBlockTextChange: (selection: BlockSelection, text: string) => void;
  onMergeBlocks: (source: BlockSelection, target: BlockSelection) => void;
  onMoveBlock: (source: BlockSelection, target: BlockSelection, placement: BlockMovePlacement) => void;
  onMoveBlockToSeat: (source: BlockSelection, target: BlockSelection) => void;
  onDropDeleteBlock: (selection: BlockSelection) => void;
}

function getRowTemplate(blocks: BoardBlock[]) {
  return blocks.map((block) => `${block.width}fr`).join(' ');
}

function isSelected(selection: BlockSelection | null, rowIndex: number, blockIndex: number) {
  return selection?.rowIndex === rowIndex && selection.blockIndex === blockIndex;
}

function isActiveBlockResize(activeResize: ResizeDraft | null, rowIndex: number, leftBlockIndex: number) {
  return activeResize?.kind === 'block' && activeResize.rowIndex === rowIndex && activeResize.leftBlockIndex === leftBlockIndex;
}

function isActiveRowResize(activeResize: ResizeDraft | null, upperRowIndex: number) {
  return activeResize?.kind === 'row' && activeResize.upperRowIndex === upperRowIndex;
}

function getBoundarySizeLabel(leadingSize: number, trailingSize: number) {
  return `${leadingSize.toFixed(2)} / ${trailingSize.toFixed(2)}`;
}

function getBlockBoundaryPosition(row: BoardRow, leftBlockIndex: number) {
  return row.blocks.slice(0, leftBlockIndex + 1).reduce((sum, block) => sum + block.width, 0);
}

function getBlankPreviewTemplate(blocksPerRow: number) {
  return `repeat(${blocksPerRow}, minmax(0, 1fr))`;
}

function getNextBoardRowElement(rowElement: HTMLElement) {
  let nextElement = rowElement.nextElementSibling;

  while (nextElement instanceof HTMLElement) {
    if (nextElement.classList.contains('board-row') && !nextElement.classList.contains('board-row--ghost')) {
      return nextElement;
    }

    nextElement = nextElement.nextElementSibling;
  }

  return null;
}

function getCellDropTarget(target: Element | null): CellDropTarget | null {
  const cellElement = target instanceof HTMLElement ? target.closest<HTMLElement>('[data-board-cell-drop-target="true"]') : null;

  if (!cellElement) {
    return null;
  }

  const rowIndex = Number.parseInt(cellElement.dataset.rowIndex ?? '', 10);
  const blockIndex = Number.parseInt(cellElement.dataset.blockIndex ?? '', 10);

  if (Number.isNaN(rowIndex) || Number.isNaN(blockIndex)) {
    return null;
  }

  return {
    selection: { rowIndex, blockIndex },
    element: cellElement,
  };
}

function isDeleteDropTarget(target: Element | null) {
  return target instanceof HTMLElement && target.closest('[data-board-delete-zone="true"]') !== null;
}

export function BoardCanvas({
  rows,
  renderedRows,
  selection,
  blankRowPreview,
  overlayPreviewState,
  onSelectBlock,
  onResizeBlockBoundary,
  onResizeRowBoundary,
  onOverlayPreviewXChange,
  onOverlayPreviewYChange,
  onInsertBlankCell,
  onBlockTextChange,
  onMergeBlocks,
  onMoveBlock,
  onMoveBlockToSeat,
  onDropDeleteBlock,
}: BoardCanvasProps) {
  const [activeResize, setActiveResize] = useState<ResizeDraft | null>(null);
  const [activeOverlayDrag, setActiveOverlayDrag] = useState<OverlayDragDraft | null>(null);
  const [activeCellDrag, setActiveCellDrag] = useState<CellDragDraft | null>(null);
  const [editingCell, setEditingCell] = useState<{ rowIndex: number; blockIndex: number; draftText: string } | null>(null);
  const shouldSkipInlineBlurRef = useRef(false);
  const photoPreviewRef = useRef<HTMLDivElement | null>(null);
  const overlayBoardRef = useRef<HTMLDivElement | null>(null);

  const activeSnapGuide = activeResize?.kind === 'block' ? activeResize.activeGuide : null;
  const activeSnapGuideStyle = activeResize?.kind === 'block' && activeSnapGuide
    ? {
        '--board-snap-guide-x': `${(activeSnapGuide.targetPosition / activeResize.activeRowTotal) * 100}%`,
      } as CSSProperties
    : undefined;

  const applyResizeDraft = (event: PointerEvent<HTMLSpanElement>, resizeDraft: ResizeDraft) => {
    if (resizeDraft.kind === 'block') {
      const boardUnitDelta = pixelDeltaToBoardUnits(event.clientX - resizeDraft.startPointerX, resizeDraft.pixelsPerBoardUnit);
      const { snappedDelta, guide } = snapBlockBoundaryDeltaToRowGuide({
        rows,
        activeRowIndex: resizeDraft.rowIndex,
        activeBoundaryStart: resizeDraft.activeBoundaryStart,
        activeRowTotal: resizeDraft.activeRowTotal,
        boardUnitDelta,
        leadingSize: resizeDraft.leadingSize,
        trailingSize: resizeDraft.trailingSize,
        pixelsPerBoardUnit: resizeDraft.pixelsPerBoardUnit,
        snapSize: resizeSnapSize,
        minSize: resizeMinSize,
      });

      onResizeBlockBoundary(
        resizeDraft.rowIndex,
        resizeDraft.leftBlockIndex,
        resizeDraft.leadingSize + snappedDelta,
        resizeDraft.trailingSize - snappedDelta,
      );
      setActiveResize({ ...resizeDraft, snappedDelta, activeGuide: guide });
      return;
    }

    const boardUnitDelta = pixelDeltaToBoardUnits(event.clientY - resizeDraft.startPointerY, resizeDraft.pixelsPerBoardUnit);
    const snappedDelta = snapBoardUnitDelta(
      boardUnitDelta,
      resizeDraft.leadingSize,
      resizeDraft.trailingSize,
      resizeSnapSize,
      resizeMinSize,
    );

    onResizeRowBoundary(resizeDraft.upperRowIndex, resizeDraft.leadingSize + snappedDelta, resizeDraft.trailingSize - snappedDelta);
    setActiveResize({ ...resizeDraft, snappedDelta });
  };

  const handleBlockResizePointerDown = (event: PointerEvent<HTMLSpanElement>, rowIndex: number, leftBlockIndex: number) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const row = rows[rowIndex];
    const leftBlock = row?.blocks[leftBlockIndex];
    const rightBlock = row?.blocks[leftBlockIndex + 1];
    const rowElement = event.currentTarget.closest('.board-row');

    if (!row || !leftBlock || !rightBlock || !(rowElement instanceof HTMLElement)) {
      return;
    }

    const totalRowWidth = row.blocks.reduce((sum, block) => sum + block.width, 0);
    const pixelsPerBoardUnit = rowElement.getBoundingClientRect().width / totalRowWidth;

    if (pixelsPerBoardUnit <= 0) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    setActiveResize({
      kind: 'block',
      pointerId: event.pointerId,
      rowIndex,
      leftBlockIndex,
      startPointerX: event.clientX,
      pixelsPerBoardUnit,
      leadingSize: leftBlock.width,
      trailingSize: rightBlock.width,
      activeRowTotal: totalRowWidth,
      activeBoundaryStart: getBlockBoundaryPosition(row, leftBlockIndex),
      snappedDelta: 0,
      activeGuide: null,
    });
  };

  const handleRowResizePointerDown = (event: PointerEvent<HTMLSpanElement>, upperRowIndex: number) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const upperRow = rows[upperRowIndex];
    const lowerRow = rows[upperRowIndex + 1];
    const upperRowElement = event.currentTarget.closest('.board-row');
    const lowerRowElement = upperRowElement instanceof HTMLElement ? getNextBoardRowElement(upperRowElement) : null;

    if (!upperRow || !lowerRow || !(upperRowElement instanceof HTMLElement) || !(lowerRowElement instanceof HTMLElement)) {
      return;
    }

    const totalRowHeight = upperRowElement.getBoundingClientRect().height + lowerRowElement.getBoundingClientRect().height;
    const pixelsPerBoardUnit = totalRowHeight / (upperRow.height + lowerRow.height);

    if (pixelsPerBoardUnit <= 0) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    setActiveResize({
      kind: 'row',
      pointerId: event.pointerId,
      upperRowIndex,
      startPointerY: event.clientY,
      pixelsPerBoardUnit,
      leadingSize: upperRow.height,
      trailingSize: lowerRow.height,
      snappedDelta: 0,
    });
  };

  const handleResizePointerMove = (event: PointerEvent<HTMLSpanElement>) => {
    if (!activeResize || event.pointerId !== activeResize.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    applyResizeDraft(event, activeResize);
  };

  const handleResizePointerUp = (event: PointerEvent<HTMLSpanElement>) => {
    if (!activeResize || event.pointerId !== activeResize.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    applyResizeDraft(event, activeResize);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    setActiveResize(null);
  };

  const handleResizePointerCancel = (event: PointerEvent<HTMLSpanElement>) => {
    if (!activeResize || event.pointerId !== activeResize.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    setActiveResize(null);
  };

  const getOverlayPreviewMetrics = () => {
    const photoElement = photoPreviewRef.current;
    const overlayElement = overlayBoardRef.current;

    if (!photoElement || !overlayElement) {
      return null;
    }

    const photoRect = photoElement.getBoundingClientRect();
    const overlayRect = overlayElement.getBoundingClientRect();

    if (photoRect.width <= 0 || photoRect.height <= 0 || overlayRect.width <= 0 || overlayRect.height <= 0) {
      return null;
    }

    return {
      photoSize: { width: photoRect.width, height: photoRect.height },
      overlaySize: { width: overlayRect.width, height: overlayRect.height },
    };
  };

  const applyOverlayDragDraft = (event: PointerEvent<HTMLDivElement>, dragDraft: OverlayDragDraft) => {
    const nextState = moveOverlayPreviewByPixelDelta({
      state: dragDraft.startState,
      photoSize: dragDraft.photoSize,
      overlaySize: dragDraft.overlaySize,
      deltaX: event.clientX - dragDraft.startPointerX,
      deltaY: event.clientY - dragDraft.startPointerY,
    });

    onOverlayPreviewXChange(nextState.x);
    onOverlayPreviewYChange(nextState.y);
  };

  const handleOverlayPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    const metrics = getOverlayPreviewMetrics();

    if (!metrics) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setActiveOverlayDrag({
      pointerId: event.pointerId,
      startPointerX: event.clientX,
      startPointerY: event.clientY,
      startState: overlayPreviewState,
      photoSize: metrics.photoSize,
      overlaySize: metrics.overlaySize,
    });
  };

  const handleOverlayPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!activeOverlayDrag || event.pointerId !== activeOverlayDrag.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    applyOverlayDragDraft(event, activeOverlayDrag);
  };

  const handleOverlayPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!activeOverlayDrag || event.pointerId !== activeOverlayDrag.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    applyOverlayDragDraft(event, activeOverlayDrag);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    setActiveOverlayDrag(null);
  };

  const handleOverlayPointerCancel = (event: PointerEvent<HTMLDivElement>) => {
    if (!activeOverlayDrag || event.pointerId !== activeOverlayDrag.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    setActiveOverlayDrag(null);
  };

  if (rows.length === 0) {
    return (
      <section className="board-canvas board-canvas--empty" aria-label="빈 보드 캔버스">
        <p>가로 칸 수와 세로 줄 수를 정한 뒤 보드를 만드세요.</p>
      </section>
    );
  }

  const renderBlankRowPreview = (preview: BlankRowPreview) => {
    const previewStyle: CSSProperties = {
      gridTemplateColumns: getBlankPreviewTemplate(preview.blocksPerRow),
      minHeight: 'calc(var(--board-cell-min-height) * 1)',
    };
    const directionLabel = preview.direction === 'above' ? '위' : '아래';

    return (
      <div
        className="board-row board-row--ghost"
        role="row"
        aria-label={`선택 행 ${directionLabel} 빈칸 ${preview.blocksPerRow}개 미리보기`}
        style={previewStyle}
      >
        {Array.from({ length: preview.blocksPerRow }, (_, blockIndex) => (
          <div className="board-cell board-cell--ghost" role="gridcell" key={`blank-preview-${blockIndex}`}>
            <span className="board-cell__text">빈칸 {blockIndex + 1}</span>
          </div>
        ))}
      </div>
    );
  };

  const renderOverlayBoard = () => {
    const overlayBoardStyle = {
      '--overlay-preview-x': `${overlayPreviewState.x}%`,
      '--overlay-preview-y': `${overlayPreviewState.y}%`,
      '--overlay-preview-scale': overlayPreviewState.scale,
    } as CSSProperties;

    return (
      <div
        className={`composition-preview__board${activeOverlayDrag ? ' composition-preview__board--dragging' : ''}`}
        role="grid"
        aria-label="사진 위 보드 합성 레이어"
        ref={overlayBoardRef}
        style={overlayBoardStyle}
        onPointerDown={handleOverlayPointerDown}
        onPointerMove={handleOverlayPointerMove}
        onPointerUp={handleOverlayPointerUp}
        onPointerCancel={handleOverlayPointerCancel}
      >
        {renderedRows.map((row) => {
          const rowStyle: CSSProperties = {
            gridTemplateColumns: getRowTemplate(row.blocks),
            minHeight: `calc(var(--overlay-board-row-height) * ${row.height})`,
          };

          return (
            <div className="composition-preview__row" role="row" style={rowStyle} key={`overlay-${row.id}`}>
              {row.blocks.map((block) => {
                const blockStyle: CSSProperties = {
                  fontSize: `calc(${block.style.fontSize}px * var(--overlay-cell-font-scale))`,
                  fontWeight: block.style.fontWeight,
                  textAlign: block.style.align,
                };

                return (
                  <div className="composition-preview__cell" role="gridcell" style={blockStyle} key={`overlay-${block.id}`}>
                    <span>{block.type === 'input' ? (block.text.trim() ? block.text : '값 비어 있음') : block.text}</span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  };

  const isEditingTarget = (target: EventTarget | null) => {
    return target instanceof HTMLInputElement
      || target instanceof HTMLTextAreaElement
      || (target instanceof HTMLElement && target.isContentEditable);
  };

  const commitInlineEdit = (target: BlockSelection, text: string) => {
    shouldSkipInlineBlurRef.current = true;
    onBlockTextChange(target, text);
    setEditingCell(null);
  };

  const cancelInlineEdit = () => {
    shouldSkipInlineBlurRef.current = true;
    setEditingCell(null);
  };

  const getActiveCellDragTarget = (event: PointerEvent<HTMLElement>, dragDraft: CellDragDraft) => {
    const elementAtPointer = window.document.elementFromPoint(event.clientX, event.clientY);
    const dropTarget = getCellDropTarget(elementAtPointer);
    let dropIntent: CellDropIntent | null = null;

    if (
      dropTarget
      && (
        dropTarget.selection.rowIndex !== dragDraft.source.rowIndex
        || dropTarget.selection.blockIndex !== dragDraft.source.blockIndex
      )
    ) {
      const targetRect = dropTarget.element.getBoundingClientRect();

      if (dropTarget.selection.rowIndex !== dragDraft.source.rowIndex) {
        dropIntent = { kind: 'seat', target: dropTarget.selection };
      } else if (targetRect.width > 0) {
        const pointerXRatio = (event.clientX - targetRect.left) / targetRect.width;

        if (pointerXRatio < cellMoveBeforeRatio) {
          dropIntent = { kind: 'move', target: dropTarget.selection, placement: 'before' };
        } else if (pointerXRatio > cellMoveAfterRatio) {
          dropIntent = { kind: 'move', target: dropTarget.selection, placement: 'after' };
        } else {
          dropIntent = { kind: 'merge', target: dropTarget.selection };
        }
      }
    }

    return {
      dropIntent,
      isOverDeleteZone: isDeleteDropTarget(elementAtPointer),
    };
  };

  const handleCellPointerDown = (event: PointerEvent<HTMLDivElement>, source: BlockSelection, isInlineEditing: boolean) => {
    if (event.button !== 0 || activeResize || activeOverlayDrag || isInlineEditing || isEditingTarget(event.target)) {
      return;
    }

    if (event.target instanceof HTMLElement && event.target.closest('.board-resize-handle')) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    setActiveCellDrag({
      pointerId: event.pointerId,
      source,
      startPointerX: event.clientX,
      startPointerY: event.clientY,
      isDragging: false,
      dropIntent: null,
      isOverDeleteZone: false,
    });
  };

  const handleCellPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!activeCellDrag || event.pointerId !== activeCellDrag.pointerId) {
      return;
    }

    const pointerDelta = Math.hypot(event.clientX - activeCellDrag.startPointerX, event.clientY - activeCellDrag.startPointerY);

    if (!activeCellDrag.isDragging && pointerDelta < 6) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const { dropIntent, isOverDeleteZone } = getActiveCellDragTarget(event, activeCellDrag);
    setActiveCellDrag({ ...activeCellDrag, isDragging: true, dropIntent, isOverDeleteZone });
  };

  const handleCellPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!activeCellDrag || event.pointerId !== activeCellDrag.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (!activeCellDrag.isDragging) {
      setActiveCellDrag(null);
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const { dropIntent, isOverDeleteZone } = getActiveCellDragTarget(event, activeCellDrag);

    if (isOverDeleteZone) {
      onDropDeleteBlock(activeCellDrag.source);
    } else if (dropIntent?.kind === 'seat') {
      onMoveBlockToSeat(activeCellDrag.source, dropIntent.target);
    } else if (dropIntent?.kind === 'merge') {
      onMergeBlocks(activeCellDrag.source, dropIntent.target);
    } else if (dropIntent?.kind === 'move') {
      onMoveBlock(activeCellDrag.source, dropIntent.target, dropIntent.placement);
    }

    setActiveCellDrag(null);
  };

  const handleCellPointerCancel = (event: PointerEvent<HTMLDivElement>) => {
    if (!activeCellDrag || event.pointerId !== activeCellDrag.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    setActiveCellDrag(null);
  };

  return (
    <section className="board-canvas" aria-label="로컬 보드 캔버스">
      <div className="board-canvas__workspace">
        <div className="board-canvas__editor">
          <div className="board-canvas__chrome">
            <span>FIELD BOARD</span>
            <span>{rows.length}행</span>
          </div>

          <div
            className={`board-cell-drop-zone${activeCellDrag?.isDragging ? ' board-cell-drop-zone--visible' : ''}${activeCellDrag?.isOverDeleteZone ? ' board-cell-drop-zone--active' : ''}`}
            data-board-delete-zone="true"
            aria-live="polite"
          >
            <span>삭제</span>
            <small>{activeCellDrag?.isDragging ? '여기에 놓으면 칸이 비워집니다' : '셀을 잡고 다른 위치로 옮기세요'}</small>
          </div>

          <div
            className={`board-table${activeResize ? ' board-table--resizing' : ''}${activeCellDrag?.isDragging ? ' board-table--cell-dragging' : ''}`}
            role="grid"
            aria-label="현장 보드 미리보기"
          >
            {activeSnapGuide && activeSnapGuideStyle && (
              <div
                className={`board-snap-guide board-snap-guide--${activeSnapGuide.kind}`}
                style={activeSnapGuideStyle}
                aria-hidden="true"
              >
                <span>{activeSnapGuide.label}</span>
              </div>
            )}
            {rows.map((row, rowIndex) => {
              const nextRow = rows[rowIndex + 1];
              const rowStyle: CSSProperties = {
                gridTemplateColumns: getRowTemplate(row.blocks),
                minHeight: `calc(var(--board-cell-min-height) * ${row.height})`,
              };
              const previewForRow = blankRowPreview?.anchorRowIndex === rowIndex ? blankRowPreview : null;
              const showPreviewAbove = previewForRow?.direction === 'above';
              const showPreviewBelow = previewForRow?.direction === 'below';

              return (
                <Fragment key={row.id}>
                  {showPreviewAbove && previewForRow && renderBlankRowPreview(previewForRow)}
                  <div className="board-row" role="row" style={rowStyle}>
                    {row.blocks.map((block, blockIndex) => {
                      const renderedBlock = renderedRows[rowIndex]?.blocks[blockIndex] ?? block;
                      const nextBlock = row.blocks[blockIndex + 1];
                      const selected = isSelected(selection, rowIndex, blockIndex);
                      const isInlineEditing = editingCell?.rowIndex === rowIndex && editingCell.blockIndex === blockIndex;
                      const isDraggingSource = activeCellDrag?.isDragging
                        && activeCellDrag.source.rowIndex === rowIndex
                        && activeCellDrag.source.blockIndex === blockIndex;
                      const isMergeTarget = activeCellDrag?.isDragging
                        && (activeCellDrag.dropIntent?.kind === 'merge' || activeCellDrag.dropIntent?.kind === 'seat')
                        && activeCellDrag.dropIntent.target.rowIndex === rowIndex
                        && activeCellDrag.dropIntent.target.blockIndex === blockIndex;
                      const activeMovePlacement = activeCellDrag?.isDragging
                        && activeCellDrag.dropIntent?.kind === 'move'
                        && activeCellDrag.dropIntent.target.rowIndex === rowIndex
                        && activeCellDrag.dropIntent.target.blockIndex === blockIndex
                        ? activeCellDrag.dropIntent.placement
                        : null;
                      const cellLabel = `R${rowIndex + 1} C${blockIndex + 1}`;
                      const hasRenderedValue = renderedBlock.text.trim().length > 0;
                      const displayText = block.type === 'input'
                        ? (hasRenderedValue ? renderedBlock.text : '값 비어 있음')
                        : block.text;
                      const blockStyle: CSSProperties = {
                        backgroundColor: block.style.backgroundColor,
                        borderColor: block.style.borderColor,
                        color: block.style.color,
                        fontSize: `${block.style.fontSize}px`,
                        fontWeight: block.style.fontWeight,
                        textAlign: block.style.align,
                      };

                      const handleSelect = () => onSelectBlock({ rowIndex, blockIndex });

                      const handleStartInlineEdit = () => {
                        shouldSkipInlineBlurRef.current = false;
                        onSelectBlock({ rowIndex, blockIndex });
                        setEditingCell({ rowIndex, blockIndex, draftText: block.text });
                      };

                      const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
                        if (isEditingTarget(event.target)) {
                          return;
                        }

                        const isBlankInsertShortcut = event.ctrlKey
                          && event.altKey
                          && !event.shiftKey
                          && !event.metaKey
                          && (event.key === 'ArrowLeft' || event.key === 'ArrowRight');

                        if (isBlankInsertShortcut) {
                          event.preventDefault();
                          event.stopPropagation();
                          onInsertBlankCell(
                            { rowIndex, blockIndex },
                            event.key === 'ArrowLeft' ? 'left' : 'right',
                          );
                          return;
                        }

                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          handleSelect();
                        }
                      };

                      const handleInlineEditorKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
                        if (event.key === 'Escape') {
                          event.preventDefault();
                          event.stopPropagation();
                          cancelInlineEdit();
                          return;
                        }

                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault();
                          event.stopPropagation();
                          commitInlineEdit({ rowIndex, blockIndex }, event.currentTarget.value);
                        }
                      };

                      return (
                        <div
                          className={`board-cell${selected ? ' board-cell--selected' : ''}${block.type === 'input' && !hasRenderedValue ? ' board-cell--missing-value' : ''}${isDraggingSource ? ' board-cell--dragging' : ''}${isMergeTarget ? ' board-cell--merge-target' : ''}${activeMovePlacement === 'before' ? ' board-cell--move-before-target' : ''}${activeMovePlacement === 'after' ? ' board-cell--move-after-target' : ''}`}
                          role="gridcell"
                          aria-label={`${cellLabel} 셀`}
                          aria-selected={selected}
                          tabIndex={0}
                          key={block.id}
                          style={blockStyle}
                          data-board-cell-drop-target="true"
                          data-row-index={rowIndex}
                          data-block-index={blockIndex}
                          onClick={handleSelect}
                          onDoubleClick={handleStartInlineEdit}
                          onKeyDown={handleKeyDown}
                          onPointerDown={(event) => handleCellPointerDown(event, { rowIndex, blockIndex }, isInlineEditing)}
                          onPointerMove={handleCellPointerMove}
                          onPointerUp={handleCellPointerUp}
                          onPointerCancel={handleCellPointerCancel}
                        >
                          {selected && <span className="board-cell__position">{cellLabel}</span>}
                          {selected && (
                            <>
                              <span className="board-cell__handle board-cell__handle--nw" aria-hidden="true" />
                              <span className="board-cell__handle board-cell__handle--ne" aria-hidden="true" />
                              <span className="board-cell__handle board-cell__handle--sw" aria-hidden="true" />
                              <span className="board-cell__handle board-cell__handle--se" aria-hidden="true" />
                            </>
                          )}
                          {isInlineEditing ? (
                            <textarea
                              className="board-cell__inline-editor"
                              value={editingCell.draftText}
                              rows={1}
                              autoFocus
                              aria-label={`${cellLabel} 텍스트 직접 편집`}
                              onClick={(event) => event.stopPropagation()}
                              onDoubleClick={(event) => event.stopPropagation()}
                              onChange={(event) => setEditingCell({ rowIndex, blockIndex, draftText: event.currentTarget.value })}
                              onKeyDown={handleInlineEditorKeyDown}
                              onBlur={(event) => {
                                if (shouldSkipInlineBlurRef.current) {
                                  shouldSkipInlineBlurRef.current = false;
                                  return;
                                }

                                commitInlineEdit({ rowIndex, blockIndex }, event.currentTarget.value);
                              }}
                            />
                          ) : (
                            <span className="board-cell__text">{displayText}</span>
                          )}
                          {nextBlock && (
                            <span
                              className={`board-resize-handle board-resize-handle--block${
                                isActiveBlockResize(activeResize, rowIndex, blockIndex) ? ' board-resize-handle--active' : ''
                              }`}
                              aria-hidden="true"
                              data-resize-guide={getBoundarySizeLabel(block.width, nextBlock.width)}
                              onClick={(event) => event.stopPropagation()}
                              onPointerDown={(event) => handleBlockResizePointerDown(event, rowIndex, blockIndex)}
                              onPointerMove={handleResizePointerMove}
                              onPointerUp={handleResizePointerUp}
                              onPointerCancel={handleResizePointerCancel}
                            />
                          )}
                        </div>
                      );
                    })}
                    {nextRow && (
                      <span
                        className={`board-resize-handle board-resize-handle--row${
                          isActiveRowResize(activeResize, rowIndex) ? ' board-resize-handle--active' : ''
                        }`}
                        aria-hidden="true"
                        data-resize-guide={getBoundarySizeLabel(row.height, nextRow.height)}
                        onClick={(event) => event.stopPropagation()}
                        onPointerDown={(event) => handleRowResizePointerDown(event, rowIndex)}
                        onPointerMove={handleResizePointerMove}
                        onPointerUp={handleResizePointerUp}
                        onPointerCancel={handleResizePointerCancel}
                      />
                    )}
                  </div>
                  {showPreviewBelow && previewForRow && renderBlankRowPreview(previewForRow)}
                </Fragment>
              );
            })}
          </div>
        </div>

        <aside className="composition-preview" id="mobile-photo-panel" data-mobile-panel="photo" aria-label="사진 합성 위치 미리보기">
          <div className="composition-preview__header">
            <p className="section-kicker">Photo overlay rig</p>
            <h3>휴대폰 사진 위 보드</h3>
            <p>현재 보드를 한 장의 레이어로 올려 드래그로 위치를 맞춥니다.</p>
          </div>

          <div className="composition-preview__phone" aria-label="휴대폰 형태 사진 자리">
            <div className="composition-preview__photo" ref={photoPreviewRef}>
              <span className="composition-preview__photo-label">현장 사진 자리</span>
              {renderOverlayBoard()}
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
