export type DisparoLogStatus = 'ENVIADO' | 'AGENDADO' | 'ERRO';

export type DisparoLogItem = {
  id: string;
  nome: string;
  telefone: string;
  status: DisparoLogStatus;
  timestamp: number;
  detalhe?: string;
};

export type ResponsibleTarget = {
  id: string;
  name: string;
  phone: string;
  students: Array<{ id: string; name: string }>;
};

