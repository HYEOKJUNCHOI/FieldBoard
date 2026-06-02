import { useRef, useState, type ChangeEvent, type PointerEvent } from 'react';
import type { BoardBlock } from '../../shared/schema/index.js';
import type { BlockUpdate, RowInsertDirection } from './index.js';

interface EditorToolbarProps {
  section?: 'all' | 'setup' | 'tools';
  rowCount: number;
  blocksPerRow: number;
  boardSummary: string;
  selectedBlock: BoardBlock | null;
  selectedLabel: string;
  blankRowDirection: RowInsertDirection;
  blankRowBlockCount: number;
  onRowCountChange: (value: number) => void;
  onBlocksPerRowChange: (value: number) => void;
  onCreateBoard: () => void;
  onBlankRowDirectionChange: (direction: RowInsertDirection) => void;
  onBlankRowBlockCountChange: (value: number) => void;
  onShowBlankRowPreview: () => void;
  onInsertBlankRow: () => void;
  onClearBlankRowPreview: () => void;
  onSelectedBlockChange: (update: BlockUpdate) => void;
  onDeleteSelectedBlock: () => void;
  onAdjustSelectedFontSize: (delta: number) => void;
}

const minGridValue = 1;
const maxGridValue = 12;
const minFontSize = 8;
const maxFontSize = 72;
const fontSizeStep = 1;
const fontWeightOptions = [400, 500, 600, 700, 800, 900];
const alignOptions: Array<{ value: BoardBlock['style']['align']; label: string }> = [
  { value: 'left', label: '왼쪽' },
  { value: 'center', label: '가운데' },
  { value: 'right', label: '오른쪽' },
];
const rowInsertDirectionOptions: Array<{ value: RowInsertDirection; label: string }> = [
  { value: 'above', label: '위' },
  { value: 'below', label: '아래' },
];

function parseGridValue(event: ChangeEvent<HTMLInputElement>) {
  const nextValue = Number.parseInt(event.currentTarget.value, 10);

  if (Number.isNaN(nextValue)) {
    return minGridValue;
  }

  return Math.min(Math.max(nextValue, minGridValue), maxGridValue);
}

function parseFontSize(event: ChangeEvent<HTMLInputElement>) {
  const nextValue = Number.parseInt(event.currentTarget.value, 10);

  if (Number.isNaN(nextValue)) {
    return minFontSize;
  }

  return Math.min(Math.max(nextValue, minFontSize), maxFontSize);
}

function parseFontWeight(event: ChangeEvent<HTMLSelectElement>) {
  return Number.parseInt(event.currentTarget.value, 10);
}

export function EditorToolbar({
  section = 'all',
  rowCount,
  blocksPerRow,
  boardSummary,
  selectedBlock,
  selectedLabel,
  blankRowDirection,
  blankRowBlockCount,
  onRowCountChange,
  onBlocksPerRowChange,
  onCreateBoard,
  onBlankRowDirectionChange,
  onBlankRowBlockCountChange,
  onShowBlankRowPreview,
  onInsertBlankRow,
  onClearBlankRowPreview,
  onSelectedBlockChange,
  onDeleteSelectedBlock,
  onAdjustSelectedFontSize,
}: EditorToolbarProps) {
  const activeBlankRowPointerIdRef = useRef<number | null>(null);
  const [activeBlankRowPointerId, setActiveBlankRowPointerId] = useState<number | null>(null);
  const hasSelection = selectedBlock !== null;
  const isDraggingBlankRow = activeBlankRowPointerId !== null;
  const shouldRenderSetupPanel = section === 'all' || section === 'setup';
  const shouldRenderToolsPanel = section === 'all' || section === 'tools';
  const blankRowHelpText = hasSelection
    ? `${selectedLabel} 행을 기준으로 [빈칸]을 끌어 빈 입력 행을 넣습니다.`
    : '보드 셀을 선택하면 [빈칸] 행을 추가할 수 있습니다.';

  const handleBlankRowSourcePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (!hasSelection || event.button !== 0 || activeBlankRowPointerIdRef.current !== null) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    activeBlankRowPointerIdRef.current = event.pointerId;
    setActiveBlankRowPointerId(event.pointerId);
    onShowBlankRowPreview();
  };

  const handleBlankRowSourcePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (activeBlankRowPointerIdRef.current !== event.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
  };

  const handleBlankRowSourcePointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    if (activeBlankRowPointerIdRef.current !== event.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    activeBlankRowPointerIdRef.current = null;
    setActiveBlankRowPointerId(null);
    onInsertBlankRow();
  };

  const handleBlankRowSourcePointerCancel = (event: PointerEvent<HTMLButtonElement>) => {
    if (activeBlankRowPointerIdRef.current !== event.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    activeBlankRowPointerIdRef.current = null;
    setActiveBlankRowPointerId(null);
    onClearBlankRowPreview();
  };

  return (
    <>
      {shouldRenderSetupPanel && (
        <section className="editor-toolbar editor-setup-panel" aria-label="보드 시작 설정">
          <div className="editor-toolbar__intro">
            <p className="section-kicker">Local board generator</p>
            <h2>현장 보드 워크벤치</h2>
            <p>칸 수와 줄 수를 정하면 바로 아래 보드에 현재 표가 다시 그려집니다.</p>
          </div>

          <div className="editor-toolbar__controls">
            <label className="grid-control">
              <span>가로 칸 수</span>
              <input
                type="number"
                min={minGridValue}
                max={maxGridValue}
                value={blocksPerRow}
                onChange={(event) => onBlocksPerRowChange(parseGridValue(event))}
              />
            </label>

            <label className="grid-control">
              <span>세로 줄 수</span>
              <input
                type="number"
                min={minGridValue}
                max={maxGridValue}
                value={rowCount}
                onChange={(event) => onRowCountChange(parseGridValue(event))}
              />
            </label>

            <button type="button" className="editor-toolbar__create" onClick={onCreateBoard}>
              보드 만들기
            </button>
          </div>

          <p className="editor-toolbar__summary" aria-live="polite">
            {boardSummary}
          </p>
        </section>
      )}

      {shouldRenderToolsPanel && (
        <section className="editor-toolbar editor-tools-panel" aria-label="선택 셀 및 빈칸 행 도구">
          <div className="block-properties" id="mobile-cell-panel" data-mobile-panel="cell" aria-label="선택 블록 속성 패널">
        <div className="block-properties__header">
          <div>
            <p className="section-kicker">Selected cell uplink</p>
            <h3>{hasSelection ? selectedLabel : '셀을 선택하세요'}</h3>
          </div>

          <div className="block-properties__quick-actions" aria-label="선택 블록 빠른 동작">
            <button type="button" onClick={() => onAdjustSelectedFontSize(-fontSizeStep)} disabled={!hasSelection}>
              A-
            </button>
            <button type="button" onClick={() => onAdjustSelectedFontSize(fontSizeStep)} disabled={!hasSelection}>
              A+
            </button>
            <button type="button" className="block-properties__delete" onClick={onDeleteSelectedBlock} disabled={!hasSelection}>
              선택 칸 삭제
            </button>
          </div>
        </div>

        <div className="block-properties__grid">
          <label className="property-control property-control--wide">
            <span>텍스트</span>
            <textarea
              value={selectedBlock?.text ?? ''}
              onChange={(event) => onSelectedBlockChange({ text: event.currentTarget.value })}
              disabled={!hasSelection}
              rows={1}
              placeholder="셀에 표시할 문구"
            />
          </label>

          {selectedBlock?.type === 'input' && (
            <label className="property-control">
              <span>입력 키</span>
              <input
                type="text"
                value={selectedBlock.key}
                onChange={(event) => onSelectedBlockChange({ key: event.currentTarget.value })}
                placeholder="site_name"
              />
            </label>
          )}

          <label className="property-control">
            <span>폰트 크기</span>
            <input
              type="number"
              min={minFontSize}
              max={maxFontSize}
              value={selectedBlock?.style.fontSize ?? minFontSize}
              onChange={(event) => onSelectedBlockChange({ style: { fontSize: parseFontSize(event) } })}
              disabled={!hasSelection}
            />
          </label>

          <label className="property-control">
            <span>굵기</span>
            <select
              value={selectedBlock?.style.fontWeight ?? 500}
              onChange={(event) => onSelectedBlockChange({ style: { fontWeight: parseFontWeight(event) } })}
              disabled={!hasSelection}
            >
              {fontWeightOptions.map((fontWeight) => (
                <option value={fontWeight} key={fontWeight}>
                  {fontWeight}
                </option>
              ))}
            </select>
          </label>

          <label className="property-control">
            <span>정렬</span>
            <select
              value={selectedBlock?.style.align ?? 'left'}
              onChange={(event) => onSelectedBlockChange({ style: { align: event.currentTarget.value as BoardBlock['style']['align'] } })}
              disabled={!hasSelection}
            >
              {alignOptions.map((option) => (
                <option value={option.value} key={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="property-control property-control--color">
            <span>배경</span>
            <input
              type="color"
              value={selectedBlock?.style.backgroundColor ?? '#ffffff'}
              onChange={(event) => onSelectedBlockChange({ style: { backgroundColor: event.currentTarget.value } })}
              disabled={!hasSelection}
            />
          </label>

          <label className="property-control property-control--color">
            <span>테두리</span>
            <input
              type="color"
              value={selectedBlock?.style.borderColor ?? '#000000'}
              onChange={(event) => onSelectedBlockChange({ style: { borderColor: event.currentTarget.value } })}
              disabled={!hasSelection}
            />
          </label>

          <label className="property-control property-control--color">
            <span>글자</span>
            <input
              type="color"
              value={selectedBlock?.style.color ?? '#000000'}
              onChange={(event) => onSelectedBlockChange({ style: { color: event.currentTarget.value } })}
              disabled={!hasSelection}
            />
          </label>
        </div>
          </div>

          <div className="blank-row-controls" id="mobile-palette-panel" data-mobile-panel="palette" aria-label="빈칸 대량 행 생성 패널">
        <div className="blank-row-controls__header">
          <div>
            <p className="section-kicker">[빈칸] palette</p>
            <h3>[빈칸]</h3>
          </div>
          <p>{blankRowHelpText}</p>
        </div>

        <div className="blank-row-controls__grid">
          <button
            type="button"
            className={`blank-row-controls__source${isDraggingBlankRow ? ' blank-row-controls__source--dragging' : ''}`}
            onPointerDown={handleBlankRowSourcePointerDown}
            onPointerMove={handleBlankRowSourcePointerMove}
            onPointerUp={handleBlankRowSourcePointerUp}
            onPointerCancel={handleBlankRowSourcePointerCancel}
            disabled={!hasSelection}
            aria-describedby="blank-row-drag-help"
            aria-pressed={isDraggingBlankRow}
          >
            <span>[빈칸]</span>
            <small>눌러서 끌고 놓기</small>
          </button>

          <div className="blank-row-controls__direction" role="group" aria-label="빈 행 삽입 방향">
            {rowInsertDirectionOptions.map((option) => (
              <button
                type="button"
                className={blankRowDirection === option.value ? 'blank-row-controls__direction-button blank-row-controls__direction-button--active' : 'blank-row-controls__direction-button'}
                onClick={() => onBlankRowDirectionChange(option.value)}
                disabled={!hasSelection}
                key={option.value}
              >
                {option.label}
              </button>
            ))}
          </div>

          <label className="property-control">
            <span>칸 수</span>
            <input
              type="number"
              min={minGridValue}
              max={maxGridValue}
              value={blankRowBlockCount}
              onChange={(event) => onBlankRowBlockCountChange(parseGridValue(event))}
              disabled={!hasSelection}
            />
          </label>

          <button type="button" className="blank-row-controls__ghost" onClick={onShowBlankRowPreview} disabled={!hasSelection}>
            미리보기
          </button>
          <button type="button" className="blank-row-controls__insert" onClick={onInsertBlankRow} disabled={!hasSelection}>
            빈 행 넣기
          </button>
        </div>

        <p className="blank-row-controls__drag-help" id="blank-row-drag-help">
          선택 셀을 기준으로 [빈칸]을 누르면 미리보기가 나타나고, 놓으면 한 번만 빈 입력 행이 추가됩니다.
        </p>
          </div>
        </section>
      )}
    </>
  );
}
