const normalizeComparableToken = (value?: string) =>
  String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

const isAluno = (record: any) => String(record?.type || '').trim().toUpperCase() === 'ALUNO';

const parseNumericRegistrationId = (value?: string) => {
  const normalized = normalizeComparableToken(value);
  if (!/^\d+$/.test(normalized)) return null;
  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

export const resolveUniqueStudentRegistrationId = (params: {
  candidate: any;
  students: any[];
  ignoreClientId?: string;
  defaultStartAt?: number;
}) => {
  const candidate = params.candidate || {};
  if (!isAluno(candidate)) {
    return String(candidate?.registrationId || '').trim();
  }

  const ignoreClientId = String(params.ignoreClientId || '').trim();
  const defaultStartAt = Number.isFinite(Number(params.defaultStartAt))
    ? Math.max(1, Number(params.defaultStartAt))
    : 1000;

  const usedRegistrationTokens = new Set<string>();
  const students = Array.isArray(params.students) ? params.students : [];

  students.forEach((student) => {
    if (!isAluno(student)) return;
    const studentId = String(student?.id || '').trim();
    if (ignoreClientId && studentId === ignoreClientId) return;

    const token = normalizeComparableToken(student?.registrationId);
    if (token) usedRegistrationTokens.add(token);
  });

  const preferredRegistrationId = String(candidate?.registrationId || '').trim();
  const preferredToken = normalizeComparableToken(preferredRegistrationId);
  if (preferredToken && !usedRegistrationTokens.has(preferredToken)) {
    return preferredRegistrationId;
  }

  const maxNumericUsed = Array.from(usedRegistrationTokens)
    .map((token) => parseNumericRegistrationId(token))
    .filter((value): value is number => Number.isFinite(value))
    .reduce((max, value) => (value > max ? value : max), 0);

  const preferredNumeric = parseNumericRegistrationId(preferredRegistrationId);
  let nextRegistrationId = Math.max(defaultStartAt, maxNumericUsed + 1);
  if (Number.isFinite(preferredNumeric)) {
    nextRegistrationId = Math.max(nextRegistrationId, Number(preferredNumeric) + 1);
  }

  while (usedRegistrationTokens.has(String(nextRegistrationId))) {
    nextRegistrationId += 1;
  }

  return String(nextRegistrationId);
};
