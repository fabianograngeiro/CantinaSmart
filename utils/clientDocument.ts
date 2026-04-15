import type { Client } from '../types';

const normalizeDigits = (value?: string) => String(value || '').replace(/\D/g, '');

export const isStudentClient = (client?: Partial<Client> | null) => String(client?.type || '').trim().toUpperCase() === 'ALUNO';

export const getOwnClientCpf = (client?: Partial<Client> | null) => {
  if (!client) return '';
  if (isStudentClient(client)) return '';
  return normalizeDigits(client.cpf);
};

export const getResponsibleCpf = (client?: Partial<Client> | null) => {
  if (!client) return '';
  if (isStudentClient(client)) return normalizeDigits(client.parentCpf);
  return normalizeDigits(client.cpf || client.parentCpf);
};
