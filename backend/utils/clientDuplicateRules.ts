const hasOwnField = (payload: any, key: string) => Object.prototype.hasOwnProperty.call(payload || {}, key);

const normalizeComparableToken = (value?: string) =>
  String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

const normalizeDigits = (value?: string) => String(value || '').replace(/\D/g, '');

export const shouldCheckDuplicateStudentOnUpdate = (current: any, payload: any) => {
  const nextType = String(payload?.type ?? current?.type ?? '').trim().toUpperCase();
  if (nextType !== 'ALUNO') return false;

  const currentType = String(current?.type || '').trim().toUpperCase();
  const typeChangedToAluno = hasOwnField(payload, 'type') && currentType !== nextType;
  const enterpriseChanged = hasOwnField(payload, 'enterpriseId')
    && String(payload?.enterpriseId || '').trim() !== String(current?.enterpriseId || '').trim();

  if (typeChangedToAluno || enterpriseChanged) {
    return true;
  }

  const fieldsWithNormalizer: Array<{ key: string; normalize: (value?: string) => string }> = [
    { key: 'name', normalize: normalizeComparableToken },
    { key: 'registrationId', normalize: normalizeComparableToken },
    { key: 'phone', normalize: normalizeDigits },
    { key: 'parentWhatsapp', normalize: normalizeDigits },
    { key: 'cpf', normalize: normalizeDigits },
    { key: 'parentCpf', normalize: normalizeDigits },
  ];

  return fieldsWithNormalizer.some(({ key, normalize }) => {
    if (!hasOwnField(payload, key)) return false;
    const currentValue = normalize(current?.[key]);
    const nextValue = normalize(payload?.[key]);
    return currentValue !== nextValue;
  });
};
