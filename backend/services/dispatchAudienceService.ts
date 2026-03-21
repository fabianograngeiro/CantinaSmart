import { db } from '../database.js';

export type DispatchAudienceFilter =
  | 'TODOS'
  | 'RESPONSAVEIS'
  | 'COLABORADORES'
  | 'SALDO_BAIXO'
  | 'PLANO_A_VENCER'
  | 'RELATORIO_ENTREGA';

export type DispatchProfileType = 'RESPONSAVEL_PARENTESCO' | 'COLABORADOR';
export type DispatchPeriodMode = 'SEMANAL' | 'QUINZENAL' | 'MENSAL' | 'DESTA_SEMANA';

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
    nome: string;
    nome_pai?: string;
    nome_colaborador?: string;
    parentesco?: string;
    alunos?: string;
    saldo: string;
    plano: string;
    consumo_hoje: string;
    status_entrega: string;
    periodo_referencia: string;
    periodo_nome?: string;
    saldo_por_aluno?: string;
    consumo_total_periodo?: string;
    consumo_total_por_aluno?: string;
  };
  report: {
    title: string;
    periodLabel: string;
    greeting: string;
    rows: AudienceReportRow[];
  };
  impact: string;
};

const WEEK_DAY_ALIASES: Record<string, string[]> = {
  DOMINGO: ['DOMINGO', 'domingo', 'SUNDAY', 'sunday'],
  SEGUNDA: ['SEGUNDA', 'segunda', 'MONDAY', 'monday'],
  TERCA: ['TERCA', 'terça', 'terca', 'TUESDAY', 'tuesday'],
  QUARTA: ['QUARTA', 'quarta', 'WEDNESDAY', 'wednesday'],
  QUINTA: ['QUINTA', 'quinta', 'THURSDAY', 'thursday'],
  SEXTA: ['SEXTA', 'sexta', 'FRIDAY', 'friday'],
  SABADO: ['SABADO', 'sábado', 'sabado', 'SATURDAY', 'saturday'],
};

const WEEK_KEY_TO_DAY_INDEX: Record<string, number> = {
  DOMINGO: 0,
  SEGUNDA: 1,
  TERCA: 2,
  QUARTA: 3,
  QUINTA: 4,
  SEXTA: 5,
  SABADO: 6,
};

const DAY_INDEX_SHORT_LABEL: Record<number, string> = {
  0: 'Dom',
  1: 'Seg',
  2: 'Ter',
  3: 'Qua',
  4: 'Qui',
  5: 'Sex',
  6: 'Sáb',
};

const normalizePhone = (value: any) => {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('55')) return digits;
  if (digits.length >= 10 && digits.length <= 11) return `55${digits}`;
  return digits;
};

const normalizeText = (value: any) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();

const toDateKey = (date: Date) => {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const toDateLabel = (value: Date) =>
  value.toLocaleDateString('pt-BR');

const parseAnyDate = (value: any) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const rawNumeric = Number(raw);
  if (Number.isFinite(rawNumeric) && rawNumeric > 0) {
    // suporta timestamp em segundos e milissegundos
    const ts = rawNumeric < 10_000_000_000 ? rawNumeric * 1000 : rawNumeric;
    const d = new Date(ts);
    if (Number.isFinite(d.getTime())) return d;
  }

  // ISO / formatos nativos
  const nativeMs = new Date(raw).getTime();
  if (Number.isFinite(nativeMs)) return new Date(nativeMs);

  // Formatos BR comuns: dd/mm/aaaa, dd-mm-aaaa, dd/mm/aa
  const brMatch = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (brMatch) {
    const day = Number(brMatch[1]);
    const month = Number(brMatch[2]);
    const yearRaw = Number(brMatch[3]);
    const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
    const hour = Number(brMatch[4] || 0);
    const minute = Number(brMatch[5] || 0);
    const second = Number(brMatch[6] || 0);
    const d = new Date(year, month - 1, day, hour, minute, second, 0);
    if (Number.isFinite(d.getTime())) return d;
  }

  // Formato invertido explícito yyyy-mm-dd hh:mm:ss
  const isoLooseMatch = raw.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (isoLooseMatch) {
    const year = Number(isoLooseMatch[1]);
    const month = Number(isoLooseMatch[2]);
    const day = Number(isoLooseMatch[3]);
    const hour = Number(isoLooseMatch[4] || 0);
    const minute = Number(isoLooseMatch[5] || 0);
    const second = Number(isoLooseMatch[6] || 0);
    const d = new Date(year, month - 1, day, hour, minute, second, 0);
    if (Number.isFinite(d.getTime())) return d;
  }

  return null;
};

const extractTransactionDate = (tx: any): Date | null => {
  const dateRaw = String(tx?.date || '').trim();
  const timeRaw = String(tx?.time || '00:00').trim();
  if (dateRaw) {
    const parsedFromDateTime = parseAnyDate(`${dateRaw} ${timeRaw || '00:00'}`);
    if (parsedFromDateTime) return parsedFromDateTime;
    const parsedFromDateOnly = parseAnyDate(dateRaw);
    if (parsedFromDateOnly) return parsedFromDateOnly;
  }
  const timestamp = parseAnyDate(tx?.timestamp);
  if (timestamp) return timestamp;
  return null;
};

const toCurrencyBr = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));

const toPeriodModeLabel = (mode: DispatchPeriodMode) => {
  if (mode === 'QUINZENAL') return 'Quinzenal';
  if (mode === 'MENSAL') return 'Mensal';
  if (mode === 'DESTA_SEMANA') return 'Desta semana';
  return 'Semanal';
};

const toAlunoList = (names: string[]) => {
  const list = (names || []).map((item) => String(item || '').trim()).filter(Boolean);
  if (list.length === 0) return '';
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} e ${list[1]}`;
  return `${list.slice(0, -1).join(', ')} e ${list[list.length - 1]}`;
};

const getClientSaldo = (client: any) => Number(client?.balance || 0);

const getClientPlanoAtivo = (client: any) => {
  const parseNumber = (value: any, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const round = (value: number, precision = 2) => {
    const factor = 10 ** precision;
    return Math.round((Number(value || 0) + Number.EPSILON) * factor) / factor;
  };
  const balances = client?.planCreditBalances && typeof client.planCreditBalances === 'object'
    ? Object.values(client.planCreditBalances)
      .map((entry: any) => ({
        name: String(entry?.planName || entry?.planId || '').trim(),
        unitValue: parseNumber(entry?.unitValue || entry?.planPrice, 0),
        balanceUnits: parseNumber(entry?.balanceUnits, NaN),
        totalUnits: parseNumber(entry?.totalUnits, NaN),
        consumedUnits: parseNumber(entry?.consumedUnits, NaN),
        unitsProgress: String(entry?.unitsProgress || '').trim(),
        balance: parseNumber(entry?.balance, 0),
      }))
      .filter((entry: any) => entry.name)
      .map((entry: any) => {
        const safeUnitValue = entry.unitValue > 0 ? entry.unitValue : 1;
        const safeUnits = Number.isFinite(entry.balanceUnits)
          ? Math.max(0, entry.balanceUnits)
          : Math.max(0, entry.balance / safeUnitValue);
        const inferredTotal = Number.isFinite(entry.totalUnits)
          ? Math.max(safeUnits, entry.totalUnits)
          : safeUnits;
        const inferredConsumed = Number.isFinite(entry.consumedUnits)
          ? Math.max(0, entry.consumedUnits)
          : Math.max(0, inferredTotal - safeUnits);
        const progressLabel = entry.unitsProgress || `${round(safeUnits, 2)}/${round(inferredTotal, 2)}`;
        return {
          name: entry.name,
          balanceUnits: round(safeUnits, 4),
          totalUnits: round(inferredTotal, 4),
          consumedUnits: round(inferredConsumed, 4),
          unitsProgress: progressLabel,
          unitValue: round(safeUnitValue, 4),
          balance: round(safeUnits * safeUnitValue, 2),
        };
      })
    : [];
  if (balances.length > 0) return balances;
  const selected = Array.isArray(client?.selectedPlansConfig) ? client.selectedPlansConfig : [];
  return selected
    .map((cfg: any) => ({
      name: String(cfg?.planName || '').trim(),
      balanceUnits: Number(Array.isArray(cfg?.selectedDates) ? cfg.selectedDates.length : 0),
      totalUnits: Number(Array.isArray(cfg?.selectedDates) ? cfg.selectedDates.length : 0),
      consumedUnits: 0,
      unitsProgress: `${Number(Array.isArray(cfg?.selectedDates) ? cfg.selectedDates.length : 0)}/${Number(Array.isArray(cfg?.selectedDates) ? cfg.selectedDates.length : 0)}`,
      unitValue: parseNumber(cfg?.planPrice, 0),
      balance: round(Number(Array.isArray(cfg?.selectedDates) ? cfg.selectedDates.length : 0) * parseNumber(cfg?.planPrice, 0), 2),
    }))
    .filter((entry: any) => entry.name);
};

const resolvePlanProgressForTransaction = (client: any, tx: any) => {
  const balances = client?.planCreditBalances && typeof client.planCreditBalances === 'object'
    ? Object.values(client.planCreditBalances)
    : [];
  if (balances.length === 0) return '';

  const normalizedPlanId = normalizeText(tx?.planId || tx?.originPlanId || '');
  const normalizedPlanName = normalizeText(tx?.plan || tx?.planName || tx?.item || '');
  if (!normalizedPlanId && !normalizedPlanName) return '';

  const matched = balances.find((entry: any) => {
    const entryPlanId = normalizeText(entry?.planId || '');
    const entryPlanName = normalizeText(entry?.planName || '');
    if (normalizedPlanId && entryPlanId && normalizedPlanId === entryPlanId) return true;
    if (normalizedPlanName && entryPlanName && normalizedPlanName === entryPlanName) return true;
    return false;
  });
  if (!matched) return '';

  const directProgress = String(matched?.unitsProgress || '').trim();
  if (directProgress) return directProgress;

  const balanceUnits = Number(matched?.balanceUnits);
  const totalUnits = Number(matched?.totalUnits);
  if (Number.isFinite(balanceUnits) && Number.isFinite(totalUnits) && totalUnits > 0) {
    const remaining = Math.max(0, Number(balanceUnits || 0));
    const total = Math.max(remaining, Number(totalUnits || 0));
    return `${remaining}/${total}`;
  }
  return '';
};

const resolveParentesco = (rawValue: string) => {
  const normalized = normalizeText(rawValue);
  if (!normalized) return 'Indefinido';
  if (normalized.includes('PAI')) return 'Pai';
  if (normalized.includes('MAE')) return 'Mãe';
  if (normalized.includes('AVO')) return 'Avós';
  if (normalized.includes('TIO') || normalized.includes('TIA')) return 'Tios';
  return 'Indefinido';
};

const classifyTxKind = (tx: any): 'CONSUMO' | 'CREDITO' | 'ESTORNO' | 'OUTRO' => {
  const type = normalizeText(tx?.type || tx?.movement || tx?.operation);
  const description = normalizeText(tx?.description || tx?.item || '');
  if (type.includes('ESTORNO') || description.includes('ESTORNO')) return 'ESTORNO';
  if (type.includes('CREDITO') || type.includes('CREDIT') || description.includes('RECARGA')) return 'CREDITO';
  if (type.includes('CONSUMO') || type.includes('DEBIT') || description.includes('COMPRA')) return 'CONSUMO';
  return 'OUTRO';
};

const getCurrentWeekBounds = () => {
  const now = new Date();
  const start = new Date(now);
  const day = start.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diffToMonday);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

const buildPeriodWindow = (mode: DispatchPeriodMode, businessDays: Set<number> | null) => {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (mode === 'DESTA_SEMANA') {
    const weekBounds = getCurrentWeekBounds();
    const fallbackDays = [1, 2, 3, 4, 5];
    const activeDays = (businessDays && businessDays.size > 0)
      ? Array.from(businessDays).sort((a, b) => a - b)
      : fallbackDays;
    const clampedActiveDays = activeDays.filter((day) => day >= 0 && day <= 6);
    const activeDaysSet = new Set<number>(clampedActiveDays.length > 0 ? clampedActiveDays : fallbackDays);

    const activeDates: Date[] = [];
    for (let cursor = new Date(weekBounds.start); cursor <= weekBounds.end; cursor.setDate(cursor.getDate() + 1)) {
      if (activeDaysSet.has(cursor.getDay())) {
        activeDates.push(new Date(cursor));
      }
    }

    const safeStart = activeDates[0] ? new Date(activeDates[0]) : new Date(weekBounds.start);
    safeStart.setHours(0, 0, 0, 0);
    const safeEnd = activeDates[activeDates.length - 1] ? new Date(activeDates[activeDates.length - 1]) : new Date(weekBounds.end);
    safeEnd.setHours(23, 59, 59, 999);

    const daysLabel = Array.from(activeDaysSet)
      .sort((a, b) => a - b)
      .map((day) => DAY_INDEX_SHORT_LABEL[day] || '')
      .filter(Boolean)
      .join(', ');
    const periodLabel = `${toDateLabel(safeStart)} a ${toDateLabel(safeEnd)}`;

    return {
      start: safeStart,
      end: safeEnd,
      periodLabel,
      periodInfo: `Dias ativos: ${daysLabel || '-'} • Período: ${periodLabel}`,
      dayFilter: activeDaysSet,
    };
  }

  if (mode === 'SEMANAL') {
    start.setDate(start.getDate() - 6);
  } else if (mode === 'QUINZENAL') {
    start.setDate(start.getDate() - 14);
  } else {
    start.setDate(start.getDate() - 29);
  }

  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return {
    start,
    end,
    periodLabel: `${toDateLabel(start)} a ${toDateLabel(end)}`,
    periodInfo: `Período: ${toDateLabel(start)} a ${toDateLabel(end)}`,
    dayFilter: null as Set<number> | null,
  };
};

const getEnterpriseBusinessDays = (enterprise: any): Set<number> | null => {
  const openingHours = enterprise?.openingHours;
  if (!openingHours || typeof openingHours !== 'object') return null;

  const result = new Set<number>();
  Object.keys(WEEK_DAY_ALIASES).forEach((weekKey) => {
    const alias = WEEK_DAY_ALIASES[weekKey].find((candidate) => openingHours[candidate] !== undefined);
    if (!alias) return;
    const config = openingHours[alias];
    if (config && !config.closed) {
      result.add(WEEK_KEY_TO_DAY_INDEX[weekKey]);
    }
  });

  return result.size > 0 ? result : null;
};

export const buildDispatchAudience = (params: {
  enterpriseId: string;
  filter?: DispatchAudienceFilter;
  profileType?: DispatchProfileType;
  periodMode?: DispatchPeriodMode;
  businessDaysOnly?: boolean;
}) => {
  const filter = String(params.filter || 'TODOS').toUpperCase() as DispatchAudienceFilter;
  const profileType = String(params.profileType || 'RESPONSAVEL_PARENTESCO').toUpperCase() as DispatchProfileType;
  const periodMode = String(params.periodMode || 'SEMANAL').toUpperCase() as DispatchPeriodMode;
  const businessDaysOnly = Boolean(params.businessDaysOnly);

  const allowedFilters: DispatchAudienceFilter[] = [
    'TODOS',
    'RESPONSAVEIS',
    'COLABORADORES',
    'SALDO_BAIXO',
    'PLANO_A_VENCER',
    'RELATORIO_ENTREGA',
  ];
  const allowedProfiles: DispatchProfileType[] = ['RESPONSAVEL_PARENTESCO', 'COLABORADOR'];
  const allowedPeriods: DispatchPeriodMode[] = ['SEMANAL', 'QUINZENAL', 'MENSAL', 'DESTA_SEMANA'];

  const safeFilter = allowedFilters.includes(filter) ? filter : 'TODOS';
  const safeProfileType = allowedProfiles.includes(profileType) ? profileType : 'RESPONSAVEL_PARENTESCO';
  const safePeriodMode = allowedPeriods.includes(periodMode) ? periodMode : 'SEMANAL';
  const periodModeLabel = toPeriodModeLabel(safePeriodMode);

  const clients = db.getClients(params.enterpriseId);
  const transactions = db.getTransactions({ enterpriseId: params.enterpriseId });
  const enterprise = db.getEnterprise(params.enterpriseId);
  const businessDays = getEnterpriseBusinessDays(enterprise);
  const periodWindow = buildPeriodWindow(safePeriodMode, businessDays);
  const todayKey = toDateKey(new Date());

  const isDateInsidePeriod = (value: Date | null) => {
    if (!value) return false;
    const ts = value.getTime();
    if (ts < periodWindow.start.getTime() || ts > periodWindow.end.getTime()) return false;
    const shouldUseBusinessDays = safePeriodMode === 'DESTA_SEMANA' || businessDaysOnly;
    if (!shouldUseBusinessDays) return true;
    if (periodWindow.dayFilter) return periodWindow.dayFilter.has(value.getDay());
    if (businessDays) return businessDays.has(value.getDay());
    return true;
  };

  const transactionsByClient = new Map<string, any[]>();
  const todayTxByClient = new Map<string, any[]>();
  transactions.forEach((tx: any) => {
    const clientId = String(tx?.clientId || '').trim();
    if (!clientId) return;

    const txDate = extractTransactionDate(tx);
    if (isDateInsidePeriod(txDate)) {
      const periodList = transactionsByClient.get(clientId) || [];
      periodList.push(tx);
      transactionsByClient.set(clientId, periodList);
    }

    const dayKey = txDate ? toDateKey(txDate) : String(tx?.date || '').trim();
    if (dayKey === todayKey) {
      const todayList = todayTxByClient.get(clientId) || [];
      todayList.push(tx);
      todayTxByClient.set(clientId, todayList);
    }
  });

  const buildConsumptionSummary = (clientId: string) => {
    const items = todayTxByClient.get(clientId) || [];
    const onlyConsumption = items.filter((tx: any) => classifyTxKind(tx) === 'CONSUMO');
    if (onlyConsumption.length === 0) return 'Sem consumo hoje';
    const detail = onlyConsumption
      .slice(0, 5)
      .map((tx: any) => String(tx?.item || tx?.description || 'Consumo').trim())
      .filter(Boolean);
    return detail.length > 0 ? detail.join(' | ') : `${onlyConsumption.length} consumo(s) hoje`;
  };

  const buildDeliveryStatus = (clientId: string) => {
    const items = todayTxByClient.get(clientId) || [];
    const delivery = items.find((tx: any) =>
      classifyTxKind(tx) === 'CONSUMO' &&
      normalizeText(tx?.description || '').includes('ENTREGA DO DIA')
    );
    if (!delivery) return 'Pendente';
    const time = String(delivery?.time || '').trim();
    return time ? `Entregue às ${time}` : 'Entregue hoje';
  };

  const baseResponsables = new Map<string, any>();
  const collaborators: any[] = [];

  clients.forEach((client: any) => {
    const type = normalizeText(client?.type);
    const clientId = String(client?.id || '').trim();
    const clientName = String(client?.name || '').trim();
    if (!clientId || !clientName) return;

    if (type === 'COLABORADOR') {
      const phone = normalizePhone(client?.phone);
      if (!phone) return;
      const txList = transactionsByClient.get(clientId) || [];
      const totalConsumptionPeriod = txList.reduce((acc: number, tx: any) => {
        if (classifyTxKind(tx) !== 'CONSUMO') return acc;
        const amount = Number(tx?.amount ?? tx?.total ?? tx?.value ?? 0);
        return acc + Math.abs(Number.isFinite(amount) ? amount : 0);
      }, 0);
      const profileRows = (transactionsByClient.get(clientId) || []).map((tx: any) => {
        const txDate = extractTransactionDate(tx);
        const amount = Number(tx?.amount ?? tx?.total ?? tx?.value ?? 0);
        const txKind = classifyTxKind(tx);
        return {
          alunoNome: clientName,
          data: txDate ? toDateLabel(txDate) : '-',
          valor: toCurrencyBr(amount),
          tipo: txKind,
          item: String(tx?.item || tx?.description || tx?.plan || 'Movimentação').trim() || 'Movimentação',
          saldoAtual: toCurrencyBr(getClientSaldo(client)),
        } as AudienceReportRow;
      });

      collaborators.push({
        id: `colab_${clientId}`,
        type: 'COLABORADOR',
        name: clientName,
        phone,
        students: [],
        parentesco: String(client?.class || '').trim() || 'Indefinido',
        variables: {
          nome: clientName,
          nome_colaborador: clientName,
          saldo: toCurrencyBr(getClientSaldo(client)),
          plano: getClientPlanoAtivo(client).map((item: any) => item.name).join(', ') || 'Sem plano ativo',
          consumo_hoje: buildConsumptionSummary(clientId),
          status_entrega: buildDeliveryStatus(clientId),
          periodo_referencia: periodWindow.periodLabel,
          periodo_nome: periodModeLabel,
          saldo_por_aluno: `${clientName}: ${toCurrencyBr(getClientSaldo(client))}`,
          consumo_total_periodo: toCurrencyBr(totalConsumptionPeriod),
          consumo_total_por_aluno: `${clientName}: ${toCurrencyBr(totalConsumptionPeriod)}`,
        },
        reportRows: profileRows,
        impacts: {
          lowBalance: getClientSaldo(client) < 10,
          planExpiringSoon: false,
          deliveredToday: buildDeliveryStatus(clientId).startsWith('Entregue'),
        },
      });
      return;
    }

    if (type !== 'ALUNO') return;
    const responsibleName = String(
      client?.parentName
      || client?.guardianName
      || (Array.isArray(client?.guardians) ? client.guardians[0] : '')
      || ''
    ).trim();
    const responsiblePhone = normalizePhone(client?.parentWhatsapp || client?.guardianPhone);
    if (!responsibleName || !responsiblePhone) return;

    const key = `${normalizeText(responsibleName)}__${responsiblePhone}`;
    const existing = baseResponsables.get(key) || {
      id: key,
      type: 'RESPONSAVEL',
      name: responsibleName,
      phone: responsiblePhone,
      parentesco: resolveParentesco(`${client?.parentName || ''} ${client?.guardianName || ''}`),
      students: [] as any[],
      reportRows: [] as AudienceReportRow[],
    };

    const planos = getClientPlanoAtivo(client);
    const selectedConfig = Array.isArray(client?.selectedPlansConfig) ? client.selectedPlansConfig : [];
    let maxPlanDate: Date | null = null;
    selectedConfig.forEach((cfg: any) => {
      const dates = Array.isArray(cfg?.selectedDates) ? cfg.selectedDates : [];
      dates.forEach((dateStr: any) => {
        const parsed = parseAnyDate(dateStr);
        if (!parsed) return;
        if (!maxPlanDate || parsed.getTime() > maxPlanDate.getTime()) maxPlanDate = parsed;
      });
    });
    const daysToExpire = maxPlanDate
      ? Math.ceil((maxPlanDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
      : null;

    const studentRows = (transactionsByClient.get(clientId) || []).map((tx: any) => {
      const txDate = extractTransactionDate(tx);
      const amount = Number(tx?.amount ?? tx?.total ?? tx?.value ?? 0);
      const txKind = classifyTxKind(tx);
      const itemBase = String(tx?.item || tx?.description || tx?.plan || 'Movimentação').trim() || 'Movimentação';
      const unitsProgress = resolvePlanProgressForTransaction(client, tx);
      const itemWithProgress = unitsProgress && txKind === 'CONSUMO'
        ? `${itemBase} • ${unitsProgress}`
        : itemBase;
      return {
        alunoNome: clientName,
        data: txDate ? toDateLabel(txDate) : '-',
        valor: toCurrencyBr(amount),
        tipo: txKind,
        item: itemWithProgress,
        saldoAtual: toCurrencyBr(getClientSaldo(client)),
      } as AudienceReportRow;
    });
    const studentPeriodConsumption = (transactionsByClient.get(clientId) || []).reduce((acc: number, tx: any) => {
      if (classifyTxKind(tx) !== 'CONSUMO') return acc;
      const amount = Number(tx?.amount ?? tx?.total ?? tx?.value ?? 0);
      return acc + Math.abs(Number.isFinite(amount) ? amount : 0);
    }, 0);

    existing.students.push({
      id: clientId,
      name: clientName,
      saldo: getClientSaldo(client),
      planos,
      consumoHoje: buildConsumptionSummary(clientId),
      statusEntrega: buildDeliveryStatus(clientId),
      periodConsumption: studentPeriodConsumption,
      maxPlanDate: maxPlanDate ? toDateKey(maxPlanDate) : null,
      planExpiringSoon: daysToExpire !== null && daysToExpire >= 0 && daysToExpire <= 5,
    });
    existing.reportRows.push(...studentRows);
    baseResponsables.set(key, existing);
  });

  const responsibles = Array.from(baseResponsables.values()).map((responsible: any) => {
    const students = Array.isArray(responsible.students) ? responsible.students : [];
    const saldoTotal = students.reduce((acc: number, student: any) => acc + Number(student?.saldo || 0), 0);
    const planoNames = Array.from(
      new Set(
        students.flatMap((student: any) =>
          Array.isArray(student?.planos) ? student.planos.map((p: any) => p.name).filter(Boolean) : []
        )
      )
    );
    const consumoHoje = students
      .map((student: any) => `${student.name}: ${student.consumoHoje}`)
      .join(' | ');
    const statusEntrega = students
      .map((student: any) => `${student.name}: ${student.statusEntrega}`)
      .join(' | ');
    const saldoPorAluno = students
      .map((student: any) => `${student.name}: ${toCurrencyBr(Number(student?.saldo || 0))}`)
      .join('\n');
    const consumoPorAluno = students
      .map((student: any) => `${student.name}: ${toCurrencyBr(Number(student?.periodConsumption || 0))}`)
      .join('\n');
    const totalConsumptionPeriod = students.reduce(
      (acc: number, student: any) => acc + Number(student?.periodConsumption || 0),
      0
    );
    return {
      id: responsible.id,
      type: 'RESPONSAVEL',
      name: responsible.name,
      phone: responsible.phone,
      parentesco: String(responsible.parentesco || '').trim() || 'Indefinido',
      students: students.map((student: any) => student.name),
      reportRows: Array.isArray(responsible.reportRows) ? responsible.reportRows : [],
      variables: {
        nome: responsible.name,
        nome_pai: responsible.name,
        parentesco: String(responsible.parentesco || 'Indefinido'),
        alunos: toAlunoList(students.map((student: any) => student.name)),
        saldo: toCurrencyBr(saldoTotal),
        plano: planoNames.join(', ') || 'Sem plano ativo',
        consumo_hoje: consumoHoje || 'Sem consumo hoje',
        status_entrega: statusEntrega || 'Pendente',
        periodo_referencia: periodWindow.periodLabel,
        periodo_nome: periodModeLabel,
        saldo_por_aluno: saldoPorAluno || '-',
        consumo_total_periodo: toCurrencyBr(totalConsumptionPeriod),
        consumo_total_por_aluno: consumoPorAluno || '-',
      },
      impacts: {
        lowBalance: students.some((student: any) => Number(student?.saldo || 0) < 10),
        planExpiringSoon: students.some((student: any) => Boolean(student?.planExpiringSoon)),
        deliveredToday: students.some((student: any) => String(student?.statusEntrega || '').startsWith('Entregue')),
      },
    };
  });

  const baseAudience = [
    ...responsibles,
    ...collaborators,
  ];

  const profileSegmented = baseAudience.filter((item: any) => {
    if (safeProfileType === 'RESPONSAVEL_PARENTESCO') return item.type === 'RESPONSAVEL';
    return item.type === 'COLABORADOR';
  });

  const filteredAudience = profileSegmented.filter((item: any) => {
    if (safeFilter === 'RESPONSAVEIS') return item.type === 'RESPONSAVEL';
    if (safeFilter === 'COLABORADORES') return item.type === 'COLABORADOR';
    if (safeFilter === 'SALDO_BAIXO') return Boolean(item?.impacts?.lowBalance);
    if (safeFilter === 'PLANO_A_VENCER') return Boolean(item?.impacts?.planExpiringSoon);
    if (safeFilter === 'RELATORIO_ENTREGA') return Boolean(item?.impacts?.deliveredToday);
    return true;
  });

  const recipients: AudienceRecipient[] = filteredAudience.map((item: any) => {
    const isResponsible = item.type === 'RESPONSAVEL';
    const greeting = isResponsible
      ? `Olá ${item.variables?.nome_pai || item.name}, segue o relatório de seus filhos no período ${periodWindow.periodLabel}.`
      : `Prezado ${item.variables?.nome_colaborador || item.name}, segue seu extrato de consumo no período ${periodWindow.periodLabel}.`;

    return {
      id: item.id,
      tipo: item.type,
      nome: item.name,
      telefone: item.phone,
      alunos: Array.isArray(item.students) ? item.students : [],
      variables: item.variables || {},
      report: {
        title: isResponsible ? 'Relatório de Consumo Escolar - Dependentes' : 'Extrato de Consumo - Funcionário',
        periodLabel: periodWindow.periodLabel,
        greeting,
        rows: Array.isArray(item.reportRows) ? item.reportRows : [],
      },
      impact: safeFilter === 'SALDO_BAIXO'
        ? item.variables?.saldo
        : safeFilter === 'PLANO_A_VENCER'
          ? item.variables?.plano
          : safeFilter === 'RELATORIO_ENTREGA'
            ? item.variables?.status_entrega
            : '',
    };
  });

  return {
    filter: safeFilter,
    profileType: safeProfileType,
    periodMode: safePeriodMode,
    businessDaysOnly: safePeriodMode === 'DESTA_SEMANA' ? true : businessDaysOnly,
    periodLabel: periodWindow.periodLabel,
    periodInfo: periodWindow.periodInfo,
    total: recipients.length,
    recipients,
  };
};
