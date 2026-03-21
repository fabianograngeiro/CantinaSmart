import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCheck, Loader2, Play, Save, Users } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import ApiService from '../../services/api';
import { Enterprise } from '../../types';

type AudienceFilter =
  | 'TODOS'
  | 'RESPONSAVEIS'
  | 'COLABORADORES'
  | 'SALDO_BAIXO'
  | 'PLANO_A_VENCER'
  | 'RELATORIO_ENTREGA';

type ReportProfileType = 'RESPONSAVEL_PARENTESCO' | 'COLABORADOR';
type DispatchPeriodMode = 'SEMANAL' | 'QUINZENAL' | 'MENSAL' | 'DESTA_SEMANA';

type AudienceReportRow = {
  alunoNome: string;
  data: string;
  valor: string;
  tipo: 'CONSUMO' | 'CREDITO' | 'ESTORNO' | 'OUTRO';
  item: string;
  saldoAtual: string;
};

type AudienceRecipient = {
  id: string;
  tipo: 'RESPONSAVEL' | 'COLABORADOR';
  nome: string;
  telefone: string;
  alunos: string[];
  variables: {
    nome?: string;
    alunos?: string;
    saldo?: string;
    plano?: string;
    consumo_hoje?: string;
    status_entrega?: string;
    nome_pai?: string;
    nome_colaborador?: string;
    parentesco?: string;
    periodo_referencia?: string;
    periodo_nome?: string;
    saldo_por_aluno?: string;
    consumo_total_periodo?: string;
    consumo_total_por_aluno?: string;
  };
  report?: {
    title: string;
    periodLabel: string;
    greeting: string;
    rows: AudienceReportRow[];
  };
  impact?: string;
};

type PersistedLogEntry = {
  id: string;
  nome: string;
  telefone: string;
  perfil: 'Responsável' | 'Colaborador';
  status: 'Sucesso' | 'Erro' | 'Simulado' | 'Inválido';
  detalhe?: string;
  timestamp: string;
};

type MassLog = {
  id: string;
  nome: string;
  telefone: string;
  perfil: 'Responsável' | 'Colaborador';
  status: 'Sucesso' | 'Erro' | 'Simulado' | 'Inválido';
  horario: Date;
  detalhe?: string;
};

type ProgressState = {
  total: number;
  processados: number;
  enviados: number;
  erros: number;
};

type DispatchAutomationConfig = {
  id: string;
  nome_perfil: string;
  tipo_destinatario: 'responsavel' | 'colaborador';
  campos: string[];
  frequencia: 'semanal' | 'quinzenal' | 'mensal';
  agendamento: {
    hora: string;
    dias_expediente_apenas: boolean;
  };
  layout_estilo: 'escolar_premium' | 'corporativo_sobrio';
  filter: AudienceFilter;
  profileType: ReportProfileType;
  periodMode: DispatchPeriodMode;
  template: string;
  delayMin: number;
  delayMax: number;
  batchLimit: number;
  isSimulation: boolean;
  updatedAt: string;
};

const periodModeHumanLabel = (periodMode: DispatchPeriodMode) => {
  if (periodMode === 'QUINZENAL') return 'quinzenal';
  if (periodMode === 'MENSAL') return 'mensal';
  if (periodMode === 'DESTA_SEMANA') return 'desta semana (dias ativos)';
  return 'semanal';
};

const buildDefaultTemplate = (profileType: ReportProfileType, periodMode: DispatchPeriodMode) => {
  const periodLabel = periodModeHumanLabel(periodMode);
  if (profileType === 'COLABORADOR') {
    return [
      'Mensagem automática da cantina.',
      `Prezado {{nome_colaborador}}, segue seu relatório ${periodLabel}.`,
      'Período: {{periodo_referencia}}',
      'Consumo total no período: {{consumo_total_periodo}}',
      'Saldo atual: {{saldo}}',
      'Plano atual: {{plano}}',
    ].join('\n');
  }

  return [
    'Mensagem automática da cantina.',
    `Olá {{nome_pai}}, segue o relatório ${periodLabel} dos seus filhos.`,
    'Período: {{periodo_referencia}}',
    'Filhos/Alunos: {{alunos}}',
    'Saldos atuais por aluno:',
    '{{saldo_por_aluno}}',
    'Total consumido no período: {{consumo_total_periodo}}',
    'Consumo por aluno no período:',
    '{{consumo_total_por_aluno}}',
  ].join('\n');
};

const ALLOWED_FILTERS: AudienceFilter[] = [
  'TODOS',
  'RESPONSAVEIS',
  'COLABORADORES',
  'SALDO_BAIXO',
  'PLANO_A_VENCER',
  'RELATORIO_ENTREGA',
];
const ALLOWED_PERIOD_MODES: DispatchPeriodMode[] = ['SEMANAL', 'QUINZENAL', 'MENSAL', 'DESTA_SEMANA'];
const ALLOWED_PROFILE_TYPES: ReportProfileType[] = ['RESPONSAVEL_PARENTESCO', 'COLABORADOR'];

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, Math.max(0, ms));
  });

const normalizePhone = (value: string) => String(value || '').replace(/\D/g, '');

const isValidPhone = (value: string) => {
  const normalized = normalizePhone(value);
  return normalized.length >= 10 && normalized.length <= 15;
};

const toWhatsAppChatId = (phone: string) => `${normalizePhone(phone)}@c.us`;

const toCurrency = (value: unknown) => {
  const parsed = Number(value || 0);
  if (Number.isNaN(parsed)) return 'R$ 0,00';
  return parsed.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const cleanupMessage = (text: string) =>
  String(text || '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const getDefaultTemplateByProfileAndPeriod = (profileType: ReportProfileType, periodMode: DispatchPeriodMode) =>
  buildDefaultTemplate(profileType, periodMode);

const renderizarMensagem = (template: string, usuario: AudienceRecipient) => {
  const alunosArray = Array.isArray(usuario?.alunos) ? usuario.alunos.filter(Boolean) : [];
  const alunosNomes = String(usuario?.variables?.alunos || alunosArray.join(', ') || '').trim();
  const financeiroSaldo =
    (usuario as any)?.financeiro?.saldo
    ?? (usuario as any)?.saldo
    ?? usuario?.variables?.saldo
    ?? 0;

  const planoNome =
    (usuario as any)?.planoAtivo?.nome
    || usuario?.variables?.plano
    || 'Sem plano ativo';

  const consumoHojeRaw =
    Array.isArray((usuario as any)?.transacoesHoje)
      ? (usuario as any).transacoesHoje
        .map((tx: any) => String(tx?.item || tx?.description || '').trim())
        .filter(Boolean)
        .join(' | ')
      : (usuario?.variables?.consumo_hoje || '');

  const vars: Record<string, string> = {
    nome: String(usuario?.nome || usuario?.variables?.nome || 'Cliente'),
    nome_pai: String(usuario?.variables?.nome_pai || usuario?.nome || 'Responsável'),
    nome_colaborador: String(usuario?.variables?.nome_colaborador || usuario?.nome || 'Colaborador'),
    parentesco: String(usuario?.variables?.parentesco || 'Indefinido'),
    saldo: typeof financeiroSaldo === 'string' && financeiroSaldo.includes('R$')
      ? financeiroSaldo
      : toCurrency(financeiroSaldo),
    alunos: alunosNomes || 'Aluno',
    plano: String(planoNome || 'Sem plano ativo'),
    consumo_hoje: String(consumoHojeRaw || 'Sem consumo hoje'),
    status_entrega: String(usuario?.variables?.status_entrega || 'Pendente'),
    periodo_referencia: String(usuario?.variables?.periodo_referencia || ''),
    periodo_nome: String(usuario?.variables?.periodo_nome || ''),
    saldo_por_aluno: String(usuario?.variables?.saldo_por_aluno || ''),
    consumo_total_periodo: String(usuario?.variables?.consumo_total_periodo || ''),
    consumo_total_por_aluno: String(usuario?.variables?.consumo_total_por_aluno || ''),
    filhos_label: alunosArray.length > 1 ? 'seus filhos' : 'seu filho',
  };

  const rendered = String(template || '').replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key: string) => {
    const safeKey = String(key || '').toLowerCase();
    return vars[safeKey] ?? '';
  });

  return cleanupMessage(rendered);
};

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] || '' : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Falha ao converter anexo para base64.'));
    reader.readAsDataURL(file);
  });

const parseMassLogFromApi = (entry: any): MassLog | null => {
  if (!entry || typeof entry !== 'object') return null;
  const id = String(entry.id || '').trim();
  const nome = String(entry.nome || '').trim();
  const telefone = String(entry.telefone || '').trim();
  if (!id || !nome) return null;

  const perfil = String(entry.perfil || '').trim() === 'Colaborador' ? 'Colaborador' : 'Responsável';
  const statusRaw = String(entry.status || '').trim();
  const status: MassLog['status'] =
    statusRaw === 'Sucesso' || statusRaw === 'Erro' || statusRaw === 'Simulado' || statusRaw === 'Inválido'
      ? (statusRaw as MassLog['status'])
      : 'Erro';

  const timestampRaw = String(entry.timestamp || '').trim();
  const horario = timestampRaw ? new Date(timestampRaw) : new Date();
  const safeHorario = Number.isFinite(horario.getTime()) ? horario : new Date();

  return {
    id,
    nome,
    telefone,
    perfil,
    status,
    horario: safeHorario,
    detalhe: entry.detalhe ? String(entry.detalhe) : undefined,
  };
};

const toPersistedLog = (entry: MassLog): PersistedLogEntry => ({
  id: entry.id,
  nome: entry.nome,
  telefone: entry.telefone,
  perfil: entry.perfil,
  status: entry.status,
  detalhe: entry.detalhe,
  timestamp: entry.horario.toISOString(),
});

const WhatsAppMassPreview: React.FC<{
  nome: string;
  mensagem: string;
}> = ({ nome, mensagem }) => {
  const horario = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return (
    <div className="rounded-2xl border border-slate-200 shadow-lg overflow-hidden bg-white">
      <div className="px-4 py-3 bg-emerald-700 text-white">
        <p className="text-sm font-black">{nome || 'Cliente'}</p>
        <p className="text-[11px] font-semibold text-emerald-100">online</p>
      </div>
      <div className="p-4 min-h-[320px] bg-[#e5ddd5]">
        <div className="ml-auto max-w-[92%] rounded-2xl bg-[#dcf8c6] px-4 py-3 shadow-md border border-emerald-200">
          <p className="text-sm font-medium text-slate-800 whitespace-pre-wrap">
            {mensagem || 'Sem mensagem para pré-visualização.'}
          </p>
          <div className="mt-1.5 flex items-center justify-end gap-1">
            <span className="text-[11px] text-slate-500">{horario}</span>
            <CheckCheck size={14} className="text-sky-500" />
          </div>
        </div>
      </div>
    </div>
  );
};

type DisparoEmMassaProps = {
  activeEnterprise: Enterprise | null;
};

const DisparoEmMassa: React.FC<DisparoEmMassaProps> = ({ activeEnterprise }) => {
  const [automationId, setAutomationId] = useState('');
  const [automationName, setAutomationName] = useState('Aviso de Saldo e Consumo Pais');
  const [audienceFilter, setAudienceFilter] = useState<AudienceFilter>('TODOS');
  const [reportProfileType, setReportProfileType] = useState<ReportProfileType>('RESPONSAVEL_PARENTESCO');
  const [periodMode, setPeriodMode] = useState<DispatchPeriodMode>('SEMANAL');
  const [dispatchTime, setDispatchTime] = useState('17:00');
  const [template, setTemplate] = useState(buildDefaultTemplate('RESPONSAVEL_PARENTESCO', 'SEMANAL'));
  const [delayMin, setDelayMin] = useState(2);
  const [delayMax, setDelayMax] = useState(6);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [isSimulation, setIsSimulation] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [recipients, setRecipients] = useState<AudienceRecipient[]>([]);
  const [isLoadingRecipients, setIsLoadingRecipients] = useState(false);
  const [logs, setLogs] = useState<MassLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [progress, setProgress] = useState<ProgressState>({ total: 0, processados: 0, enviados: 0, erros: 0 });
  const [mensagemStatus, setMensagemStatus] = useState('Aguardando início do disparo.');
  const [showResumoModal, setShowResumoModal] = useState(false);
  const [batchLimit, setBatchLimit] = useState(50);
  const [usuarioSelecionadoId, setUsuarioSelecionadoId] = useState('');
  const [previewContactSearch, setPreviewContactSearch] = useState('');
  const [previewText, setPreviewText] = useState('Sem audiência para pré-visualização.');
  const [periodLabel, setPeriodLabel] = useState('');
  const [periodInfo, setPeriodInfo] = useState('');
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [enterprisePlans, setEnterprisePlans] = useState<Array<{ id?: string; name: string; isActive?: boolean }>>([]);
  const stopSignal = useRef(false);
  const prevProfileTypeRef = useRef<ReportProfileType>(reportProfileType);
  const prevPeriodModeRef = useRef<DispatchPeriodMode>(periodMode);

  const templatesRapidos = useMemo(
    () => reportProfileType === 'COLABORADOR'
      ? [
        {
          id: 'colab-extrato',
          label: '📄 Extrato de Consumo',
          text: buildDefaultTemplate('COLABORADOR', periodMode),
        },
        {
          id: 'colab-saldo',
          label: '💳 Saldo Atual',
          text: [
            'Mensagem automática da cantina.',
            'Prezado {{nome_colaborador}}, segue seu resumo {{periodo_nome}}.',
            'Período: {{periodo_referencia}}',
            'Consumo total no período: {{consumo_total_periodo}}',
            'Saldo atual: {{saldo}}',
            'Plano: {{plano}}',
          ].join('\n'),
        },
      ]
      : [
        {
          id: 'resp-relatorio',
          label: '👨‍👩‍👧 Relatório Dependentes',
          text: buildDefaultTemplate('RESPONSAVEL_PARENTESCO', periodMode),
        },
        {
          id: 'resp-saldo-baixo',
          label: '🔔 Saldo Baixo',
          text: [
            'Mensagem automática da cantina.',
            'Olá {{nome_pai}}, identificamos saldo baixo no período {{periodo_referencia}}.',
            'Dependentes: {{alunos}}',
            'Saldos por aluno:',
            '{{saldo_por_aluno}}',
          ].join('\n'),
        },
        {
          id: 'resp-entrega',
          label: '🍱 Entrega de Hoje',
          text: 'Olá {{nome_pai}}, status de entrega de hoje: {{status_entrega}}.',
        },
      ],
    [periodMode, reportProfileType]
  );

  const usuarioSelecionado = useMemo(
    () => recipients.find((item) => item.id === usuarioSelecionadoId) || recipients[0] || null,
    [recipients, usuarioSelecionadoId]
  );

  const previewName = usuarioSelecionado?.nome || 'Cliente';

  const progressPct = progress.total > 0
    ? Math.round((progress.processados / progress.total) * 100)
    : 0;
  const isDestaSemanaMode = periodMode === 'DESTA_SEMANA';

  const audienceCounters = useMemo(() => {
    return recipients.reduce(
      (acc, item) => {
        if (item.tipo === 'RESPONSAVEL') acc.responsaveis += 1;
        if (item.tipo === 'COLABORADOR') acc.colaboradores += 1;
        return acc;
      },
      { responsaveis: 0, colaboradores: 0 }
    );
  }, [recipients]);

  const previewRecipients = useMemo(() => {
    const term = String(previewContactSearch || '').trim().toLowerCase();
    if (!term) return recipients;
    return recipients.filter((item) => {
      const target = [
        item.nome,
        item.telefone,
        ...(Array.isArray(item.alunos) ? item.alunos : []),
      ]
        .map((value) => String(value || '').toLowerCase())
        .join(' ');
      return target.includes(term);
    });
  }, [recipients, previewContactSearch]);

  const clearLogs = async () => {
    if (!activeEnterprise?.id) {
      setLogs([]);
      return;
    }

    try {
      await ApiService.clearWhatsAppDispatchLogs(activeEnterprise.id);
      setLogs([]);
      setFeedback('Logs do disparo limpos com sucesso.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Falha ao limpar logs.');
    }
  };

  const visualizarModeloPdf = () => {
    if (!usuarioSelecionado?.report) {
      setFeedback('Selecione um contato com dados de relatório para visualizar o PDF.');
      return;
    }

    const doc = new jsPDF('l', 'pt', 'a4');
    const marginX = 36;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const contentWidth = pageWidth - marginX * 2;
    const periodText = usuarioSelecionado.report.periodLabel || periodLabel || '-';
    const isResponsible = usuarioSelecionado.tipo === 'RESPONSAVEL';
    const profileLabel = isResponsible ? 'Responsável / Parentesco' : 'Colaborador';
    const logoDataUrl = typeof activeEnterprise?.logo === 'string' ? activeEnterprise.logo.trim() : '';
    const safeLogoDataUrl = logoDataUrl.startsWith('data:image/') ? logoDataUrl : '';

    const toAmount = (value: string) => {
      const raw = String(value || '').trim();
      const isNegative = /(^-|-\s*R\$|-\s*\d)/i.test(raw);
      const normalized = raw
        .replace(/[^\d,.-]/g, '')
        .replace(/\.(?=\d{3}(?:\D|$))/g, '')
        .replace(',', '.')
        .replace(/(?!^)-/g, '');
      const numberValue = Number(normalized);
      if (!Number.isFinite(numberValue)) return 0;
      const abs = Math.abs(numberValue);
      return isNegative ? -abs : abs;
    };

    const rows = usuarioSelecionado.report.rows || [];
    const normalizeText = (value: unknown) =>
      String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/\s+/g, ' ')
        .trim();
    const normalizeKey = (value: unknown) => normalizeText(value).replace(/[^A-Z0-9]/g, '');
    const simplifyPlanKey = (value: unknown) => normalizeKey(value)
      .replace(/FIXO/g, '')
      .replace(/PLANO/g, '')
      .replace(/CREDITO/g, '')
      .trim();

    const parseTokens = (rawText: string) => {
      const text = String(rawText || '');
      const tokens: Array<{ qty: number; name: string }> = [];
      const regex = /(\d+(?:[.,]\d+)?)\s*x\s*([^,|]+)/gi;
      let match: RegExpExecArray | null = regex.exec(text);
      while (match) {
        const qty = Number(String(match[1] || '').replace(',', '.'));
        const name = String(match[2] || '').trim();
        if (Number.isFinite(qty) && qty > 0 && name) {
          tokens.push({ qty, name });
        }
        match = regex.exec(text);
      }
      return tokens;
    };
    const formatQty = (value: number) => {
      const safe = Number(value || 0);
      if (!Number.isFinite(safe)) return '0';
      const rounded = Math.round(safe * 100) / 100;
      return Number.isInteger(rounded)
        ? String(Math.trunc(rounded))
        : rounded.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    };

    const isCantinaText = (text: string) => {
      const norm = normalizeText(text);
      return (
        norm.includes('CARTEIRA')
        || norm.includes('PRE PAGA')
        || norm.includes('PREPAGA')
        || norm.includes('SALDO CANTINA')
        || norm.includes('CREDITO LIVRE')
      );
    };

    const planNamesByKey = new Map<string, string>();
    const creditPlanValues = new Map<string, number>();
    const creditPlanQty = new Map<string, number>();
    const consumptionPlanValues = new Map<string, number>();
    const consumptionPlanQty = new Map<string, number>();
    const estornoPlanValues = new Map<string, number>();
    const estornoPlanQty = new Map<string, number>();
    const unitPriceByPlan = new Map<string, number>();
    let creditCantina = 0;
    let consumptionCantina = 0;
    let estornoCantina = 0;
    const creditQtyByStudentPlan = new Map<string, number>();
    const runningConsumedQtyByStudentPlan = new Map<string, number>();

    const activePlansRaw = String(usuarioSelecionado?.variables?.plano || '')
      .split(',')
      .map((name) => String(name || '').trim())
      .filter(Boolean)
      .filter((name) => normalizeText(name) !== 'SEM PLANO ATIVO');
    const createdPlansRaw = enterprisePlans
      .map((plan) => String(plan?.name || '').trim())
      .filter(Boolean);
    const allKnownPlansRaw = Array.from(new Set([...createdPlansRaw, ...activePlansRaw]));
    const activePlanNamesByKey = new Map<string, string>();
    activePlansRaw.forEach((name) => {
      const key = normalizeKey(name);
      if (key) activePlanNamesByKey.set(key, name);
    });

    const ensurePlanName = (rawName: string) => {
      const key = normalizeKey(rawName);
      const label = activePlanNamesByKey.get(key) || String(rawName || '').trim();
      if (key && label && !planNamesByKey.has(key)) {
        planNamesByKey.set(key, label);
      }
      return key;
    };
    const resolvePlanKey = (rawName: string) => {
      const direct = normalizeKey(rawName);
      if (direct && activePlanNamesByKey.has(direct)) {
        ensurePlanName(activePlanNamesByKey.get(direct) || rawName);
        return direct;
      }
      if (direct && planNamesByKey.has(direct)) return direct;

      const simplified = simplifyPlanKey(rawName);
      if (!simplified) return '';

      for (const [key, label] of activePlanNamesByKey.entries()) {
        const candidate = simplifyPlanKey(label);
        if (!candidate) continue;
        if (
          candidate === simplified
          || candidate.includes(simplified)
          || simplified.includes(candidate)
        ) {
          ensurePlanName(label);
          return key;
        }
      }

      for (const [key] of planNamesByKey.entries()) {
        const candidate = simplifyPlanKey(key);
        if (!candidate) continue;
        if (
          candidate === simplified
          || candidate.includes(simplified)
          || simplified.includes(candidate)
        ) {
          return key;
        }
      }
      return '';
    };

    allKnownPlansRaw.forEach((planName) => ensurePlanName(planName));

    // Passo 1: detectar planos explícitos e preço unitário inferido por consumo simples
    rows.forEach((row) => {
      const rowText = `${String(row.item || '')} ${String(row.alunoNome || '')}`;
      const tipo = normalizeText(row.tipo || '');
      const amount = Math.abs(toAmount(row.valor));
      const tokens = parseTokens(rowText);

      const creditPlanMatch = rowText.match(/cr[eé]dito\s+plano\s+(.+)$/i);
      if (creditPlanMatch?.[1]) {
        ensurePlanName(String(creditPlanMatch[1] || '').trim());
      }
      const explicitPlanFromDesc = rowText.match(/plano\s+([A-Za-zÀ-ÿ0-9\s\-_]+)/i);
      if (explicitPlanFromDesc?.[1]) {
        ensurePlanName(String(explicitPlanFromDesc[1] || '').trim());
      }
      tokens.forEach((token) => {
        if (normalizeText(token.name).includes('FIXO') || normalizeText(token.name).includes('PLANO')) {
          ensurePlanName(token.name);
        }
      });

      if (tipo === 'CONSUMO' && tokens.length === 1 && amount > 0) {
        const token = tokens[0];
        const tokenKey = resolvePlanKey(token.name);
        if (tokenKey) {
          const inferredUnit = amount / token.qty;
          if (Number.isFinite(inferredUnit) && inferredUnit > 0) {
            unitPriceByPlan.set(tokenKey, inferredUnit);
          }
        }
      }
    });

    // Passo 2: consolidar crédito/consumo/estorno por plano e cantina
    rows.forEach((row) => {
      const rowText = String(row.item || '').trim();
      const tipo = normalizeText(row.tipo || '');
      const amount = Math.abs(toAmount(row.valor));
      const tokens = parseTokens(rowText);
      const rowHasCantinaKeyword = isCantinaText(rowText);

      if (tipo === 'CREDITO') {
        const creditPlanMatch = rowText.match(/cr[eé]dito\s+plano\s+(.+)$/i);
        if (creditPlanMatch?.[1]) {
          const planName = String(creditPlanMatch[1] || '').trim();
          const key = ensurePlanName(planName);
          if (key) {
            creditPlanValues.set(key, (creditPlanValues.get(key) || 0) + amount);
            const unitPrice = unitPriceByPlan.get(key) || 0;
            if (unitPrice > 0) {
              creditPlanQty.set(key, (creditPlanQty.get(key) || 0) + (amount / unitPrice));
            }
            return;
          }
        }
        if (rowHasCantinaKeyword || !/plano/i.test(rowText)) {
          creditCantina += amount;
          return;
        }
      }

      if (tipo === 'CONSUMO' || tipo === 'ESTORNO') {
        const valueMap = tipo === 'ESTORNO' ? estornoPlanValues : consumptionPlanValues;
        const qtyMap = tipo === 'ESTORNO' ? estornoPlanQty : consumptionPlanQty;

        let allocatedPlanValue = 0;
        let hasAnyPlanToken = false;

        const planTokens = tokens.filter((token) => {
          const key = resolvePlanKey(token.name);
          return Boolean(key);
        });

        if (planTokens.length > 0) {
          hasAnyPlanToken = true;
          const unknownTokens: Array<{ key: string; qty: number }> = [];
          planTokens.forEach((token) => {
            const key = resolvePlanKey(token.name);
            if (!key) return;
            qtyMap.set(key, (qtyMap.get(key) || 0) + token.qty);
            const unitPrice = unitPriceByPlan.get(key) || 0;
            if (unitPrice > 0) {
              const value = token.qty * unitPrice;
              valueMap.set(key, (valueMap.get(key) || 0) + value);
              allocatedPlanValue += value;
            } else {
              unknownTokens.push({ key, qty: token.qty });
            }
          });

          if (unknownTokens.length > 0) {
            const totalUnknownQty = unknownTokens.reduce((acc, t) => acc + t.qty, 0);
            const available = Math.max(0, amount - allocatedPlanValue);
            unknownTokens.forEach((token) => {
              const proportional = totalUnknownQty > 0 ? (available * token.qty) / totalUnknownQty : 0;
              valueMap.set(token.key, (valueMap.get(token.key) || 0) + proportional);
              allocatedPlanValue += proportional;
            });
          }
        } else {
          const explicitPlanMatch = rowText.match(/plano\s+([A-Za-zÀ-ÿ0-9\s\-_]+)/i);
          if (explicitPlanMatch?.[1]) {
            const key = ensurePlanName(String(explicitPlanMatch[1] || '').trim());
            if (key) {
              hasAnyPlanToken = true;
              const qty = Math.max(1, Number(row.item?.match(/(\d+(?:[.,]\d+)?)\s*x/i)?.[1] || 1));
              qtyMap.set(key, (qtyMap.get(key) || 0) + qty);
              valueMap.set(key, (valueMap.get(key) || 0) + amount);
              allocatedPlanValue += amount;
            }
          }
        }

        const remainder = Math.max(0, amount - allocatedPlanValue);
        if (remainder > 0 || (!hasAnyPlanToken && !rowHasCantinaKeyword)) {
          if (tipo === 'ESTORNO') {
            estornoCantina += remainder > 0 ? remainder : amount;
          } else {
            consumptionCantina += remainder > 0 ? remainder : amount;
          }
        } else if (rowHasCantinaKeyword && !hasAnyPlanToken) {
          if (tipo === 'ESTORNO') estornoCantina += amount;
          else consumptionCantina += amount;
        }
      }
    });

    const sumMapValues = (map: Map<string, number>) =>
      Array.from(map.values()).reduce((acc, value) => acc + Number(value || 0), 0);

    const totalCreditsByPlan = sumMapValues(creditPlanValues);
    const totalConsumptionByPlan = sumMapValues(consumptionPlanValues);
    const totalEstornoByPlan = sumMapValues(estornoPlanValues);
    const totalCredits = totalCreditsByPlan + creditCantina;
    const totalConsumption = totalConsumptionByPlan + consumptionCantina;
    const totalEstorno = totalEstornoByPlan + estornoCantina;
    const totalSaidas = totalConsumption + totalEstorno;
    const saldoFinal = totalCredits - totalSaidas;

    const formatCurrency = (value: number) =>
      value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const planPriority = (label: string) => {
      const normalized = normalizeText(label);
      if (normalized.includes('LANCHE')) return 1;
      if (normalized.includes('ALMOCO')) return 2;
      if (normalized.includes('PRE PAGA') || normalized.includes('PREPAGA') || normalized.includes('CARTEIRA')) return 3;
      return 99;
    };
    const orderedPlanEntries = Array.from(planNamesByKey.entries()).sort((a, b) => {
      const prio = planPriority(a[1]) - planPriority(b[1]);
      if (prio !== 0) return prio;
      return a[1].localeCompare(b[1], 'pt-BR', { sensitivity: 'base' });
    });

    const saldoCantina = creditCantina - consumptionCantina - estornoCantina;

    // Passo 3: quantidade creditada por aluno/plano para exibir progresso por linha (ex: 3/9)
    rows.forEach((row) => {
      const rowText = String(row.item || '').trim();
      const tipo = normalizeText(row.tipo || '');
      if (tipo !== 'CREDITO') return;

      const creditPlanMatch = rowText.match(/cr[eé]dito\s+plano\s+(.+)$/i);
      if (!creditPlanMatch?.[1]) return;
      const planName = String(creditPlanMatch[1] || '').trim();
      const planKey = normalizeKey(planName);
      if (!planKey) return;
      const studentKey = normalizeKey(row.alunoNome || usuarioSelecionado.nome || '');
      if (!studentKey) return;

      const value = Math.abs(toAmount(row.valor));
      const unitPrice = Number(unitPriceByPlan.get(planKey) || 0);
      const qty = unitPrice > 0 ? (value / unitPrice) : 0;
      if (!(qty > 0)) return;

      const sk = `${studentKey}__${planKey}`;
      creditQtyByStudentPlan.set(sk, (creditQtyByStudentPlan.get(sk) || 0) + qty);
    });

    // Header institucional
    doc.setFillColor(30, 64, 175);
    doc.rect(0, 0, pageWidth, 78, 'F');

    if (safeLogoDataUrl) {
      try {
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(marginX, 16, 44, 44, 8, 8, 'F');
        doc.addImage(safeLogoDataUrl, 'PNG', marginX + 4, 20, 36, 36);
      } catch {
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(marginX, 16, 44, 44, 8, 8, 'F');
        doc.setTextColor(30, 64, 175);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.text('CA', marginX + 22, 44, { align: 'center' });
      }
    } else {
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(marginX, 16, 44, 44, 8, 8, 'F');
      doc.setTextColor(30, 64, 175);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text('CA', marginX + 22, 44, { align: 'center' });
    }

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(isResponsible ? 'Relatório de Consumo Escolar - Dependentes' : 'Extrato de Consumo - Funcionário', marginX + 56, 34);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Unidade: ${activeEnterprise?.name || '-'}`, marginX + 56, 51);
    doc.text(`Período: ${periodText}`, marginX + 56, 66);

    const idStartY = 92;
    doc.setDrawColor(203, 213, 225);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(marginX, idStartY, contentWidth, 76, 8, 8, 'FD');
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`Cliente: ${usuarioSelecionado.nome}`, marginX + 12, idStartY + 22);
    doc.text(`Perfil: ${profileLabel}`, marginX + 12, idStartY + 40);
    doc.text(`Código: ${usuarioSelecionado.id || '-'}`, marginX + 12, idStartY + 58);
    doc.setFont('helvetica', 'normal');
    doc.text(`Telefone: ${usuarioSelecionado.telefone || '-'}`, marginX + 280, idStartY + 22);
    doc.text(`Contato de prévia: ${previewName || '-'}`, marginX + 280, idStartY + 40);
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, marginX + 280, idStartY + 58);

    // Tabela principal
    const bodyRows = rows.map((row) => {
      const unitsMatch = String(row.item || '').match(/(\d+(?:[.,]\d+)?)\s*x/i);
      const units = unitsMatch?.[1] || '-';
      let description = String(row.item || '-');

      const tipo = normalizeText(row.tipo || '');
      if (tipo === 'CONSUMO' || tipo === 'ESTORNO') {
        const rowText = String(row.item || '').trim();
        const studentKey = normalizeKey(row.alunoNome || usuarioSelecionado.nome || '');
        const tokens = parseTokens(rowText);
        const planTokens = tokens
          .map((token) => ({ ...token, key: resolvePlanKey(token.name) }))
          .filter((token) => Boolean(token.key));

        const ratioParts: string[] = [];
        if (planTokens.length > 0 && studentKey) {
          planTokens.forEach((token) => {
            const planKey = String(token.key || '');
            const key = `${studentKey}__${planKey}`;
            const newConsumed = (runningConsumedQtyByStudentPlan.get(key) || 0) + token.qty;
            runningConsumedQtyByStudentPlan.set(key, newConsumed);
            const totalCreditQty = creditQtyByStudentPlan.get(key) || creditPlanQty.get(planKey) || 0;
            if (totalCreditQty > 0) {
              const remaining = Math.max(0, totalCreditQty - newConsumed);
              const hasMultiplePlansInLine = planTokens.length > 1;
              const label = hasMultiplePlansInLine ? `${planNamesByKey.get(planKey) || token.name}: ` : '';
              ratioParts.push(`${label}${formatQty(newConsumed)}/${formatQty(totalCreditQty)} (restam ${formatQty(remaining)})`);
            }
          });
        } else {
          const explicitPlanMatch = rowText.match(/plano\s+([A-Za-zÀ-ÿ0-9\s\-_]+)/i);
          if (explicitPlanMatch?.[1] && studentKey) {
            const planName = String(explicitPlanMatch[1] || '').trim();
            const planKey = normalizeKey(planName);
            if (planKey) {
              const qty = Math.max(1, Number(String(row.item || '').match(/(\d+(?:[.,]\d+)?)\s*x/i)?.[1] || 1));
              const key = `${studentKey}__${planKey}`;
              const newConsumed = (runningConsumedQtyByStudentPlan.get(key) || 0) + qty;
              runningConsumedQtyByStudentPlan.set(key, newConsumed);
              const totalCreditQty = creditQtyByStudentPlan.get(key) || creditPlanQty.get(planKey) || 0;
              if (totalCreditQty > 0) {
                const remaining = Math.max(0, totalCreditQty - newConsumed);
                ratioParts.push(`${formatQty(newConsumed)}/${formatQty(totalCreditQty)} (restam ${formatQty(remaining)})`);
              }
            }
          }
        }

        if (ratioParts.length > 0) {
          description = `${description} • ${ratioParts.join(' | ')}`;
        }
      }

      return [
        row.data || '-',
        row.alunoNome || '-',
        String(row.tipo || '-').toUpperCase(),
        description,
        units,
        formatCurrency(Math.abs(toAmount(row.valor))),
      ];
    });

    autoTable(doc, {
      startY: idStartY + 88,
      head: [['Data', 'Aluno/Colaborador', 'Tipo', 'Descrição do Item / Insumo', 'Unidades', 'Valor (R$)']],
      body: bodyRows.length > 0 ? bodyRows : [['-', '-', '-', 'Sem movimentações no período', '-', '-']],
      styles: { fontSize: 9, cellPadding: 6, textColor: [31, 41, 55] },
      headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold', halign: 'left' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { halign: 'left', cellWidth: 74 },
        1: { halign: 'left', cellWidth: 150 },
        2: { halign: 'left', cellWidth: 82 },
        3: { halign: 'left', cellWidth: 330 },
        4: { halign: 'right', cellWidth: 78 },
        5: { halign: 'right', cellWidth: 86 },
      },
      margin: { left: marginX, right: marginX },
      didParseCell: (data) => {
        if (data.section !== 'body') return;
        const tipo = String(data.row.raw?.[2] || '').toUpperCase();
        if (data.column.index === 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.textColor = [15, 23, 42];
        }
        if (data.column.index !== 1 && tipo === 'CONSUMO') {
          data.cell.styles.textColor = [185, 28, 28];
        } else if (data.column.index !== 1 && (tipo === 'CREDITO' || tipo === 'ESTORNO')) {
          data.cell.styles.textColor = [22, 101, 52];
        }
      },
    });

    let summaryStartY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 18 : 250;
    const neededHeight = 180;
    if (summaryStartY + neededHeight > pageHeight - 20) {
      doc.addPage();
      summaryStartY = 44;
    }

    // Cards de resumo
    const gap = 10;
    const cardW = (contentWidth - gap * 2) / 3;
    const cardH = 118;
    const drawCard = (
      x: number,
      title: string,
      valueTop: string,
      detailLines: string[],
      fill: [number, number, number],
      text: [number, number, number]
    ) => {
      doc.setFillColor(fill[0], fill[1], fill[2]);
      doc.roundedRect(x, summaryStartY, cardW, cardH, 8, 8, 'F');
      doc.setTextColor(text[0], text[1], text[2]);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(title, x + 10, summaryStartY + 20);
      doc.setFontSize(12);
      doc.text(valueTop, x + 10, summaryStartY + 39);
      if (detailLines.length > 0) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.6);
        const limited = detailLines.slice(0, 4);
        limited.forEach((line, index) => {
          const y = summaryStartY + 54 + (index * 13);
          const wrapped = doc.splitTextToSize(line, cardW - 16);
          doc.text(String(wrapped[0] || ''), x + 10, y);
        });
      }
    };

    const creditDetailLines = [
      ...orderedPlanEntries.map(([key, label]) => {
        const value = creditPlanValues.get(key) || 0;
        const qty = creditPlanQty.get(key) || 0;
        const qtyLabel = qty > 0 ? ` • ${Number(qty).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} un` : '';
        return `${label}: ${formatCurrency(value)}${qtyLabel}`;
      }),
      `Cantina: ${formatCurrency(creditCantina)}`,
    ];

    const consumptionDetailLines = [
      ...orderedPlanEntries.map(([key, label]) => {
        const consumedValue = consumptionPlanValues.get(key) || 0;
        const estornoValue = estornoPlanValues.get(key) || 0;
        const consumedQty = consumptionPlanQty.get(key) || 0;
        const estornoQty = estornoPlanQty.get(key) || 0;
        const totalPlanOut = consumedValue + estornoValue;
        const totalQty = consumedQty + estornoQty;
        return `${label}: ${formatCurrency(totalPlanOut)} • ${Number(totalQty).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} un`;
      }),
      `Cantina: ${formatCurrency(consumptionCantina + estornoCantina)}`,
    ];

    const saldoDetailLines = [
      ...orderedPlanEntries.map(([key, label]) => {
        const creditQty = creditPlanQty.get(key) || 0;
        const consumedQty = consumptionPlanQty.get(key) || 0;
        const estornoQty = estornoPlanQty.get(key) || 0;
        const saldoQty = creditQty - consumedQty - estornoQty;
        const saldoValue = (creditPlanValues.get(key) || 0) - (consumptionPlanValues.get(key) || 0) - (estornoPlanValues.get(key) || 0);
        return `${label}: ${formatCurrency(saldoValue)} • saldo ${formatQty(saldoQty)} un`;
      }),
      `Cantina: ${formatCurrency(saldoCantina)}`,
    ];

    drawCard(
      marginX,
      'TOTAL CRÉDITOS',
      formatCurrency(totalCredits),
      creditDetailLines,
      [220, 252, 231],
      [22, 101, 52]
    );
    drawCard(
      marginX + cardW + gap,
      'TOTAL CONSUMO / ESTORNOS',
      formatCurrency(totalSaidas),
      [
        ...consumptionDetailLines,
        `Consumo: ${formatCurrency(totalConsumption)} | Estornos: ${formatCurrency(totalEstorno)}`,
      ],
      [254, 226, 226],
      [185, 28, 28]
    );
    drawCard(
      marginX + (cardW + gap) * 2,
      'SALDO FINAL',
      formatCurrency(saldoFinal),
      saldoDetailLines,
      [30, 64, 175],
      [255, 255, 255]
    );

    // Rodapé legal
    doc.setDrawColor(226, 232, 240);
    doc.line(marginX, pageHeight - 40, pageWidth - marginX, pageHeight - 40);
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.text(
      'Este relatório foi gerado automaticamente pelo Cantina Smart. Valores sujeitos a conferência pelo financeiro.',
      marginX,
      pageHeight - 26
    );

    const blobUrl = doc.output('bloburl');
    window.open(blobUrl, '_blank', 'noopener,noreferrer');
  };

  const saveAutomationConfig = async () => {
    if (!activeEnterprise?.id) {
      setFeedback('Selecione uma unidade para salvar a configuração.');
      return;
    }

    setIsSavingConfig(true);
    setFeedback('');
    const nextId = automationId || `auto_${Date.now()}`;
    const config: DispatchAutomationConfig = {
      id: nextId,
      nome_perfil: String(automationName || '').trim() || 'Automação sem nome',
      tipo_destinatario: reportProfileType === 'COLABORADOR' ? 'colaborador' : 'responsavel',
      campos: ['consumo', 'saldos', 'descricao_itens'],
      frequencia: (periodMode === 'QUINZENAL'
        ? 'quinzenal'
        : periodMode === 'MENSAL'
          ? 'mensal'
          : 'semanal'),
      agendamento: {
        hora: dispatchTime || '17:00',
        dias_expediente_apenas: isDestaSemanaMode,
      },
      layout_estilo: reportProfileType === 'COLABORADOR' ? 'corporativo_sobrio' : 'escolar_premium',
      filter: audienceFilter,
      profileType: reportProfileType,
      periodMode,
      template,
      delayMin: Math.max(0, Number(delayMin || 0)),
      delayMax: Math.max(0, Number(delayMax || 0)),
      batchLimit: Math.max(1, Math.min(50, Number(batchLimit || 50))),
      isSimulation: Boolean(isSimulation),
      updatedAt: new Date().toISOString(),
    };

    try {
      const response = await ApiService.saveWhatsAppDispatchConfig({
        enterpriseId: activeEnterprise.id,
        config,
      });
      const saved = (response?.config || config) as DispatchAutomationConfig;
      setAutomationId(saved.id || nextId);
      setFeedback('Configuração da automação salva com sucesso.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Falha ao salvar configuração.');
    } finally {
      setIsSavingConfig(false);
    }
  };

  useEffect(() => {
    if (!activeEnterprise?.id) return;
    let cancelled = false;

    const run = async () => {
      setIsLoadingConfig(true);
      setIsLoadingLogs(true);
      try {
        const [configResponse, logsResponse] = await Promise.all([
          ApiService.getWhatsAppDispatchConfig(activeEnterprise.id),
          ApiService.getWhatsAppDispatchLogs({ enterpriseId: activeEnterprise.id, limit: 300 }),
        ]);

        if (cancelled) return;

        const config = configResponse?.config && typeof configResponse.config === 'object'
          ? (configResponse.config as Partial<DispatchAutomationConfig>)
          : null;
        if (config) {
          setAutomationId(String(config.id || '').trim());
          setAutomationName(String(config.nome_perfil || '').trim() || 'Aviso de Saldo e Consumo Pais');
          setAudienceFilter(ALLOWED_FILTERS.includes(config.filter as AudienceFilter) ? (config.filter as AudienceFilter) : 'TODOS');
          setReportProfileType(
            ALLOWED_PROFILE_TYPES.includes(config.profileType as ReportProfileType)
              ? (config.profileType as ReportProfileType)
              : (config.tipo_destinatario === 'colaborador' ? 'COLABORADOR' : 'RESPONSAVEL_PARENTESCO')
          );
          const loadedPeriodMode: DispatchPeriodMode = ALLOWED_PERIOD_MODES.includes(config.periodMode as DispatchPeriodMode)
            ? (config.periodMode as DispatchPeriodMode)
            : (config.agendamento?.dias_expediente_apenas
              ? 'DESTA_SEMANA'
              : (config.frequencia === 'quinzenal'
                ? 'QUINZENAL'
                : config.frequencia === 'mensal'
                  ? 'MENSAL'
                  : 'SEMANAL'));
          setPeriodMode(loadedPeriodMode);
          setDispatchTime(String(config.agendamento?.hora || '17:00'));
          setDelayMin(Math.max(0, Number(config.delayMin || 2)));
          setDelayMax(Math.max(0, Number(config.delayMax || 6)));
          setBatchLimit(Math.max(1, Math.min(50, Number(config.batchLimit || 50))));
          setIsSimulation(Boolean(config.isSimulation ?? true));

          const loadedTemplate = String(config.template || '').trim();
          if (loadedTemplate) {
            setTemplate(loadedTemplate);
          } else {
            const loadedProfile = config.profileType === 'COLABORADOR' ? 'COLABORADOR' : 'RESPONSAVEL_PARENTESCO';
            setTemplate(getDefaultTemplateByProfileAndPeriod(loadedProfile, loadedPeriodMode));
          }
        }

        const remoteLogs = Array.isArray(logsResponse?.logs)
          ? logsResponse.logs.map(parseMassLogFromApi).filter(Boolean) as MassLog[]
          : [];
        setLogs(remoteLogs);
      } catch (error) {
        if (!cancelled) {
          setFeedback(error instanceof Error ? error.message : 'Falha ao carregar configuração e logs.');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingConfig(false);
          setIsLoadingLogs(false);
        }
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [activeEnterprise?.id]);

  useEffect(() => {
    const previousProfile = prevProfileTypeRef.current;
    const previousPeriod = prevPeriodModeRef.current;
    const changed = previousProfile !== reportProfileType || previousPeriod !== periodMode;
    if (!changed) return;

    const prevDefault = getDefaultTemplateByProfileAndPeriod(previousProfile, previousPeriod);
    const currentDefault = getDefaultTemplateByProfileAndPeriod(reportProfileType, periodMode);
    if (!template.trim() || template.trim() === prevDefault.trim()) {
      setTemplate(currentDefault);
    }
    prevProfileTypeRef.current = reportProfileType;
    prevPeriodModeRef.current = periodMode;
  }, [periodMode, reportProfileType, template]);

  useEffect(() => {
    if (reportProfileType === 'COLABORADOR' && audienceFilter === 'RESPONSAVEIS') {
      setAudienceFilter('TODOS');
      return;
    }
    if (reportProfileType === 'RESPONSAVEL_PARENTESCO' && audienceFilter === 'COLABORADORES') {
      setAudienceFilter('TODOS');
    }
  }, [reportProfileType, audienceFilter]);

  useEffect(() => {
    if (!activeEnterprise?.id) return;
    let cancelled = false;

    const run = async () => {
      try {
        setIsLoadingRecipients(true);
        const data = await ApiService.getWhatsAppDispatchAudience({
          enterpriseId: activeEnterprise.id,
          filter: audienceFilter,
          profileType: reportProfileType,
          periodMode,
          businessDaysOnly: periodMode === 'DESTA_SEMANA',
        });
        if (!cancelled) {
          const list = Array.isArray(data?.recipients) ? data.recipients : [];
          setRecipients(list);
          setPeriodLabel(String(data?.periodLabel || '').trim());
          setPeriodInfo(String(data?.periodInfo || '').trim());
          setUsuarioSelecionadoId((prev) => {
            if (prev && list.some((item: AudienceRecipient) => item.id === prev)) return prev;
            return list[0]?.id || '';
          });
        }
      } catch (error) {
        if (!cancelled) {
          setRecipients([]);
          setPeriodLabel('');
          setPeriodInfo('');
          setUsuarioSelecionadoId('');
          setFeedback(error instanceof Error ? error.message : 'Falha ao buscar audiência.');
        }
      } finally {
        if (!cancelled) setIsLoadingRecipients(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [activeEnterprise?.id, audienceFilter, reportProfileType, periodMode]);

  useEffect(() => {
    if (!activeEnterprise?.id) {
      setEnterprisePlans([]);
      return;
    }
    let cancelled = false;

    const run = async () => {
      try {
        const data = await ApiService.getPlans(activeEnterprise.id);
        if (cancelled) return;
        const plans = Array.isArray(data) ? data : [];
        setEnterprisePlans(
          plans
            .map((plan: any) => ({
              id: String(plan?.id || ''),
              name: String(plan?.name || '').trim(),
              isActive: Boolean(plan?.isActive),
            }))
            .filter((plan: { name: string }) => Boolean(plan.name))
        );
      } catch {
        if (!cancelled) setEnterprisePlans([]);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [activeEnterprise?.id]);

  useEffect(() => {
    if (!usuarioSelecionado) {
      setPreviewText('Sem audiência para pré-visualização.');
      return;
    }
    setPreviewText(renderizarMensagem(template, usuarioSelecionado));
  }, [template, usuarioSelecionado]);

  useEffect(() => {
    if (previewRecipients.length === 0) {
      setUsuarioSelecionadoId('');
      return;
    }
    if (!previewRecipients.some((item) => item.id === usuarioSelecionadoId)) {
      setUsuarioSelecionadoId(previewRecipients[0].id);
    }
  }, [previewRecipients, usuarioSelecionadoId]);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!isSending) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => {
      window.removeEventListener('beforeunload', handler);
    };
  }, [isSending]);

  const processarEnvio = async (usuario: AudienceRecipient): Promise<MassLog> => {
    const perfil: MassLog['perfil'] = usuario.tipo === 'RESPONSAVEL' ? 'Responsável' : 'Colaborador';
    const logBase: Omit<MassLog, 'status'> = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      nome: usuario.nome,
      telefone: usuario.telefone,
      perfil,
      horario: new Date(),
    };

    if (!isValidPhone(usuario.telefone)) {
      return { ...logBase, status: 'Inválido', detalhe: 'Telefone vazio ou inválido.' };
    }

    const waitMs = Math.floor(Math.random() * (delayMax - delayMin + 1) + delayMin) * 1000;
    setMensagemStatus(`Aguardando intervalo aleatório (${Math.round(waitMs / 1000)}s) para ${usuario.nome}...`);
    await sleep(waitMs);

    if (stopSignal.current) {
      return { ...logBase, status: 'Erro', detalhe: 'Disparo cancelado manualmente.' };
    }

    setMensagemStatus(`Enviando para ${usuario.nome} (${usuario.telefone})...`);
    const message = renderizarMensagem(template, usuario);

    if (isSimulation) {
      return { ...logBase, status: 'Simulado', detalhe: message.slice(0, 180) };
    }

    try {
      if (attachment) {
        const base64 = await fileToBase64(attachment);
        const mediaType: 'image' | 'audio' | 'document' = String(attachment.type || '').startsWith('image/')
          ? 'image'
          : String(attachment.type || '').startsWith('audio/')
            ? 'audio'
            : 'document';

        await ApiService.sendWhatsAppMediaToChat(toWhatsAppChatId(usuario.telefone), message, {
          mediaType,
          base64Data: base64,
          mimeType: attachment.type || undefined,
          fileName: attachment.name || undefined,
        });
      } else {
        await ApiService.sendWhatsAppMessage(usuario.telefone, message);
      }

      return { ...logBase, status: 'Sucesso' };
    } catch (error) {
      return {
        ...logBase,
        status: 'Erro',
        detalhe: error instanceof Error ? error.message : 'Falha no envio',
      };
    }
  };

  const iniciarDisparoEmMassa = async () => {
    if (isSending) return;
    if (!activeEnterprise?.id) {
      setFeedback('Selecione uma unidade para iniciar o disparo.');
      return;
    }
    if (!recipients.length) {
      setFeedback('Nenhum destinatário encontrado para o filtro atual.');
      return;
    }
    if (delayMax < delayMin) {
      setFeedback('Delay máximo precisa ser maior ou igual ao mínimo.');
      return;
    }
    if (!template.trim()) {
      setFeedback('Digite a mensagem do disparo em massa.');
      return;
    }

    const cappedLimit = Math.max(1, Math.min(50, Number(batchLimit || 50)));
    const targetRecipients = recipients
      .filter((item) => (
        reportProfileType === 'COLABORADOR'
          ? item.tipo === 'COLABORADOR'
          : item.tipo === 'RESPONSAVEL'
      ))
      .slice(0, cappedLimit);
    if (!targetRecipients.length) {
      setFeedback('Nenhum destinatário válido para o lote atual.');
      return;
    }

    setFeedback('');
    setShowResumoModal(false);
    stopSignal.current = false;
    setIsSending(true);
    setMensagemStatus('Iniciando disparo...');
    setProgress({ total: targetRecipients.length, processados: 0, enviados: 0, erros: 0 });

    const batchLogs: MassLog[] = [];
    let processados = 0;
    let enviados = 0;
    let erros = 0;

    for (const usuario of targetRecipients) {
      if (stopSignal.current) break;
      const logEntry = await processarEnvio(usuario);
      batchLogs.push(logEntry);
      setLogs((prev) => [logEntry, ...prev].slice(0, 500));

      processados += 1;
      if (logEntry.status === 'Sucesso' || logEntry.status === 'Simulado') enviados += 1;
      if (logEntry.status === 'Erro' || logEntry.status === 'Inválido') erros += 1;
      setProgress((prev) => ({ ...prev, processados, enviados, erros }));
    }

    let hadPersistError = false;
    try {
      if (batchLogs.length > 0) {
        await ApiService.appendWhatsAppDispatchLogs({
          enterpriseId: activeEnterprise.id,
          entries: batchLogs.map(toPersistedLog),
        });
      }
    } catch (error) {
      hadPersistError = true;
      setFeedback(
        `Disparo processado, mas houve falha ao persistir logs: ${error instanceof Error ? error.message : 'erro desconhecido'}`
      );
    }

    setIsSending(false);
    setMensagemStatus(stopSignal.current ? 'Disparo cancelado pelo usuário.' : 'Concluído!');
    if (!hadPersistError) {
      setFeedback(
        stopSignal.current
          ? `Disparo interrompido em ${processados} de ${targetRecipients.length} destinatário(s).`
          : (isSimulation
            ? `Simulação concluída para ${targetRecipients.length} destinatário(s).`
            : `Disparo concluído para ${targetRecipients.length} destinatário(s).`)
      );
    }
    setShowResumoModal(true);
  };

  const cancelarDisparo = () => {
    if (!isSending) return;
    stopSignal.current = true;
    setMensagemStatus('Cancelamento solicitado. Finalizando envio atual...');
  };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-cyan-100 bg-white p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-lg font-black text-slate-900">Disparo em Massa</h4>
            <p className="text-sm font-semibold text-slate-500">
              Automação por perfil dinâmico (Responsável/Parentesco ou Colaborador) com logs persistidos.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={saveAutomationConfig}
              disabled={isSavingConfig || isLoadingConfig || !activeEnterprise?.id}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-cyan-200 bg-cyan-50 hover:bg-cyan-100 disabled:opacity-60 text-cyan-700 text-xs font-black uppercase tracking-widest"
            >
              {isSavingConfig ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Salvar Perfil
            </button>
            <button
              type="button"
              onClick={iniciarDisparoEmMassa}
              disabled={isSending || isLoadingRecipients || isLoadingConfig}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-xs font-black uppercase tracking-widest"
            >
              {isSending ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              {isSending ? 'Processando...' : 'Iniciar disparo'}
            </button>
            {isSending && (
              <button
                type="button"
                onClick={cancelarDisparo}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black uppercase tracking-widest"
              >
                Cancelar disparos
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="space-y-1 block">
                <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Nome da automação</span>
                <input
                  value={automationName}
                  onChange={(e) => setAutomationName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-semibold"
                  placeholder="Ex.: Aviso de Saldo e Consumo Pais"
                />
              </label>
              <label className="space-y-1 block">
                <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Hora padrão de envio</span>
                <input
                  type="time"
                  value={dispatchTime}
                  onChange={(e) => setDispatchTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-semibold"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="space-y-1 block">
                <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Tipo de perfil do relatório</span>
                <select
                  value={reportProfileType}
                  onChange={(e) => setReportProfileType(e.target.value as ReportProfileType)}
                  className="w-full px-3 py-2.5 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-semibold"
                >
                  <option value="RESPONSAVEL_PARENTESCO">Responsável / Parentesco</option>
                  <option value="COLABORADOR">Colaborador</option>
                </select>
              </label>

              <label className="space-y-1 block">
                <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Filtro de audiência</span>
                <select
                  value={audienceFilter}
                  onChange={(e) => setAudienceFilter(e.target.value as AudienceFilter)}
                  className="w-full px-3 py-2.5 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-semibold"
                >
                  <option value="TODOS">Todos</option>
                  <option value="RESPONSAVEIS">Apenas Responsáveis</option>
                  <option value="COLABORADORES">Apenas Colaboradores</option>
                  <option value="SALDO_BAIXO">Saldo baixo (&lt; R$ 10,00)</option>
                  <option value="PLANO_A_VENCER">Plano a vencer (5 dias)</option>
                  <option value="RELATORIO_ENTREGA">Relatório de entrega</option>
                </select>
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="space-y-1 block">
                <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Frequência / período</span>
                <select
                  value={periodMode}
                  onChange={(e) => setPeriodMode(e.target.value as DispatchPeriodMode)}
                  className="w-full px-3 py-2.5 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-semibold"
                >
                  <option value="SEMANAL">Semanal</option>
                  <option value="QUINZENAL">Quinzenal</option>
                  <option value="MENSAL">Mensal</option>
                  <option value="DESTA_SEMANA">Desta semana (dias ativos)</option>
                </select>
              </label>
              <div className="rounded-xl border border-cyan-100 bg-cyan-50 px-3 py-2">
                <p className="text-[11px] font-black uppercase tracking-widest text-cyan-700">Regra aplicada</p>
                <p className="text-sm font-semibold text-cyan-900">
                  {isDestaSemanaMode
                    ? 'Dias ativos em Ajustes > Atendimento'
                    : 'Período corrido por datas'}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-cyan-100 bg-cyan-50 px-3 py-2">
              <p className="text-[11px] font-black uppercase tracking-widest text-cyan-700">Período calculado</p>
              <p className="text-sm font-semibold text-cyan-800">{periodLabel || 'Aguardando carregamento...'}</p>
              {periodInfo && (
                <p className="mt-1 text-xs font-semibold text-cyan-700">{periodInfo}</p>
              )}
            </div>

            <label className="space-y-1 block">
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Mensagem</span>
              <div className="mb-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setTemplate(buildDefaultTemplate(reportProfileType, periodMode))}
                  className="px-2.5 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-[11px] font-black text-emerald-700"
                >
                  🧩 Modelo do período
                </button>
                {templatesRapidos.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setTemplate(preset.text)}
                    className="px-2.5 py-1.5 rounded-lg border border-cyan-200 bg-cyan-50 hover:bg-cyan-100 text-[11px] font-black text-cyan-700"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <textarea
                rows={8}
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-medium"
              />
              <p className="text-xs font-semibold text-slate-500">
                Variáveis: <span className="font-black">{'{{nome}}'}</span>, <span className="font-black">{'{{nome_pai}}'}</span>, <span className="font-black">{'{{nome_colaborador}}'}</span>, <span className="font-black">{'{{parentesco}}'}</span>, <span className="font-black">{'{{alunos}}'}</span>, <span className="font-black">{'{{saldo}}'}</span>, <span className="font-black">{'{{plano}}'}</span>, <span className="font-black">{'{{consumo_hoje}}'}</span>, <span className="font-black">{'{{status_entrega}}'}</span>, <span className="font-black">{'{{periodo_referencia}}'}</span>, <span className="font-black">{'{{periodo_nome}}'}</span>, <span className="font-black">{'{{saldo_por_aluno}}'}</span>, <span className="font-black">{'{{consumo_total_periodo}}'}</span>, <span className="font-black">{'{{consumo_total_por_aluno}}'}</span>
              </p>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 block">
                <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Delay Min (s)</span>
                <input
                  type="number"
                  min={0}
                  value={delayMin}
                  onChange={(e) => setDelayMin(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full px-3 py-2 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-semibold"
                />
              </label>
              <label className="space-y-1 block">
                <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Delay Max (s)</span>
                <input
                  type="number"
                  min={0}
                  value={delayMax}
                  onChange={(e) => setDelayMax(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full px-3 py-2 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-semibold"
                />
              </label>
            </div>

            <label className="space-y-1 block">
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Limite por lote (máx. 50)</span>
              <input
                type="number"
                min={1}
                max={50}
                value={batchLimit}
                onChange={(e) => setBatchLimit(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                className="w-full px-3 py-2 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-semibold"
              />
            </label>

            <label className="space-y-1 block">
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Anexo (opcional)</span>
              <input
                type="file"
                onChange={(e) => setAttachment(e.target.files?.[0] || null)}
                className="w-full px-3 py-2 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-semibold"
              />
            </label>

            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-cyan-100 bg-cyan-50 text-sm font-bold text-cyan-700">
              <input
                type="checkbox"
                checked={isSimulation}
                onChange={(e) => setIsSimulation(e.target.checked)}
              />
              Modo Simulação (não envia para WhatsApp)
            </label>
          </div>

          <div className="space-y-3">
            <div className="space-y-2">
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Prévia da mensagem</p>
              <label className="space-y-1 block">
                <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Contato de prévia</span>
                <input
                  type="text"
                  value={previewContactSearch}
                  onChange={(e) => setPreviewContactSearch(e.target.value)}
                  placeholder="Buscar cliente por nome, telefone ou aluno..."
                  className="mb-2 w-full px-3 py-2 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-semibold"
                />
                <select
                  value={usuarioSelecionadoId}
                  onChange={(e) => setUsuarioSelecionadoId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-semibold"
                >
                  {previewRecipients.length === 0 && <option value="">Sem destinatários</option>}
                  {previewRecipients.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nome} ({item.tipo === 'RESPONSAVEL' ? 'Responsável' : 'Colaborador'})
                    </option>
                  ))}
                </select>
              </label>
              <WhatsAppMassPreview nome={previewName} mensagem={previewText} />
            </div>

            <div className="rounded-2xl border border-cyan-100 bg-white p-4">
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Resumo da audiência</p>
              <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Users size={14} />
                {isLoadingRecipients ? 'Carregando destinatários...' : `${recipients.length} destinatário(s) elegível(eis)`}
              </div>
              {!isLoadingRecipients && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-cyan-100 bg-cyan-50 px-2.5 py-2">
                    <p className="text-[11px] font-black uppercase tracking-widest text-cyan-700">Responsáveis</p>
                    <p className="text-sm font-black text-cyan-900">{audienceCounters.responsaveis}</p>
                  </div>
                  <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-2.5 py-2">
                    <p className="text-[11px] font-black uppercase tracking-widest text-emerald-700">Colaboradores</p>
                    <p className="text-sm font-black text-emerald-900">{audienceCounters.colaboradores}</p>
                  </div>
                </div>
              )}
              {!isLoadingRecipients && recipients.length > batchLimit && (
                <p className="mt-2 text-xs font-bold text-amber-700">
                  Serão processados apenas os primeiros {Math.max(1, Math.min(50, batchLimit))} contatos neste lote.
                </p>
              )}
            </div>

            {usuarioSelecionado?.report && (
              <div className="rounded-2xl border border-cyan-100 bg-white p-4">
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Prévia do relatório</p>
                <p className="mt-1 text-sm font-black text-slate-900">{usuarioSelecionado.report.title}</p>
                <p className="text-xs font-semibold text-slate-600">{usuarioSelecionado.report.periodLabel}</p>
                <button
                  type="button"
                  onClick={visualizarModeloPdf}
                  className="mt-2 inline-flex items-center px-3 py-2 rounded-lg border border-cyan-200 bg-cyan-50 hover:bg-cyan-100 text-cyan-700 text-[11px] font-black uppercase tracking-widest"
                >
                  Visualizar modelo em PDF
                </button>
                <p className="mt-2 text-xs font-semibold text-slate-500">
                  {usuarioSelecionado.report.rows.length} linha(s) para o relatório deste contato.
                </p>
                {usuarioSelecionado.report.rows.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {usuarioSelecionado.report.rows.slice(0, 3).map((row, idx) => (
                      <li key={`${row.alunoNome}_${row.data}_${idx}`} className="text-xs font-semibold text-slate-700">
                        {row.data} • {row.alunoNome} • {row.item} • {row.valor}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {progress.total > 0 && (
              <div className="rounded-2xl border border-cyan-100 bg-white p-4">
                <div className="flex items-center justify-between text-xs font-black uppercase tracking-widest text-slate-500">
                  <span>Progresso</span>
                  <span>{progress.processados}/{progress.total} ({progressPct}%)</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={`h-full bg-emerald-500 transition-all duration-300 ${isSending ? 'animate-pulse' : ''}`}
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] font-bold text-slate-600">
                  <span>Enviados: {progress.enviados}</span>
                  <span>Erros: {progress.erros}</span>
                </div>
                <p className="mt-2 text-xs font-semibold text-cyan-700">{mensagemStatus}</p>
              </div>
            )}
          </div>
        </div>

        <p className={`text-sm font-semibold ${feedback ? 'text-cyan-700' : 'text-slate-500'}`}>
          {feedback || 'Configure o filtro e inicie o disparo em massa.'}
        </p>
      </section>

      <section className="rounded-2xl border border-cyan-100 bg-white p-5">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-lg font-black text-slate-900">Painel de Logs de Disparo</h4>
          <button
            type="button"
            onClick={clearLogs}
            disabled={isLoadingLogs}
            className="px-3 py-2 rounded-lg border border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100 text-xs font-black uppercase tracking-widest disabled:opacity-60"
          >
            Limpar Logs
          </button>
        </div>
        {isLoadingLogs ? (
          <p className="mt-2 text-sm font-semibold text-slate-500">Carregando logs...</p>
        ) : logs.length === 0 ? (
          <p className="mt-2 text-sm font-semibold text-slate-500">Sem logs ainda.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left">
                  <th className="py-2 pr-4 text-[11px] font-black uppercase tracking-widest text-slate-500">Nome</th>
                  <th className="py-2 pr-4 text-[11px] font-black uppercase tracking-widest text-slate-500">Perfil</th>
                  <th className="py-2 pr-4 text-[11px] font-black uppercase tracking-widest text-slate-500">Telefone</th>
                  <th className="py-2 pr-4 text-[11px] font-black uppercase tracking-widest text-slate-500">Status</th>
                  <th className="py-2 pr-4 text-[11px] font-black uppercase tracking-widest text-slate-500">Horário</th>
                  <th className="py-2 pr-4 text-[11px] font-black uppercase tracking-widest text-slate-500">Detalhe</th>
                </tr>
              </thead>
              <tbody>
                {logs.slice(0, 300).map((log) => (
                  <tr key={log.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4 font-semibold text-slate-800">{log.nome}</td>
                    <td className="py-2 pr-4 font-semibold text-slate-700">{log.perfil}</td>
                    <td className="py-2 pr-4 font-semibold text-slate-700">{log.telefone}</td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-1 rounded-full text-[11px] font-black ${
                        log.status === 'Sucesso'
                          ? 'bg-emerald-50 text-emerald-700'
                          : log.status === 'Simulado'
                            ? 'bg-cyan-50 text-cyan-700'
                            : log.status === 'Inválido'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-rose-50 text-rose-700'
                      }`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="py-2 pr-4 font-semibold text-slate-600">{log.horario.toLocaleString('pt-BR')}</td>
                    <td className="py-2 pr-4 font-semibold text-slate-500">{log.detalhe || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showResumoModal && (
        <div className="fixed inset-0 z-[80] bg-slate-900/35 backdrop-blur-[1px] flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-cyan-100 bg-white shadow-2xl p-5">
            <h5 className="text-lg font-black text-slate-900">Resumo do Disparo</h5>
            <p className="mt-2 text-sm font-semibold text-slate-700">
              {progress.enviados} mensagens enviadas com sucesso e {progress.erros} falhas.
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              Processados: {progress.processados} de {progress.total}
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={clearLogs}
                className="px-3 py-2 rounded-lg border border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100 text-xs font-black uppercase tracking-widest"
              >
                Limpar Logs
              </button>
              <button
                type="button"
                onClick={() => setShowResumoModal(false)}
                className="px-3 py-2 rounded-lg border border-cyan-200 text-cyan-700 bg-cyan-50 hover:bg-cyan-100 text-xs font-black uppercase tracking-widest"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DisparoEmMassa;
