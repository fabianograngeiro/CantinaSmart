import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
const DATABASE_FILE = path.join(DATA_DIR, 'database.json');
const CURRENT_SCHEMA_VERSION = 2;

interface DatabaseShape {
  schemaVersion: number;
  enterprises: any[];
  users: any[];
  products: any[];
  productSequence: number;
  categories: any[];
  clients: any[];
  plans: any[];
  suppliers: any[];
  transactions: any[];
  orders: any[];
  ingredients: any[];
  menus?: any[];
  whatsappStore?: {
    history?: any;
    schedules?: any;
    aiConfig?: any;
    dispatchAutomationsByEnterprise?: Record<string, any>;
    dispatchLogsByEnterprise?: Record<string, any[]>;
    updatedAt?: string;
  };
}

const createEmptyDatabase = (): DatabaseShape => ({
  schemaVersion: CURRENT_SCHEMA_VERSION,
  enterprises: [],
  users: [],
  products: [],
  productSequence: 0,
  categories: [],
  clients: [],
  plans: [],
  suppliers: [],
  transactions: [],
  orders: [],
  ingredients: [],
  menus: [],
  whatsappStore: {},
});

export class Database {
  private schemaVersion = CURRENT_SCHEMA_VERSION;
  private enterprises: any[] = [];
  private users: any[] = [];
  private products: any[] = [];
  private productSequence = 0;
  private categories: any[] = [];
  private clients: any[] = [];
  private plans: any[] = [];
  private suppliers: any[] = [];
  private transactions: any[] = [];
  private orders: any[] = [];
  private ingredients: any[] = [];
  private menus: any[] = [];
  private whatsappStore: {
    history?: any;
    schedules?: any;
    aiConfig?: any;
    dispatchAutomationsByEnterprise?: Record<string, any>;
    dispatchLogsByEnterprise?: Record<string, any[]>;
    updatedAt?: string;
  } = {};

  private normalizeBrazilPhone(value: any) {
    const digits = String(value ?? '').replace(/\D/g, '');
    return digits;
  }

  private generateEntityId(prefix: string) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  }

  private normalizeParentRelationship(value: any) {
    const normalized = String(value || '').trim().toUpperCase();
    if (['PAIS', 'AVOS', 'TIOS', 'TUTOR_LEGAL'].includes(normalized)) return normalized;
    return 'PAIS';
  }

  private toStringArray(value: any) {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => String(item || '').trim())
      .filter(Boolean);
  }

  private normalizeRelatedStudentPayload(value: any) {
    if (!value || typeof value !== 'object') return null;

    const classType = String(value?.classType || '').trim().toUpperCase();
    const normalizedClassType = ['INFANTIL', 'FUNDAMENTAL', 'MEDIO', 'INTEGRAL'].includes(classType) ? classType : '';
    const classGrade = String(value?.classGrade || '').trim();
    const classValueRaw = String(value?.class || '').trim();
    const classValue = classValueRaw || [normalizedClassType, classGrade].filter(Boolean).join(' - ');
    const restrictions = this.toStringArray(value?.restrictions);

    return {
      name: String(value?.name || '').trim(),
      registrationId: String(value?.registrationId || '').trim(),
      class: classValue,
      classType: normalizedClassType,
      classGrade,
      dailyLimit: this.toFiniteNumber(value?.dailyLimit, 0),
      restrictions,
      responsibleType: this.normalizeParentRelationship(value?.responsibleType),
    };
  }

  private syncCollaboratorStudentRelationships() {
    const collaboratorMap = new Map<string, any>();
    this.clients.forEach((client: any) => {
      if (String(client?.type || '').trim().toUpperCase() !== 'COLABORADOR') return;
      const collaboratorId = String(client?.id || '').trim();
      if (!collaboratorId) return;
      client.relatedStudentIds = this.toStringArray(client.relatedStudentIds);
      collaboratorMap.set(collaboratorId, client);
    });

    this.clients.forEach((client: any) => {
      if (String(client?.type || '').trim().toUpperCase() !== 'ALUNO') return;
      let collaboratorId = String(client?.responsibleCollaboratorId || '').trim();
      if (!collaboratorId) {
        const studentEnterpriseId = String(client?.enterpriseId || '').trim();
        const studentResponsiblePhone = this.normalizeBrazilPhone(client?.parentWhatsapp || client?.phone || '');
        const studentResponsibleName = this.normalizeToken(client?.parentName);
        const inferred = this.clients.find((candidate: any) => {
          if (String(candidate?.type || '').trim().toUpperCase() !== 'COLABORADOR') return false;
          if (String(candidate?.enterpriseId || '').trim() !== studentEnterpriseId) return false;
          const candidatePhone = this.normalizeBrazilPhone(candidate?.phone || candidate?.parentWhatsapp || '');
          const candidateName = this.normalizeToken(candidate?.name);
          if (studentResponsiblePhone && candidatePhone && studentResponsiblePhone === candidatePhone) return true;
          if (studentResponsibleName && candidateName && studentResponsibleName === candidateName) return true;
          return false;
        });
        if (inferred?.id) {
          collaboratorId = String(inferred.id).trim();
          client.responsibleCollaboratorId = collaboratorId;
        }
      }
      if (!collaboratorId) return;

      const collaborator = collaboratorMap.get(collaboratorId);
      if (!collaborator) {
        client.responsibleCollaboratorId = '';
        if (String(client?.responsibleOriginType || '').trim().toUpperCase() === 'COLABORADOR') {
          client.responsibleOriginType = 'MANUAL';
        }
        return;
      }

      client.responsibleOriginType = 'COLABORADOR';
      client.parentName = String(collaborator?.name || client?.parentName || '').trim();
      if (String(collaborator?.phone || '').trim()) {
        const normalizedPhone = this.normalizeBrazilPhone(collaborator.phone);
        client.parentWhatsapp = normalizedPhone;
        client.phone = normalizedPhone;
      }
      if (String(collaborator?.parentWhatsappCountryCode || '').trim()) {
        client.parentWhatsappCountryCode = String(collaborator.parentWhatsappCountryCode).replace(/\D/g, '') || '55';
      }
      if (String(collaborator?.email || '').trim()) {
        client.parentEmail = String(collaborator.email).trim();
        client.email = String(collaborator.email).trim();
      }
      if (String(collaborator?.cpf || '').trim()) {
        const normalizedCpf = String(collaborator.cpf).replace(/\D/g, '');
        client.parentCpf = normalizedCpf;
        client.cpf = normalizedCpf;
      }

      const existing = this.toStringArray(collaborator.relatedStudentIds);
      if (!existing.includes(String(client.id))) {
        existing.push(String(client.id));
      }
      collaborator.relatedStudentIds = existing;
    });
  }

  private normalizeContactFields(record: any) {
    const next = { ...(record || {}) };
    const phoneFields = ['phone', 'phone1', 'phone2', 'guardianPhone', 'parentWhatsapp'];

    for (const field of phoneFields) {
      if (field in next) {
        next[field] = this.normalizeBrazilPhone(next[field]);
      }
    }

    const isStudent = String(next?.type || '').trim().toUpperCase() === 'ALUNO';
    const isCollaborator = String(next?.type || '').trim().toUpperCase() === 'COLABORADOR';
    const studentName = String(next?.name || '').trim();
    const parentName = String(next?.parentName || '').trim();
    if (isStudent && !parentName) {
      next.parentName = studentName
        ? `Responsável pelo(a) ${studentName}`
        : 'Responsável não informado';
    }
    next.parentRelationship = this.normalizeParentRelationship(next?.parentRelationship);
    next.restrictions = this.toStringArray(next?.restrictions);
    if ('relatedStudentIds' in next) {
      next.relatedStudentIds = this.toStringArray(next.relatedStudentIds);
    }
    if ('relatedStudent' in next) {
      next.relatedStudent = this.normalizeRelatedStudentPayload(next.relatedStudent);
    }
    next.parentCpf = String(next?.parentCpf || '').replace(/\D/g, '');
    next.cpf = String(next?.cpf || '').replace(/\D/g, '');
    next.parentEmail = String(next?.parentEmail || '').trim();
    next.email = String(next?.email || '').trim();
    next.responsibleCollaboratorId = String(next?.responsibleCollaboratorId || '').trim();
    next.responsibleOriginType = String(next?.responsibleOriginType || '').trim().toUpperCase();
    if (isStudent && next.responsibleCollaboratorId) {
      next.responsibleOriginType = 'COLABORADOR';
    }
    if (!isStudent && 'responsibleCollaboratorId' in next) {
      if (!isCollaborator) {
        next.responsibleCollaboratorId = '';
        if (next.responsibleOriginType === 'COLABORADOR') next.responsibleOriginType = 'MANUAL';
      }
    }
    if (isCollaborator && !Array.isArray(next.relatedStudentIds)) {
      next.relatedStudentIds = [];
    }
    if (!isCollaborator && 'relatedStudentIds' in next) {
      next.relatedStudentIds = this.toStringArray(next.relatedStudentIds);
    }

    return next;
  }

  private toFiniteNumber(value: any, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private roundValue(value: number, precision = 2) {
    const factor = 10 ** precision;
    return Math.round((this.toFiniteNumber(value, 0) + Number.EPSILON) * factor) / factor;
  }

  private normalizeToken(value?: string) {
    return String(value || '')
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase();
  }

  private findPlanByReference(planId: string, planName: string, enterpriseId?: string) {
    if (planId) {
      const byId = this.plans.find((plan: any) => String(plan?.id || '').trim() === planId);
      if (byId) return byId;
    }

    if (!planName) return null;
    const normalizedPlanName = this.normalizeToken(planName);
    if (!normalizedPlanName) return null;
    const enterpriseIdNormalized = String(enterpriseId || '').trim();

    const matches = this.plans.filter((plan: any) => {
      const sameName = this.normalizeToken(plan?.name) === normalizedPlanName;
      if (!sameName) return false;
      if (!enterpriseIdNormalized) return true;
      return String(plan?.enterpriseId || '').trim() === enterpriseIdNormalized;
    });

    return matches[0] || null;
  }

  private resolvePlanUnitValue(planId: string, planName: string, enterpriseId?: string, extraCandidates: any[] = []) {
    const directCandidates = extraCandidates
      .map((candidate) => this.toFiniteNumber(candidate, 0))
      .find((candidate) => candidate > 0);
    if (directCandidates && directCandidates > 0) {
      return this.roundValue(directCandidates, 4);
    }

    const plan = this.findPlanByReference(planId, planName, enterpriseId);
    if (!plan) return 0;

    const planCandidates = [plan?.price, plan?.unitPrice, plan?.amount, plan?.value]
      .map((candidate) => this.toFiniteNumber(candidate, 0))
      .find((candidate) => candidate > 0);

    return planCandidates && planCandidates > 0
      ? this.roundValue(planCandidates, 4)
      : 0;
  }

  private extractPlanBalanceUnits(entry: any, unitValue: number) {
    const directUnits = [entry?.balanceUnits, entry?.units, entry?.remainingUnits, entry?.quantity]
      .map((candidate) => this.toFiniteNumber(candidate, NaN))
      .find((candidate) => Number.isFinite(candidate));
    if (Number.isFinite(directUnits)) {
      return Math.max(0, this.roundValue(Number(directUnits), 4));
    }

    const currentBalance = this.toFiniteNumber(entry?.balance, 0);
    if (unitValue > 0) {
      return Math.max(0, this.roundValue(currentBalance / unitValue, 4));
    }

    return Math.max(0, this.roundValue(currentBalance, 4));
  }

  private resolvePlanBalanceKey(balances: Record<string, any>, planId: string, planName: string) {
    if (planId) return planId;
    if (!planName) return '';

    const byNameKey = Object.keys(balances).find((key) =>
      this.normalizeToken(balances[key]?.planName) === this.normalizeToken(planName)
    );
    if (byNameKey) return byNameKey;

    return this.normalizeToken(planName);
  }

  private resolveTransactionAmount(tx: any) {
    return this.toFiniteNumber(tx?.amount ?? tx?.total ?? tx?.value, 0);
  }

  private resolveTransactionPlanUnits(tx: any, unitValue: number) {
    const directPlanUnits = [tx?.planUnits, tx?.units]
      .map((candidate) => this.toFiniteNumber(candidate, NaN))
      .find((candidate) => Number.isFinite(candidate) && Math.abs(candidate) > 0);
    if (Number.isFinite(directPlanUnits)) {
      return Math.abs(this.roundValue(Number(directPlanUnits), 4));
    }

    const txType = this.normalizeToken(tx?.type);
    const quantityCandidate = this.toFiniteNumber(tx?.quantity, NaN);
    if (
      Number.isFinite(quantityCandidate)
      && Math.abs(quantityCandidate) > 0
      && (txType === 'CONSUMO' || txType === 'DEBIT')
    ) {
      return Math.abs(this.roundValue(Number(quantityCandidate), 4));
    }

    const descriptionRaw = `${String(tx?.description || '')} ${String(tx?.item || '')}`;
    const unitsMatch = descriptionRaw.match(/(\d+(?:[.,]\d+)?)\s*(unidade(?:s)?|dia(?:s)?)/i);
    if (unitsMatch?.[1]) {
      const parsed = Number(String(unitsMatch[1]).replace(',', '.'));
      if (Number.isFinite(parsed) && parsed > 0) {
        return Math.abs(this.roundValue(parsed, 4));
      }
    }

    const amount = Math.abs(this.resolveTransactionAmount(tx));
    if (amount > 0 && unitValue > 0) {
      return Math.abs(this.roundValue(amount / unitValue, 4));
    }

    const description = this.normalizeToken(`${tx?.description || ''} ${tx?.item || ''}`);
    if (description.includes('CONSUMO DE 1 UNIDADE') || description.includes('ENTREGA DO DIA')) {
      return 1;
    }

    return 0;
  }

  private formatUnitsLabel(value: number) {
    const safe = this.roundValue(this.toFiniteNumber(value, 0), 4);
    if (Math.abs(safe - Math.trunc(safe)) < 0.000001) return String(Math.trunc(safe));
    return safe.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  private buildPlanUnitsProgressLabel(remainingUnits: number, totalUnits: number) {
    const safeRemaining = Math.max(0, this.roundValue(this.toFiniteNumber(remainingUnits, 0), 4));
    const safeTotal = Math.max(safeRemaining, this.roundValue(this.toFiniteNumber(totalUnits, 0), 4));
    return `${this.formatUnitsLabel(safeRemaining)}/${this.formatUnitsLabel(safeTotal)}`;
  }

  private resolveConfiguredPlanUnits(client: any, planId: string, planName: string) {
    const selectedPlansConfig = Array.isArray(client?.selectedPlansConfig) ? client.selectedPlansConfig : [];
    const normalizedPlanName = this.normalizeToken(planName);

    const matched = selectedPlansConfig.find((cfg: any) => {
      const cfgPlanId = String(cfg?.planId || '').trim();
      const cfgPlanName = this.normalizeToken(cfg?.planName || '');
      if (planId && cfgPlanId && cfgPlanId === planId) return true;
      if (normalizedPlanName && cfgPlanName && cfgPlanName === normalizedPlanName) return true;
      return false;
    });

    if (!matched) return 0;

    const selectedDates = Array.isArray(matched?.selectedDates) ? matched.selectedDates : [];
    const daysOfWeek = Array.isArray(matched?.daysOfWeek) ? matched.daysOfWeek : [];
    const count = selectedDates.length > 0 ? selectedDates.length : daysOfWeek.length;
    return Math.max(0, this.roundValue(this.toFiniteNumber(count, 0), 4));
  }

  private isDeliveryPlanTransaction(tx: any) {
    const description = this.normalizeToken(tx?.description || tx?.item || '');
    if (!description.includes('ENTREGA DO DIA')) return false;
    const method = this.normalizeToken(tx?.paymentMethod || tx?.method);
    const hasPlan = Boolean(String(tx?.planId || '').trim() || String(tx?.plan || tx?.planName || tx?.item || '').trim());
    return hasPlan && (method.includes('PLANO') || description.includes('PLANO') || description.includes('ALMOCO') || description.includes('LANCHE'));
  }

  private resolveDeliveryPlanTransactionKey(tx: any) {
    const clientId = String(tx?.clientId || '').trim();
    const planName = this.normalizeToken(tx?.plan || tx?.planName || tx?.item || '');
    const date = String(tx?.deliveryDate || tx?.scheduledDate || tx?.mealDate || tx?.date || '').slice(0, 10);
    if (!clientId || !planName || !date) return '';
    return `${clientId}|${planName}|${date}`;
  }

  private normalizeClientPlanBalances(client: any) {
    const next = { ...(client || {}) };
    const rawBalances = next?.planCreditBalances;
    if (!rawBalances || typeof rawBalances !== 'object' || Array.isArray(rawBalances)) {
      return next;
    }

    const normalizedBalances: Record<string, any> = {};
    for (const [rawKey, rawEntry] of Object.entries(rawBalances)) {
      const entry = rawEntry && typeof rawEntry === 'object' ? rawEntry : {};
      const planIdCandidate = String((entry as any)?.planId || '').trim();
      const planId = planIdCandidate || (String(rawKey || '').startsWith('plan_') ? String(rawKey).trim() : '');
      const planName = String((entry as any)?.planName || '').trim();
      const fallbackKey = String(rawKey || planName || planId || '').trim();
      const key = planId || this.normalizeToken(fallbackKey);
      if (!key) continue;

      const unitValueResolved = this.resolvePlanUnitValue(
        planId,
        planName,
        String(next?.enterpriseId || '').trim(),
        [(entry as any)?.unitValue, (entry as any)?.planPrice, (entry as any)?.price]
      );
      const unitValue = unitValueResolved > 0 ? unitValueResolved : 1;
      const balanceUnits = this.extractPlanBalanceUnits(entry, unitValue);
      const configuredUnits = this.resolveConfiguredPlanUnits(next, planId, planName);
      const explicitTotalUnits = this.toFiniteNumber((entry as any)?.totalUnits, NaN);
      const totalUnitsBase = Number.isFinite(explicitTotalUnits) ? Number(explicitTotalUnits) : 0;
      const totalUnits = Math.max(balanceUnits, configuredUnits, this.roundValue(totalUnitsBase, 4));
      const consumedUnits = Math.max(0, this.roundValue(totalUnits - balanceUnits, 4));
      const balance = Math.max(0, this.roundValue(balanceUnits * unitValue, 2));
      const resolvedPlan = this.findPlanByReference(planId, planName, String(next?.enterpriseId || '').trim());
      const resolvedPlanName = String((entry as any)?.planName || planName || resolvedPlan?.name || 'PLANO').trim() || 'PLANO';
      const resolvedPlanId = String((entry as any)?.planId || planId || resolvedPlan?.id || key).trim() || key;

      normalizedBalances[key] = {
        ...entry,
        planId: resolvedPlanId,
        planName: resolvedPlanName,
        balanceUnits,
        totalUnits,
        consumedUnits,
        unitsProgress: this.buildPlanUnitsProgressLabel(balanceUnits, totalUnits),
        unitValue: this.roundValue(unitValue, 4),
        balance,
        updatedAt: (entry as any)?.updatedAt || new Date().toISOString(),
      };
    }

    next.planCreditBalances = normalizedBalances;
    return next;
  }

  private applyPlanBalanceDelta(clientRef: any, tx: any, signedUnits: number, signedAmount: number) {
    const planId = String(tx?.planId || tx?.originPlanId || '').trim();
    const planName = String(tx?.plan || tx?.planName || '').trim();
    if (!planId && !planName) return;

    const balances = { ...(clientRef?.planCreditBalances || {}) } as Record<string, any>;
    const key = this.resolvePlanBalanceKey(balances, planId, planName);
    if (!key) return;

    const current = balances[key] || {};
    const unitValueResolved = this.resolvePlanUnitValue(
      planId || String(current?.planId || '').trim(),
      planName || String(current?.planName || '').trim(),
      String(clientRef?.enterpriseId || '').trim(),
      [current?.unitValue, current?.planPrice, tx?.unitValue, tx?.planUnitValue, tx?.planPrice]
    );
    const unitValue = unitValueResolved > 0 ? unitValueResolved : 1;
    const currentUnits = this.extractPlanBalanceUnits(current, unitValue);

    let deltaUnits = this.toFiniteNumber(signedUnits, 0);
    if (Math.abs(deltaUnits) < 0.000001) {
      const fallbackAmount = this.toFiniteNumber(signedAmount, 0);
      if (Math.abs(fallbackAmount) > 0) {
        deltaUnits = unitValue > 0 ? fallbackAmount / unitValue : fallbackAmount;
      }
    }

    const nextUnits = Math.max(0, this.roundValue(currentUnits + deltaUnits, 4));
    const configuredUnits = this.resolveConfiguredPlanUnits(
      clientRef,
      planId || String(current?.planId || '').trim(),
      planName || String(current?.planName || '').trim()
    );
    const explicitTotalUnits = this.toFiniteNumber(current?.totalUnits, NaN);
    const totalUnitsBase = Number.isFinite(explicitTotalUnits) ? Number(explicitTotalUnits) : 0;
    const nextTotalUnits = Math.max(nextUnits, configuredUnits, this.roundValue(totalUnitsBase, 4));
    const nextConsumedUnits = Math.max(0, this.roundValue(nextTotalUnits - nextUnits, 4));
    const nextBalance = Math.max(0, this.roundValue(nextUnits * unitValue, 2));
    const resolvedPlan = this.findPlanByReference(
      planId || String(current?.planId || '').trim(),
      planName || String(current?.planName || '').trim(),
      String(clientRef?.enterpriseId || '').trim()
    );

    balances[key] = {
      ...current,
      planId: String(current?.planId || planId || resolvedPlan?.id || key).trim() || key,
      planName: String(current?.planName || planName || resolvedPlan?.name || 'PLANO').trim() || 'PLANO',
      balanceUnits: nextUnits,
      totalUnits: nextTotalUnits,
      consumedUnits: nextConsumedUnits,
      unitsProgress: this.buildPlanUnitsProgressLabel(nextUnits, nextTotalUnits),
      unitValue: this.roundValue(unitValue, 4),
      balance: nextBalance,
      updatedAt: new Date().toISOString(),
    };

    clientRef.planCreditBalances = balances;
  }

  private rebuildClientPlanBalancesFromTransactions(client: any) {
    const next = { ...(client || {}) };
    const clientId = String(next?.id || '').trim();
    if (!clientId) return next;

    const existingBalances = next?.planCreditBalances && typeof next.planCreditBalances === 'object' && !Array.isArray(next.planCreditBalances)
      ? (next.planCreditBalances as Record<string, any>)
      : {};

    const stateByKey = new Map<string, {
      key: string;
      planId: string;
      planName: string;
      unitValue: number;
      purchasedUnits: number;
      balanceUnits: number;
      configuredUnits: number;
      sawTransaction: boolean;
      existingEntry: any;
    }>();

    const resolveStateKey = (planId: string, planName: string) => {
      if (planId) return planId;
      const normalizedName = this.normalizeToken(planName);
      if (!normalizedName) return '';
      const byName = Array.from(stateByKey.values()).find((entry) => this.normalizeToken(entry.planName) === normalizedName);
      if (byName) return byName.key;
      const byExisting = Object.entries(existingBalances).find(([, entry]) =>
        this.normalizeToken((entry as any)?.planName) === normalizedName
      );
      if (byExisting?.[0]) return String(byExisting[0]);
      return normalizedName;
    };

    const ensureState = (planIdInput: string, planNameInput: string, unitValueHint = 0) => {
      const planId = String(planIdInput || '').trim();
      const planName = String(planNameInput || '').trim();
      const key = resolveStateKey(planId, planName);
      if (!key) return null;
      const current = stateByKey.get(key);
      if (current) {
        if (!current.planId && planId) current.planId = planId;
        if ((!current.planName || current.planName === 'PLANO') && planName) current.planName = planName;
        if (unitValueHint > 0 && current.unitValue <= 0) current.unitValue = this.roundValue(unitValueHint, 4);
        return current;
      }

      const existingEntry = existingBalances[key] || {};
      const existingPlanId = String(existingEntry?.planId || '').trim();
      const existingPlanName = String(existingEntry?.planName || '').trim();
      const resolvedPlan = this.findPlanByReference(
        planId || existingPlanId,
        planName || existingPlanName,
        String(next?.enterpriseId || '').trim()
      );
      const resolvedPlanId = String(planId || existingPlanId || resolvedPlan?.id || key).trim() || key;
      const resolvedPlanName = String(planName || existingPlanName || resolvedPlan?.name || 'PLANO').trim() || 'PLANO';
      const resolvedUnitValue = this.resolvePlanUnitValue(
        resolvedPlanId,
        resolvedPlanName,
        String(next?.enterpriseId || '').trim(),
        [unitValueHint, existingEntry?.unitValue, existingEntry?.planPrice]
      );

      const state = {
        key,
        planId: resolvedPlanId,
        planName: resolvedPlanName,
        unitValue: resolvedUnitValue > 0 ? this.roundValue(resolvedUnitValue, 4) : 0,
        purchasedUnits: 0,
        balanceUnits: 0,
        configuredUnits: this.resolveConfiguredPlanUnits(next, resolvedPlanId, resolvedPlanName),
        sawTransaction: false,
        existingEntry,
      };
      stateByKey.set(key, state);
      return state;
    };

    for (const [rawKey, rawEntry] of Object.entries(existingBalances)) {
      const entry = rawEntry && typeof rawEntry === 'object' ? rawEntry : {};
      const planId = String((entry as any)?.planId || '').trim() || (String(rawKey || '').startsWith('plan_') ? String(rawKey).trim() : '');
      const planName = String((entry as any)?.planName || '').trim();
      const unitHint = this.toFiniteNumber((entry as any)?.unitValue, 0);
      ensureState(planId, planName, unitHint);
    }

    const selectedConfigs = Array.isArray(next?.selectedPlansConfig) ? next.selectedPlansConfig : [];
    selectedConfigs.forEach((cfg: any) => {
      const planId = String(cfg?.planId || '').trim();
      const planName = String(cfg?.planName || cfg?.name || '').trim();
      const unitHint = this.toFiniteNumber(cfg?.planPrice ?? cfg?.price ?? cfg?.value, 0);
      ensureState(planId, planName, unitHint);
    });

    const clientTransactions = this.transactions
      .filter((tx: any) => String(tx?.clientId || '').trim() === clientId)
      .sort((a: any, b: any) => {
        const aTs = new Date(a?.timestamp || `${a?.date || ''}T${a?.time || '00:00'}`).getTime();
        const bTs = new Date(b?.timestamp || `${b?.date || ''}T${b?.time || '00:00'}`).getTime();
        return (Number.isFinite(aTs) ? aTs : 0) - (Number.isFinite(bTs) ? bTs : 0);
      });

    clientTransactions.forEach((tx: any) => {
      const txType = this.normalizeToken(tx?.type);
      const txDesc = this.normalizeToken(tx?.description || tx?.item);
      const txMethod = this.normalizeToken(tx?.paymentMethod || tx?.method);
      const planId = String(tx?.planId || tx?.originPlanId || '').trim();
      const planName = String(tx?.plan || tx?.planName || tx?.item || '').trim();
      const planNameNormalized = this.normalizeToken(planName);
      const isDelivery = this.isDeliveryPlanTransaction(tx);
      const isPlanCredit = (txType === 'CREDIT' || txType === 'CREDITO')
        && (Boolean(planId) || txDesc.includes('CREDITO PLANO') || txDesc.includes('RECARGA DE PLANO') || txMethod.includes('PLANO'));
      const isPlanConsumption = (txType === 'CONSUMO' || txType === 'DEBIT')
        && (isDelivery || Boolean(planId) || txMethod.includes('PLANO') || (planNameNormalized.length > 0 && !['AVULSO', 'PREPAGO', 'GERAL', 'VENDA'].includes(planNameNormalized)));
      if (!isPlanCredit && !isPlanConsumption) return;
      if (!planId && !planName) return;

      const state = ensureState(planId, planName, this.toFiniteNumber(tx?.planUnitValue ?? tx?.unitValue ?? tx?.planPrice, 0));
      if (!state) return;

      const unitValue = state.unitValue > 0
        ? state.unitValue
        : this.resolvePlanUnitValue(state.planId, state.planName, String(next?.enterpriseId || '').trim(), [tx?.planUnitValue, tx?.unitValue, tx?.planPrice]);
      const safeUnitValue = unitValue > 0 ? unitValue : 1;
      if (state.unitValue <= 0 && safeUnitValue > 0) {
        state.unitValue = this.roundValue(safeUnitValue, 4);
      }
      const units = this.resolveTransactionPlanUnits(tx, safeUnitValue);
      if (units <= 0) return;

      state.sawTransaction = true;
      if (isPlanCredit) {
        const isReversal = txDesc.includes('ESTORNO');
        state.balanceUnits = this.roundValue(state.balanceUnits + units, 4);
        if (!isReversal) {
          state.purchasedUnits = this.roundValue(state.purchasedUnits + units, 4);
        }
        return;
      }

      if (isPlanConsumption) {
        state.balanceUnits = this.roundValue(Math.max(0, state.balanceUnits - units), 4);
      }
    });

    const rebuiltBalances: Record<string, any> = {};
    stateByKey.forEach((state) => {
      const currentEntry = state.existingEntry || {};
      const currentUnitValue = state.unitValue > 0
        ? state.unitValue
        : this.resolvePlanUnitValue(state.planId, state.planName, String(next?.enterpriseId || '').trim(), [currentEntry?.unitValue, currentEntry?.planPrice]);
      const safeUnitValue = currentUnitValue > 0 ? currentUnitValue : 1;

      let balanceUnits = state.sawTransaction
        ? this.roundValue(Math.max(0, state.balanceUnits), 4)
        : this.extractPlanBalanceUnits(currentEntry, safeUnitValue);
      const explicitTotalUnits = this.toFiniteNumber(currentEntry?.totalUnits, NaN);
      const totalBase = Number.isFinite(explicitTotalUnits) ? Number(explicitTotalUnits) : 0;
      const purchasedBase = state.sawTransaction ? state.purchasedUnits : 0;
      const totalUnits = Math.max(balanceUnits, state.configuredUnits, this.roundValue(totalBase, 4), this.roundValue(purchasedBase, 4));
      const consumedUnits = Math.max(0, this.roundValue(totalUnits - balanceUnits, 4));
      const balance = Math.max(0, this.roundValue(balanceUnits * safeUnitValue, 2));
      const key = String(state.planId || state.key).trim() || state.key;

      rebuiltBalances[key] = {
        ...currentEntry,
        planId: String(state.planId || currentEntry?.planId || key).trim() || key,
        planName: String(state.planName || currentEntry?.planName || 'PLANO').trim() || 'PLANO',
        balanceUnits,
        totalUnits,
        consumedUnits,
        unitsProgress: this.buildPlanUnitsProgressLabel(balanceUnits, totalUnits),
        unitValue: this.roundValue(safeUnitValue, 4),
        balance,
        updatedAt: new Date().toISOString(),
      };
    });

    next.planCreditBalances = rebuiltBalances;
    return next;
  }

  private deduplicateDeliveryHistoryTransactions() {
    const groupedByKey = new Map<string, any[]>();
    const toTimestamp = (tx: any) => {
      const parsed = new Date(tx?.timestamp || `${tx?.date || ''}T${tx?.time || '00:00'}`).getTime();
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const isReversal = (tx: any) => {
      const txType = this.normalizeToken(tx?.type);
      const txDesc = this.normalizeToken(tx?.description || tx?.item);
      return txType === 'CREDITO' || txDesc.includes('ESTORNO');
    };

    this.transactions.forEach((tx: any) => {
      if (!this.isDeliveryPlanTransaction(tx)) return;
      const key = this.resolveDeliveryPlanTransactionKey(tx);
      if (!key) return;
      const current = groupedByKey.get(key) || [];
      current.push(tx);
      groupedByKey.set(key, current);
    });

    const idsToRemove = new Set<string>();
    let affectedKeys = 0;

    groupedByKey.forEach((txs) => {
      if (!Array.isArray(txs) || txs.length <= 1) return;
      let removedInGroup = 0;
      const sorted = [...txs].sort((a, b) => toTimestamp(a) - toTimestamp(b));
      const normal = sorted.filter((tx) => !isReversal(tx));
      const reversals = sorted.filter((tx) => isReversal(tx));
      const net = sorted.reduce((acc, tx) => acc + (isReversal(tx) ? -1 : 1), 0);
      const keepIds = new Set<string>();

      if (net > 0) {
        const firstNormal = normal[0];
        if (firstNormal?.id) keepIds.add(String(firstNormal.id));
      } else if (net === 0) {
        const firstNormal = normal[0];
        if (firstNormal?.id) keepIds.add(String(firstNormal.id));
        if (reversals.length > 0) {
          const firstNormalTs = firstNormal ? toTimestamp(firstNormal) : 0;
          const reversalAfterNormal = reversals.find((tx) => toTimestamp(tx) >= firstNormalTs) || reversals[0];
          if (reversalAfterNormal?.id) keepIds.add(String(reversalAfterNormal.id));
        }
      } else {
        const firstReversal = reversals[0];
        if (firstReversal?.id) keepIds.add(String(firstReversal.id));
      }

      sorted.forEach((tx) => {
        const txId = String(tx?.id || '').trim();
        if (!txId) return;
        if (!keepIds.has(txId)) {
          idsToRemove.add(txId);
          removedInGroup += 1;
        }
      });
      if (removedInGroup > 0) affectedKeys += 1;
    });

    if (idsToRemove.size === 0) {
      return { removed: 0, affectedKeys: 0 };
    }

    this.transactions = this.transactions.filter((tx: any) => {
      const txId = String(tx?.id || '').trim();
      return !txId || !idsToRemove.has(txId);
    });

    return { removed: idsToRemove.size, affectedKeys };
  }

  private buildConsumedPlanProgressByTransactionId(transactions: any[]) {
    const progressByTxId = new Map<string, string>();
    const unitByClientPlanId = new Map<string, number>();
    const unitByClientPlanName = new Map<string, number>();
    const genericPlanNames = new Set(['', 'AVULSO', 'PREPAGO', 'GERAL', 'VENDA', 'CANTINA', 'CREDITO CANTINA', 'CRÉDITO CANTINA']);

    this.clients.forEach((client: any) => {
      const clientId = String(client?.id || '').trim();
      if (!clientId) return;
      const balances = client?.planCreditBalances && typeof client.planCreditBalances === 'object' && !Array.isArray(client.planCreditBalances)
        ? Object.values(client.planCreditBalances)
        : [];
      (Array.isArray(balances) ? balances : []).forEach((entry: any) => {
        const planId = String(entry?.planId || '').trim();
        const planName = this.normalizeToken(entry?.planName || '');
        const unitValue = this.toFiniteNumber(entry?.unitValue ?? entry?.planPrice ?? entry?.price, 0);
        if (!Number.isFinite(unitValue) || unitValue <= 0) return;
        if (planId) unitByClientPlanId.set(`${clientId}|${planId}`, unitValue);
        if (planName) unitByClientPlanName.set(`${clientId}|${planName}`, unitValue);
      });
    });

    type State = { totalUnits: number; balanceUnits: number };
    const stateByCanonical = new Map<string, State>();
    const canonicalById = new Map<string, string>();
    const canonicalByName = new Map<string, string>();
    const resolveCanonicalKey = (clientId: string, planId: string, planName: string) => {
      const idLookup = planId ? canonicalById.get(`${clientId}|${planId}`) : '';
      if (idLookup) {
        if (planName) canonicalByName.set(`${clientId}|${planName}`, idLookup);
        return idLookup;
      }
      const nameLookup = planName ? canonicalByName.get(`${clientId}|${planName}`) : '';
      if (nameLookup) {
        if (planId) canonicalById.set(`${clientId}|${planId}`, nameLookup);
        return nameLookup;
      }
      const fresh = `${clientId}|${planId || planName}`;
      if (planId) canonicalById.set(`${clientId}|${planId}`, fresh);
      if (planName) canonicalByName.set(`${clientId}|${planName}`, fresh);
      return fresh;
    };

    const sorted = [...(Array.isArray(transactions) ? transactions : [])].sort((a: any, b: any) => {
      const aTs = new Date(a?.timestamp || `${a?.date || ''}T${a?.time || '00:00'}`).getTime();
      const bTs = new Date(b?.timestamp || `${b?.date || ''}T${b?.time || '00:00'}`).getTime();
      const safeATs = Number.isFinite(aTs) ? aTs : 0;
      const safeBTs = Number.isFinite(bTs) ? bTs : 0;
      if (safeATs !== safeBTs) return safeATs - safeBTs;

      return String(a?.id || '').localeCompare(String(b?.id || ''));
    });

    sorted.forEach((tx: any) => {
      const txId = String(tx?.id || '').trim();
      const clientId = String(tx?.clientId || '').trim();
      if (!txId || !clientId) return;

      const txType = this.normalizeToken(tx?.type);
      const txDesc = this.normalizeToken(tx?.description || tx?.item);
      const txMethod = this.normalizeToken(tx?.paymentMethod || tx?.method);
      const planId = String(tx?.planId || tx?.originPlanId || '').trim();
      const planName = this.normalizeToken(tx?.plan || tx?.planName || tx?.item || '');
      if (!planId && !planName) return;

      const isPlanCredit = (txType === 'CREDIT' || txType === 'CREDITO')
        && (Boolean(planId) || txDesc.includes('CREDITO PLANO') || txDesc.includes('RECARGA DE PLANO') || txMethod.includes('PLANO'));
      const isPlanConsumption = (txType === 'CONSUMO' || txType === 'DEBIT')
        && (
          this.isDeliveryPlanTransaction(tx)
          || Boolean(planId)
          || txMethod.includes('PLANO')
          || (planName.length > 0 && !genericPlanNames.has(planName))
        );
      if (!isPlanCredit && !isPlanConsumption) return;

      const canonicalKey = resolveCanonicalKey(clientId, planId, planName);
      const state = stateByCanonical.get(canonicalKey) || { totalUnits: 0, balanceUnits: 0 };
      const unitValue = this.resolvePlanUnitValue(
        planId,
        planName,
        String(tx?.enterpriseId || '').trim(),
        [
          tx?.planUnitValue,
          tx?.unitValue,
          tx?.planPrice,
          planId ? unitByClientPlanId.get(`${clientId}|${planId}`) : undefined,
          planName ? unitByClientPlanName.get(`${clientId}|${planName}`) : undefined,
        ]
      );
      const units = this.resolveTransactionPlanUnits(tx, unitValue > 0 ? unitValue : 1);
      if (!Number.isFinite(units) || units <= 0) return;

      if (isPlanCredit) {
        const isReversal = txDesc.includes('ESTORNO');
        if (isReversal) {
          state.balanceUnits = this.roundValue(Math.max(0, state.balanceUnits + units), 4);
          if (state.totalUnits < state.balanceUnits) state.totalUnits = state.balanceUnits;
        } else {
          if (state.balanceUnits <= 0.000001) {
            state.totalUnits = this.roundValue(units, 4);
            state.balanceUnits = this.roundValue(units, 4);
          } else {
            state.totalUnits = this.roundValue(state.totalUnits + units, 4);
            state.balanceUnits = this.roundValue(state.balanceUnits + units, 4);
          }
        }
        const safeTotal = Math.max(0, state.totalUnits, state.balanceUnits);
        const consumedUnits = this.roundValue(Math.max(0, safeTotal - state.balanceUnits), 4);
        progressByTxId.set(
          txId,
          this.buildPlanUnitsProgressLabel(
            consumedUnits,
            safeTotal
          )
        );
        stateByCanonical.set(canonicalKey, state);
        return;
      }

      if (state.totalUnits <= 0.000001 && state.balanceUnits <= 0.000001) {
        state.totalUnits = this.roundValue(units, 4);
        state.balanceUnits = 0;
      } else {
        state.balanceUnits = this.roundValue(Math.max(0, state.balanceUnits - units), 4);
      }
      const safeTotal = Math.max(0, state.totalUnits, state.balanceUnits);
      const consumedUnits = this.roundValue(Math.max(0, safeTotal - state.balanceUnits), 4);
      progressByTxId.set(
        txId,
        this.buildPlanUnitsProgressLabel(
          consumedUnits,
          safeTotal
        )
      );
      stateByCanonical.set(canonicalKey, state);
    });

    return progressByTxId;
  }

  private normalizeStoredData() {
    this.enterprises = this.enterprises.map((enterprise) => this.normalizeContactFields(enterprise));
    this.suppliers = this.suppliers.map((supplier) => this.normalizeContactFields(supplier));
    this.deduplicateDeliveryHistoryTransactions();
    this.clients = this.clients.map((client) => {
      const contactNormalized = this.normalizeContactFields(client);
      const schemaNormalized = this.normalizeClientPlanBalances(contactNormalized);
      return this.rebuildClientPlanBalancesFromTransactions(schemaNormalized);
    });
    this.syncCollaboratorStudentRelationships();
  }

  constructor() {
    this.loadData();
  }

  private ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  private readLegacyData(): DatabaseShape {
    const readArrayFile = (fileName: string): any[] => {
      const filePath = path.join(DATA_DIR, fileName);
      if (!fs.existsSync(filePath)) return [];

      try {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    };

    return {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      enterprises: readArrayFile('enterprises.json'),
      users: readArrayFile('users.json'),
      products: readArrayFile('products.json'),
      productSequence: 0,
      categories: [],
      clients: readArrayFile('clients.json'),
      plans: readArrayFile('plans.json'),
      suppliers: readArrayFile('suppliers.json'),
      transactions: readArrayFile('transactions.json'),
      orders: readArrayFile('orders.json'),
      ingredients: readArrayFile('ingredients.json'),
      menus: readArrayFile('menus.json'),
    };
  }

  private normalizeIncomingData(raw: any): DatabaseShape {
    const safeRaw = raw && typeof raw === 'object' ? raw : {};
    const ensureArray = (value: any) => (Array.isArray(value) ? value : []);
    const rawVersion = Number(safeRaw.schemaVersion);
    const detectedVersion = Number.isFinite(rawVersion) && rawVersion > 0
      ? Math.trunc(rawVersion)
      : 0;
    const merged = {
      ...createEmptyDatabase(),
      ...safeRaw,
      enterprises: ensureArray(safeRaw.enterprises),
      users: ensureArray(safeRaw.users),
      products: ensureArray(safeRaw.products),
      categories: ensureArray(safeRaw.categories),
      clients: ensureArray(safeRaw.clients),
      plans: ensureArray(safeRaw.plans),
      suppliers: ensureArray(safeRaw.suppliers),
      transactions: ensureArray(safeRaw.transactions),
      orders: ensureArray(safeRaw.orders),
      ingredients: ensureArray(safeRaw.ingredients),
      menus: ensureArray(safeRaw.menus),
      whatsappStore: safeRaw.whatsappStore && typeof safeRaw.whatsappStore === 'object'
        ? safeRaw.whatsappStore
        : {},
      productSequence: Number(safeRaw.productSequence) || 0,
    } as DatabaseShape;

    let version = detectedVersion;
    if (version < 1) version = 1;
    if (version < 2) version = 2;

    merged.schemaVersion = Math.max(version, CURRENT_SCHEMA_VERSION);
    return merged;
  }

  private migrateData(raw: any) {
    const detectedVersion = Number.isFinite(Number(raw?.schemaVersion)) && Number(raw?.schemaVersion) > 0
      ? Math.trunc(Number(raw.schemaVersion))
      : 0;
    const normalized = this.normalizeIncomingData(raw);
    const migrated = detectedVersion !== normalized.schemaVersion;
    return { data: normalized, migrated, fromVersion: detectedVersion, toVersion: normalized.schemaVersion };
  }

  private assignData(data: DatabaseShape) {
    this.schemaVersion = Number(data.schemaVersion || CURRENT_SCHEMA_VERSION);
    this.enterprises = data.enterprises;
    this.users = data.users;
    this.products = data.products;
    this.productSequence = Number(data.productSequence || 0);
    this.categories = data.categories;
    this.clients = data.clients;
    this.plans = data.plans;
    this.suppliers = data.suppliers;
    this.transactions = data.transactions;
    this.orders = data.orders;
    this.ingredients = data.ingredients;
    this.menus = Array.isArray((data as any).menus) ? (data as any).menus : [];
    this.whatsappStore = (data as any).whatsappStore && typeof (data as any).whatsappStore === 'object'
      ? (data as any).whatsappStore
      : {};
  }

  private snapshotData(): DatabaseShape {
    return {
      schemaVersion: this.schemaVersion,
      enterprises: this.enterprises,
      users: this.users,
      products: this.products,
      productSequence: this.productSequence,
      categories: this.categories,
      clients: this.clients,
      plans: this.plans,
      suppliers: this.suppliers,
      transactions: this.transactions,
      orders: this.orders,
      ingredients: this.ingredients,
      menus: this.menus,
      whatsappStore: this.whatsappStore,
    };
  }

  private loadData() {
    try {
      this.ensureDataDir();
      console.log('📂 [DB] Loading data from database.json...');

      let data: DatabaseShape;

      if (fs.existsSync(DATABASE_FILE)) {
        const parsed = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf-8'));
        const migration = this.migrateData(parsed);
        data = migration.data;
        if (migration.migrated) {
          console.log(`ℹ️ [DB] Schema migration aplicada: v${migration.fromVersion} -> v${migration.toVersion}`);
          fs.writeFileSync(DATABASE_FILE, JSON.stringify(data, null, 2), 'utf-8');
        }
      } else {
        console.log('ℹ️ [DB] database.json not found, migrating legacy files...');
        const legacyData = this.readLegacyData();
        const hasLegacyRecords = [
          legacyData.enterprises,
          legacyData.users,
          legacyData.products,
          legacyData.categories,
          legacyData.clients,
          legacyData.plans,
          legacyData.suppliers,
          legacyData.transactions,
          legacyData.orders,
          legacyData.ingredients,
        ].some((collection) => collection.length > 0);
        const baseData = hasLegacyRecords ? legacyData : createEmptyDatabase();
        data = this.migrateData(baseData).data;
        fs.writeFileSync(DATABASE_FILE, JSON.stringify(data, null, 2), 'utf-8');
        console.log('✅ [DB] database.json created successfully');
      }

      this.assignData(data);
      this.normalizeStoredData();
      this.syncProductSequence();
      // Persiste normalizações (ex.: saldos de plano com unidade+valor derivado).
      this.saveData();

      console.log('✅ [DB] Data loaded successfully');
      console.log(`   - Enterprise: ${this.enterprises.length}`);
      console.log(`   - Users: ${this.users.length}`);
      console.log(`   - Products: ${this.products.length}`);
      console.log(`   - Schema version: ${this.schemaVersion}`);
      console.log(`   - Categories: ${this.categories.length}`);
      console.log(`   - Clients: ${this.clients.length}`);
      console.log(`   - Plans: ${this.plans.length}`);
      console.log(`   - Suppliers: ${this.suppliers.length}`);
      console.log(`   - Menus: ${this.menus.length}`);
    } catch (err) {
      console.error('❌ [DB] Error loading data:', err);
    }
  }

  private saveData() {
    try {
      this.ensureDataDir();
      fs.writeFileSync(DATABASE_FILE, JSON.stringify(this.snapshotData(), null, 2), 'utf-8');
    } catch (err) {
      console.error('Error saving data:', err);
    }
  }

  // Método público para recarregar dados do disco
  reload() {
    this.loadData();
  }

  reset() {
    this.assignData(createEmptyDatabase());
    this.saveData();
  }

  private syncProductSequence() {
    const maxExistingSequence = this.products.reduce((max, product) => {
      const id = String(product?.id || '');
      const match = id.match(/^p_(\d+)$/i);
      if (!match) return max;
      const parsed = Number(match[1]);
      if (!Number.isFinite(parsed)) return max;
      return Math.max(max, parsed);
    }, 0);

    this.productSequence = Math.max(this.productSequence, maxExistingSequence);
  }

  getStats() {
    return {
      enterprises: this.enterprises.length,
      users: this.users.length,
      products: this.products.length,
      categories: this.categories.length,
      clients: this.clients.length,
      plans: this.plans.length,
      suppliers: this.suppliers.length,
      ingredients: this.ingredients.length,
      menus: this.menus.length,
      orders: this.orders.length,
      transactions: this.transactions.length,
    };
  }

  // ===== MENUS =====
  getMenus(enterpriseId?: string, type?: string) {
    let result = this.menus;
    if (enterpriseId) result = result.filter((m) => String(m.enterpriseId) === String(enterpriseId));
    if (type) result = result.filter((m) => String(m.type || '').toUpperCase() === String(type || '').toUpperCase());
    return result;
  }

  getMenuByEnterpriseAndType(enterpriseId: string, type: string) {
    return this.menus.find(
      (m) =>
        String(m.enterpriseId) === String(enterpriseId)
        && String(m.type || '').toUpperCase() === String(type || '').toUpperCase()
    );
  }

  upsertMenuByEnterpriseAndType(payload: {
    enterpriseId: string;
    type: 'ALMOCO' | 'LANCHE' | string;
    days: any[];
  }) {
    const enterpriseId = String(payload.enterpriseId || '').trim();
    const type = String(payload.type || '').trim().toUpperCase();
    if (!enterpriseId || !type) return null;

    const normalizedDays = Array.isArray(payload.days) ? payload.days : [];
    const index = this.menus.findIndex(
      (m) =>
        String(m.enterpriseId) === enterpriseId
        && String(m.type || '').toUpperCase() === type
    );

    const nextRecord = {
      id: index > -1 ? this.menus[index].id : `menu_${Date.now()}`,
      enterpriseId,
      type,
      days: normalizedDays,
      updatedAt: new Date().toISOString(),
    };

    if (index > -1) {
      this.menus[index] = nextRecord;
    } else {
      this.menus.push(nextRecord);
    }
    this.saveData();
    return nextRecord;
  }

  // ===== WHATSAPP STORE (persistido no database.json) =====
  getWhatsAppStore() {
    return this.whatsappStore && typeof this.whatsappStore === 'object'
      ? this.whatsappStore
      : {};
  }

  updateWhatsAppStore(patch: {
    history?: any;
    schedules?: any;
    aiConfig?: any;
    dispatchAutomationsByEnterprise?: Record<string, any>;
    dispatchLogsByEnterprise?: Record<string, any[]>;
  }) {
    this.whatsappStore = {
      ...this.getWhatsAppStore(),
      ...(patch && typeof patch === 'object' ? patch : {}),
      updatedAt: new Date().toISOString(),
    };
    this.saveData();
    return this.whatsappStore;
  }

  // ===== ENTERPRISES =====
  getEnterprises() {
    return this.enterprises;
  }

  getEnterprise(id: string) {
    return this.enterprises.find(e => e.id === id);
  }

  createEnterprise(data: any) {
    const newEnterprise = this.normalizeContactFields({ ...data, id: 'ent_' + Date.now() });
    this.enterprises.push(newEnterprise);
    this.saveData();
    return newEnterprise;
  }

  updateEnterprise(id: string, data: any) {
    const index = this.enterprises.findIndex(e => e.id === id);
    if (index > -1) {
      this.enterprises[index] = this.normalizeContactFields({ ...this.enterprises[index], ...data });
      this.saveData();
      return this.enterprises[index];
    }
    return null;
  }

  deleteEnterprise(id: string) {
    const index = this.enterprises.findIndex(e => e.id === id);
    if (index > -1) {
      this.enterprises.splice(index, 1);
      this.saveData();
      return true;
    }
    return false;
  }

  // ===== USERS =====
  getUsers() {
    console.log('📋 [DB] Getting all users, total:', this.users.length);
    return this.users;
  }

  getUser(id: string) {
    console.log('🔍 [DB] Getting user by ID:', id);
    const user = this.users.find(u => u.id === id);
    console.log('   Result:', user ? `Found ${user.email}` : 'Not found');
    return user;
  }

  getUserByEmail(email: string) {
    console.log('🔍 [DB] Getting user by email:', email);
    const user = this.users.find(u => u.email === email);
    console.log('   Result:', user ? `Found ${user.id}` : 'Not found');
    if (!user) {
      console.log('   Available emails:', this.users.map(u => u.email).join(', '));
    }
    return user;
  }

  createUser(data: any) {
    const newUser = { ...data, id: 'u_' + Date.now() };
    this.users.push(newUser);
    this.saveData();
    return newUser;
  }

  updateUser(id: string, data: any) {
    const index = this.users.findIndex(u => u.id === id);
    if (index > -1) {
      this.users[index] = { ...this.users[index], ...data };
      this.saveData();
      return this.users[index];
    }
    return null;
  }

  deleteUser(id: string) {
    const index = this.users.findIndex(u => u.id === id);
    if (index > -1) {
      this.users.splice(index, 1);
      this.saveData();
      return true;
    }
    return false;
  }

  // ===== PRODUCTS =====
  getProducts(enterpriseId?: string) {
    if (enterpriseId) {
      return this.products.filter(p => p.enterpriseId === enterpriseId);
    }
    return this.products;
  }

  getProduct(id: string) {
    return this.products.find(p => p.id === id);
  }

  createProduct(data: any) {
    this.productSequence += 1;
    const nextId = `p_${String(this.productSequence).padStart(6, '0')}`;
    const newProduct = { ...data, id: nextId };
    this.products.push(newProduct);
    this.saveData();
    return newProduct;
  }

  updateProduct(id: string, data: any) {
    const index = this.products.findIndex(p => p.id === id);
    if (index > -1) {
      this.products[index] = { ...this.products[index], ...data };
      this.saveData();
      return this.products[index];
    }
    return null;
  }

  deleteProduct(id: string) {
    const index = this.products.findIndex(p => p.id === id);
    if (index > -1) {
      this.products.splice(index, 1);
      this.saveData();
      return true;
    }
    return false;
  }

  // ===== CATEGORIES =====
  getCategories(enterpriseId?: string) {
    if (enterpriseId) {
      return this.categories.filter(c => c.enterpriseId === enterpriseId);
    }
    return this.categories;
  }

  getCategory(id: string) {
    return this.categories.find(c => c.id === id);
  }

  createCategory(data: any) {
    const newCategory = {
      ...data,
      id: data.id || 'cat_' + Date.now(),
      subCategories: data.subCategories || [],
    };
    this.categories.push(newCategory);
    this.saveData();
    return newCategory;
  }

  updateCategory(id: string, data: any) {
    const index = this.categories.findIndex(c => c.id === id);
    if (index > -1) {
      this.categories[index] = { ...this.categories[index], ...data };
      this.saveData();
      return this.categories[index];
    }
    return null;
  }

  deleteCategory(id: string) {
    const index = this.categories.findIndex(c => c.id === id);
    if (index > -1) {
      this.categories.splice(index, 1);
      this.saveData();
      return true;
    }
    return false;
  }

  // ===== CLIENTS =====
  getClients(enterpriseId?: string) {
    if (enterpriseId) {
      return this.clients.filter(c => c.enterpriseId === enterpriseId);
    }
    return this.clients;
  }

  getClient(id: string) {
    return this.clients.find(c => c.id === id);
  }

  createClient(data: any) {
    const newClient = this.normalizeClientPlanBalances(
      this.normalizeContactFields({ ...data, id: this.generateEntityId('c') })
    );
    this.clients.push(newClient);

    const isCollaborator = String(newClient?.type || '').trim().toUpperCase() === 'COLABORADOR';
    const relatedStudent = this.normalizeRelatedStudentPayload(data?.relatedStudent);
    if (isCollaborator && relatedStudent?.name) {
      const relatedStudentId = this.generateEntityId('c');
      const collaboratorPhone = this.normalizeBrazilPhone(newClient?.phone || newClient?.parentWhatsapp || '');
      const collaboratorCountryCode = String(newClient?.parentWhatsappCountryCode || '55').replace(/\D/g, '') || '55';
      const classValue = String(relatedStudent.class || '').trim()
        || [String(relatedStudent.classType || '').trim(), String(relatedStudent.classGrade || '').trim()].filter(Boolean).join(' - ');

      const relatedStudentPayload = this.normalizeClientPlanBalances(
        this.normalizeContactFields({
          id: relatedStudentId,
          enterpriseId: String(newClient?.enterpriseId || '').trim(),
          type: 'ALUNO',
          registrationId: relatedStudent.registrationId || `${String(newClient?.registrationId || 'COL')}-ALUNO`,
          name: relatedStudent.name,
          class: classValue,
          dailyLimit: this.toFiniteNumber(relatedStudent.dailyLimit, 0),
          restrictions: this.toStringArray(relatedStudent.restrictions),
          servicePlans: ['PREPAGO'],
          selectedPlansConfig: [],
          planCreditBalances: {},
          balance: 0,
          spentToday: 0,
          isBlocked: false,
          parentName: String(newClient?.name || '').trim(),
          parentRelationship: relatedStudent.responsibleType || 'PAIS',
          parentWhatsappCountryCode: collaboratorCountryCode,
          parentWhatsapp: collaboratorPhone,
          phone: collaboratorPhone,
          parentEmail: String(newClient?.email || newClient?.parentEmail || '').trim(),
          email: String(newClient?.email || '').trim(),
          parentCpf: String(newClient?.cpf || newClient?.parentCpf || '').replace(/\D/g, ''),
          cpf: String(newClient?.cpf || '').replace(/\D/g, ''),
          responsibleCollaboratorId: String(newClient?.id || ''),
          responsibleOriginType: 'COLABORADOR',
        })
      );
      this.clients.push(relatedStudentPayload);

      const existingIds = this.toStringArray(newClient.relatedStudentIds);
      if (!existingIds.includes(relatedStudentId)) {
        existingIds.push(relatedStudentId);
      }
      newClient.relatedStudentIds = existingIds;
      newClient.relatedStudent = { ...relatedStudent, studentId: relatedStudentId };
    }

    this.syncCollaboratorStudentRelationships();
    this.saveData();
    return newClient;
  }

  updateClient(id: string, data: any) {
    const index = this.clients.findIndex(c => c.id === id);
    if (index > -1) {
      this.clients[index] = this.normalizeClientPlanBalances(
        this.normalizeContactFields({ ...this.clients[index], ...data })
      );
      const updatedClient = this.clients[index];
      const isCollaborator = String(updatedClient?.type || '').trim().toUpperCase() === 'COLABORADOR';
      const relatedStudent = this.normalizeRelatedStudentPayload(data?.relatedStudent);
      if (isCollaborator && relatedStudent?.name) {
        const existingLinkedStudent = this.clients.find((client: any) => {
          if (String(client?.type || '').trim().toUpperCase() !== 'ALUNO') return false;
          if (String(client?.responsibleCollaboratorId || '').trim() !== String(updatedClient?.id || '').trim()) return false;
          const sameName = this.normalizeToken(client?.name) === this.normalizeToken(relatedStudent.name);
          const sameRegistration = relatedStudent.registrationId
            && this.normalizeToken(client?.registrationId) === this.normalizeToken(relatedStudent.registrationId);
          return sameName || Boolean(sameRegistration);
        });
        if (!existingLinkedStudent) {
          const relatedStudentId = this.generateEntityId('c');
          const collaboratorPhone = this.normalizeBrazilPhone(updatedClient?.phone || updatedClient?.parentWhatsapp || '');
          const collaboratorCountryCode = String(updatedClient?.parentWhatsappCountryCode || '55').replace(/\D/g, '') || '55';
          const classValue = String(relatedStudent.class || '').trim()
            || [String(relatedStudent.classType || '').trim(), String(relatedStudent.classGrade || '').trim()].filter(Boolean).join(' - ');
          const relatedStudentPayload = this.normalizeClientPlanBalances(
            this.normalizeContactFields({
              id: relatedStudentId,
              enterpriseId: String(updatedClient?.enterpriseId || '').trim(),
              type: 'ALUNO',
              registrationId: relatedStudent.registrationId || `${String(updatedClient?.registrationId || 'COL')}-ALUNO`,
              name: relatedStudent.name,
              class: classValue,
              dailyLimit: this.toFiniteNumber(relatedStudent.dailyLimit, 0),
              restrictions: this.toStringArray(relatedStudent.restrictions),
              servicePlans: ['PREPAGO'],
              selectedPlansConfig: [],
              planCreditBalances: {},
              balance: 0,
              spentToday: 0,
              isBlocked: false,
              parentName: String(updatedClient?.name || '').trim(),
              parentRelationship: relatedStudent.responsibleType || 'PAIS',
              parentWhatsappCountryCode: collaboratorCountryCode,
              parentWhatsapp: collaboratorPhone,
              phone: collaboratorPhone,
              parentEmail: String(updatedClient?.email || updatedClient?.parentEmail || '').trim(),
              email: String(updatedClient?.email || '').trim(),
              parentCpf: String(updatedClient?.cpf || updatedClient?.parentCpf || '').replace(/\D/g, ''),
              cpf: String(updatedClient?.cpf || '').replace(/\D/g, ''),
              responsibleCollaboratorId: String(updatedClient?.id || ''),
              responsibleOriginType: 'COLABORADOR',
            })
          );
          this.clients.push(relatedStudentPayload);

          const existingIds = this.toStringArray(updatedClient.relatedStudentIds);
          if (!existingIds.includes(relatedStudentId)) {
            existingIds.push(relatedStudentId);
          }
          updatedClient.relatedStudentIds = existingIds;
          updatedClient.relatedStudent = { ...relatedStudent, studentId: relatedStudentId };
        }
      }
      this.syncCollaboratorStudentRelationships();
      this.saveData();
      return this.clients[index];
    }
    return null;
  }

  deleteClient(id: string) {
    const index = this.clients.findIndex(c => c.id === id);
    if (index > -1) {
      const deletingClient = this.clients[index];
      const deletingType = String(deletingClient?.type || '').trim().toUpperCase();
      if (deletingType === 'COLABORADOR') {
        this.clients = this.clients.map((client: any) => {
          if (String(client?.type || '').trim().toUpperCase() !== 'ALUNO') return client;
          if (String(client?.responsibleCollaboratorId || '').trim() !== String(id).trim()) return client;
          return {
            ...client,
            responsibleCollaboratorId: '',
            responsibleOriginType: 'MANUAL',
          };
        });
      } else if (deletingType === 'ALUNO') {
        this.clients = this.clients.map((client: any) => {
          if (String(client?.type || '').trim().toUpperCase() !== 'COLABORADOR') return client;
          return {
            ...client,
            relatedStudentIds: this.toStringArray(client?.relatedStudentIds).filter((studentId) => String(studentId) !== String(id)),
          };
        });
      }
      this.clients.splice(index, 1);
      this.syncCollaboratorStudentRelationships();
      this.saveData();
      return true;
    }
    return false;
  }

  // ===== PLANS =====
  getPlans(enterpriseId?: string) {
    if (enterpriseId) {
      return this.plans.filter(p => p.enterpriseId === enterpriseId);
    }
    return this.plans;
  }

  getPlan(id: string) {
    return this.plans.find(p => p.id === id);
  }

  createPlan(data: any) {
    const newPlan = { ...data, id: 'plan_' + Date.now() };
    this.plans.push(newPlan);
    this.saveData();
    return newPlan;
  }

  updatePlan(id: string, data: any) {
    const index = this.plans.findIndex(p => p.id === id);
    if (index > -1) {
      this.plans[index] = { ...this.plans[index], ...data };
      this.saveData();
      return this.plans[index];
    }
    return null;
  }

  deletePlan(id: string) {
    const index = this.plans.findIndex(p => p.id === id);
    if (index > -1) {
      this.plans.splice(index, 1);
      this.saveData();
      return true;
    }
    return false;
  }

  // ===== SUPPLIERS =====
  getSuppliers(enterpriseId?: string) {
    if (enterpriseId) {
      return this.suppliers.filter(s => s.enterpriseId === enterpriseId);
    }
    return this.suppliers;
  }

  getSupplier(id: string) {
    return this.suppliers.find(s => s.id === id);
  }

  createSupplier(data: any) {
    const newSupplier = this.normalizeContactFields({ ...data, id: 's_' + Date.now() });
    this.suppliers.push(newSupplier);
    this.saveData();
    return newSupplier;
  }

  updateSupplier(id: string, data: any) {
    const index = this.suppliers.findIndex(s => s.id === id);
    if (index > -1) {
      this.suppliers[index] = this.normalizeContactFields({ ...this.suppliers[index], ...data });
      this.saveData();
      return this.suppliers[index];
    }
    return null;
  }

  deleteSupplier(id: string) {
    const index = this.suppliers.findIndex(s => s.id === id);
    if (index > -1) {
      this.suppliers.splice(index, 1);
      this.saveData();
      return true;
    }
    return false;
  }

  // ===== TRANSACTIONS =====
  getTransactions(filters?: { clientId?: string; enterpriseId?: string }) {
    const dedupResult = this.deduplicateDeliveryHistoryTransactions();
    if (dedupResult.removed > 0) {
      this.clients = this.clients.map((client) => this.rebuildClientPlanBalancesFromTransactions(client));
      this.saveData();
    }

    const consumedProgressByTxId = this.buildConsumedPlanProgressByTransactionId(this.transactions);

    const { clientId, enterpriseId } = filters || {};
    let result = this.transactions;

    if (clientId) {
      result = result.filter(t => t.clientId === clientId);
    }

    if (enterpriseId) {
      result = result.filter(t => t.enterpriseId === enterpriseId);
    }

    return [...result].sort((a, b) => {
      const aTs = new Date(a.timestamp || `${a.date || ''}T${a.time || '00:00'}`).getTime();
      const bTs = new Date(b.timestamp || `${b.date || ''}T${b.time || '00:00'}`).getTime();
      return (Number.isFinite(bTs) ? bTs : 0) - (Number.isFinite(aTs) ? aTs : 0);
    }).map((tx: any) => {
      const txId = String(tx?.id || '').trim();
      const snapshot = txId ? consumedProgressByTxId.get(txId) : '';
      if (!snapshot) return tx;
      return {
        ...tx,
        unitsProgressSnapshot: snapshot,
      };
    });
  }

  getTransaction(id: string) {
    return this.transactions.find(t => t.id === id);
  }

  createTransaction(data: any) {
    const now = new Date();
    const nowIso = now.toISOString();
    const date = nowIso.split('T')[0];
    const time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const randomSuffix = Math.random().toString(36).slice(2, 7);

    const parsedAmount = Number(data?.amount ?? data?.total ?? data?.value ?? 0);
    const amount = Number.isFinite(parsedAmount) ? parsedAmount : 0;

    const newTransaction = {
      ...data,
      id: data?.id || `t_${Date.now()}_${randomSuffix}`,
      type: data?.type || 'DEBIT',
      amount,
      total: Number(data?.total ?? amount) || amount,
      status: data?.status || 'CONCLUIDA',
      executionSource: String(data?.executionSource || 'USUARIO').toUpperCase() === 'SISTEMA' ? 'SISTEMA' : 'USUARIO',
      timestamp: data?.timestamp || nowIso,
      date: data?.date || date,
      time: data?.time || time,
    };

    if (this.isDeliveryPlanTransaction(newTransaction)) {
      const deliveryKey = this.resolveDeliveryPlanTransactionKey(newTransaction);
      const txType = this.normalizeToken(newTransaction?.type);
      const txDesc = this.normalizeToken(newTransaction?.description || newTransaction?.item);
      const isReversal = txType === 'CREDITO' || txDesc.includes('ESTORNO');

      if (deliveryKey && txType === 'CONSUMO' && !isReversal) {
        const deliveryBalance = this.transactions.reduce((acc, tx: any) => {
          if (!this.isDeliveryPlanTransaction(tx)) return acc;
          if (this.resolveDeliveryPlanTransactionKey(tx) !== deliveryKey) return acc;
          const existingType = this.normalizeToken(tx?.type);
          const existingDesc = this.normalizeToken(tx?.description || tx?.item);
          const existingIsReversal = existingType === 'CREDITO' || existingDesc.includes('ESTORNO');
          return acc + (existingIsReversal ? -1 : 1);
        }, 0);

        if (deliveryBalance > 0) {
          const existing = [...this.transactions].reverse().find((tx: any) => {
            if (!this.isDeliveryPlanTransaction(tx)) return false;
            if (this.resolveDeliveryPlanTransactionKey(tx) !== deliveryKey) return false;
            const existingType = this.normalizeToken(tx?.type);
            const existingDesc = this.normalizeToken(tx?.description || tx?.item);
            return !(existingType === 'CREDITO' || existingDesc.includes('ESTORNO'));
          });
          return existing || newTransaction;
        }
      }
    }

    this.transactions.push(newTransaction);

    if (this.isDeliveryPlanTransaction(newTransaction)) {
      const clientId = String(newTransaction?.clientId || '').trim();
      const clientIndex = clientId
        ? this.clients.findIndex((client: any) => String(client?.id || '').trim() === clientId)
        : -1;
      if (clientIndex > -1) {
        const clientRef: any = { ...this.clients[clientIndex] };
        const planId = String(newTransaction?.planId || newTransaction?.originPlanId || '').trim();
        const planName = String(newTransaction?.plan || newTransaction?.planName || '').trim();
        const unitValue = this.resolvePlanUnitValue(
          planId,
          planName,
          String(clientRef?.enterpriseId || '').trim(),
          [newTransaction?.planUnitValue, newTransaction?.unitValue, newTransaction?.planPrice]
        );
        const units = this.resolveTransactionPlanUnits(newTransaction, unitValue > 0 ? unitValue : 1);
        if (units > 0) {
          const normalizedType = this.normalizeToken(newTransaction?.type);
          const normalizedDesc = this.normalizeToken(newTransaction?.description || newTransaction?.item);
          const isReversal = normalizedType === 'CREDITO' || normalizedDesc.includes('ESTORNO');
          const signedUnits = isReversal ? units : -units;
          this.applyPlanBalanceDelta(clientRef, newTransaction, signedUnits, 0);
          this.clients[clientIndex] = this.normalizeClientPlanBalances(clientRef);
        }
      }
    }

    this.saveData();
    return newTransaction;
  }

  updateTransaction(id: string, data: any) {
    const index = this.transactions.findIndex(t => t.id === id);
    if (index > -1) {
      const previous = this.transactions[index];
      const parsedAmount = Number(data?.amount ?? data?.total ?? data?.value ?? previous?.amount ?? previous?.total ?? 0);
      const nextAmount = Number.isFinite(parsedAmount) ? parsedAmount : Number(previous?.amount ?? previous?.total ?? 0);
      const applyClientEffects = data?.applyClientEffects !== false;

      const updatePayload = { ...data };
      delete (updatePayload as any).applyClientEffects;

      this.transactions[index] = {
        ...previous,
        ...updatePayload,
        id: previous.id,
        amount: nextAmount,
        total: Number(updatePayload?.total ?? nextAmount) || nextAmount
      };

      if (applyClientEffects) {
        const amountFromTx = (tx: any) => {
          const n = this.resolveTransactionAmount(tx);
          return Number.isFinite(n) ? n : 0;
        };

        const applyEffect = (clientRef: any, tx: any, factor: number) => {
          const signedAmount = Number((amountFromTx(tx) * factor).toFixed(2));
          const txType = this.normalizeToken(tx?.type);
          const txDesc = this.normalizeToken(tx?.description || tx?.item);
          const txMethod = this.normalizeToken(tx?.paymentMethod || tx?.method);
          const planId = String(tx?.planId || tx?.originPlanId || '').trim();
          const planName = String(tx?.plan || tx?.planName || '').trim();
          const planNameNormalized = this.normalizeToken(planName);
          const isPlanConsumption =
            Boolean(planId)
            || txMethod.includes('PLANO')
            || (planNameNormalized.length > 0 && !['AVULSO', 'PREPAGO', 'GERAL'].includes(planNameNormalized));
          const unitValue = this.resolvePlanUnitValue(planId, planName, String(clientRef?.enterpriseId || '').trim(), [
            tx?.planUnitValue,
            tx?.unitValue,
            tx?.planPrice,
          ]);
          const signedUnits = this.roundValue(this.resolveTransactionPlanUnits(tx, unitValue > 0 ? unitValue : 1) * factor, 4);

          if (txType === 'CREDIT' || txType === 'CREDITO') {
            if (txDesc.includes('PAGAMENTO DE CONSUMO DO COLABORADOR')) {
              const currentDue = Number(clientRef.amountDue || 0);
              const currentMonthly = Number(clientRef.monthlyConsumption || 0);
              clientRef.amountDue = Math.max(0, Number((currentDue - signedAmount).toFixed(2)));
              clientRef.monthlyConsumption = Math.max(0, Number((currentMonthly - signedAmount).toFixed(2)));
              return;
            }

            if (tx?.planId || txDesc.includes('CREDITO PLANO') || txDesc.includes('RECARGA DE PLANO')) {
              this.applyPlanBalanceDelta(clientRef, tx, signedUnits, signedAmount);
              return;
            }

            clientRef.balance = Number((Number(clientRef.balance || 0) + signedAmount).toFixed(2));
            return;
          }

          if (txType === 'CONSUMO') {
            if (isPlanConsumption) {
              this.applyPlanBalanceDelta(clientRef, tx, -signedUnits, -signedAmount);
            }
          }
        };

        const prevClientId = String(previous?.clientId || '').trim();
        const nextClientId = String(this.transactions[index]?.clientId || '').trim();

        if (prevClientId && prevClientId === nextClientId) {
          const cIndex = this.clients.findIndex(c => String(c.id) === prevClientId);
          if (cIndex > -1) {
            const clientRef: any = { ...this.clients[cIndex] };
            // desfaz efeito anterior e aplica novo
            applyEffect(clientRef, previous, -1);
            applyEffect(clientRef, this.transactions[index], 1);
            this.clients[cIndex] = clientRef;
          }
        }
      }

      this.saveData();
      return this.transactions[index];
    }
    return null;
  }

  deleteTransaction(id: string) {
    const index = this.transactions.findIndex(t => t.id === id);
    if (index > -1) {
      const txToDelete: any = this.transactions[index];

      const amountFromTx = (tx: any) => {
        const n = Math.abs(this.resolveTransactionAmount(tx));
        return Number.isFinite(n) ? n : 0;
      };

      const applyEffect = (clientRef: any, tx: any, factor: number) => {
        const signedAmount = Number((amountFromTx(tx) * factor).toFixed(2));
        const txType = this.normalizeToken(tx?.type);
        const txDesc = this.normalizeToken(tx?.description || tx?.item);
        const txMethod = this.normalizeToken(tx?.paymentMethod || tx?.method);
        const isSaldoMethod = txMethod.includes('SALDO') || txMethod.includes('CARTEIRA');
        const isCollaboratorCreditMethod = txMethod.includes('CREDITO_COLABORADOR');
        const planNameNormalized = this.normalizeToken(tx?.plan);
        const isPlanConsumption =
          Boolean(tx?.planId)
          || txMethod.includes('PLANO')
          || (planNameNormalized.length > 0 && !['AVULSO', 'PREPAGO', 'GERAL'].includes(planNameNormalized));
        const planId = String(tx?.planId || tx?.originPlanId || '').trim();
        const planName = String(tx?.plan || tx?.planName || '').trim();
        const unitValue = this.resolvePlanUnitValue(planId, planName, String(clientRef?.enterpriseId || '').trim(), [
          tx?.planUnitValue,
          tx?.unitValue,
          tx?.planPrice,
        ]);
        const signedUnits = this.roundValue(this.resolveTransactionPlanUnits(tx, unitValue > 0 ? unitValue : 1) * factor, 4);

        if (txType === 'CREDIT' || txType === 'CREDITO') {
          if (txDesc.includes('PAGAMENTO DE CONSUMO DO COLABORADOR')) {
            const currentDue = Number(clientRef.amountDue || 0);
            const currentMonthly = Number(clientRef.monthlyConsumption || 0);
            clientRef.amountDue = Math.max(0, Number((currentDue - signedAmount).toFixed(2)));
            clientRef.monthlyConsumption = Math.max(0, Number((currentMonthly - signedAmount).toFixed(2)));
            return;
          }

          if (tx?.planId || txDesc.includes('CREDITO PLANO') || txDesc.includes('RECARGA DE PLANO')) {
            this.applyPlanBalanceDelta(clientRef, tx, signedUnits, signedAmount);
            return;
          }

          clientRef.balance = Number((Number(clientRef.balance || 0) + signedAmount).toFixed(2));
          return;
        }

        if (txType === 'CONSUMO') {
          if (isPlanConsumption) {
            this.applyPlanBalanceDelta(clientRef, tx, -signedUnits, -signedAmount);
            return;
          }
          if (isSaldoMethod) {
            clientRef.balance = Number((Number(clientRef.balance || 0) - signedAmount).toFixed(2));
            return;
          }
          if (isCollaboratorCreditMethod) {
            const currentDue = Number(clientRef.amountDue || 0);
            const currentMonthly = Number(clientRef.monthlyConsumption || 0);
            clientRef.amountDue = Math.max(0, Number((currentDue + signedAmount).toFixed(2)));
            clientRef.monthlyConsumption = Math.max(0, Number((currentMonthly + signedAmount).toFixed(2)));
            return;
          }
        }

        if (txType === 'DEBIT' || txType === 'VENDA_BALCAO') {
          if (isSaldoMethod) {
            clientRef.balance = Number((Number(clientRef.balance || 0) - signedAmount).toFixed(2));
          }
          if (isCollaboratorCreditMethod) {
            const currentDue = Number(clientRef.amountDue || 0);
            const currentMonthly = Number(clientRef.monthlyConsumption || 0);
            clientRef.amountDue = Math.max(0, Number((currentDue + signedAmount).toFixed(2)));
            clientRef.monthlyConsumption = Math.max(0, Number((currentMonthly + signedAmount).toFixed(2)));
          }
        }
      };

      const clientId = String(txToDelete?.clientId || '').trim();
      let clientIndex = -1;
      if (clientId) {
        clientIndex = this.clients.findIndex(c => String(c.id) === clientId);
      } else {
        const txClientName = this.normalizeToken(txToDelete?.clientName || txToDelete?.client);
        if (txClientName && txClientName !== 'CONSUMIDOR FINAL') {
          clientIndex = this.clients.findIndex(c => this.normalizeToken(c.name) === txClientName);
        }
      }

      if (clientIndex > -1) {
        const clientRef: any = { ...this.clients[clientIndex] };
        // Reverte os efeitos desta transação no cadastro do cliente.
        applyEffect(clientRef, txToDelete, -1);
        this.clients[clientIndex] = clientRef;
      }

      this.transactions.splice(index, 1);
      this.saveData();
      return true;
    }
    return false;
  }

  clearTransactions() {
    const removedCount = this.transactions.length;
    this.transactions = [];
    this.saveData();
    return removedCount;
  }

  // ===== ORDERS =====
  getOrders(enterpriseId?: string) {
    if (enterpriseId) {
      return this.orders.filter(o => o.enterpriseId === enterpriseId);
    }
    return this.orders;
  }

  getOrder(id: string) {
    return this.orders.find(o => o.id === id);
  }

  createOrder(data: any) {
    const newOrder = { ...data, id: 'ord_' + Date.now() };
    this.orders.push(newOrder);
    this.saveData();
    return newOrder;
  }

  updateOrder(id: string, data: any) {
    const index = this.orders.findIndex(o => o.id === id);
    if (index > -1) {
      this.orders[index] = { ...this.orders[index], ...data };
      this.saveData();
      return this.orders[index];
    }
    return null;
  }

  deleteOrder(id: string) {
    const index = this.orders.findIndex(o => o.id === id);
    if (index > -1) {
      this.orders.splice(index, 1);
      this.saveData();
      return true;
    }
    return false;
  }

  // ===== INGREDIENTS =====
  getIngredients() {
    return this.ingredients;
  }

  getIngredient(id: string) {
    return this.ingredients.find(i => i.id === id);
  }

  createIngredient(data: any) {
    const newIngredient = { ...data, id: 'ing_' + Date.now() };
    this.ingredients.push(newIngredient);
    this.saveData();
    return newIngredient;
  }

  updateIngredient(id: string, data: any) {
    const index = this.ingredients.findIndex(i => i.id === id);
    if (index > -1) {
      this.ingredients[index] = { ...this.ingredients[index], ...data };
      this.saveData();
      return this.ingredients[index];
    }
    return null;
  }

  deleteIngredient(id: string) {
    const index = this.ingredients.findIndex(i => i.id === id);
    if (index > -1) {
      this.ingredients.splice(index, 1);
      this.saveData();
      return true;
    }
    return false;
  }
}

export const db = new Database();
