import { useCallback, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';

import { moveOverlayPreviewByPixelDelta } from './index.js';

type Align = 'left' | 'center' | 'right';
type PreviewCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
type PreviewPlacement = PreviewCorner | 'custom';

interface CellStyle {
  backgroundColor: string;
  color: string;
  bold: boolean;
  align: Align;
}

interface BoardCell {
  id: string;
  text: string;
  rowSpan: number;
  colSpan: number;
  hidden: boolean;
  mergedFrom?: string;
  style: CellStyle;
}

interface EditorState {
  rows: number;
  columns: number;
  cells: BoardCell[][];
  previewCorner: PreviewPlacement;
  previewX: number;
  previewY: number;
  previewScale: number;
}

interface HistoryState {
  past: EditorState[];
  present: EditorState;
  future: EditorState[];
}

interface CellPoint {
  rowIndex: number;
  columnIndex: number;
}

interface PreviewDragDraft {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startPreviewX: number;
  startPreviewY: number;
  photoSize: PreviewSize;
  overlaySize: PreviewSize;
}

interface PreviewSize {
  width: number;
  height: number;
}

interface CellInsertPreview {
  rowIndex: number;
  columnIndex: number;
  placement: 'before' | 'after';
}

interface CellMoveDragDraft {
  pointerId: number;
  source: CellPoint;
  startClientX: number;
  startClientY: number;
  clientX: number;
  clientY: number;
  started: boolean;
}

type SelectionKey = string;

const defaultRows = 4;
const defaultColumns = 4;
const defaultCellStyle: CellStyle = {
  backgroundColor: '#ffffff',
  color: '#111827',
  bold: false,
  align: 'center',
};

const cornerLabels: Record<PreviewCorner, string> = {
  'top-left': '상좌',
  'top-right': '상우',
  'bottom-left': '하좌',
  'bottom-right': '하우',
};

const previewCornerPositions: Record<PreviewCorner, { x: number; y: number }> = {
  'top-left': { x: 34, y: 28 },
  'top-right': { x: 66, y: 28 },
  'bottom-left': { x: 34, y: 72 },
  'bottom-right': { x: 66, y: 72 },
};

const alignLabels: Record<Align, string> = {
  left: '좌',
  center: '중',
  right: '우',
};

function createCell(rowIndex: number, columnIndex: number, text = ''): BoardCell {
  return {
    id: `cell-${rowIndex + 1}-${columnIndex + 1}-${Math.random().toString(36).slice(2, 8)}`,
    text,
    rowSpan: 1,
    colSpan: 1,
    hidden: false,
    style: { ...defaultCellStyle },
  };
}

function createBoard(rows: number, columns: number): EditorState {
  return {
    rows,
    columns,
    cells: Array.from({ length: rows }, (_, rowIndex) => (
      Array.from({ length: columns }, (_, columnIndex) => createCell(rowIndex, columnIndex, `R${rowIndex + 1} C${columnIndex + 1}`))
    )),
    previewCorner: 'bottom-right',
    previewX: previewCornerPositions['bottom-right'].x,
    previewY: previewCornerPositions['bottom-right'].y,
    previewScale: 0.5,
  };
}

function cloneState(state: EditorState): EditorState {
  return structuredClone(state);
}

function getSelectionKey(point: CellPoint): SelectionKey {
  return `${point.rowIndex}:${point.columnIndex}`;
}

function parseSelectionKey(key: SelectionKey): CellPoint {
  const [rowIndex, columnIndex] = key.split(':').map((value) => Number.parseInt(value, 10));
  return { rowIndex, columnIndex };
}

function getRangeSelection(start: CellPoint, end: CellPoint): SelectionKey[] {
  const minRow = Math.min(start.rowIndex, end.rowIndex);
  const maxRow = Math.max(start.rowIndex, end.rowIndex);
  const minColumn = Math.min(start.columnIndex, end.columnIndex);
  const maxColumn = Math.max(start.columnIndex, end.columnIndex);
  const keys: SelectionKey[] = [];

  for (let rowIndex = minRow; rowIndex <= maxRow; rowIndex += 1) {
    for (let columnIndex = minColumn; columnIndex <= maxColumn; columnIndex += 1) {
      keys.push(getSelectionKey({ rowIndex, columnIndex }));
    }
  }

  return keys;
}

function clampGridValue(value: number) {
  if (Number.isNaN(value)) {
    return 1;
  }

  return Math.min(Math.max(value, 1), 12);
}

function getMutableSelectedCells(state: EditorState, selectedKeys: Set<SelectionKey>) {
  return Array.from(selectedKeys)
    .map(parseSelectionKey)
    .map(({ rowIndex, columnIndex }) => state.cells[rowIndex]?.[columnIndex])
    .filter((cell): cell is BoardCell => Boolean(cell) && !cell.hidden);
}

function applyToSelectedCells(state: EditorState, selectedKeys: Set<SelectionKey>, updater: (cell: BoardCell) => void) {
  const nextState = cloneState(state);
  getMutableSelectedCells(nextState, selectedKeys).forEach(updater);
  return nextState;
}

function getCellRect(element: HTMLElement): CellPoint | null {
  const rowIndex = Number.parseInt(element.dataset.rowIndex ?? '', 10);
  const columnIndex = Number.parseInt(element.dataset.columnIndex ?? '', 10);

  if (Number.isNaN(rowIndex) || Number.isNaN(columnIndex)) {
    return null;
  }

  return { rowIndex, columnIndex };
}

function shouldRefreshGeneratedCellText(text: string) {
  return /^R\d+\s+C\d+$/.test(text) || text === '새 셀';
}

function reindexBoard(state: EditorState): EditorState {
  const nextState = cloneState(state);
  const nextColumnCount = Math.max(...nextState.cells.map((row) => row.length), 1);

  nextState.rows = nextState.cells.length;
  nextState.columns = nextColumnCount;
  nextState.cells = nextState.cells.map((row, rowIndex) => row.map((cell, columnIndex) => ({
    ...cell,
    id: `cell-${rowIndex + 1}-${columnIndex + 1}-${cell.id.split('-').at(-1) ?? 'local'}`,
    text: shouldRefreshGeneratedCellText(cell.text) ? `R${rowIndex + 1} C${columnIndex + 1}` : cell.text,
  })));

  return nextState;
}

function insertColumnAt(state: EditorState, preview: CellInsertPreview): EditorState {
  const targetRow = state.cells[preview.rowIndex];

  if (!targetRow) {
    return state;
  }

  const insertionIndex = preview.placement === 'before' ? preview.columnIndex : preview.columnIndex + 1;
  const nextState = cloneState(state);

  nextState.cells = nextState.cells.map((row, rowIndex) => {
    const boundedIndex = Math.min(Math.max(insertionIndex, 0), row.length);
    const nextRow = [...row];

    nextRow.splice(boundedIndex, 0, createCell(rowIndex, boundedIndex, '새 셀'));

    return nextRow;
  });

  return reindexBoard(nextState);
}

function moveCellToInsertPreview(state: EditorState, source: CellPoint, preview: CellInsertPreview): EditorState {
  if (source.rowIndex !== preview.rowIndex) {
    return state;
  }

  const sourceRow = state.cells[source.rowIndex];

  if (!sourceRow || sourceRow.length <= 1) {
    return state;
  }

  const sourceCell = sourceRow[source.columnIndex];

  if (!sourceCell || sourceCell.hidden) {
    return state;
  }

  const nextState = cloneState(state);
  const row = [...nextState.cells[source.rowIndex]];
  const [movingCell] = row.splice(source.columnIndex, 1);

  if (!movingCell) {
    return state;
  }

  let insertionIndex = preview.placement === 'before' ? preview.columnIndex : preview.columnIndex + 1;

  if (source.columnIndex < insertionIndex) {
    insertionIndex -= 1;
  }

  insertionIndex = Math.min(Math.max(insertionIndex, 0), row.length);

  if (insertionIndex === source.columnIndex) {
    return state;
  }

  row.splice(insertionIndex, 0, movingCell);
  nextState.cells[source.rowIndex] = row;

  return reindexBoard(nextState);
}

function deleteSelectedCellsByDrop(state: EditorState, selectedKeys: Set<SelectionKey>): EditorState {
  if (selectedKeys.size === 0) {
    return state;
  }

  const nextState = cloneState(state);
  const selectedByRow = new Map<number, Set<number>>();

  selectedKeys.forEach((key) => {
    const point = parseSelectionKey(key);
    const columns = selectedByRow.get(point.rowIndex) ?? new Set<number>();
    columns.add(point.columnIndex);
    selectedByRow.set(point.rowIndex, columns);
  });

  selectedByRow.forEach((columns, rowIndex) => {
    const row = nextState.cells[rowIndex];

    if (!row || row.length <= 1 || row.length - columns.size < 1) {
      return;
    }

    nextState.cells[rowIndex] = row.filter((_, columnIndex) => !columns.has(columnIndex));
  });

  return reindexBoard(nextState);
}

function equalizeRowsBySelection(state: EditorState, selectedKeys: Set<SelectionKey>): EditorState {
  if (selectedKeys.size === 0) {
    return state;
  }

  const selectedRows = new Set(Array.from(selectedKeys).map((key) => parseSelectionKey(key).rowIndex));
  const nextState = cloneState(state);

  nextState.cells = nextState.cells.map((row, rowIndex) => {
    if (!selectedRows.has(rowIndex)) {
      return row;
    }

    return row.map((cell) => ({
      ...cell,
      colSpan: 1,
      rowSpan: 1,
      hidden: false,
      mergedFrom: undefined,
    }));
  });

  return reindexBoard(nextState);
}

function isEditingTarget(target: EventTarget | null) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

export function BoardEditor() {
  const [rowInput, setRowInput] = useState(defaultRows);
  const [columnInput, setColumnInput] = useState(defaultColumns);
  const [history, setHistory] = useState<HistoryState>(() => ({
    past: [],
    present: createBoard(defaultRows, defaultColumns),
    future: [],
  }));
  const [selection, setSelection] = useState<Set<SelectionKey>>(() => new Set([getSelectionKey({ rowIndex: 0, columnIndex: 0 })]));
  const [anchorCell, setAnchorCell] = useState<CellPoint>({ rowIndex: 0, columnIndex: 0 });
  const [isCellSourceDragging, setIsCellSourceDragging] = useState(false);
  const [cellInsertPreview, setCellInsertPreview] = useState<CellInsertPreview | null>(null);
  const [cellMoveDragDraft, setCellMoveDragDraft] = useState<CellMoveDragDraft | null>(null);
  const [isTrashHot, setIsTrashHot] = useState(false);
  const [previewDragDraft, setPreviewDragDraft] = useState<PreviewDragDraft | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const previewPhotoRef = useRef<HTMLDivElement | null>(null);
  const previewOverlayRef = useRef<HTMLDivElement | null>(null);
  const suppressNextCellClickRef = useRef(false);

  const state = history.present;
  const selectedCount = selection.size;
  const firstSelectedCell = useMemo(() => getMutableSelectedCells(state, selection)[0] ?? null, [selection, state]);
  const previewClassName = `block-board-preview__overlay${previewDragDraft ? ' block-board-preview__overlay--dragging' : ''}`;
  const movingCell = cellMoveDragDraft ? state.cells[cellMoveDragDraft.source.rowIndex]?.[cellMoveDragDraft.source.columnIndex] : null;

  const commit = useCallback((recipe: (current: EditorState) => EditorState, nextSelection?: Set<SelectionKey>, nextAnchor?: CellPoint) => {
    setHistory((currentHistory) => {
      const nextPresent = recipe(currentHistory.present);

      return {
        past: [...currentHistory.past, cloneState(currentHistory.present)].slice(-80),
        present: nextPresent,
        future: [],
      };
    });

    if (nextSelection) {
      setSelection(nextSelection);
    }

    if (nextAnchor) {
      setAnchorCell(nextAnchor);
    }
  }, []);

  const undo = useCallback(() => {
    setHistory((currentHistory) => {
      const previous = currentHistory.past.at(-1);

      if (!previous) {
        return currentHistory;
      }

      return {
        past: currentHistory.past.slice(0, -1),
        present: previous,
        future: [cloneState(currentHistory.present), ...currentHistory.future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory((currentHistory) => {
      const next = currentHistory.future[0];

      if (!next) {
        return currentHistory;
      }

      return {
        past: [...currentHistory.past, cloneState(currentHistory.present)],
        present: next,
        future: currentHistory.future.slice(1),
      };
    });
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (isEditingTarget(event.target)) {
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && event.shiftKey) {
      event.preventDefault();
      redo();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      undo();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      redo();
      return;
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      commit((current) => applyToSelectedCells(current, selection, (cell) => {
        cell.text = '';
      }));
    }
  };

  const handleCreateBoard = () => {
    const nextRows = clampGridValue(rowInput);
    const nextColumns = clampGridValue(columnInput);
    const nextSelection = new Set([getSelectionKey({ rowIndex: 0, columnIndex: 0 })]);
    commit(() => createBoard(nextRows, nextColumns), nextSelection, { rowIndex: 0, columnIndex: 0 });
  };

  const handleCellClick = (event: MouseEvent<HTMLDivElement>, point: CellPoint) => {
    if (suppressNextCellClickRef.current) {
      suppressNextCellClickRef.current = false;
      return;
    }

    const key = getSelectionKey(point);

    if (event.shiftKey) {
      const rangeSelection = new Set(getRangeSelection(anchorCell, point));
      setSelection(rangeSelection);
      return;
    }

    if (event.ctrlKey || event.metaKey) {
      const nextSelection = new Set(selection);

      if (nextSelection.has(key) && nextSelection.size > 1) {
        nextSelection.delete(key);
      } else {
        nextSelection.add(key);
      }

      setSelection(nextSelection);
      setAnchorCell(point);
      return;
    }

    setSelection(new Set([key]));
    setAnchorCell(point);
  };

  const handleCellPointerDown = (event: PointerEvent<HTMLDivElement>, point: CellPoint) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }

    const key = getSelectionKey(point);

    if (!selection.has(key)) {
      setSelection(new Set([key]));
      setAnchorCell(point);
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    setCellMoveDragDraft({
      pointerId: event.pointerId,
      source: point,
      startClientX: event.clientX,
      startClientY: event.clientY,
      clientX: event.clientX,
      clientY: event.clientY,
      started: false,
    });
  };

  const handleCellPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!cellMoveDragDraft || event.pointerId !== cellMoveDragDraft.pointerId) {
      return;
    }

    const deltaX = event.clientX - cellMoveDragDraft.startClientX;
    const deltaY = event.clientY - cellMoveDragDraft.startClientY;
    const started = cellMoveDragDraft.started || Math.hypot(deltaX, deltaY) >= 4;

    setCellMoveDragDraft({ ...cellMoveDragDraft, clientX: event.clientX, clientY: event.clientY, started });

    if (!started) {
      return;
    }

    event.preventDefault();
    setIsTrashHot(isPointerNearTrash(event.clientX, event.clientY));
    setCellInsertPreview(getCellInsertPreview(event.clientX, event.clientY));
  };

  const clearCellMoveDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (cellMoveDragDraft?.started) {
      suppressNextCellClickRef.current = true;

      const preview = getCellInsertPreview(event.clientX, event.clientY) ?? cellInsertPreview;
      const sourceKey = getSelectionKey(cellMoveDragDraft.source);
      const dragSelection = selection.has(sourceKey) ? selection : new Set([sourceKey]);

      if (isTrashHot) {
        commit((current) => deleteSelectedCellsByDrop(current, dragSelection), new Set([getSelectionKey({ rowIndex: 0, columnIndex: 0 })]), { rowIndex: 0, columnIndex: 0 });
      } else if (preview) {
        const insertionIndex = preview.placement === 'before' ? preview.columnIndex : preview.columnIndex + 1;
        const nextColumnIndex = cellMoveDragDraft.source.columnIndex < insertionIndex ? insertionIndex - 1 : insertionIndex;
        const nextPoint = { rowIndex: preview.rowIndex, columnIndex: Math.max(0, nextColumnIndex) };
        commit((current) => moveCellToInsertPreview(current, cellMoveDragDraft.source, preview), new Set([getSelectionKey(nextPoint)]), nextPoint);
      }
    }

    setCellMoveDragDraft(null);
    setCellInsertPreview(null);
    setIsTrashHot(false);
  };

  const handleCellTextChange = (point: CellPoint, text: string) => {
    const key = getSelectionKey(point);
    commit((current) => {
      const nextState = cloneState(current);
      const cell = nextState.cells[point.rowIndex]?.[point.columnIndex];

      if (cell && !cell.hidden) {
        cell.text = text;
      }

      return nextState;
    }, new Set([key]), point);
  };

  const handleStyleChange = (style: Partial<CellStyle>) => {
    if (selection.size === 0) {
      return;
    }

    commit((current) => applyToSelectedCells(current, selection, (cell) => {
      cell.style = { ...cell.style, ...style };
    }));
  };

  const handleMerge = () => {
    if (selection.size < 2) {
      return;
    }

    const points = Array.from(selection).map(parseSelectionKey);
    const minRow = Math.min(...points.map((point) => point.rowIndex));
    const maxRow = Math.max(...points.map((point) => point.rowIndex));
    const minColumn = Math.min(...points.map((point) => point.columnIndex));
    const maxColumn = Math.max(...points.map((point) => point.columnIndex));
    const requiredKeys = new Set(getRangeSelection({ rowIndex: minRow, columnIndex: minColumn }, { rowIndex: maxRow, columnIndex: maxColumn }));

    if (requiredKeys.size !== selection.size || Array.from(requiredKeys).some((key) => !selection.has(key))) {
      return;
    }

    const anchor = { rowIndex: minRow, columnIndex: minColumn };
    const anchorKey = getSelectionKey(anchor);

    commit((current) => {
      const nextState = cloneState(current);
      const anchorCell = nextState.cells[minRow]?.[minColumn];

      if (!anchorCell) {
        return current;
      }

      anchorCell.rowSpan = maxRow - minRow + 1;
      anchorCell.colSpan = maxColumn - minColumn + 1;
      anchorCell.text = points
        .map((point) => nextState.cells[point.rowIndex]?.[point.columnIndex]?.text.trim())
        .filter(Boolean)
        .join(' / ');

      requiredKeys.forEach((key) => {
        const point = parseSelectionKey(key);
        const cell = nextState.cells[point.rowIndex]?.[point.columnIndex];

        if (!cell || key === anchorKey) {
          return;
        }

        cell.hidden = true;
        cell.mergedFrom = anchorKey;
      });

      return nextState;
    }, new Set([anchorKey]), anchor);
  };

  const handleSplit = () => {
    const selectedCell = firstSelectedCell;

    if (!selectedCell || (selectedCell.rowSpan === 1 && selectedCell.colSpan === 1)) {
      return;
    }

    const anchorPoint = parseSelectionKey(Array.from(selection)[0]);
    const anchorKey = getSelectionKey(anchorPoint);

    commit((current) => {
      const nextState = cloneState(current);
      const anchorCell = nextState.cells[anchorPoint.rowIndex]?.[anchorPoint.columnIndex];

      if (!anchorCell) {
        return current;
      }

      for (let rowIndex = anchorPoint.rowIndex; rowIndex < anchorPoint.rowIndex + anchorCell.rowSpan; rowIndex += 1) {
        for (let columnIndex = anchorPoint.columnIndex; columnIndex < anchorPoint.columnIndex + anchorCell.colSpan; columnIndex += 1) {
          const cell = nextState.cells[rowIndex]?.[columnIndex];

          if (!cell || getSelectionKey({ rowIndex, columnIndex }) === anchorKey) {
            continue;
          }

          cell.hidden = false;
          cell.mergedFrom = undefined;
          cell.text = '';
          cell.rowSpan = 1;
          cell.colSpan = 1;
        }
      }

      anchorCell.rowSpan = 1;
      anchorCell.colSpan = 1;

      return nextState;
    });
  };

  const getCellInsertPreview = (clientX: number, clientY: number): CellInsertPreview | null => {
    const element = document.elementFromPoint(clientX, clientY);
    const target = element instanceof HTMLElement ? element.closest<HTMLElement>('[data-board-cell="true"]') : null;
    const point = target ? getCellRect(target) : null;

    if (!target || !point) {
      return null;
    }

    const rect = target.getBoundingClientRect();

    if (rect.width <= 0) {
      return null;
    }

    return {
      ...point,
      placement: clientX < rect.left + (rect.width / 2) ? 'before' : 'after',
    };
  };

  const clearCellSourceDragState = () => {
    setIsCellSourceDragging(false);
    setCellInsertPreview(null);
    setIsTrashHot(false);
    editorRef.current?.removeAttribute('data-add-hover');
  };

  const handleSourcePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    setIsCellSourceDragging(true);
  };

  const handleSourcePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (!isCellSourceDragging) {
      return;
    }

    const preview = getCellInsertPreview(event.clientX, event.clientY);

    setIsTrashHot(isPointerNearTrash(event.clientX, event.clientY));
    setCellInsertPreview(preview);

    if (preview) {
      editorRef.current?.setAttribute('data-add-hover', 'true');
    } else {
      editorRef.current?.removeAttribute('data-add-hover');
    }
  };

  const handleSourcePointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const preview = getCellInsertPreview(event.clientX, event.clientY) ?? cellInsertPreview;

    if (!isTrashHot && preview) {
      const insertedColumnIndex = preview.placement === 'before' ? preview.columnIndex : preview.columnIndex + 1;
      const nextPoint = { rowIndex: preview.rowIndex, columnIndex: insertedColumnIndex };
      commit((current) => insertColumnAt(current, preview), new Set([getSelectionKey(nextPoint)]), nextPoint);
    }

    clearCellSourceDragState();
  };

  const isPointerNearTrash = (x: number, y: number) => {
    const trash = document.querySelector<HTMLElement>('[data-trash-zone="true"]');

    if (!trash) {
      return false;
    }

    const rect = trash.getBoundingClientRect();
    const hotPadding = 42;

    return x >= rect.left - hotPadding && x <= rect.right + hotPadding && y >= rect.top - hotPadding && y <= rect.bottom + hotPadding;
  };

  const handleEqualizeSelection = () => {
    if (selection.size === 0) {
      return;
    }

    commit((current) => equalizeRowsBySelection(current, selection));
  };

  const setPreviewCorner = (previewCorner: PreviewCorner) => {
    const position = previewCornerPositions[previewCorner];
    commit((current) => ({ ...cloneState(current), previewCorner, previewX: position.x, previewY: position.y }));
  };

  const setPreviewScale = (previewScale: number) => {
    commit((current) => ({ ...cloneState(current), previewScale }));
  };

  const getPreviewDragMetrics = (): { photoSize: PreviewSize; overlaySize: PreviewSize } | null => {
    const photoElement = previewPhotoRef.current;
    const overlayElement = previewOverlayRef.current;

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

  const setPreviewPositionWithoutHistory = (x: number, y: number) => {
    setHistory((currentHistory) => ({
      ...currentHistory,
      present: {
        ...cloneState(currentHistory.present),
        previewCorner: 'custom',
        previewX: x,
        previewY: y,
      },
    }));
  };

  const handlePreviewPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    const metrics = getPreviewDragMetrics();

    if (!metrics) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setPreviewDragDraft({
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPreviewX: state.previewX,
      startPreviewY: state.previewY,
      photoSize: metrics.photoSize,
      overlaySize: metrics.overlaySize,
    });
    setHistory((currentHistory) => ({
      past: [...currentHistory.past, cloneState(currentHistory.present)].slice(-80),
      present: currentHistory.present,
      future: [],
    }));
  };

  const handlePreviewPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!previewDragDraft || event.pointerId !== previewDragDraft.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const nextPosition = moveOverlayPreviewByPixelDelta({
      state: {
        x: previewDragDraft.startPreviewX,
        y: previewDragDraft.startPreviewY,
        scale: state.previewScale,
      },
      photoSize: previewDragDraft.photoSize,
      overlaySize: previewDragDraft.overlaySize,
      deltaX: event.clientX - previewDragDraft.startClientX,
      deltaY: event.clientY - previewDragDraft.startClientY,
    });

    setPreviewPositionWithoutHistory(nextPosition.x, nextPosition.y);
  };

  const clearPreviewDragDraft = (event: PointerEvent<HTMLDivElement>) => {
    if (!previewDragDraft || event.pointerId !== previewDragDraft.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    setPreviewDragDraft(null);
  };

  return (
    <main className="block-board" onKeyDown={handleKeyDown} onPointerMove={handleCellPointerMove} onPointerUp={clearCellMoveDrag} onPointerCancel={clearCellMoveDrag} tabIndex={-1}>
      <header className="block-board-toolbar" aria-label="보드판 편집 도구">
        <button
          type="button"
          className={`block-board-toolbar__cell-source${isCellSourceDragging ? ' block-board-toolbar__cell-source--dragging' : ''}`}
          onPointerDown={handleSourcePointerDown}
          onPointerMove={handleSourcePointerMove}
          onPointerUp={handleSourcePointerUp}
          onPointerCancel={() => {
            clearCellSourceDragState();
          }}
        >
          <span>셀 추가</span>
          <small>위치에 놓으면 열 삽입</small>
        </button>

        <div className={`block-board-trash${isTrashHot ? ' block-board-trash--hot' : ''}`} data-trash-zone="true" aria-label="휴지통">
          <span>휴지통</span>
          <small>선택 영역 드롭</small>
        </div>

        <div className="block-board-toolbar__grid-maker" aria-label="NxN 표 만들기">
          <span>NxN</span>
          <input type="number" min="1" max="12" value={rowInput} onChange={(event) => setRowInput(clampGridValue(Number.parseInt(event.currentTarget.value, 10)))} aria-label="행 수" />
          <span>x</span>
          <input type="number" min="1" max="12" value={columnInput} onChange={(event) => setColumnInput(clampGridValue(Number.parseInt(event.currentTarget.value, 10)))} aria-label="열 수" />
          <button type="button" onClick={handleCreateBoard}>표 만들기</button>
        </div>

        <div className="block-board-toolbar__group" aria-label="히스토리">
          <button type="button" onClick={undo} disabled={history.past.length === 0}>되돌리기</button>
          <button type="button" onClick={redo} disabled={history.future.length === 0}>다시실행</button>
        </div>

        <div className="block-board-toolbar__group" aria-label="병합과 분할">
          <button type="button" onClick={handleMerge} disabled={selection.size < 2}>병합</button>
          <button type="button" onClick={handleSplit} disabled={!firstSelectedCell || (firstSelectedCell.rowSpan === 1 && firstSelectedCell.colSpan === 1)}>분할</button>
          <button type="button" onClick={handleEqualizeSelection} disabled={selection.size === 0}>균등</button>
        </div>

        <label className="block-board-toolbar__color">
          <span>배경색</span>
          <input type="color" value={firstSelectedCell?.style.backgroundColor ?? defaultCellStyle.backgroundColor} onChange={(event) => handleStyleChange({ backgroundColor: event.currentTarget.value })} />
        </label>

        <label className="block-board-toolbar__color">
          <span>글자색</span>
          <input type="color" value={firstSelectedCell?.style.color ?? defaultCellStyle.color} onChange={(event) => handleStyleChange({ color: event.currentTarget.value })} />
        </label>

        <button type="button" className={firstSelectedCell?.style.bold ? 'block-board-toolbar__toggle block-board-toolbar__toggle--active' : 'block-board-toolbar__toggle'} onClick={() => handleStyleChange({ bold: !firstSelectedCell?.style.bold })}>
          B
        </button>

        <div className="block-board-toolbar__group" aria-label="정렬">
          {(['left', 'center', 'right'] as Align[]).map((align) => (
            <button
              type="button"
              className={firstSelectedCell?.style.align === align ? 'block-board-toolbar__toggle block-board-toolbar__toggle--active' : 'block-board-toolbar__toggle'}
              onClick={() => handleStyleChange({ align })}
              key={align}
            >
              {alignLabels[align]}
            </button>
          ))}
        </div>

      </header>

      <section className="block-board__body">
        <section className="block-board-editor" aria-label="표 편집 영역">
          <div className="block-board-editor__status">
            <strong>{selectedCount}개 셀 선택됨</strong>
          </div>

          <div
            className="block-board-grid"
            ref={editorRef}
            role="grid"
            aria-label="웹 보드판 표"
            style={{ '--block-board-columns': state.columns } as CSSProperties}
          >
            {state.cells.map((row, rowIndex) => (
              <div className="block-board-grid__row" role="row" key={`row-${rowIndex}`}>
                {row.map((cell, columnIndex) => {
                  if (cell.hidden) {
                    return null;
                  }

                  const point = { rowIndex, columnIndex };
                  const selected = selection.has(getSelectionKey(point));
                  const insertPreviewPlacement = cellInsertPreview
                    && cellInsertPreview.rowIndex === rowIndex
                    && cellInsertPreview.columnIndex === columnIndex
                    ? cellInsertPreview.placement
                    : null;
                  const cellStyle = {
                    '--cell-row-span': cell.rowSpan,
                    '--cell-col-span': cell.colSpan,
                    backgroundColor: cell.style.backgroundColor,
                    color: cell.style.color,
                    fontWeight: cell.style.bold ? 900 : 650,
                    textAlign: cell.style.align,
                  } as CSSProperties;

                  return (
                    <div
                      className={`block-board-cell${selected ? ' block-board-cell--selected' : ''}${cellMoveDragDraft?.started && cellMoveDragDraft.source.rowIndex === rowIndex && cellMoveDragDraft.source.columnIndex === columnIndex ? ' block-board-cell--dragging' : ''}${insertPreviewPlacement === 'before' ? ' block-board-cell--insert-before' : ''}${insertPreviewPlacement === 'after' ? ' block-board-cell--insert-after' : ''}`}
                      style={cellStyle}
                      role="gridcell"
                      tabIndex={0}
                      aria-selected={selected}
                      data-board-cell="true"
                      data-row-index={rowIndex}
                      data-column-index={columnIndex}
                      onClick={(event) => handleCellClick(event, point)}
                      onPointerDown={(event) => handleCellPointerDown(event, point)}
                      key={cell.id}
                    >
                      <span className="block-board-cell__label">R{rowIndex + 1} C{columnIndex + 1}</span>
                      <textarea
                        value={cell.text}
                        onChange={(event) => handleCellTextChange(point, event.currentTarget.value)}
                        onClick={(event) => event.stopPropagation()}
                        aria-label={`R${rowIndex + 1} C${columnIndex + 1} 내용`}
                      />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {cellMoveDragDraft?.started && movingCell ? (
            <div
              className="block-board-drag-preview"
              style={{
                '--drag-preview-x': `${cellMoveDragDraft.clientX}px`,
                '--drag-preview-y': `${cellMoveDragDraft.clientY}px`,
                backgroundColor: movingCell.style.backgroundColor,
                color: movingCell.style.color,
                fontWeight: movingCell.style.bold ? 900 : 650,
                textAlign: movingCell.style.align,
              } as CSSProperties}
            >
              <span>{movingCell.text || '선택 셀'}</span>
            </div>
          ) : null}
        </section>

        <aside className="block-board-preview" aria-label="4대3 사진 미리보기">
          <div className="block-board-preview__controls">
            <div className="block-board-preview__corners" role="group" aria-label="보드판 위치">
              {(Object.keys(cornerLabels) as PreviewCorner[]).map((corner) => (
                <button
                  type="button"
                  className={state.previewCorner === corner ? 'block-board-preview__corner block-board-preview__corner--active' : 'block-board-preview__corner'}
                  onClick={() => setPreviewCorner(corner)}
                  key={corner}
                >
                  {cornerLabels[corner]}
                </button>
              ))}
            </div>

            <label className="block-board-preview__scale">
              <span>배율 {Math.round(state.previewScale * 100)}%</span>
              <input type="range" min="0.45" max="1.15" step="0.01" value={state.previewScale} onChange={(event) => setPreviewScale(Number.parseFloat(event.currentTarget.value))} />
            </label>
          </div>

          <div className="block-board-preview__frame-shell" aria-label="휴대폰 실사용 기준 4대3 사진 미리보기">
            <div className="block-board-preview__phone-frame">
              <div className="block-board-preview__phone-sensor" aria-hidden="true" />
              <div className="block-board-preview__photo" ref={previewPhotoRef}>
              <div
                className={previewClassName}
                style={{
                  '--preview-scale': state.previewScale,
                  '--preview-x': `${state.previewX}%`,
                  '--preview-y': `${state.previewY}%`,
                  '--block-board-preview-columns': state.columns,
                } as CSSProperties}
                ref={previewOverlayRef}
                role="grid"
                aria-label="드래그 가능한 사진 위 보드판 미리보기"
                onPointerDown={handlePreviewPointerDown}
                onPointerMove={handlePreviewPointerMove}
                onPointerUp={clearPreviewDragDraft}
                onPointerCancel={clearPreviewDragDraft}
              >
                {state.cells.map((row, rowIndex) => (
                  <div className="block-board-preview__row" key={`preview-row-${rowIndex}`}>
                    {row.map((cell, columnIndex) => {
                      if (cell.hidden) {
                        return null;
                      }

                      return (
                        <div
                          className="block-board-preview__cell"
                          style={{
                            gridColumn: `span ${cell.colSpan}`,
                            gridRow: `span ${cell.rowSpan}`,
                            backgroundColor: cell.style.backgroundColor,
                            color: cell.style.color,
                            fontWeight: cell.style.bold ? 900 : 650,
                            textAlign: cell.style.align,
                          }}
                          key={`preview-${cell.id}-${columnIndex}`}
                        >
                          {cell.text || '-'}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
