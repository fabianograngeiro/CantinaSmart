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

export type DispatchAudienceFilter =
  | 'TODOS'
  | 'RESPONSAVEIS'
  | 'COLABORADORES'
  | 'SALDO_BAIXO'
  | 'PLANO_A_VENCER'
  | 'RELATORIO_ENTREGA';

export type DispatchProfileType = 'RESPONSAVEL_PARENTESCO' | 'COLABORADOR';
export type DispatchPeriodMode = 'SEMANAL' | 'QUINZENAL' | 'MENSAL' | 'DESTA_SEMANA';
export type DispatchWeekday = 'DOMINGO' | 'SEGUNDA' | 'TERCA' | 'QUARTA' | 'QUINTA' | 'SEXTA' | 'SABADO';
export type DispatchMonthlyWindowMode = 'ROLLING_30_DAYS' | 'CURRENT_MONTH';
export type DispatchSendMode =
  | 'TEXT'
  | 'TEXT_AND_STATEMENT_PDF'
  | 'TEXT_AND_UPLOAD_FILE'
  | 'EXTERNAL_BUTTONS'
  | 'EXTERNAL_LIST'
  | 'EXTERNAL_POLL'
  | 'EXTERNAL_CAROUSEL'
  | 'EXTERNAL_PIX';

export type DispatchExternalCarouselButtonType = 'REPLY' | 'URL' | 'COPY' | 'CALL';

export type DispatchExternalCarouselButton = {
  id: string;
  text: string;
  type: DispatchExternalCarouselButtonType;
};

export type DispatchExternalCarouselCard = {
  text: string;
  image: string;
  buttons: DispatchExternalCarouselButton[];
};

export type DispatchExternalPixType = 'CPF' | 'CNPJ' | 'PHONE' | 'EMAIL' | 'EVP';
export type DispatchPdfAttachment = {
  base64Data: string;
  fileName: string;
  mimeType?: string;
};

export type DispatchAutomationConfig = {
  id: string;
  nome_perfil: string;
  tipo_destinatario: 'responsavel' | 'colaborador';
  campos: string[];
  frequencia: 'semanal' | 'quinzenal' | 'mensal';
  agendamento: {
    hora: string;
    dias_expediente_apenas: boolean;
    dia_semana?: DispatchWeekday;
    dias_semana?: DispatchWeekday[];
    hora_semanal?: string;
  };
  layout_estilo: 'escolar_premium' | 'corporativo_sobrio';
  filter: DispatchAudienceFilter;
  profileType: DispatchProfileType;
  periodMode: DispatchPeriodMode;
  monthlyWindowMode?: DispatchMonthlyWindowMode;
  monthlyReferenceDate?: string;
  template: string;
  sendMode?: DispatchSendMode;
  uploadPdfAttachment?: DispatchPdfAttachment | null;
  externalMenuText?: string;
  externalMenuFooter?: string;
  externalChoices?: string[];
  externalListButton?: string;
  externalSelectableCount?: number;
  externalCarouselHeaderText?: string;
  externalCarouselCards?: DispatchExternalCarouselCard[];
  externalPixTitle?: string;
  externalPixText?: string;
  externalPixFooter?: string;
  externalPixKey?: string;
  externalPixType?: DispatchExternalPixType;
  externalPixName?: string;
  externalPixAmount?: number;
  delayMin: number;
  delayMax: number;
  batchLimit: number;
  isSimulation: boolean;
  paused?: boolean;
  dispatchRuntimeStatus?: 'EM_DISPARO' | null;
  enterpriseId?: string;
  createdAt?: string;
  updatedAt: string;
};

