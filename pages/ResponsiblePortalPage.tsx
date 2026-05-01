import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Home,
  History,
  Settings,
  LogOut,
  Wallet,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  Zap,
  Clock,
  Sun,
  Moon,
  X,
  Plus,
  Check,
  Calendar,
} from 'lucide-react';
import { ApiService } from '../services/api';
import { Client, Enterprise } from '../types';
import { resolveUserAvatar } from '../utils/avatar';
import { useTheme } from '../components/ThemeProvider';

type PortalTab = 'HOME' | 'HISTORY' | 'PAYMENTS' | 'SETTINGS';
type PortalTxType = 'CONSUMPTION' | 'PAYMENT' | 'CREDIT_INSERT' | 'ADJUSTMENT';

type PortalTransaction = {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: PortalTxType;
  paymentMethod?: string;
  isVistaPayment: boolean;
  studentId: string;
  studentName: string;
};

type PlanOption = {
  key: string;
  planId?: string;
  planName: string;
  unitValue: number;
};

type PlanCreditDraft = {
  studentId: string;
  planId?: string;
  planName: string;
  unitValue: number;
  amount: number;
  selectedDates: string[];
};

const VISTA_METHODS = ['PIX', 'DEBITO', 'DINHEIRO', 'CASH', 'CREDITO_CARTAO', 'CREDITO CARTAO', 'CARTAO_CREDITO', 'CARTAO_DEBITO'];

const toTitleCase = (str: string): string =>
  str.toLowerCase().replace(/(?:^|[\s,+x])\S/g, (c) => c.toUpperCase());

const getPaymentAbbr = (method: string, txType?: string): string => {
  const m = method.toUpperCase().trim();
  if (m.includes('PIX')) return 'PIX';
  if (m.includes('DEBITO') || m.includes('CARTAO_DEB') || m.includes('DEBIT')) return 'DBT';
  if (m.includes('DINHEIRO') || m.includes('CASH')) return 'DIN';
  if (m.includes('CREDITO_COLABORADOR') || m.includes('CREDITO_CANTI') || m.includes('CRED_CANT')) return 'CON';
  if (txType === 'CONSUMPTION') return 'CON';
  return '';
};

const getTransactionLabel = (tx: PortalTransaction): string => {
  if (tx.type === 'CONSUMPTION' && tx.isVistaPayment) return 'COMPRA A VISTA';
  if (tx.type === 'CONSUMPTION') return 'CONSUMO';
  if (tx.type === 'CREDIT_INSERT') return 'CRÉDITO PARA CONSUMO';
  if (tx.type === 'PAYMENT') return 'PAGAMENTO';
  return 'AJUSTE';
};

const mapBackendTransaction = (raw: any, student: Client): PortalTransaction => {
  const method = String(raw?.paymentMethod || raw?.method || '').toUpperCase().trim();
  const rawType = String(raw?.type || '').toUpperCase().trim();
  const amount = Math.abs(Number(raw?.total ?? raw?.amount ?? 0));
  const desc = String(raw?.description || raw?.item || '').toUpperCase();

  const isVista = VISTA_METHODS.some((m) => method.includes(m));

  let txType: PortalTxType;
  if (
    rawType === 'DEBIT'
    || rawType === 'DEBITO'
    || method.includes('CREDITO_COLABORADOR')
    || (isVista && (rawType === 'DEBIT' || rawType === 'DEBITO' || rawType === 'SALE'))
  ) {
    txType = 'CONSUMPTION';
  } else if (
    (rawType === 'CREDIT' || rawType === 'CREDITO')
    && (desc.includes('PAGAMENTO') || desc.includes('QUITACAO') || desc.includes('QUITAÇÃO'))
  ) {
    txType = 'PAYMENT';
  } else if (rawType === 'AJUSTE_SALDO' && amount < 0) {
    txType = 'PAYMENT';
  } else if (
    (rawType === 'CREDIT' || rawType === 'CREDITO')
    && (desc.includes('CRÉDITO') || desc.includes('CREDITO') || desc.includes('RECARGA') || desc.includes('SALDO'))
  ) {
    txType = 'CREDIT_INSERT';
  } else {
    txType = 'ADJUSTMENT';
  }

  const dateRaw = String(raw?.date || raw?.timestamp || '').trim();
  const date = dateRaw.length >= 10 ? dateRaw.substring(0, 10) : dateRaw;

  let descDisplay = String(raw?.item || '').trim();
  if (!descDisplay && Array.isArray(raw?.items) && raw.items.length > 0) {
    descDisplay = (raw.items as any[]).map((i: any) => `${i.quantity}x ${i.name}`).join(', ');
  }
  if (!descDisplay) {
    descDisplay = String(raw?.description || '').trim() || rawType || 'Operação';
  }

  return {
    id: String(raw?.id || `${Date.now()}-${Math.random()}`),
    date,
    description: toTitleCase(descDisplay),
    amount,
    type: txType,
    paymentMethod: method || undefined,
    isVistaPayment: isVista,
    studentId: String(student?.id || ''),
    studentName: String(student?.name || 'Aluno'),
  };
};

const normalizeEmail = (value?: string) => String(value || '').trim().toLowerCase();
const normalizeId = (value?: string) => String(value || '').trim();

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || '').trim()).filter(Boolean);
};

const resolveStudentDue = (student: Client | null | undefined) => {
  if (!student) return 0;
  const dueByField = Number((student as any)?.amountDue || 0);
  if (Number.isFinite(dueByField) && dueByField > 0) return dueByField;
  const balance = Number(student.balance || 0);
  if (Number.isFinite(balance) && balance < 0) return Math.abs(balance);
  return 0;
};

const roundCurrency = (value: number) => Number((Number(value || 0)).toFixed(2));

const ResponsiblePortalPage: React.FC<{ currentUser?: any; handleLogout?: () => void }> = ({ currentUser, handleLogout: onLogout }) => {
  const { toggleTheme, isDark } = useTheme();

  const [activeTab, setActiveTab] = useState<PortalTab>('HOME');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [enterprise, setEnterprise] = useState<Enterprise | null>(null);
  const [students, setStudents] = useState<Client[]>([]);
  const [transactions, setTransactions] = useState<PortalTransaction[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');

  const [historyFrom, setHistoryFrom] = useState('');
  const [historyTo, setHistoryTo] = useState('');

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentTargetStudentId, setPaymentTargetStudentId] = useState('');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'PIX'>('PIX');
  const [debtPaymentAmount, setDebtPaymentAmount] = useState('');
  const [cantinaCreditAmount, setCantinaCreditAmount] = useState('');
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentSuccessMessage, setPaymentSuccessMessage] = useState('');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  const [planCreditDrafts, setPlanCreditDrafts] = useState<Record<string, PlanCreditDraft>>({});
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [planModalStudentId, setPlanModalStudentId] = useState('');
  const [planModalPlan, setPlanModalPlan] = useState<PlanOption | null>(null);
  const [planModalAmount, setPlanModalAmount] = useState('');
  const [planModalDateInput, setPlanModalDateInput] = useState('');
  const [planModalDates, setPlanModalDates] = useState<string[]>([]);

  const hasMultipleStudents = students.length > 1;
  const selectedStudent = useMemo(
    () => students.find((student) => String(student.id) === selectedStudentId) || null,
    [students, selectedStudentId]
  );

  const contextStudents = useMemo(() => {
    if (selectedStudent) return [selectedStudent];
    return students;
  }, [students, selectedStudent]);

  const contextStudentIds = useMemo(() => new Set(contextStudents.map((student) => String(student.id))), [contextStudents]);

  const contextTransactions = useMemo(() => {
    const filtered = transactions.filter((tx) => contextStudentIds.has(String(tx.studentId)));
    return filtered.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  }, [transactions, contextStudentIds]);

  const currentMonthTransactions = useMemo(() => {
    const now = new Date();
    return contextTransactions.filter((tx) => {
      const date = new Date(`${tx.date}T00:00:00`);
      if (Number.isNaN(date.getTime())) return false;
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    });
  }, [contextTransactions]);

  const currentMonthConsumptions = useMemo(
    () => currentMonthTransactions.filter((tx) => tx.type === 'CONSUMPTION'),
    [currentMonthTransactions]
  );

  const currentMonthConsumptionTotal = useMemo(
    () => currentMonthConsumptions.reduce((acc, tx) => acc + Math.abs(Number(tx.amount || 0)), 0),
    [currentMonthConsumptions]
  );

  const contextTotalDue = useMemo(
    () => contextStudents.reduce((acc, student) => acc + resolveStudentDue(student), 0),
    [contextStudents]
  );

  const contextTotalBalance = useMemo(
    () => contextStudents.reduce((acc, student) => acc + Number(student.balance || 0), 0),
    [contextStudents]
  );

  const recentTransactions = useMemo(() => contextTransactions.slice(0, 12), [contextTransactions]);

  const paymentHistoryTransactions = useMemo(() => {
    return contextTransactions.filter((tx) => tx.type === 'PAYMENT' || tx.type === 'CREDIT_INSERT');
  }, [contextTransactions]);

  const filteredHistoryTransactions = useMemo(() => {
    return contextTransactions.filter((tx) => {
      if (historyFrom && tx.date < historyFrom) return false;
      if (historyTo && tx.date > historyTo) return false;
      return true;
    });
  }, [contextTransactions, historyFrom, historyTo]);

  const resolvePlanOptions = useCallback((student: Client | null): PlanOption[] => {
    if (!student) return [];

    const byKey = new Map<string, PlanOption>();

    const selectedConfigs = Array.isArray((student as any)?.selectedPlansConfig)
      ? ((student as any).selectedPlansConfig as any[])
      : [];

    selectedConfigs.forEach((cfg) => {
      const planId = String(cfg?.planId || '').trim();
      const planName = String(cfg?.planName || cfg?.name || '').trim();
      const unitValue = Number(cfg?.planPrice || cfg?.price || 0);
      if (!planName && !planId) return;
      const key = planId || planName.toUpperCase();
      byKey.set(key, {
        key,
        planId: planId || undefined,
        planName: planName || 'PLANO',
        unitValue: Number.isFinite(unitValue) && unitValue > 0 ? unitValue : 0,
      });
    });

    const balances = (student as any)?.planCreditBalances;
    if (balances && typeof balances === 'object' && !Array.isArray(balances)) {
      Object.values(balances as Record<string, any>).forEach((entry: any) => {
        const planId = String(entry?.planId || '').trim();
        const planName = String(entry?.planName || '').trim();
        const unitValue = Number(entry?.unitValue || entry?.planPrice || 0);
        if (!planName && !planId) return;
        const key = planId || planName.toUpperCase();
        if (!byKey.has(key)) {
          byKey.set(key, {
            key,
            planId: planId || undefined,
            planName: planName || 'PLANO',
            unitValue: Number.isFinite(unitValue) && unitValue > 0 ? unitValue : 0,
          });
        }
      });
    }

    const servicePlans = Array.isArray(student.servicePlans) ? student.servicePlans : [];
    servicePlans.forEach((planNameRaw: any) => {
      const planName = String(planNameRaw || '').trim();
      if (!planName || planName.toUpperCase() === 'PREPAGO') return;
      const key = planName.toUpperCase();
      if (!byKey.has(key)) {
        byKey.set(key, {
          key,
          planName,
          unitValue: 0,
        });
      }
    });

    return Array.from(byKey.values()).sort((a, b) => a.planName.localeCompare(b.planName));
  }, []);

  const loadPortalData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const enterpriseId = String(currentUser?.enterpriseIds?.[0] || '').trim();
      if (!enterpriseId) {
        setStudents([]);
        setTransactions([]);
        setError('Não foi possível identificar a unidade vinculada ao responsável.');
        return;
      }

      const [enterpriseData, clientsData] = await Promise.all([
        ApiService.getEnterprise(enterpriseId).catch(() => null),
        ApiService.getClients(enterpriseId),
      ]);

      setEnterprise(enterpriseData || null);

      const allClients: Client[] = Array.isArray(clientsData) ? clientsData : [];
      const currentUserId = normalizeId(currentUser?.id);
      const currentUserEmail = normalizeEmail(currentUser?.email);

      const linkedStudentIds = new Set<string>([
        ...toStringArray((currentUser as any)?.relatedStudentIds),
        ...toStringArray((currentUser as any)?.linkedStudentIds),
      ]);

      const linkedClientId = normalizeId((currentUser as any)?.linkedClientId);
      if (linkedClientId) {
        const responsibleClient = allClients.find((client) => normalizeId(client.id) === linkedClientId);
        toStringArray((responsibleClient as any)?.relatedStudentIds).forEach((id) => linkedStudentIds.add(id));
      }

      allClients
        .filter((client) => String(client.type || '').toUpperCase() === 'RESPONSAVEL')
        .forEach((responsibleClient) => {
          const matchesById = linkedClientId && normalizeId(responsibleClient.id) === linkedClientId;
          const matchesByEmail = currentUserEmail
            && [normalizeEmail((responsibleClient as any)?.email), normalizeEmail((responsibleClient as any)?.guardianEmail), normalizeEmail((responsibleClient as any)?.parentEmail)]
              .includes(currentUserEmail);
          if (matchesById || matchesByEmail) {
            toStringArray((responsibleClient as any)?.relatedStudentIds).forEach((id) => linkedStudentIds.add(id));
          }
        });

      const responsibleStudents = allClients
        .filter((client) => String(client.type || '').toUpperCase() === 'ALUNO')
        .filter((student) => {
          const studentId = normalizeId(student.id);
          const guardians = toStringArray((student as any)?.guardians);
          const guardianEmails = [normalizeEmail((student as any)?.guardianEmail), normalizeEmail((student as any)?.parentEmail)];

          const linkedById = studentId && linkedStudentIds.has(studentId);
          const linkedByGuardian = currentUserId && guardians.includes(currentUserId);
          const linkedByEmail = currentUserEmail && guardianEmails.includes(currentUserEmail);

          return linkedById || linkedByGuardian || linkedByEmail;
        })
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

      setStudents(responsibleStudents);

      if (responsibleStudents.length === 1) {
        setSelectedStudentId(String(responsibleStudents[0].id));
      } else {
        setSelectedStudentId('');
      }

      const transactionsByStudent = await Promise.all(
        responsibleStudents.map(async (student) => {
          const rawTx = await ApiService.getTransactions({
            clientId: String(student.id),
            enterpriseId: String(student.enterpriseId || enterpriseId),
          });
          const txArray = Array.isArray(rawTx) ? rawTx : [];
          return txArray.map((tx) => mapBackendTransaction(tx, student));
        })
      );

      const mergedTransactions = transactionsByStudent
        .flat()
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

      setTransactions(mergedTransactions);
    } catch (err) {
      console.error('Erro ao carregar painel do responsável:', err);
      setError('Falha ao carregar dados do portal. Tente novamente.');
      setStudents([]);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    loadPortalData();
  }, [loadPortalData]);

  const openPaymentModal = () => {
    const defaultStudent = selectedStudent || students[0] || null;
    setPaymentTargetStudentId(defaultStudent ? String(defaultStudent.id) : '');
    setDebtPaymentAmount('');
    setCantinaCreditAmount('');
    setSelectedPaymentMethod('PIX');
    setPaymentError(null);
    setPaymentSuccessMessage('');
    setShowPaymentModal(true);
  };

  const closePaymentModal = () => {
    setShowPaymentModal(false);
    setPaymentError(null);
    setIsProcessingPayment(false);
  };

  const paymentTargetStudent = useMemo(
    () => students.find((student) => String(student.id) === paymentTargetStudentId) || null,
    [students, paymentTargetStudentId]
  );

  const paymentTargetDue = useMemo(() => resolveStudentDue(paymentTargetStudent), [paymentTargetStudent]);

  const planOptionsForPaymentTarget = useMemo(
    () => resolvePlanOptions(paymentTargetStudent),
    [paymentTargetStudent, resolvePlanOptions]
  );

  const draftsForPaymentTarget = useMemo(() => {
    if (!paymentTargetStudent) return [];
    return Object.values(planCreditDrafts).filter((draft) => draft.studentId === String(paymentTargetStudent.id));
  }, [planCreditDrafts, paymentTargetStudent]);

  const totalPlannedPlanCredit = useMemo(
    () => draftsForPaymentTarget.reduce((acc, draft) => acc + Number(draft.amount || 0), 0),
    [draftsForPaymentTarget]
  );

  const totalPlannedPayment = useMemo(() => {
    const debt = Number(debtPaymentAmount || 0);
    const cantina = Number(cantinaCreditAmount || 0);
    return roundCurrency((Number.isFinite(debt) ? debt : 0) + (Number.isFinite(cantina) ? cantina : 0) + totalPlannedPlanCredit);
  }, [debtPaymentAmount, cantinaCreditAmount, totalPlannedPlanCredit]);

  const openPlanCreditModal = (plan: PlanOption) => {
    if (!paymentTargetStudent) return;
    const draftKey = `${String(paymentTargetStudent.id)}::${plan.key}`;
    const existingDraft = planCreditDrafts[draftKey];

    setPlanModalStudentId(String(paymentTargetStudent.id));
    setPlanModalPlan(plan);
    setPlanModalAmount(existingDraft ? String(existingDraft.amount) : (plan.unitValue > 0 ? String(plan.unitValue) : ''));
    setPlanModalDates(existingDraft ? existingDraft.selectedDates : []);
    setPlanModalDateInput('');
    setIsPlanModalOpen(true);
  };

  const closePlanCreditModal = () => {
    setIsPlanModalOpen(false);
    setPlanModalPlan(null);
    setPlanModalStudentId('');
    setPlanModalAmount('');
    setPlanModalDateInput('');
    setPlanModalDates([]);
  };

  const addPlanModalDate = () => {
    const value = String(planModalDateInput || '').trim();
    if (!value) return;
    if (planModalDates.includes(value)) return;
    const nextDates = [...planModalDates, value].sort((a, b) => a.localeCompare(b));
    setPlanModalDates(nextDates);
    if (!planModalAmount && planModalPlan?.unitValue && planModalPlan.unitValue > 0) {
      setPlanModalAmount(String(roundCurrency(nextDates.length * planModalPlan.unitValue)));
    }
    setPlanModalDateInput('');
  };

  const removePlanModalDate = (date: string) => {
    const nextDates = planModalDates.filter((item) => item !== date);
    setPlanModalDates(nextDates);
    if (planModalPlan?.unitValue && planModalPlan.unitValue > 0) {
      setPlanModalAmount(String(roundCurrency(nextDates.length * planModalPlan.unitValue)));
    }
  };

  const savePlanDraft = () => {
    if (!planModalPlan || !planModalStudentId) return;

    const amount = Number(planModalAmount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      setPaymentError('Informe um valor válido para o crédito do plano.');
      return;
    }
    if (planModalDates.length === 0) {
      setPaymentError('Selecione pelo menos uma data para o crédito de plano.');
      return;
    }

    const draftKey = `${planModalStudentId}::${planModalPlan.key}`;
    setPlanCreditDrafts((prev) => ({
      ...prev,
      [draftKey]: {
        studentId: planModalStudentId,
        planId: planModalPlan.planId,
        planName: planModalPlan.planName,
        unitValue: planModalPlan.unitValue,
        amount: roundCurrency(amount),
        selectedDates: Array.from(new Set(planModalDates)).sort((a, b) => a.localeCompare(b)),
      },
    }));
    setPaymentError(null);
    closePlanCreditModal();
  };

  const removePlanDraft = (draft: PlanCreditDraft) => {
    const key = `${draft.studentId}::${draft.planId || draft.planName.toUpperCase()}`;
    setPlanCreditDrafts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleProcessPayment = async () => {
    if (!paymentTargetStudent) {
      setPaymentError('Selecione um aluno para registrar o pagamento.');
      return;
    }

    const debt = Number(debtPaymentAmount || 0);
    const cantinaCredit = Number(cantinaCreditAmount || 0);

    const debtAmount = Number.isFinite(debt) && debt > 0 ? roundCurrency(debt) : 0;
    const cantinaAmount = Number.isFinite(cantinaCredit) && cantinaCredit > 0 ? roundCurrency(cantinaCredit) : 0;
    const selectedPlanDrafts = draftsForPaymentTarget.filter((draft) => Number(draft.amount || 0) > 0);

    if (debtAmount <= 0 && cantinaAmount <= 0 && selectedPlanDrafts.length === 0) {
      setPaymentError('Informe ao menos um valor de pagamento ou crédito.');
      return;
    }

    if (debtAmount > paymentTargetDue) {
      setPaymentError(`O valor para quitar negativo não pode exceder R$ ${paymentTargetDue.toFixed(2)}.`);
      return;
    }

    const invalidDraft = selectedPlanDrafts.find((draft) => !Array.isArray(draft.selectedDates) || draft.selectedDates.length === 0);
    if (invalidDraft) {
      setPaymentError(`Configure as datas do crédito de plano ${invalidDraft.planName}.`);
      return;
    }

    try {
      setIsProcessingPayment(true);
      setPaymentError(null);
      setPaymentSuccessMessage('');

      const freshClient = await ApiService.getClient(String(paymentTargetStudent.id));
      const expectedUpdatedAt = String((freshClient as any)?.updatedAt || '').trim();

      let nextBalance = Number((freshClient as any)?.balance || 0);
      let nextAmountDue = Number((freshClient as any)?.amountDue || 0);
      let nextMonthlyConsumption = Number((freshClient as any)?.monthlyConsumption || 0);

      if (debtAmount > 0) {
        if (nextAmountDue > 0) {
          nextAmountDue = Math.max(0, roundCurrency(nextAmountDue - debtAmount));
          nextMonthlyConsumption = Math.max(0, roundCurrency(nextMonthlyConsumption - debtAmount));
        } else {
          nextBalance = roundCurrency(nextBalance + debtAmount);
        }
      }

      if (cantinaAmount > 0) {
        nextBalance = roundCurrency(nextBalance + cantinaAmount);
      }

      if (debtAmount > 0 || cantinaAmount > 0) {
        await ApiService.updateClient(
          String(paymentTargetStudent.id),
          {
            balance: nextBalance,
            amountDue: nextAmountDue,
            monthlyConsumption: nextMonthlyConsumption,
            balanceAdjustment: {
              source: 'PORTAL_RESPONSAVEL',
              reason: 'Pagamento no portal do responsável',
              requestedByUserId: String((currentUser as any)?.id || ''),
              requestedByName: String((currentUser as any)?.name || ''),
            },
          },
          {
            expectedUpdatedAt: expectedUpdatedAt || undefined,
          }
        );
      }

      const now = new Date();
      const dayLabel = now.toISOString().slice(0, 10);
      const timeLabel = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      let txOffsetSeconds = 0;

      const createTx = async (payload: any) => {
        const txDate = new Date(now.getTime() + txOffsetSeconds * 1000);
        txOffsetSeconds += 1;
        return ApiService.createTransaction({
          ...payload,
          clientId: String(paymentTargetStudent.id),
          clientName: String(paymentTargetStudent.name || ''),
          enterpriseId: String(paymentTargetStudent.enterpriseId || ''),
          type: 'CREDIT',
          paymentMethod: selectedPaymentMethod,
          method: selectedPaymentMethod,
          status: 'CONCLUIDA',
          date: dayLabel,
          time: timeLabel,
          timestamp: txDate.toISOString(),
        });
      };

      if (debtAmount > 0) {
        await createTx({
          amount: debtAmount,
          total: debtAmount,
          description: 'Pagamento de saldo negativo (portal responsável)',
          item: 'Pagamento de consumo',
        });
      }

      if (cantinaAmount > 0) {
        await createTx({
          amount: cantinaAmount,
          total: cantinaAmount,
          description: 'Crédito cantina (portal responsável)',
          item: 'Crédito livre cantina',
        });
      }

      for (const draft of selectedPlanDrafts) {
        await createTx({
          amount: roundCurrency(Number(draft.amount || 0)),
          total: roundCurrency(Number(draft.amount || 0)),
          plan: draft.planName,
          planId: draft.planId,
          planUnitValue: Number(draft.unitValue || 0) > 0 ? Number(draft.unitValue) : undefined,
          planUnits: draft.selectedDates.length,
          selectedDates: draft.selectedDates,
          selectedDays: [],
          description: `Crédito plano ${draft.planName} (portal responsável)`,
          item: `Crédito plano ${draft.planName}`,
        });
      }

      setPlanCreditDrafts((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((key) => {
          if (key.startsWith(`${String(paymentTargetStudent.id)}::`)) {
            delete next[key];
          }
        });
        return next;
      });

      setPaymentSuccessMessage(`Pagamento único registrado com sucesso. Total: R$ ${totalPlannedPayment.toFixed(2)}.`);
      await loadPortalData();
      setActiveTab('PAYMENTS');

      window.setTimeout(() => {
        closePaymentModal();
      }, 900);
    } catch (err) {
      console.error('Erro ao processar pagamento do responsável:', err);
      setPaymentError('Falha ao processar pagamento. Revise os dados e tente novamente.');
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handleLogout = () => {
    if (typeof onLogout === 'function') {
      onLogout();
      return;
    }
    ApiService.clearToken();
    localStorage.removeItem('canteen_auth_user');
    localStorage.removeItem('canteen_active_enterprise');
    window.location.hash = '#/';
  };

  const responsibleAvatar = resolveUserAvatar(currentUser?.avatar, currentUser?.name || currentUser?.email || 'Responsável');

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin inline-block w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full"></div>
          <p className="text-slate-600 font-medium">Carregando painel do responsável...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100 dark:from-zinc-900 dark:to-zinc-950">
      <header className="sticky top-0 z-40 bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-700 shadow-sm">
        <div className="max-w-md mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <img src={responsibleAvatar} alt="Responsável" className="w-10 h-10 rounded-lg object-cover border-2 border-white shadow-sm" />
            <div className="min-w-0">
              <p className="text-xs font-black text-gray-400 dark:text-zinc-400 uppercase tracking-widest">Portal do</p>
              <p className="text-sm font-black text-gray-900 dark:text-zinc-100 truncate">{currentUser?.name || 'Responsável'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
              title={isDark ? 'Ativar modo claro' : 'Ativar modo escuro'}
              aria-label={isDark ? 'Ativar modo claro' : 'Ativar modo escuro'}
            >
              {isDark ? <Moon size={20} className="text-zinc-200" /> : <Sun size={20} className="text-gray-600" />}
            </button>
            <button onClick={handleLogout} className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors" title="Sair">
              <LogOut size={20} className="text-gray-600 dark:text-zinc-200" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-6 pb-52 md:pb-36">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
            <AlertCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700 font-medium">{error}</p>
          </div>
        )}

        {hasMultipleStudents && (activeTab === 'HOME' || activeTab === 'HISTORY') && (
          <div className="mb-4 bg-white dark:bg-zinc-900/90 rounded-2xl p-3 border border-gray-100 dark:border-zinc-700">
            <label className="text-[9px] font-black text-gray-500 dark:text-zinc-400 uppercase tracking-widest block mb-2">
              Aluno
            </label>
            <select
              value={selectedStudentId}
              onChange={(event) => setSelectedStudentId(String(event.target.value || ''))}
              title="Selecionar aluno"
              aria-label="Selecionar aluno"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 dark:bg-zinc-800 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 px-3 py-2.5 text-sm font-bold outline-none"
            >
              <option value="">Todos os alunos (saldo somado)</option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>{student.name}</option>
              ))}
            </select>
          </div>
        )}

        {activeTab === 'HOME' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-[40px] p-6 text-white shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl"></div>
              <div className="relative z-10 space-y-4">
                {contextTotalDue > 0 ? (
                  <>
                    <div>
                      <p className="text-[8px] font-black uppercase tracking-[3px] text-indigo-100 mb-1">
                        {selectedStudent ? `Dívida - ${selectedStudent.name}` : 'Dívida consolidada'}
                      </p>
                      <p className="text-3xl font-black tracking-tight">R$ {contextTotalDue.toFixed(2)}</p>
                    </div>
                    <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-3 space-y-1.5">
                      <div className="flex justify-between items-center">
                        <span className="text-[11px] font-bold text-indigo-100">Saldo atual</span>
                        <span className="text-xs font-black text-white">R$ {contextTotalBalance.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[11px] font-bold text-indigo-100">Consumo do mês</span>
                        <span className="text-xs font-black text-orange-300">R$ {currentMonthConsumptionTotal.toFixed(2)}</span>
                      </div>
                    </div>
                    <button
                      onClick={openPaymentModal}
                      className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-4 rounded-2xl font-black uppercase text-sm shadow-lg transition-all active:scale-95"
                    >
                      <CreditCard size={18} className="inline mr-2" /> Pagar agora
                    </button>
                  </>
                ) : (
                  <>
                    <div className="text-center space-y-4">
                      <div className="w-16 h-16 bg-emerald-400/20 rounded-full flex items-center justify-center mx-auto">
                        <CheckCircle2 size={32} className="text-emerald-300" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[4px] text-indigo-100 mb-1">Saldo</p>
                        <p className="text-3xl font-black">R$ {contextTotalBalance.toFixed(2)}</p>
                      </div>
                      <p className="text-indigo-100 text-sm">
                        {selectedStudent ? 'Sem pendências para este aluno.' : 'Sem pendências no consolidado dos alunos.'}
                      </p>
                    </div>
                    <button
                      onClick={openPaymentModal}
                      className="w-full bg-white/20 hover:bg-white/30 text-white py-3 rounded-2xl font-black uppercase text-xs shadow-lg transition-all"
                    >
                      <Plus size={16} className="inline mr-1" /> Adicionar crédito
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white dark:bg-zinc-900/90 rounded-2xl p-3 shadow-sm border border-gray-100 dark:border-zinc-700">
                <div className="flex items-center justify-between mb-2">
                  <Wallet size={17} className="text-indigo-600 dark:text-indigo-400" />
                  <span className="text-[8px] font-black text-gray-500 dark:text-zinc-400 uppercase">Consumo mês</span>
                </div>
                <p className="text-xl font-black text-gray-900 dark:text-zinc-100">R$ {currentMonthConsumptionTotal.toFixed(2)}</p>
              </div>
              <div className="bg-white dark:bg-zinc-900/90 rounded-2xl p-3 shadow-sm border border-gray-100 dark:border-zinc-700">
                <div className="flex items-center justify-between mb-2">
                  <History size={17} className="text-orange-600 dark:text-orange-400" />
                  <span className="text-[8px] font-black text-gray-500 dark:text-zinc-400 uppercase">Transações</span>
                </div>
                <p className="text-xl font-black text-gray-900 dark:text-zinc-100">{currentMonthConsumptions.length}</p>
              </div>
            </div>

            <div>
              <h3 className="text-[10px] font-black text-gray-400 dark:text-zinc-400 uppercase tracking-[3px] mb-4 px-2">Últimas transações</h3>
              <div className="max-h-80 overflow-y-auto pr-1">
                <div className="space-y-2 pb-20">
                  {recentTransactions.length === 0 && (
                    <div className="text-center py-8 text-sm text-gray-500 dark:text-zinc-300">Sem transações para o filtro atual.</div>
                  )}
                  {recentTransactions.map((transaction) => {
                    const label = getTransactionLabel(transaction);
                    const abbr = getPaymentAbbr(transaction.paymentMethod || '', transaction.type);
                    const abbrColor =
                      abbr === 'PIX' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' :
                      abbr === 'DBT' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' :
                      abbr === 'DIN' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300' :
                      abbr === 'CON' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' : '';

                    return (
                      <div key={`${transaction.studentId}-${transaction.id}`} className="bg-white dark:bg-zinc-900/90 rounded-2xl p-3 flex items-center gap-2 border border-gray-100 dark:border-zinc-700">
                        <div className={`w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center ${
                          transaction.type === 'CONSUMPTION' ? 'bg-orange-50 dark:bg-orange-900/20' :
                          transaction.type === 'PAYMENT' ? 'bg-emerald-50 dark:bg-emerald-900/20' :
                          transaction.type === 'CREDIT_INSERT' ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-gray-50 dark:bg-zinc-800'
                        }`}>
                          {transaction.type === 'CONSUMPTION' && <ArrowUpRight size={16} className="text-orange-600 dark:text-orange-300" />}
                          {transaction.type === 'PAYMENT' && <ArrowDownRight size={16} className="text-emerald-600 dark:text-emerald-300" />}
                          {transaction.type === 'CREDIT_INSERT' && <Zap size={16} className="text-blue-600 dark:text-blue-300" />}
                          {transaction.type === 'ADJUSTMENT' && <Zap size={16} className="text-gray-500 dark:text-zinc-400" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-black text-gray-400 dark:text-zinc-400 uppercase tracking-wide leading-none mb-0.5">{label}</p>
                          <p className="text-xs font-bold text-gray-900 dark:text-zinc-100 break-words">{transaction.description}</p>
                          <p className="text-[9px] text-gray-400 dark:text-zinc-400 font-medium mt-0.5">
                            {transaction.date} • {transaction.studentName}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0 pl-1">
                          {abbr && <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-lg uppercase ${abbrColor}`}>{abbr}</span>}
                          <p className={`text-sm font-black whitespace-nowrap ${
                            transaction.type === 'CONSUMPTION' ? 'text-orange-600 dark:text-orange-300' :
                            transaction.type === 'PAYMENT' ? 'text-emerald-600 dark:text-emerald-300' :
                            transaction.type === 'CREDIT_INSERT' ? 'text-blue-600 dark:text-blue-300' : 'text-gray-600 dark:text-zinc-300'
                          }`}>
                            {transaction.type === 'CONSUMPTION' ? '+' : '-'} R$ {Math.abs(transaction.amount).toFixed(2)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'HISTORY' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-[10px] font-black text-gray-400 dark:text-zinc-400 uppercase tracking-[3px]">Histórico completo</h3>
              <span className="text-xs font-bold text-gray-600 dark:text-zinc-300">{filteredHistoryTransactions.length} registros</span>
            </div>

            <div className="bg-white dark:bg-zinc-900/90 rounded-2xl p-3 border border-gray-100 dark:border-zinc-700 grid grid-cols-2 gap-3">
              <div>
                <label className="text-[9px] font-black text-gray-400 dark:text-zinc-400 uppercase tracking-widest block mb-1">De</label>
                <input
                  type="date"
                  value={historyFrom}
                  onChange={(event) => setHistoryFrom(event.target.value)}
                  title="Filtrar histórico a partir da data"
                  aria-label="Filtrar histórico a partir da data"
                  className="w-full text-sm font-bold text-gray-800 dark:text-zinc-100 bg-transparent border-b border-gray-200 dark:border-zinc-700 pb-1 outline-none"
                />
              </div>
              <div>
                <label className="text-[9px] font-black text-gray-400 dark:text-zinc-400 uppercase tracking-widest block mb-1">Até</label>
                <input
                  type="date"
                  value={historyTo}
                  onChange={(event) => setHistoryTo(event.target.value)}
                  title="Filtrar histórico até a data"
                  aria-label="Filtrar histórico até a data"
                  className="w-full text-sm font-bold text-gray-800 dark:text-zinc-100 bg-transparent border-b border-gray-200 dark:border-zinc-700 pb-1 outline-none"
                />
              </div>
            </div>

            {filteredHistoryTransactions.length === 0 ? (
              <div className="text-center py-12">
                <History size={32} className="text-gray-300 dark:text-zinc-500 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-zinc-300 font-medium">Nenhuma transação encontrada.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredHistoryTransactions.map((transaction) => {
                  const label = getTransactionLabel(transaction);
                  const abbr = getPaymentAbbr(transaction.paymentMethod || '', transaction.type);
                  const abbrColor =
                    abbr === 'PIX' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' :
                    abbr === 'DBT' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' :
                    abbr === 'DIN' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300' :
                    abbr === 'CON' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' : '';

                  return (
                    <div key={`history-${transaction.studentId}-${transaction.id}`} className="bg-white dark:bg-zinc-900/90 rounded-2xl p-3 flex items-center gap-2 border border-gray-100 dark:border-zinc-700">
                      <div className={`w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center ${
                        transaction.type === 'CONSUMPTION' ? 'bg-orange-50 dark:bg-orange-900/20' :
                        transaction.type === 'PAYMENT' ? 'bg-emerald-50 dark:bg-emerald-900/20' :
                        transaction.type === 'CREDIT_INSERT' ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-gray-50 dark:bg-zinc-800'
                      }`}>
                        {transaction.type === 'CONSUMPTION' && <ArrowUpRight size={16} className="text-orange-600 dark:text-orange-300" />}
                        {transaction.type === 'PAYMENT' && <ArrowDownRight size={16} className="text-emerald-600 dark:text-emerald-300" />}
                        {transaction.type === 'CREDIT_INSERT' && <Zap size={16} className="text-blue-600 dark:text-blue-300" />}
                        {transaction.type === 'ADJUSTMENT' && <Zap size={16} className="text-gray-500 dark:text-zinc-400" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-black text-gray-400 dark:text-zinc-400 uppercase tracking-wide leading-none mb-0.5">{label}</p>
                        <p className="text-xs font-bold text-gray-900 dark:text-zinc-100 break-words">{transaction.description}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <Clock size={10} className="text-gray-400 dark:text-zinc-400" />
                          <p className="text-[9px] text-gray-400 dark:text-zinc-400 font-medium">{transaction.date} • {transaction.studentName}</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0 pl-1">
                        {abbr && <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-lg uppercase ${abbrColor}`}>{abbr}</span>}
                        <p className={`text-sm font-black whitespace-nowrap ${
                          transaction.type === 'CONSUMPTION' ? 'text-orange-600 dark:text-orange-300' :
                          transaction.type === 'PAYMENT' ? 'text-emerald-600 dark:text-emerald-300' :
                          transaction.type === 'CREDIT_INSERT' ? 'text-blue-600 dark:text-blue-300' : 'text-gray-600 dark:text-zinc-300'
                        }`}>
                          {transaction.type === 'CONSUMPTION' ? '+' : '-'} R$ {Math.abs(transaction.amount).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'PAYMENTS' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-3xl p-5 text-white shadow-xl">
              <p className="text-[10px] uppercase tracking-[3px] font-black text-emerald-100 mb-1">Pagamentos realizados</p>
              <p className="text-2xl font-black">{paymentHistoryTransactions.length}</p>
              <p className="text-sm text-emerald-100 mt-2">Registros de quitação e créditos no período filtrado.</p>
              <button
                onClick={openPaymentModal}
                className="mt-4 w-full bg-white text-emerald-700 py-3 rounded-2xl font-black uppercase text-xs hover:bg-emerald-50 transition-all"
              >
                <CreditCard size={16} className="inline mr-1" /> Novo pagamento
              </button>
            </div>

            {hasMultipleStudents && (
              <div className="bg-white dark:bg-zinc-900/90 rounded-2xl p-3 border border-gray-100 dark:border-zinc-700">
                <label className="text-[9px] font-black text-gray-500 dark:text-zinc-400 uppercase tracking-widest block mb-2">Aluno (opcional)</label>
                <select
                  value={selectedStudentId}
                  onChange={(event) => setSelectedStudentId(String(event.target.value || ''))}
                  title="Filtrar pagamentos por aluno"
                  aria-label="Filtrar pagamentos por aluno"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 dark:bg-zinc-800 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 px-3 py-2.5 text-sm font-bold outline-none"
                >
                  <option value="">Todos os alunos</option>
                  {students.map((student) => (
                    <option key={student.id} value={student.id}>{student.name}</option>
                  ))}
                </select>
              </div>
            )}

            {paymentHistoryTransactions.length === 0 ? (
              <div className="text-center py-12 text-gray-500 dark:text-zinc-300 font-medium">Nenhum pagamento encontrado.</div>
            ) : (
              <div className="space-y-2">
                {paymentHistoryTransactions.map((tx) => (
                  <div key={`pay-${tx.studentId}-${tx.id}`} className="bg-white dark:bg-zinc-900/90 rounded-2xl p-3 border border-gray-100 dark:border-zinc-700">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-black text-gray-900 dark:text-zinc-100">{tx.description}</p>
                        <p className="text-[10px] font-bold text-gray-500 dark:text-zinc-400 mt-1">{tx.date} • {tx.studentName}</p>
                      </div>
                      <p className="text-sm font-black text-emerald-600 dark:text-emerald-300">- R$ {Math.abs(tx.amount).toFixed(2)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'SETTINGS' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-slate-50 dark:bg-zinc-900/90 rounded-[32px] p-6 shadow-sm border border-slate-200 dark:border-zinc-700">
              <h3 className="text-[10px] font-black text-gray-400 dark:text-zinc-400 uppercase tracking-[3px] mb-6">Dados da conta</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-[9px] font-black text-gray-500 dark:text-zinc-400 uppercase tracking-widest block mb-2">Nome</label>
                  <input
                    type="text"
                    value={String(currentUser?.name || '')}
                    disabled
                    title="Nome do responsável"
                    aria-label="Nome do responsável"
                    className="w-full px-4 py-3 bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-sm font-medium text-gray-700 dark:text-zinc-100"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black text-gray-500 dark:text-zinc-400 uppercase tracking-widest block mb-2">Email</label>
                  <input
                    type="text"
                    value={String(currentUser?.email || '')}
                    disabled
                    title="Email do responsável"
                    aria-label="Email do responsável"
                    className="w-full px-4 py-3 bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-sm font-medium text-gray-700 dark:text-zinc-100"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black text-gray-500 dark:text-zinc-400 uppercase tracking-widest block mb-2">Unidade</label>
                  <input
                    type="text"
                    value={String(enterprise?.name || 'Não informada')}
                    disabled
                    title="Unidade vinculada"
                    aria-label="Unidade vinculada"
                    className="w-full px-4 py-3 bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-sm font-medium text-gray-700 dark:text-zinc-100"
                  />
                </div>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="w-full bg-red-50 hover:bg-red-100 text-red-600 py-4 rounded-2xl font-black uppercase text-sm transition-all border border-red-200"
            >
              <LogOut size={18} className="inline mr-2" /> Sair da conta
            </button>
          </div>
        )}
      </main>

      <div className="fixed bottom-0 inset-x-0 z-40 pointer-events-none">
        <div className="max-w-md mx-auto px-4 pb-4">
          <div className="pointer-events-auto bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl rounded-3xl border border-gray-200 dark:border-zinc-700 shadow-2xl p-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
            <div className="grid grid-cols-4 gap-2">
              <button
                onClick={() => setActiveTab('HOME')}
                className={`py-3 px-2 rounded-2xl text-[11px] font-black transition-all flex items-center justify-center gap-1 ${
                  activeTab === 'HOME' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-600 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800'
                }`}
              >
                <Home size={15} /> INÍCIO
              </button>
              <button
                onClick={() => setActiveTab('HISTORY')}
                className={`py-3 px-2 rounded-2xl text-[11px] font-black transition-all flex items-center justify-center gap-1 ${
                  activeTab === 'HISTORY' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-600 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800'
                }`}
              >
                <History size={15} /> HISTÓRICO
              </button>
              <button
                onClick={() => setActiveTab('PAYMENTS')}
                className={`py-3 px-2 rounded-2xl text-[11px] font-black transition-all flex items-center justify-center gap-1 ${
                  activeTab === 'PAYMENTS' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-600 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800'
                }`}
              >
                <CreditCard size={15} /> PAGAR
              </button>
              <button
                onClick={() => setActiveTab('SETTINGS')}
                className={`py-3 px-2 rounded-2xl text-[11px] font-black transition-all flex items-center justify-center gap-1 ${
                  activeTab === 'SETTINGS' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-600 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800'
                }`}
              >
                <Settings size={15} /> CONFIG
              </button>
            </div>
          </div>
        </div>
      </div>

      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50 animate-in fade-in duration-300">
          <div className="w-full max-h-[90vh] overflow-y-auto bg-white dark:bg-zinc-900 rounded-t-[40px] p-6 animate-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-black text-gray-900 dark:text-zinc-100">Pagamento e créditos</h2>
              <button
                onClick={closePaymentModal}
                title="Fechar modal de pagamento"
                aria-label="Fechar modal de pagamento"
                className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <X size={24} className="text-gray-600 dark:text-zinc-200" />
              </button>
            </div>

            <div className="space-y-5">
              {hasMultipleStudents && (
                <div>
                  <label className="text-[9px] font-black text-gray-500 dark:text-zinc-400 uppercase tracking-widest block mb-2">Aluno</label>
                  <select
                    value={paymentTargetStudentId}
                    onChange={(event) => setPaymentTargetStudentId(String(event.target.value || ''))}
                    title="Selecionar aluno para pagamento"
                    aria-label="Selecionar aluno para pagamento"
                    className="w-full px-4 py-3 border border-slate-300 dark:border-zinc-700 bg-slate-100 dark:bg-zinc-800 rounded-2xl text-sm font-bold text-slate-900 dark:text-zinc-100"
                  >
                    <option value="">Selecione</option>
                    {students.map((student) => (
                      <option key={`pay-target-${student.id}`} value={student.id}>{student.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {paymentTargetStudent && (
                <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-2xl p-4">
                  <p className="text-[9px] font-bold text-indigo-600 uppercase">Aluno selecionado</p>
                  <p className="text-sm font-black text-indigo-900 dark:text-indigo-100 mt-1">{paymentTargetStudent.name}</p>
                  <p className="text-xs font-bold text-indigo-700 dark:text-indigo-300 mt-1">
                    Negativo atual: R$ {paymentTargetDue.toFixed(2)} • Saldo: R$ {Number(paymentTargetStudent.balance || 0).toFixed(2)}
                  </p>
                </div>
              )}

              <div>
                <label className="text-[9px] font-black text-gray-500 dark:text-zinc-400 uppercase tracking-widest block mb-2">Quitar negativo (R$)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={debtPaymentAmount}
                  onChange={(event) => {
                    setDebtPaymentAmount(event.target.value);
                    setPaymentError(null);
                  }}
                  title="Valor para quitar saldo negativo"
                  aria-label="Valor para quitar saldo negativo"
                  placeholder="0,00"
                  className="w-full px-4 py-3 border border-slate-300 dark:border-zinc-700 bg-slate-100 dark:bg-zinc-800 rounded-2xl text-sm font-bold text-slate-900 dark:text-zinc-100"
                />
              </div>

              <div>
                <label className="text-[9px] font-black text-gray-500 dark:text-zinc-400 uppercase tracking-widest block mb-2">Crédito Cantina (R$)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={cantinaCreditAmount}
                  onChange={(event) => {
                    setCantinaCreditAmount(event.target.value);
                    setPaymentError(null);
                  }}
                  title="Valor para crédito cantina"
                  aria-label="Valor para crédito cantina"
                  placeholder="0,00"
                  className="w-full px-4 py-3 border border-slate-300 dark:border-zinc-700 bg-slate-100 dark:bg-zinc-800 rounded-2xl text-sm font-bold text-slate-900 dark:text-zinc-100"
                />
              </div>

              <div>
                <label className="text-[9px] font-black text-gray-500 dark:text-zinc-400 uppercase tracking-widest block mb-3">Créditos de plano</label>
                {planOptionsForPaymentTarget.length === 0 ? (
                  <div className="text-xs text-gray-500 dark:text-zinc-400 bg-slate-100 dark:bg-zinc-800 rounded-xl p-3 border border-slate-200 dark:border-zinc-700">
                    Este aluno não possui planos elegíveis para crédito.
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {planOptionsForPaymentTarget.map((plan) => (
                      <button
                        key={`credit-plan-${plan.key}`}
                        onClick={() => openPlanCreditModal(plan)}
                        className="px-3 py-2 rounded-xl border border-indigo-300 text-indigo-700 dark:text-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/20 text-[11px] font-black uppercase tracking-wide hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-all"
                      >
                        CRÉDITO {plan.planName}
                      </button>
                    ))}
                  </div>
                )}

                {draftsForPaymentTarget.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {draftsForPaymentTarget.map((draft) => (
                      <div key={`draft-${draft.studentId}-${draft.planId || draft.planName}`} className="bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-black text-slate-900 dark:text-zinc-100">{draft.planName}</p>
                            <p className="text-[10px] text-slate-500 dark:text-zinc-400 font-bold mt-1">
                              {draft.selectedDates.length} data(s) • R$ {Number(draft.amount || 0).toFixed(2)}
                            </p>
                            <p className="text-[10px] text-slate-500 dark:text-zinc-400 mt-1">
                              {draft.selectedDates.join(', ')}
                            </p>
                          </div>
                          <button
                            onClick={() => removePlanDraft(draft)}
                            className="px-2 py-1 rounded-lg text-[10px] font-black uppercase bg-rose-50 text-rose-700 border border-rose-200"
                          >
                            Remover
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="text-[9px] font-black text-gray-500 dark:text-zinc-400 uppercase tracking-widest block mb-2">Método de pagamento</label>
                <button
                  onClick={() => setSelectedPaymentMethod('PIX')}
                  className="w-full p-4 rounded-2xl border-2 border-indigo-600 bg-slate-100 dark:bg-zinc-800 text-indigo-900 dark:text-indigo-200 text-sm font-bold uppercase flex items-center gap-3"
                >
                  <Check size={18} /> PIX
                </button>
              </div>

              <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-300">Pagamento único</p>
                <p className="text-2xl font-black text-emerald-900 dark:text-emerald-100 mt-1">R$ {totalPlannedPayment.toFixed(2)}</p>
                <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-1">Quitação de negativo + crédito cantina + créditos de plano.</p>
              </div>

              {paymentError && (
                <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
                  <AlertCircle size={14} /> {paymentError}
                </p>
              )}

              {paymentSuccessMessage && (
                <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-2 flex items-center gap-1">
                  <CheckCircle2 size={14} /> {paymentSuccessMessage}
                </p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={closePaymentModal}
                  className="flex-1 px-4 py-4 border border-gray-300 dark:border-zinc-700 rounded-2xl font-bold text-gray-700 dark:text-zinc-200 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-all"
                >
                  Cancelar
                </button>
                <button
                  disabled={isProcessingPayment}
                  onClick={handleProcessPayment}
                  className="flex-1 px-4 py-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-70 text-white rounded-2xl font-bold shadow-lg transition-all active:scale-95"
                >
                  {isProcessingPayment ? 'Processando...' : 'Finalizar pagamento'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isPlanModalOpen && planModalPlan && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-end">
          <div className="w-full max-h-[88vh] overflow-y-auto bg-white dark:bg-zinc-900 rounded-t-[32px] p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black text-slate-900 dark:text-zinc-100">Crédito {planModalPlan.planName}</h3>
              <button
                onClick={closePlanCreditModal}
                title="Fechar crédito de plano"
                aria-label="Fechar crédito de plano"
                className="p-2 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-200"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 p-3 text-xs text-slate-600 dark:text-zinc-300">
                Configure igual ao fluxo de creditar aluno: selecione datas do plano e valor final do crédito.
              </div>

              <div>
                <label className="text-[9px] font-black text-gray-500 dark:text-zinc-400 uppercase tracking-widest block mb-2">Valor total (R$)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={planModalAmount}
                  onChange={(event) => setPlanModalAmount(event.target.value)}
                  title="Valor total do crédito de plano"
                  aria-label="Valor total do crédito de plano"
                  placeholder="0,00"
                  className="w-full px-4 py-3 border border-slate-300 dark:border-zinc-700 bg-slate-100 dark:bg-zinc-800 rounded-2xl text-sm font-bold text-slate-900 dark:text-zinc-100"
                />
                {planModalPlan.unitValue > 0 && (
                  <p className="text-[10px] text-slate-500 dark:text-zinc-400 mt-1">
                    Valor sugerido por unidade: R$ {planModalPlan.unitValue.toFixed(2)}
                  </p>
                )}
              </div>

              <div>
                <label className="text-[9px] font-black text-gray-500 dark:text-zinc-400 uppercase tracking-widest block mb-2">Datas do plano</label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={planModalDateInput}
                    onChange={(event) => setPlanModalDateInput(event.target.value)}
                    title="Selecionar data do plano"
                    aria-label="Selecionar data do plano"
                    className="flex-1 px-4 py-3 border border-slate-300 dark:border-zinc-700 bg-slate-100 dark:bg-zinc-800 rounded-2xl text-sm font-bold text-slate-900 dark:text-zinc-100"
                  />
                  <button
                    onClick={addPlanModalDate}
                    className="px-3 py-3 rounded-2xl bg-indigo-600 text-white font-black text-xs uppercase"
                  >
                    <Plus size={14} className="inline mr-1" /> Add
                  </button>
                </div>

                {planModalDates.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {planModalDates.map((date) => (
                      <button
                        key={`plan-date-${date}`}
                        onClick={() => removePlanModalDate(date)}
                        className="px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-black"
                      >
                        {date} ✕
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={closePlanCreditModal}
                  className="flex-1 px-4 py-4 border border-gray-300 dark:border-zinc-700 rounded-2xl font-bold text-gray-700 dark:text-zinc-200 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={savePlanDraft}
                  className="flex-1 px-4 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold shadow-lg transition-all"
                >
                  <Check size={16} className="inline mr-1" /> Salvar crédito
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResponsiblePortalPage;
