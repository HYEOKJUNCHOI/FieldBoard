export type BlockType = 'title' | 'input';
export type BlockAlign = 'left' | 'center' | 'right';

export interface BlockStyle {
  fontSize: number;
  fontWeight: number;
  align: BlockAlign;
  backgroundColor: string;
  borderColor: string;
  color: string;
}

export interface BoardBlockBase {
  id: string;
  text: string;
  width: number;
  style: BlockStyle;
}

export interface TitleBlock extends BoardBlockBase {
  type: 'title';
  key?: never;
}

export interface InputBlock extends BoardBlockBase {
  type: 'input';
  key: string;
}

export type BoardBlock = TitleBlock | InputBlock;

export interface BoardRow {
  id: string;
  height: number;
  blocks: BoardBlock[];
}

export interface OverlaySettings {
  x: number;
  y: number;
  scale: number;
}

export interface BoardTemplate {
  schemaVersion: 1;
  id: string;
  ownerId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  defaultOverlay: OverlaySettings;
  rows: BoardRow[];
}

export interface ValueSet {
  schemaVersion: 1;
  id: string;
  ownerId: string;
  templateId: string;
  templateVersion?: number;
  templateUpdatedAt?: string;
  name: string;
  values: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}
