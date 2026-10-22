import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');

const DELETED_DIRS = ['app/(app)/pettycash', 'app/api/pettycash/[id]'];
const DELETED_FILES = [
  'docs/specs/nuevo-flag.schema.ts',
  'docs/specs/product-image-upload.schema.ts',
  'docs/specs/share-image.schema.ts',
];

describe('Slice 17 — smoke housekeeping audit #3', () => {
  test.each(DELETED_DIRS)('%s NO existe en disco', (dir) => {
    expect(fs.existsSync(path.join(PROJECT_ROOT, dir))).toBe(false);
  });
  test.each(DELETED_FILES)('%s NO existe en disco', (file) => {
    expect(fs.existsSync(path.join(PROJECT_ROOT, file))).toBe(false);
  });
});
