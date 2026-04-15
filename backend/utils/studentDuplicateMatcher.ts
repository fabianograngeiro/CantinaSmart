const normalizeComparableToken = (value?: string) =>
  String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

const normalizeDigits = (value?: string) => String(value || '').replace(/\D/g, '');

const resolveResponsibleIdentity = (record: any) => {
  const responsibleCollaboratorId = String(record?.responsibleCollaboratorId || '').trim();
  const responsibleClientId = String(record?.responsibleClientId || '').trim();
  const parentCpf = normalizeDigits(record?.parentCpf);
  const parentWhatsapp = normalizeDigits(record?.parentWhatsapp);
  const parentEmail = String(record?.parentEmail || '').trim().toLowerCase();
  const parentName = normalizeComparableToken(record?.parentName);

  return {
    responsibleCollaboratorId,
    responsibleClientId,
    parentCpf,
    parentWhatsapp,
    parentEmail,
    parentName,
  };
};

const hasSameResponsible = (candidate: any, existing: any) => {
  const left = resolveResponsibleIdentity(candidate);
  const right = resolveResponsibleIdentity(existing);

  if (left.responsibleCollaboratorId && right.responsibleCollaboratorId) {
    return left.responsibleCollaboratorId === right.responsibleCollaboratorId;
  }
  if (left.responsibleClientId && right.responsibleClientId) {
    return left.responsibleClientId === right.responsibleClientId;
  }
  if (left.parentCpf && right.parentCpf) {
    return left.parentCpf === right.parentCpf;
  }
  if (left.parentWhatsapp && right.parentWhatsapp) {
    return left.parentWhatsapp === right.parentWhatsapp;
  }
  if (left.parentEmail && right.parentEmail) {
    return left.parentEmail === right.parentEmail;
  }
  if (left.parentName && right.parentName) {
    return left.parentName === right.parentName;
  }

  return false;
};

const resolveOwnStudentPhone = (record: any) => {
  const phone = normalizeDigits(record?.phone);
  const parentWhatsapp = normalizeDigits(record?.parentWhatsapp);
  if (!phone) return '';
  if (parentWhatsapp && phone === parentWhatsapp) return '';
  return phone;
};

const resolveOwnStudentCpf = (record: any) => {
  const cpf = normalizeDigits(record?.cpf);
  const parentCpf = normalizeDigits(record?.parentCpf);
  if (!cpf) return '';
  if (parentCpf && cpf === parentCpf) return '';
  return cpf;
};

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

  const candidateCpf = resolveOwnStudentCpf(candidate);
  const existingCpf = resolveOwnStudentCpf(existing);
  const candidatePhone = resolveOwnStudentPhone(candidate);
  const existingPhone = resolveOwnStudentPhone(existing);

  const candidateName = normalizeComparableToken(candidate?.name);
  const existingName = normalizeComparableToken(existing?.name);

  if (candidateId && existingId && candidateId === existingId) {
    return 'ID interno';
  }
  if (hasSameResponsible(candidate, existing)) {
    if (candidateName && existingName && candidateName === existingName) {
      return 'Nome completo';
    }
    return null;
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
