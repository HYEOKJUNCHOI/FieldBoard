import type { BoardTemplate, ValueSet } from './types.js';

const sharedBlockStyle = {
  fontSize: 14,
  fontWeight: 700,
  align: 'center' as const,
  backgroundColor: '#ffffff',
  borderColor: '#111111',
  color: '#111111',
};

const valueBlockStyle = {
  fontSize: 16,
  fontWeight: 700,
  align: 'center' as const,
  backgroundColor: '#ffffff',
  borderColor: '#111111',
  color: '#111111',
};

const labelBlock = (id: string, text: string, width = 2) => ({
  id,
  type: 'title' as const,
  text,
  width,
  style: sharedBlockStyle,
});

const inputBlock = (id: string, text: string, key: string, width = 4) => ({
  id,
  type: 'input' as const,
  text,
  key,
  width,
  style: valueBlockStyle,
});

export const qualityBoardTemplate = {
  schemaVersion: 1,
  id: 'quality-board-template',
  ownerId: 'sample-owner',
  name: '품질보드 샘플',
  createdAt: '2026-06-02T00:00:00.000Z',
  updatedAt: '2026-06-02T00:00:00.000Z',
  defaultOverlay: {
    x: 0,
    y: 0,
    scale: 1,
  },
  rows: [
    {
      id: 'quality-row-1',
      height: 0.75,
      blocks: [
        labelBlock('quality-row-1-label-1', '현장명', 2),
        inputBlock('quality-row-1-value-1', '모두의 공장 신축공사', 'site_name', 10),
      ],
    },
    {
      id: 'quality-row-2',
      height: 0.75,
      blocks: [
        labelBlock('quality-row-2-label-1', '위  치', 2),
        inputBlock('quality-row-2-value-1', '공장동 기초', 'location', 10),
      ],
    },
    {
      id: 'quality-row-3',
      height: 0.85,
      blocks: [
        labelBlock('quality-row-3-label-1', '규  격', 2),
        inputBlock('quality-row-3-value-1', '25-27-150', 'specification', 4),
        labelBlock('quality-row-3-label-2', '1 회', 2),
        inputBlock('quality-row-3-value-2', '26.05.12 화', 'inspection_date', 4),
      ],
    },
    {
      id: 'quality-row-4',
      height: 0.6,
      blocks: [
        labelBlock('quality-row-4-label-1', '슬럼프(mm)', 2),
        labelBlock('quality-row-4-label-2', '공기량(%)', 2),
        labelBlock('quality-row-4-label-3', '염화물(kg/m3)', 2),
        labelBlock('quality-row-4-label-4', '단위수량(kg/m3)', 2),
        labelBlock('quality-row-4-label-5', '대기온도(°C)', 2),
        labelBlock('quality-row-4-label-6', '콘크리트온도(°C)', 2),
      ],
    },
    {
      id: 'quality-row-5',
      height: 0.95,
      blocks: [
        inputBlock('quality-row-5-value-1', '170', 'slump', 2),
        inputBlock('quality-row-5-value-2', '4.0', 'air_content', 2),
        inputBlock('quality-row-5-value-3', '0.016', 'chloride', 2),
        inputBlock('quality-row-5-value-4', '170', 'unit_water', 2),
        inputBlock('quality-row-5-value-5', '28.0', 'air_temp', 2),
        inputBlock('quality-row-5-value-6', '26.5', 'concrete_temp', 2),
      ],
    },
    {
      id: 'quality-row-6',
      height: 0.75,
      blocks: [
        labelBlock('quality-row-6-label-1', '회사명', 2),
        inputBlock('quality-row-6-value-1', '모두의 종합건설(주)', 'company_name', 10),
      ],
    },
  ],
} satisfies BoardTemplate;

export const simpleTwoColumnBoardTemplate = {
  schemaVersion: 1,
  id: 'simple-two-column-template',
  ownerId: 'sample-owner',
  name: '2열 비교용 샘플',
  createdAt: '2026-06-02T00:00:00.000Z',
  updatedAt: '2026-06-02T00:00:00.000Z',
  defaultOverlay: {
    x: 0,
    y: 0,
    scale: 1,
  },
  rows: [
    {
      id: 'simple-row-1',
      height: 0.8,
      blocks: [
        labelBlock('simple-row-1-label-1', '항목', 3),
        inputBlock('simple-row-1-value-1', '값', 'item_value', 9),
      ],
    },
    {
      id: 'simple-row-2',
      height: 0.8,
      blocks: [
        labelBlock('simple-row-2-label-1', '메모', 3),
        inputBlock('simple-row-2-value-1', '비교용 2열 보드', 'note', 9),
      ],
    },
  ],
} satisfies BoardTemplate;

export const qualityBoardValueSet = {
  schemaVersion: 1,
  id: 'quality-board-values',
  ownerId: 'sample-owner',
  templateId: qualityBoardTemplate.id,
  templateVersion: 1,
  name: '품질보드 기본 값세트',
  values: {
    site_name: '모두의 공장 신축공사',
    location: '공장동 기초',
    specification: '25-27-150',
    inspection_date: '26.05.12 화',
    slump: '170',
    air_content: '4.0',
    chloride: '0.016',
    unit_water: '170',
    air_temp: '28.0',
    concrete_temp: '26.5',
    company_name: '모두의 종합건설(주)',
  },
  createdAt: '2026-06-02T00:00:00.000Z',
  updatedAt: '2026-06-02T00:00:00.000Z',
} satisfies ValueSet;

export const simpleTwoColumnValueSet = {
  schemaVersion: 1,
  id: 'simple-two-column-values',
  ownerId: 'sample-owner',
  templateId: simpleTwoColumnBoardTemplate.id,
  templateVersion: 1,
  name: '2열 비교용 값세트',
  values: {
    item_value: '값',
    note: '비교용 2열 보드',
  },
  createdAt: '2026-06-02T00:00:00.000Z',
  updatedAt: '2026-06-02T00:00:00.000Z',
} satisfies ValueSet;
