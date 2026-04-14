const normalizeComparableToken = (value?: string) =>
  String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

const normalizeDigits = (value?: string) => String(value || '').replace(/\D/g, '');

export const detectStudentDuplicateReason = (params: {
  candidate: any;
  existing: any;
  ignoreClientId?: string;
}) => {
  const candidate = params.candidate || {};
  const existing = params.existing || {};
  const ignoreClientId = String(params.ignoreClientId || '').trim();

  const candidateId = String(candidate?.id || '').trim();
  const existingId = String(existing?.id || '').trim();

  if (ignoreClientId && existingId === ignoreClientId) return null;

  const candidateRegistrationId = normalizeComparableToken(candidate?.registrationId);
  const existingRegistrationId = normalizeComparableToken(existing?.registrationId);

  const candidateCpf = normalizeDigits(candidate?.cpf || candidate?.parentCpf);
  const existingCpf = normalizeDigits(existing?.cpf || existing?.parentCpf);

  // Intencional: nao usar parentWhatsapp para permitir varios alunos
  // com o mesmo responsavel.
  const candidatePhone = normalizeDigits(candidate?.phone);
  const existingPhone = normalizeDigits(existing?.phone);

  const candidateName = normalizeComparableToken(candidate?.name);
  const existingName = normalizeComparableToken(existing?.name);

  if (candidateId && existingId && candidateId === existingId) {
    return 'ID interno';
  }
  if (candidateRegistrationId && existingRegistrationId && candidateRegistrationId === existingRegistrationId) {
    return 'Matrícula/ID';
  }
  if (candidateCpf && existingCpf && candidateCpf === existingCpf) {
    return 'CPF';
  }
  if (candidatePhone && existingPhone && candidatePhone === existingPhone) {
    return 'Telefone';
  }
  if (candidateName && existingName && candidateName === existingName) {
    return 'Nome completo';
  }

  return null;
};
