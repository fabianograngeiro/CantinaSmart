const normalizeDigits = (value?: string) => String(value || '').replace(/\D/g, '');

const normalizeType = (value?: string) => String(value || '').trim().toUpperCase();

export const isStudentClient = (client: any) => normalizeType(client?.type) === 'ALUNO';

export const getOwnClientCpf = (client: any) => {
  if (isStudentClient(client)) return '';
  return normalizeDigits(client?.cpf);
};

export const getResponsibleCpf = (client: any) => {
  if (isStudentClient(client)) {
    return normalizeDigits(client?.parentCpf);
  }
  return normalizeDigits(client?.cpf || client?.parentCpf);
};

export const normalizeClientCpfFields = (client: any) => {
  const next = { ...(client || {}) };
  next.parentCpf = normalizeDigits(next?.parentCpf);
  next.cpf = getOwnClientCpf(next);
  return next;
};
