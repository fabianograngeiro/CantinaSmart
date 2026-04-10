import { db } from '../database.js';
import {
  buildDispatchAudience,
  DispatchAudienceFilter,
  DispatchPeriodMode,
  DispatchProfileType,
} from './dispatchAudienceService.js';
import { whatsappSession } from '../utils/whatsappSession.js';
import {
  reserveDispatchIdempotency,
  markDispatchIdempotencySent,
  clearDispatchIdempotencyReservation,
} from './whatsappIdempotencyService.js';

type RuntimeStatus = 'EM_DISPARO' | null;
type DispatchSendMode = 'TEXT_ONLY' | 'TEXT_AND_REPORT_PDF' | 'TEXT_AND_UPLOAD_PDF';

type StoredPdfAttachment = {
  base64Data?: string;
  fileName?: string;
  mimeType?: string;
} | null;

type SchedulerProfile = {
  id?: string;
  nome_perfil?: string;
  paused?: boolean;
  isSimulation?: boolean;
  filter?: DispatchAudienceFilter;
  profileType?: DispatchProfileType;
  periodMode?: DispatchPeriodMode;
  sendMode?: DispatchSendMode;
  uploadPdfAttachment?: StoredPdfAttachment;
  template?: string;
  batchLimit?: number;
  delayMin?: number;
  delayMax?: number;
  agendamento?: {
    hora?: string;
    hora_semanal?: string;
    dia_semana?: string;
  };
  dispatchRuntimeStatus?: RuntimeStatus;
  lastAutoDispatchSlot?: string;
  lastAutoDispatchAt?: string;
  updatedAt?: string;
};

type PersistedLogEntry = {
  id: string;
  nome: string;
  telefone: string;
  perfil: 'Responsavel' | 'Colaborador';
  status: 'Sucesso' | 'Erro' | 'Simulado' | 'Invalido' | 'Duplicado';
  detalhe?: string;
  timestamp: string;
};

const TICK_MS = 30 * 1000;
const WINDOW_TOLERANCE_MS = 5 * 60 * 1000;
const MAX_LOGS = 1000;
const MAX_BATCH = 200;

const weekdayToIndex = (value: unknown): number | null => {
  const token = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
  if (!token) return null;

  if (token === 'DOMINGO') return 0;
  if (token === 'SEGUNDA') return 1;
  if (token === 'TERCA') return 2;
  if (token === 'QUARTA') return 3;
  if (token === 'QUINTA') return 4;
  if (token === 'SEXTA') return 5;
  if (token === 'SABADO') return 6;
  return null;
};

const isValidTime = (value: unknown) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(String(value || '').trim());

const normalizePhone = (value: unknown) => String(value || '').replace(/\D/g, '');

const isValidPhone = (value: unknown) => {
  const phone = normalizePhone(value);
  return phone.length >= 10 && phone.length <= 15;
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, Math.max(0, ms));
  });

const cleanupMessage = (text: string) =>
  String(text || '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const defaultTemplate = (profileType: DispatchProfileType | undefined, periodMode: DispatchPeriodMode | undefined) => {
  const mode = String(periodMode || 'SEMANAL').toUpperCase();
  const modeLabel = mode === 'QUINZENAL'
    ? 'quinzenal'
    : mode === 'MENSAL'
      ? 'mensal'
      : mode === 'DESTA_SEMANA'
        ? 'desta semana'
        : 'semanal';

  if (profileType === 'COLABORADOR') {
    return [
      'Mensagem automatica da cantina.',
      `Prezado {{nome_colaborador}}, segue seu relatorio ${modeLabel}.`,
      'Periodo: {{periodo_referencia}}',
      'Consumo total no periodo: {{consumo_total_periodo}}',
      'Saldo atual: {{saldo}}',
      'Plano atual: {{plano}}',
    ].join('\n');
  }

  return [
    'Mensagem automatica da cantina.',
    `Ola {{nome_pai}}, segue o relatorio ${modeLabel} dos seus filhos.`,
    'Periodo: {{periodo_referencia}}',
    'Filhos/Alunos: {{alunos}}',
    'Saldos atuais por aluno:',
    '{{saldo_por_aluno}}',
    'Total consumido no periodo: {{consumo_total_periodo}}',
    'Consumo por aluno no periodo:',
    '{{consumo_total_por_aluno}}',
  ].join('\n');
};

const escapePdfText = (value: string) =>
  String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');

const toPdfBase64 = (lines: string[]) => {
  const safeLines = lines
    .map((line) => String(line || '').trim())
    .filter(Boolean)
    .slice(0, 44);

  const contentRows = safeLines.length > 0 ? safeLines : ['Sem dados para o relatorio.'];
  let y = 800;
  const textCommands = contentRows.map((line) => {
    const cmd = `BT /F1 10 Tf 40 ${y} Td (${escapePdfText(line)}) Tj ET`;
    y -= 15;
    return cmd;
  }).join('\n');

  const objects: string[] = [];
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>';
  objects[3] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>';
  objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  objects[5] = `<< /Length ${textCommands.length} >>\nstream\n${textCommands}\nendstream`;

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (let i = 1; i < objects.length; i += 1) {
    offsets[i] = Buffer.byteLength(pdf, 'utf8');
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < objects.length; i += 1) {
    const off = String(offsets[i]).padStart(10, '0');
    pdf += `${off} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, 'utf8').toString('base64');
};

const normalizeFileToken = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48)
    .toLowerCase() || 'contato';

const parseCurrencyNumber = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const raw = String(value || '').trim();
  if (!raw) return 0;
  const normalized = raw.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const buildRecipientReportPdfAttachment = (recipient: any, enterpriseId: string, profileName: string) => {
  const period = String(recipient?.report?.periodLabel || recipient?.variables?.periodo_referencia || '-').trim() || '-';
  const recipientName = String(recipient?.nome || 'Contato').trim() || 'Contato';
  const recipientType = String(recipient?.tipo || '').toUpperCase() === 'COLABORADOR' ? 'COLABORADOR' : 'ALUNO';
  const rows = Array.isArray(recipient?.report?.rows) ? recipient.report.rows : [];

  const isConsumption = (row: any) => String(row?.tipo || '').toUpperCase() === 'CONSUMO';
  const isCredit = (row: any) => {
    const type = String(row?.tipo || '').toUpperCase();
    return type === 'CREDITO' || type === 'ESTORNO';
  };
  const totalEstornos = rows
    .filter((row: any) => String(row?.tipo || '').toUpperCase() === 'ESTORNO')
    .reduce((acc: number, row: any) => acc + Math.abs(parseCurrencyNumber(row?.valor)), 0);
  const totalConsumption = rows.filter(isConsumption).reduce((acc: number, row: any) => acc + Math.abs(parseCurrencyNumber(row?.valor)), 0);
  const totalCredits = rows.filter(isCredit).reduce((acc: number, row: any) => acc + Math.abs(parseCurrencyNumber(row?.valor)), 0);
  const netPeriod = Number((totalCredits - totalConsumption).toFixed(2));

  const perfilLabel = String(recipient?.tipo || '').toUpperCase() === 'COLABORADOR' ? 'Colaborador' : 'Responsável';

  const lines: string[] = [
    'Relatorio de Movimentacoes - WhatsApp',
    `Empresa: ${enterpriseId}`,
    `Perfil: ${perfilLabel}`,
    `Contato: ${recipientName}`,
    `Tipo: ${recipientType}`,
    `Periodo: ${period}`,
    `Gerado em: ${new Date().toLocaleString('pt-BR')}`,
    ' ',
    'Data/Hora | Aluno/Colaborador | Tipo | Descricao | Valor',
  ];

  rows.slice(0, 32).forEach((row: any) => {
    const line = [
      String(row?.data || '-').trim() || '-',
      String(row?.alunoNome || '-').trim() || '-',
      String(row?.tipo || '-').trim().toUpperCase() || '-',
      String(row?.item || '-').trim() || '-',
      `R$ ${Math.abs(parseCurrencyNumber(row?.valor)).toFixed(2)}`,
    ].join(' | ');
    lines.push(line.slice(0, 180));
  });

  if (rows.length === 0) {
    lines.push('Sem movimentacoes no periodo.');
  }

  lines.push(' ');
  lines.push('Rodape de Totais e Saldos');
  lines.push(`- Total de movimentacoes: ${rows.length}`);
  lines.push(`- Total creditos: R$ ${totalCredits.toFixed(2)}`);
  lines.push(`- Total estornos: R$ ${totalEstornos.toFixed(2)}`);
  lines.push(`- Total consumo: R$ ${totalConsumption.toFixed(2)}`);
  lines.push(`- Saldo liquido do periodo: R$ ${netPeriod.toFixed(2)}`);
  const currentBalance = String(recipient?.variables?.saldo || '').trim();
  if (currentBalance) {
    lines.push(`- Saldo atual: ${currentBalance}`);
  }

  const base64Data = toPdfBase64(lines);
  const dateToken = new Date().toISOString().slice(0, 10);
  const fileName = `relatorio_${normalizeFileToken(recipientName)}_${dateToken}.pdf`;
  return {
    mediaType: 'document' as const,
    base64Data,
    mimeType: 'application/pdf',
    fileName,
  };
};

const renderTemplate = (template: string, recipient: any) => {
  const vars = {
    nome: String(recipient?.nome || recipient?.variables?.nome || 'Cliente'),
    nome_pai: String(recipient?.variables?.nome_pai || recipient?.nome || 'Responsavel'),
    nome_colaborador: String(recipient?.variables?.nome_colaborador || recipient?.nome || 'Colaborador'),
    parentesco: String(recipient?.variables?.parentesco || 'Indefinido'),
    saldo: String(recipient?.variables?.saldo || 'R$ 0,00'),
    alunos: String(recipient?.variables?.alunos || ''),
    plano: String(recipient?.variables?.plano || 'Sem plano ativo'),
    consumo_hoje: String(recipient?.variables?.consumo_hoje || 'Sem consumo hoje'),
    status_entrega: String(recipient?.variables?.status_entrega || 'Pendente'),
    periodo_referencia: String(recipient?.variables?.periodo_referencia || ''),
    periodo_nome: String(recipient?.variables?.periodo_nome || ''),
    saldo_por_aluno: String(recipient?.variables?.saldo_por_aluno || ''),
    consumo_total_periodo: String(recipient?.variables?.consumo_total_periodo || ''),
    consumo_total_por_aluno: String(recipient?.variables?.consumo_total_por_aluno || ''),
  };

  const rendered = String(template || '').replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key: string) => {
    const safeKey = String(key || '').toLowerCase();
    return (vars as Record<string, string>)[safeKey] ?? '';
  });

  return cleanupMessage(rendered);
};

const toSlotKey = (date: Date, hour: number, minute: number) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return `${year}-${month}-${day} ${hh}:${mm}`;
};

const resolveDispatchWindow = (profile: SchedulerProfile, now: Date) => {
  const weeklyTime = String(profile?.agendamento?.hora_semanal || '').trim();
  const fallbackTime = String(profile?.agendamento?.hora || '').trim();
  const time = isValidTime(weeklyTime)
    ? weeklyTime
    : (isValidTime(fallbackTime) ? fallbackTime : '17:00');

  const [hourRaw, minuteRaw] = time.split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;

  const dayIndex = weekdayToIndex(profile?.agendamento?.dia_semana);
  if (dayIndex !== null && now.getDay() !== dayIndex) return null;

  const scheduledAt = new Date(now);
  scheduledAt.setHours(hour, minute, 0, 0);

  const diff = now.getTime() - scheduledAt.getTime();
  if (diff < 0 || diff > WINDOW_TOLERANCE_MS) return null;

  return {
    slotKey: toSlotKey(now, hour, minute),
    scheduledAt,
  };
};

const updateProfileAndConfig = (
  enterpriseId: string,
  profileId: string,
  updater: (profile: SchedulerProfile) => SchedulerProfile
) => {
  const store = db.getWhatsAppStore() as any;
  const profilesByEnterprise = store?.dispatchAutomationProfilesByEnterprise || {};
  const configsByEnterprise = store?.dispatchAutomationsByEnterprise || {};
  const currentProfiles: SchedulerProfile[] = Array.isArray(profilesByEnterprise[enterpriseId])
    ? profilesByEnterprise[enterpriseId]
    : [];

  const idx = currentProfiles.findIndex((item) => String(item?.id || '') === profileId);
  if (idx < 0) return;

  const currentProfile = currentProfiles[idx] || {};
  const nextProfile = updater(currentProfile);
  const nextProfiles = [...currentProfiles];
  nextProfiles[idx] = {
    ...nextProfile,
    updatedAt: new Date().toISOString(),
  };

  const currentConfig = configsByEnterprise[enterpriseId];
  const shouldUpdateConfig = String(currentConfig?.id || '') === profileId;
  const nextConfig = shouldUpdateConfig
    ? {
        ...currentConfig,
        ...nextProfiles[idx],
      }
    : currentConfig;

  db.updateWhatsAppStore({
    dispatchAutomationProfilesByEnterprise: {
      ...profilesByEnterprise,
      [enterpriseId]: nextProfiles,
    },
    dispatchAutomationsByEnterprise: {
      ...configsByEnterprise,
      [enterpriseId]: nextConfig,
    },
  });
};

const appendDispatchLogs = (enterpriseId: string, entries: PersistedLogEntry[]) => {
  if (!entries.length) return;

  const store = db.getWhatsAppStore() as any;
  const logsByEnterprise = store?.dispatchLogsByEnterprise || {};
  const current = Array.isArray(logsByEnterprise[enterpriseId]) ? logsByEnterprise[enterpriseId] : [];
  const next = [...entries, ...current].slice(0, MAX_LOGS);

  db.updateWhatsAppStore({
    dispatchLogsByEnterprise: {
      ...logsByEnterprise,
      [enterpriseId]: next,
    },
  });
};

const runningProfiles = new Set<string>();

const executeProfileDispatch = async (enterpriseId: string, profile: SchedulerProfile, slotKey: string) => {
  const profileId = String(profile?.id || '').trim();
  if (!profileId) return;

  const lockKey = `${enterpriseId}::${profileId}`;
  if (runningProfiles.has(lockKey)) return;
  runningProfiles.add(lockKey);

  try {
    const snapshot = whatsappSession.getSnapshot();
    if (!snapshot.connected) {
      console.warn(`⚠️ [DISPATCH-SCHEDULER] WhatsApp desconectado para enterprise=${enterpriseId}, perfil=${profileId}.`);
      return;
    }

    updateProfileAndConfig(enterpriseId, profileId, (current) => ({
      ...current,
      lastAutoDispatchSlot: slotKey,
      dispatchRuntimeStatus: 'EM_DISPARO',
    }));

    const safeFilter = String(profile?.filter || 'TODOS').toUpperCase() as DispatchAudienceFilter;
    const safeProfileType = String(profile?.profileType || 'RESPONSAVEL_PARENTESCO').toUpperCase() as DispatchProfileType;
    const safePeriodMode = String(profile?.periodMode || 'SEMANAL').toUpperCase() as DispatchPeriodMode;
    const safeSendModeRaw = String(profile?.sendMode || 'TEXT_ONLY').toUpperCase();
    const safeSendMode: DispatchSendMode =
      safeSendModeRaw === 'TEXT_AND_REPORT_PDF' || safeSendModeRaw === 'TEXT_AND_UPLOAD_PDF'
        ? (safeSendModeRaw as DispatchSendMode)
        : 'TEXT_ONLY';
    const profileName = String(profile?.nome_perfil || 'Automacao').trim() || 'Automacao';

    const audience = buildDispatchAudience({
      enterpriseId,
      filter: safeFilter,
      profileType: safeProfileType,
      periodMode: safePeriodMode,
      businessDaysOnly: safePeriodMode === 'DESTA_SEMANA',
    });

    const template = String(profile?.template || '').trim() || defaultTemplate(safeProfileType, safePeriodMode);
    const batchLimit = Math.max(1, Math.min(MAX_BATCH, Number(profile?.batchLimit || 50)));
    const recipients = (Array.isArray(audience?.recipients) ? audience.recipients : []).slice(0, batchLimit);
    const isSimulation = Boolean(profile?.isSimulation);
    const delayMin = Math.max(0, Number(profile?.delayMin || 0));
    const delayMax = Math.max(delayMin, Number(profile?.delayMax || delayMin));

    const entries: PersistedLogEntry[] = [];
    for (const recipient of recipients) {
      const nome = String(recipient?.nome || 'Contato').trim() || 'Contato';
      const telefone = String(recipient?.telefone || '').trim();
      const perfil = String(recipient?.tipo || '').toUpperCase() === 'COLABORADOR' ? 'Colaborador' : 'Responsavel';

      if (!isValidPhone(telefone)) {
        entries.push({
          id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          nome,
          telefone,
          perfil,
          status: 'Invalido',
          detalhe: 'Telefone vazio ou invalido.',
          timestamp: new Date().toISOString(),
        });
        continue;
      }

      const message = renderTemplate(template, recipient);
      if (!message) {
        entries.push({
          id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          nome,
          telefone,
          perfil,
          status: 'Erro',
          detalhe: 'Mensagem vazia apos renderizacao do template.',
          timestamp: new Date().toISOString(),
        });
        continue;
      }

      if (isSimulation) {
        entries.push({
          id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          nome,
          telefone,
          perfil,
          status: 'Simulado',
          detalhe: message.slice(0, 180),
          timestamp: new Date().toISOString(),
        });
      } else {
        let fingerprint = '';
        try {
          const reservation = reserveDispatchIdempotency({
            source: 'SCHEDULER',
            enterpriseId,
            phone: telefone,
            message,
            profileId,
            slotKey,
            ttlSeconds: 7 * 24 * 60 * 60,
          });

          if (reservation.duplicate) {
            entries.push({
              id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              nome,
              telefone,
              perfil,
              status: 'Duplicado',
              detalhe: 'Disparo duplicado bloqueado por idempotencia (slot ja processado).',
              timestamp: new Date().toISOString(),
            });
            continue;
          }
          fingerprint = reservation.fingerprint;

          let sentResult: any = null;
          if (safeSendMode === 'TEXT_AND_UPLOAD_PDF') {
            const uploadPdf = profile?.uploadPdfAttachment && typeof profile.uploadPdfAttachment === 'object'
              ? {
                base64Data: String(profile.uploadPdfAttachment.base64Data || ''),
                fileName: String(profile.uploadPdfAttachment.fileName || 'relatorio.pdf'),
                mimeType: String(profile.uploadPdfAttachment.mimeType || 'application/pdf'),
              }
              : null;

            if (!uploadPdf?.base64Data) {
              throw new Error('Perfil em modo texto + PDF upload sem PDF salvo no perfil.');
            }

            sentResult = await whatsappSession.sendMediaToChat(telefone, {
              mediaType: 'document',
              base64Data: uploadPdf.base64Data,
              mimeType: uploadPdf.mimeType || 'application/pdf',
              fileName: uploadPdf.fileName || 'relatorio.pdf',
            }, message);
          } else if (safeSendMode === 'TEXT_AND_REPORT_PDF') {
            const reportPdf = buildRecipientReportPdfAttachment(recipient, enterpriseId, profileName);
            sentResult = await whatsappSession.sendMediaToChat(telefone, {
              mediaType: 'document',
              base64Data: reportPdf.base64Data,
              mimeType: reportPdf.mimeType,
              fileName: reportPdf.fileName,
            }, message);
          } else {
            sentResult = await whatsappSession.sendMessage(telefone, message);
          }

          markDispatchIdempotencySent({
            enterpriseId,
            fingerprint,
            messageId: String(sentResult?.messageId || sentResult?.key?.id || '').trim(),
            detail: {
              profileId,
              slotKey,
              sendMode: safeSendMode,
            },
          });

          entries.push({
            id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            nome,
            telefone,
            perfil,
            status: 'Sucesso',
            timestamp: new Date().toISOString(),
          });
        } catch (err) {
          if (fingerprint) {
            clearDispatchIdempotencyReservation({
              enterpriseId,
              fingerprint,
            });
          }
          entries.push({
            id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            nome,
            telefone,
            perfil,
            status: 'Erro',
            detalhe: err instanceof Error ? err.message : 'Falha no envio automatico.',
            timestamp: new Date().toISOString(),
          });
        }
      }

      const waitMs = Math.floor((Math.random() * (delayMax - delayMin + 1) + delayMin) * 1000);
      if (waitMs > 0) {
        await sleep(waitMs);
      }
    }

    appendDispatchLogs(enterpriseId, entries);
    updateProfileAndConfig(enterpriseId, profileId, (current) => ({
      ...current,
      lastAutoDispatchAt: new Date().toISOString(),
      dispatchRuntimeStatus: null,
    }));

    console.log(
      `✅ [DISPATCH-SCHEDULER] enterprise=${enterpriseId} perfil=${profileId} processado (${entries.length} registro(s)).`
    );
  } finally {
    const profileIdSafe = String(profile?.id || '').trim();
    const lockKeySafe = `${enterpriseId}::${profileIdSafe}`;
    runningProfiles.delete(lockKeySafe);

    if (profileIdSafe) {
      updateProfileAndConfig(enterpriseId, profileIdSafe, (current) => ({
        ...current,
        dispatchRuntimeStatus: null,
      }));
    }
  }
};

const tickScheduler = async () => {
  const now = new Date();
  const store = db.getWhatsAppStore() as any;
  const profilesByEnterprise = store?.dispatchAutomationProfilesByEnterprise || {};

  const enterprises = Object.keys(profilesByEnterprise);
  for (const enterpriseId of enterprises) {
    const profiles: SchedulerProfile[] = Array.isArray(profilesByEnterprise[enterpriseId])
      ? profilesByEnterprise[enterpriseId]
      : [];

    for (const profile of profiles) {
      if (!profile || typeof profile !== 'object') continue;
      if (Boolean(profile.paused)) continue;

      const profileId = String(profile.id || '').trim();
      if (!profileId) continue;

      const window = resolveDispatchWindow(profile, now);
      if (!window) continue;

      if (String(profile.lastAutoDispatchSlot || '').trim() === window.slotKey) {
        continue;
      }

      await executeProfileDispatch(enterpriseId, profile, window.slotKey);
    }
  }
};

let schedulerTimer: ReturnType<typeof setInterval> | null = null;

export const startWhatsAppDispatchScheduler = () => {
  if (schedulerTimer) return;

  schedulerTimer = setInterval(() => {
    tickScheduler().catch((err) => {
      console.error('❌ [DISPATCH-SCHEDULER] Falha no ciclo de agendamento:', err);
    });
  }, TICK_MS);

  tickScheduler().catch((err) => {
    console.error('❌ [DISPATCH-SCHEDULER] Falha na inicializacao do agendador:', err);
  });

  console.log('⏱️ [DISPATCH-SCHEDULER] Agendador automatico iniciado (janela de 5 minutos).');
};

export const stopWhatsAppDispatchScheduler = () => {
  if (!schedulerTimer) return;
  clearInterval(schedulerTimer);
  schedulerTimer = null;
};
