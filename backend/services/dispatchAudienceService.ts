import { db } from '../database.js';

export type DispatchAudienceFilter =
  | 'TODOS'
  | 'RESPONSAVEIS'
  | 'COLABORADORES'
  | 'SALDO_BAIXO'
  | 'PLANO_A_VENCER'
  | 'RELATORIO_ENTREGA';

type AudienceRecipient = {
  id: string;
  tipo: 'RESPONSAVEL' | 'COLABORADOR';
  nome: string;
  telefone: string;
  alunos: string[];
  variables: {
    nome: string;
    alunos?: string;
    saldo: string;
    plano: string;
    consumo_hoje: string;
    status_entrega: string;
  };
  impact: string;
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

const parseAnyDate = (value: any) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const ms = new Date(raw).getTime();
  if (Number.isFinite(ms)) return new Date(ms);
  return null;
};

const toCurrencyBr = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));

const toAlunoList = (names: string[]) => {
  const list = (names || []).map((item) => String(item || '').trim()).filter(Boolean);
  if (list.length === 0) return '';
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} e ${list[1]}`;
  return `${list.slice(0, -1).join(', ')} e ${list[list.length - 1]}`;
};

const getClientSaldo = (client: any) => Number(client?.balance || 0);

const getClientPlanoAtivo = (client: any) => {
  const balances = client?.planCreditBalances && typeof client.planCreditBalances === 'object'
    ? Object.values(client.planCreditBalances)
      .map((entry: any) => ({
        name: String(entry?.planName || entry?.planId || '').trim(),
        balance: Number(entry?.balance || 0),
      }))
      .filter((entry: any) => entry.name)
    : [];
  if (balances.length > 0) return balances;
  const selected = Array.isArray(client?.selectedPlansConfig) ? client.selectedPlansConfig : [];
  return selected
    .map((cfg: any) => ({
      name: String(cfg?.planName || '').trim(),
      balance: Number(Array.isArray(cfg?.selectedDates) ? cfg.selectedDates.length : 0),
    }))
    .filter((entry: any) => entry.name);
};

export const buildDispatchAudience = (params: {
  enterpriseId: string;
  filter?: DispatchAudienceFilter;
}) => {
  const filter = String(params.filter || 'TODOS').toUpperCase() as DispatchAudienceFilter;
  const allowedFilters: DispatchAudienceFilter[] = [
    'TODOS',
    'RESPONSAVEIS',
    'COLABORADORES',
    'SALDO_BAIXO',
    'PLANO_A_VENCER',
    'RELATORIO_ENTREGA',
  ];
  const safeFilter = allowedFilters.includes(filter) ? filter : 'TODOS';

  const clients = db.getClients(params.enterpriseId);
  const transactions = db.getTransactions({ enterpriseId: params.enterpriseId });
  const todayKey = toDateKey(new Date());

  const todayTxByClient = new Map<string, any[]>();
  transactions.forEach((tx: any) => {
    const clientId = String(tx?.clientId || '').trim();
    if (!clientId) return;
    const txDate = String(tx?.date || '').trim();
    if (txDate !== todayKey) return;
    const arr = todayTxByClient.get(clientId) || [];
    arr.push(tx);
    todayTxByClient.set(clientId, arr);
  });

  const buildConsumptionSummary = (clientId: string) => {
    const items = todayTxByClient.get(clientId) || [];
    const onlyConsumption = items.filter((tx: any) => normalizeText(tx?.type) === 'CONSUMO');
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
      normalizeText(tx?.type) === 'CONSUMO' &&
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
      collaborators.push({
        id: `colab_${clientId}`,
        type: 'COLABORADOR',
        name: clientName,
        phone,
        students: [],
        variables: {
          nome: clientName,
          saldo: toCurrencyBr(getClientSaldo(client)),
          plano: getClientPlanoAtivo(client).map((item: any) => item.name).join(', ') || 'Sem plano ativo',
          consumo_hoje: buildConsumptionSummary(clientId),
          status_entrega: buildDeliveryStatus(clientId),
        },
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
      students: [] as any[],
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

    existing.students.push({
      id: clientId,
      name: clientName,
      saldo: getClientSaldo(client),
      planos,
      consumoHoje: buildConsumptionSummary(clientId),
      statusEntrega: buildDeliveryStatus(clientId),
      maxPlanDate: maxPlanDate ? toDateKey(maxPlanDate) : null,
      planExpiringSoon: daysToExpire !== null && daysToExpire >= 0 && daysToExpire <= 5,
    });
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
    return {
      id: responsible.id,
      type: 'RESPONSAVEL',
      name: responsible.name,
      phone: responsible.phone,
      students: students.map((student: any) => student.name),
      variables: {
        nome: responsible.name,
        alunos: toAlunoList(students.map((student: any) => student.name)),
        saldo: toCurrencyBr(saldoTotal),
        plano: planoNames.join(', ') || 'Sem plano ativo',
        consumo_hoje: consumoHoje || 'Sem consumo hoje',
        status_entrega: statusEntrega || 'Pendente',
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

  const filteredAudience = baseAudience.filter((item: any) => {
    if (safeFilter === 'RESPONSAVEIS') return item.type === 'RESPONSAVEL';
    if (safeFilter === 'COLABORADORES') return item.type === 'COLABORADOR';
    if (safeFilter === 'SALDO_BAIXO') return Boolean(item?.impacts?.lowBalance);
    if (safeFilter === 'PLANO_A_VENCER') return Boolean(item?.impacts?.planExpiringSoon);
    if (safeFilter === 'RELATORIO_ENTREGA') return Boolean(item?.impacts?.deliveredToday);
    return true;
  });

  const recipients: AudienceRecipient[] = filteredAudience.map((item: any) => ({
    id: item.id,
    tipo: item.type,
    nome: item.name,
    telefone: item.phone,
    alunos: Array.isArray(item.students) ? item.students : [],
    variables: item.variables || {},
    impact: safeFilter === 'SALDO_BAIXO'
      ? item.variables?.saldo
      : safeFilter === 'PLANO_A_VENCER'
        ? item.variables?.plano
        : safeFilter === 'RELATORIO_ENTREGA'
          ? item.variables?.status_entrega
          : '',
  }));

  return {
    filter: safeFilter,
    total: recipients.length,
    recipients,
  };
};

