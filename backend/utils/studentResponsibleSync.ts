const normalizeDigits = (value?: string) => String(value || '').replace(/\D/g, '');
const normalizePhone = (value?: string) => String(value || '').replace(/\D/g, '');
const normalizeText = (value?: string) => String(value || '').trim();
const normalizeToken = (value?: string) =>
  normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

export const hasStudentResponsibleFieldsChanged = (previousRecord: any, nextRecord: any) => {
  const keys = [
    'parentName',
    'parentRelationship',
    'parentWhatsappCountryCode',
    'parentWhatsapp',
    'parentEmail',
    'parentCpf',
    'responsibleClientId',
    'responsibleCollaboratorId',
  ];

  return keys.some((key) => normalizeText(previousRecord?.[key]) !== normalizeText(nextRecord?.[key]));
};

const getResponsibleIdentity = (record: any) => ({
  enterpriseId: normalizeText(record?.enterpriseId),
  responsibleClientId: normalizeText(record?.responsibleClientId),
  responsibleCollaboratorId: normalizeText(record?.responsibleCollaboratorId),
  parentCpf: normalizeDigits(record?.parentCpf),
  parentWhatsapp: normalizePhone(record?.parentWhatsapp || record?.phone),
  parentEmail: normalizeText(record?.parentEmail || record?.email).toLowerCase(),
  parentName: normalizeToken(record?.parentName),
});

export const isSameResponsibleReference = (leftRecord: any, rightRecord: any) => {
  const left = getResponsibleIdentity(leftRecord);
  const right = getResponsibleIdentity(rightRecord);

  if (!left.enterpriseId || !right.enterpriseId || left.enterpriseId !== right.enterpriseId) {
    return false;
  }
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

export const buildStudentParentPatchFromResponsible = (studentRecord: any) => {
  const parentName = normalizeText(studentRecord?.parentName);
  const parentRelationship = normalizeText(studentRecord?.parentRelationship);
  const parentWhatsappCountryCode = normalizeDigits(studentRecord?.parentWhatsappCountryCode) || '55';
  const parentWhatsapp = normalizePhone(studentRecord?.parentWhatsapp || studentRecord?.phone);
  const parentEmail = normalizeText(studentRecord?.parentEmail || studentRecord?.email);
  const parentCpf = normalizeDigits(studentRecord?.parentCpf);

  return {
    parentName,
    parentRelationship,
    parentWhatsappCountryCode,
    parentWhatsapp,
    phone: parentWhatsapp,
    parentEmail,
    email: parentEmail,
    parentCpf,
    cpf: '',
  };
};

export const buildResponsiblePatchFromStudent = (studentRecord: any, responsibleType?: string) => {
  const type = normalizeText(responsibleType).toUpperCase();
  const base = {
    name: normalizeText(studentRecord?.parentName),
    phone: normalizePhone(studentRecord?.parentWhatsapp || studentRecord?.phone),
    parentWhatsappCountryCode: normalizeDigits(studentRecord?.parentWhatsappCountryCode) || '55',
    parentWhatsapp: normalizePhone(studentRecord?.parentWhatsapp || studentRecord?.phone),
    email: normalizeText(studentRecord?.parentEmail || studentRecord?.email),
    parentEmail: normalizeText(studentRecord?.parentEmail || studentRecord?.email),
    cpf: normalizeDigits(studentRecord?.parentCpf),
    parentCpf: normalizeDigits(studentRecord?.parentCpf),
  };

  if (type === 'RESPONSAVEL') {
    return {
      ...base,
      class: normalizeText(studentRecord?.parentRelationship) || 'PAIS',
      parentRelationship: normalizeText(studentRecord?.parentRelationship) || 'PAIS',
    };
  }

  return base;
};
