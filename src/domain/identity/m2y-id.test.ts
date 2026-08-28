import { isM2yId, normalizeM2yIdInput } from './m2y-id';

describe('M2Y-ID', () => {
  it('只归一化大小写和首尾空白', () => {
    expect(normalizeM2yIdInput('  m2y-jklm-npqr-stuv-wxyz  ')).toBe('M2Y-JKLM-NPQR-STUV-WXYZ');
  });

  it.each([
    ['M2Y-JKLM-NPQR-STUV-WXYZ', true],
    ['M2Y-IJKL-NPQR-STUV-WXYZ', false],
    ['M2Y-JKLM-NPQR-STUV', false],
    ['M2Y-JKLM NPQR STUV WXYZ', false],
  ])('严格校验 %s', (value, expected) => {
    expect(isM2yId(value)).toBe(expected);
  });
});
