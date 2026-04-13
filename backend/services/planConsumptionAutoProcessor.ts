import { db } from '../database.js';

type AutoProcessOptions = {
  enterpriseId?: string;
  force?: boolean;
};

type AutoProcessResult = {
  processedCount: number;
  enterpriseIds: string[];
};

const REQUEST_THROTTLE_MS = 5_000;
const SCHEDULER_INTERVAL_MS = 60_000;
const WEEKDAY_BACKFILL_DAYS = 7;
const BLOCKED_PLAN_NAMES = new Set(['PREPAGO', 'PRE-PAGO', 'PRÉ-PAGO', 'PF_FIXO', 'LANCHE_FIXO']);
const JS_DAY_TO_KEY: Record<number, string> = {
  0: 'DOMINGO',
  1: 'SEGUNDA',
  2: 'TERCA',
  3: 'QUARTA',
  4: 'QUINTA',
  5: 'SEXTA',
  6: 'SABADO',
};
const DAY_KEY_ALIASES: Record<string, string[]> = {
  SEGUNDA: ['SEGUNDA', 'segunda', 'MONDAY', 'monday'],
  TERCA: ['TERCA', 'terça', 'terca', 'TUESDAY', 'tuesday'],
  QUARTA: ['QUARTA', 'quarta', 'WEDNESDAY', 'wednesday'],
  QUINTA: ['QUINTA', 'quinta', 'THURSDAY', 'thursday'],
  SEXTA: ['SEXTA', 'sexta', 'FRIDAY', 'friday'],
  SABADO: ['SABADO', 'sábado', 'sabado', 'SATURDAY', 'saturday'],
  DOMINGO: ['DOMINGO', 'domingo', 'SUNDAY', 'sunday'],
};
const NON_OPERATIONAL_CATEGORIES = new Set([
  'FERIADO',
  'RECESSO',
  'EVENTO',
  'PEDAGOGICO',
  'AVALIACAO',
  'FERIAS',
]);
const OPERATIONAL_CATEGORIES = new Set(['LETIVO']);
const NON_OPERATIONAL_LEGEND_IDS = new Set(['feriado', 'recesso', 'evento', 'pedagogico', 'avaliacao', 'ferias']);
const OPERATIONAL_LEGEND_IDS = new Set(['letivo', 'sabados_letivos']);

const inFlightByScope = new Map<string, Promise<AutoProcessResult>>();
const lastRunAtByEnterprise = new Map<string, number>();
let schedulerHandle: NodeJS.Timeout | null = null;

const normalizeToken = (value: unknown) =>
  String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

const normalizeDateKey = (value: unknown) => {
  const raw = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!br) return '';
  return `${br[3]}-${br[2]}-${br[1]}`;
};

const normalizeDayKey = (value: unknown) => {
  const normalized = normalizeToken(value);
  for (const [canonical, aliases] of Object.entries(DAY_KEY_ALIASES)) {
    if (aliases.some((alias) => normalizeToken(alias) === normalized)) return canonical;
  }
  return normalized;
};

const toLocalDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getDayKeyFromDateIso = (dateIso: string) => {
  const parsed = new Date(`${dateIso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return '';
  return JS_DAY_TO_KEY[parsed.getDay()] || '';
};

const buildLegendCategoryMap = (legends: any[]) =>
  new Map<string, string>(
    (Array.isArray(legends) ? legends : []).map((legend: any) => [
      String(legend?.id || '').trim().toLowerCase(),
      String(legend?.category || '').trim().toUpperCase(),
    ])
  );

const isNonOperationalSchoolEvent = (event: any, categoryByLegendId: Map<string, string>) => {
  const legendTypeId = String(event?.legendTypeId || event?.legendId || '').trim().toLowerCase();
  const category = (
    categoryByLegendId.get(legendTypeId)
    || String(event?.category || '')
  ).trim().toUpperCase();

  if (category && OPERATIONAL_CATEGORIES.has(category)) return false;
  if (category && NON_OPERATIONAL_CATEGORIES.has(category)) return true;
  if (legendTypeId && OPERATIONAL_LEGEND_IDS.has(legendTypeId)) return false;
  if (legendTypeId && NON_OPERATIONAL_LEGEND_IDS.has(legendTypeId)) return true;
  return false;
};

const getBlockedSchoolDates = (enterpriseId: string, schoolYear: number) => {
  const record = db.getSchoolCalendarByEnterpriseAndYear(enterpriseId, schoolYear);
  if (!record) return new Set<string>();

  const categoryByLegendId = buildLegendCategoryMap(Array.isArray(record.legends) ? record.legends : []);
  const blockedDates = (Array.isArray(record.events) ? record.events : [])
    .filter((event: any) => isNonOperationalSchoolEvent(event, categoryByLegendId))
    .map((event: any) => normalizeDateKey(event?.date))
    .filter((dateKey: string) => dateKey.startsWith(`${schoolYear}-`));

  return new Set<string>(blockedDates);
};

const isSchoolDateAllowed = (enterpriseId: string, dateIso: string, cache: Map<number, Set<string>>) => {
  const year = Number(String(dateIso || '').slice(0, 4));
  if (!Number.isFinite(year)) return true;
  if (!cache.has(year)) {
    cache.set(year, getBlockedSchoolDates(enterpriseId, year));
  }
  return !cache.get(year)?.has(dateIso);
};

const isPastCutoffForDate = (dateIso: string, cutoffTime: string, now: Date) => {
  const [hourRaw, minuteRaw] = String(cutoffTime || '18:00').split(':');
  const cutoffHour = Number(hourRaw);
  const cutoffMinute = Number(minuteRaw);
  const base = new Date(`${dateIso}T00:00:00`);
  if (Number.isNaN(base.getTime())) return false;
  base.setHours(
    Number.isFinite(cutoffHour) ? cutoffHour : 18,
    Number.isFinite(cutoffMinute) ? cutoffMinute : 0,
    0,
    0
  );
  return now.getTime() > base.getTime();
};

const buildAutoProcessScope = (enterpriseIds: string[]) =>
  enterpriseIds.length === 1 ? `enterprise:${enterpriseIds[0]}` : 'enterprise:all';

const collectEnterpriseIds = (requestedEnterpriseId?: string) => {
  if (requestedEnterpriseId) return [String(requestedEnterpriseId).trim()].filter(Boolean);
  return db.getEnterprises()
    .map((enterprise: any) => String(enterprise?.id || '').trim())
    .filter(Boolean);
};

const buildExistingDeliveryState = (transactions: any[]) => {
  const deliveryBalanceByKey = new Map<string, number>();
  const manuallyDeletedDeliveryKeys = new Set<string>();

  (Array.isArray(transactions) ? transactions : []).forEach((tx: any) => {
    const type = normalizeToken(tx?.type);
    if (type === 'AUDITORIA_EXCLUSAO') {
      const deletedKeys = Array.isArray(tx?.deletedDeliveryKeys) ? tx.deletedDeliveryKeys : [];
      deletedKeys.forEach((rawKey: any) => {
        const normalized = normalizeToken(rawKey);
        if (normalized) manuallyDeletedDeliveryKeys.add(normalized);
      });
      return;
    }

    const description = String(tx?.description || '').toLowerCase();
    const method = normalizeToken(tx?.paymentMethod || tx?.method);
    const clientId = String(tx?.clientId || '').trim();
    const planName = normalizeToken(tx?.plan || tx?.planName || tx?.item);
    const deliveryDate = normalizeDateKey(tx?.deliveryDate || tx?.scheduledDate || tx?.mealDate || tx?.date);
    if (!clientId || !planName || !deliveryDate) return;

    const isPlanConsumption = type === 'CONSUMO' && (method.includes('PLANO') || Boolean(String(tx?.planId || tx?.originPlanId || '').trim()));
    const looksLikeDelivery = description.includes('entrega do dia') || description.includes('retroativa');
    if (!isPlanConsumption && !looksLikeDelivery) return;

    const key = `${clientId}|${planName}|${deliveryDate}`;
    const current = Number(deliveryBalanceByKey.get(key) || 0);
    const isReversal = description.includes('estorno') || type === 'CREDITO';
    deliveryBalanceByKey.set(key, isReversal ? current - 1 : current + 1);
  });

  return { deliveryBalanceByKey, manuallyDeletedDeliveryKeys };
};

const getDueDatesForConfig = (
  config: any,
  enterpriseId: string,
  cutoffTime: string,
  now: Date,
  schoolCalendarCache: Map<number, Set<string>>
) => {
  const selectedDates = Array.from(new Set<string>(
    (Array.isArray(config?.selectedDates) ? config.selectedDates : [])
      .map((value: unknown) => normalizeDateKey(value))
      .filter(Boolean)
  )).filter((dateIso) => isSchoolDateAllowed(enterpriseId, dateIso, schoolCalendarCache));

  const dueDates = selectedDates.filter((dateIso) => isPastCutoffForDate(dateIso, cutoffTime, now));

  const normalizedDays = new Set(
    (Array.isArray(config?.daysOfWeek) ? config.daysOfWeek : [])
      .map((value: unknown) => normalizeDayKey(value))
      .filter(Boolean)
  );

  if (normalizedDays.size === 0) {
    return dueDates.sort();
  }

  for (let offset = 0; offset <= WEEKDAY_BACKFILL_DAYS; offset += 1) {
    const candidate = new Date(now);
    candidate.setHours(0, 0, 0, 0);
    candidate.setDate(candidate.getDate() - offset);
    const candidateDate = toLocalDateKey(candidate);
    const dayKey = getDayKeyFromDateIso(candidateDate);
    if (!dayKey || !normalizedDays.has(dayKey)) continue;
    if (!isSchoolDateAllowed(enterpriseId, candidateDate, schoolCalendarCache)) continue;
    if (!isPastCutoffForDate(candidateDate, cutoffTime, now)) continue;
    dueDates.push(candidateDate);
  }

  return Array.from(new Set(dueDates)).sort();
};

const findMostRecentPlanCreditTransaction = (
  clientId: string,
  planId: string,
  transactions: any[]
) => {
  const normalizedClientId = String(clientId || '').trim();
  const normalizedPlanId = String(planId || '').trim();
  if (!normalizedClientId || !normalizedPlanId) return null;

  const creditTx = (Array.isArray(transactions) ? transactions : [])
    .filter((tx: any) => {
      const txClientId = String(tx?.clientId || '').trim();
      const txPlanId = String(tx?.planId || tx?.originPlanId || '').trim();
      const txType = normalizeToken(tx?.type);
      return txClientId === normalizedClientId
        && txPlanId === normalizedPlanId
        && (txType === 'CREDIT' || txType === 'CREDITO');
    })
    .sort((a: any, b: any) => {
      const aTs = new Date(a?.timestamp || `${a?.date || ''}T${a?.time || '00:00'}`).getTime();
      const bTs = new Date(b?.timestamp || `${b?.date || ''}T${b?.time || '00:00'}`).getTime();
      return bTs - aTs;
    })[0];

  return creditTx || null;
};

const hasAvailablePlanBalance = (client: any, planId: string, planName: string) => {
  const balances = client?.planCreditBalances;
  if (!balances || typeof balances !== 'object' || Array.isArray(balances)) return false;

  const normalizedTargetName = normalizeToken(planName);

  return Object.values(balances).some((entry: any) => {
    const entryPlanId = String(entry?.planId || '').trim();
    const entryPlanName = normalizeToken(entry?.planName);
    const balanceUnits = Number(entry?.balanceUnits || 0);

    if (balanceUnits <= 0) return false;
    if (planId && entryPlanId === planId) return true;
    if (normalizedTargetName && entryPlanName === normalizedTargetName) return true;
    return false;
  });
};

const runAutoProcessForEnterprise = (enterpriseId: string, now: Date) => {
  const enterprise = db.getEnterprise(enterpriseId);
  if (!enterprise) return 0;

  const processingProfile = (enterprise as any)?.planConsumptionProcessingProfile || {};
  if (processingProfile?.enabled === false) return 0;

  const cutoffRaw = String(processingProfile?.cutoffTime || '').trim();
  const cutoffTime = /^([01]\d|2[0-3]):([0-5]\d)$/.test(cutoffRaw) ? cutoffRaw : '18:00';
  const configuredPlanIds = new Set(
    Array.isArray(processingProfile?.planIds)
      ? processingProfile.planIds.map((id: any) => String(id || '').trim()).filter(Boolean)
      : []
  );

  const plans = db.getPlans(enterpriseId).filter((plan: any) => plan?.isActive !== false);
  const planById = new Map(plans.map((plan: any) => [String(plan?.id || '').trim(), plan]));
  const planByName = new Map(plans.map((plan: any) => [normalizeToken(plan?.name), plan]));
  const clients = db.getClients(enterpriseId).filter((client: any) => normalizeToken(client?.type) === 'ALUNO');
  const transactions = db.getTransactions({ enterpriseId });
  const { deliveryBalanceByKey, manuallyDeletedDeliveryKeys } = buildExistingDeliveryState(transactions);
  const schoolCalendarCache = new Map<number, Set<string>>();

  let processedCount = 0;

  clients.forEach((client: any) => {
    const selectedConfigs = Array.isArray(client?.selectedPlansConfig) ? client.selectedPlansConfig : [];
    selectedConfigs.forEach((config: any) => {
      const planId = String(config?.planId || '').trim();
      const planNameToken = normalizeToken(config?.planName);
      const plan = planById.get(planId) || planByName.get(planNameToken) || null;
      const resolvedPlanId = String(plan?.id || planId || '').trim();
      const resolvedPlanName = String(plan?.name || config?.planName || '').trim();
      const normalizedPlanName = normalizeToken(resolvedPlanName);

      if (!resolvedPlanName || !plan || BLOCKED_PLAN_NAMES.has(normalizedPlanName)) return;
      if (configuredPlanIds.size > 0 && (!resolvedPlanId || !configuredPlanIds.has(resolvedPlanId))) return;
      if (!hasAvailablePlanBalance(client, resolvedPlanId, resolvedPlanName)) return; // só baixa se houver saldo de plano

      const dueDates = getDueDatesForConfig(config, enterpriseId, cutoffTime, now, schoolCalendarCache);
      dueDates.forEach((scheduledDate, index) => {
        const deliveryKey = `${String(client?.id || '').trim()}|${normalizedPlanName}|${scheduledDate}`;
        if (!deliveryKey || manuallyDeletedDeliveryKeys.has(normalizeToken(deliveryKey))) return;
        if (Number(deliveryBalanceByKey.get(deliveryKey) || 0) > 0) return;

        // Encontra a recarga mais recente para lincar
        const mostRecentCredit = findMostRecentPlanCreditTransaction(
          String(client?.id || '').trim(),
          resolvedPlanId,
          transactions
        );

        const txTimestamp = new Date(now.getTime() + index * 1000);
        const createPayload: any = {
          clientId: String(client?.id || '').trim(),
          clientName: String(client?.name || '').trim(),
          enterpriseId,
          type: 'CONSUMO',
          amount: 0,
          description: `Entrega do dia - ${resolvedPlanName} - ${resolvedPlanName} - ${scheduledDate}`,
          item: resolvedPlanName,
          paymentMethod: 'PLANO',
          method: 'PLANO',
          timestamp: txTimestamp.toISOString(),
          date: scheduledDate,
          deliveryDate: scheduledDate,
          time: txTimestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          status: 'CONCLUIDA',
          executionSource: 'SISTEMA',
          plan: resolvedPlanName,
          planId: resolvedPlanId || undefined,
          planUnitValue: Number(plan?.price || config?.planPrice || 0) || undefined,
          planUnits: 1,
        };

        // ✅ Lincar à recarga encontrada
        if (mostRecentCredit) {
          createPayload.originTransactionId = String(mostRecentCredit?.id || '').trim();
          createPayload.purchaseRefCode = String(mostRecentCredit?.purchaseRefCode || '').trim() || undefined;
        }

        db.createTransaction(createPayload);
        deliveryBalanceByKey.set(deliveryKey, 1);
        processedCount += 1;
      });
    });
  });

  if (processedCount > 0) {
    console.log(`🔄 [AUTO_PLAN] ${processedCount} consumo(s) auto-baixado(s) para enterprise ${enterpriseId}`);
  }

  return processedCount;
};

export const processOverduePlanConsumptions = async (options: AutoProcessOptions = {}) => {
  const enterpriseIds = collectEnterpriseIds(options.enterpriseId);
  if (enterpriseIds.length === 0) {
    return { processedCount: 0, enterpriseIds: [] };
  }

  const force = Boolean(options.force);
  const nowMs = Date.now();
  const eligibleEnterpriseIds = force
    ? enterpriseIds
    : enterpriseIds.filter((enterpriseId) => nowMs - Number(lastRunAtByEnterprise.get(enterpriseId) || 0) >= REQUEST_THROTTLE_MS);

  if (eligibleEnterpriseIds.length === 0) {
    return { processedCount: 0, enterpriseIds };
  }

  const scopeKey = buildAutoProcessScope(eligibleEnterpriseIds);
  const existing = inFlightByScope.get(scopeKey);
  if (existing) return existing;

  const job = Promise.resolve().then(() => {
    const now = new Date();
    let processedCount = 0;

    eligibleEnterpriseIds.forEach((enterpriseId) => {
      processedCount += runAutoProcessForEnterprise(enterpriseId, now);
      lastRunAtByEnterprise.set(enterpriseId, Date.now());
    });

    return {
      processedCount,
      enterpriseIds: eligibleEnterpriseIds,
    };
  }).finally(() => {
    inFlightByScope.delete(scopeKey);
  });

  inFlightByScope.set(scopeKey, job);
  return job;
};

export const startPlanConsumptionAutoProcessor = () => {
  if (schedulerHandle) return;

  void processOverduePlanConsumptions({ force: true }).catch((error) => {
    console.error('❌ [AUTO_PLAN] Falha no processamento inicial:', error);
  });

  schedulerHandle = setInterval(() => {
    void processOverduePlanConsumptions({ force: true }).catch((error) => {
      console.error('❌ [AUTO_PLAN] Falha no processamento agendado:', error);
    });
  }, SCHEDULER_INTERVAL_MS);
};
