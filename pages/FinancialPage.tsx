import React, { useEffect, useMemo, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Calendar,
  FileSpreadsheet,
  Printer,
  User,
  Plus,
  X,
  Pencil,
  CheckCircle2,
  Trash2,
  CreditCard
} from 'lucide-react';
import { Client, Enterprise, User as UserType } from '../types';
import { ApiService } from '../services/api';
import { formatPhoneWithFlag } from '../utils/phone';
import { drawEnterpriseLogoOnPdf } from '../utils/enterpriseBranding';

type TimeFilter = 'TODAY' | 'MONTH' | 'YEAR' | 'DATE';
type EntryType = 'RECEITA' | 'DESPESA';
type FinancialSectionTab = 'PENDING' | 'REMINDERS' | 'LAUNCHES' | 'AUDIT';
type PaymentMethodViewFilter = 'ALL' | 'CORE';

type FinancialTx = {
  id: string;
  date: string;
  time: string;
  client: string;
  description: string;
  type: EntryType;
  amount: number;
  method: string;
  category: string;
  quantity: number;
  unitPrice: number;
  dueDate?: string;
  reminderDate?: string;
  monthReference?: string;
  isManual: boolean;
  rawType?: string;
  userName?: string;
  payerResponsibleId?: string;
  payerResponsibleName?: string;
  isAudit?: boolean;
  auditedItemType?: 'ITEM' | 'PLANO';
  auditedQuantity?: number;
};

interface FinancialPageProps {
  activeEnterprise: Enterprise | null;
  currentUser: UserType;
}

const defaultRevenueCategories = ['CRÉDITO CANTINA', 'CRÉDITO PLANO', 'VENDA AVULSA PDV'];
const defaultExpenseCategories = ['COMPRA DE MATERIAL', 'VALE FUNCIONÁRIO', 'PASSAGEM DE ÔNIBUS', 'OUTROS'];

const toLocalDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDateOnly = (dateStr?: string): Date | null => {
  if (!dateStr) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(year, month - 1, day, 0, 0, 0, 0);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDateBr = (dateStr?: string) => {
  const parsed = parseDateOnly(dateStr);
  if (!parsed) return '';
  return parsed.toLocaleDateString('pt-BR');
};

const formatPhoneNumber = (rawPhone?: string) => {
  return formatPhoneWithFlag(rawPhone, 'Não informado');
};

const normalizeUpper = (value?: string) =>
  String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

const inferAuditItemType = (tx: any): 'ITEM' | 'PLANO' => {
  const plan = normalizeUpper(tx?.plan || tx?.planName);
  const item = normalizeUpper(tx?.item);
  const description = normalizeUpper(tx?.description);

  if (plan && plan !== 'AUDITORIA' && plan !== 'VENDA' && plan !== 'CREDITO CANTINA') return 'PLANO';
  if (item.includes('PLANO') || item.includes('PACOTE')) return 'PLANO';
  if (description.includes('PLANO') || description.includes('PACOTE')) return 'PLANO';

  return 'ITEM';
};

const isDeletionAdjustmentTx = (tx: FinancialTx) => {
  const category = normalizeUpper(tx?.category);
  const description = normalizeUpper(tx?.description);
  return category === 'AJUSTE EXCLUSAO TRANSACAO' || description.includes('EXCLUSAO REGISTRADA EM TRANSACOES');
};

const normalizePaymentLabel = (value?: string) => {
  const normalized = normalizeUpper(value);
  if (!normalized) return 'OUTROS';
  if (normalized.includes('PIX')) return 'PIX';
  if (normalized.includes('DINHEIRO')) return 'DINHEIRO';
  if (normalized.includes('DEBITO')) return 'CARTAO DEBITO';
  if (normalized.includes('CREDITO')) return 'CARTAO CREDITO';
  if (normalized.includes('TICKET')) return 'TICKET';
  if (normalized.includes('MANUAL')) return 'MANUAL';
  if (normalized.includes('SALDO')) return 'SALDO CARTEIRA';
  return normalized;
};

const splitPaymentMethods = (raw?: string) => {
  const tokens = String(raw || '')
    .split(/[+,/|]/g)
    .map((item) => normalizePaymentLabel(item))
    .filter(Boolean);
  return tokens.length > 0 ? tokens : ['OUTROS'];
};

const filterTransactionsByPeriod = (
  items: FinancialTx[],
  timeFilter: TimeFilter,
  specificDate: string
) => {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  return items.filter((tx) => {
    const txDate = parseDateOnly(tx.date);
    if (!txDate) return false;

    if (timeFilter === 'TODAY') return txDate >= todayStart && txDate <= todayEnd;
    if (timeFilter === 'MONTH') return txDate.getFullYear() === now.getFullYear() && txDate.getMonth() === now.getMonth();
    if (timeFilter === 'YEAR') return txDate.getFullYear() === now.getFullYear();
    if (timeFilter === 'DATE') {
      const selected = specificDate ? new Date(`${specificDate}T00:00:00`) : null;
      if (!selected || Number.isNaN(selected.getTime())) return false;
      const selectedStart = new Date(selected.getFullYear(), selected.getMonth(), selected.getDate());
      const selectedEnd = new Date(selected.getFullYear(), selected.getMonth(), selected.getDate(), 23, 59, 59, 999);
      return txDate >= selectedStart && txDate <= selectedEnd;
    }

    return true;
  });
};

const inferRevenueByBusinessRule = (tx: any) => {
  const description = normalizeUpper(tx?.description || tx?.item);
  const rawType = normalizeUpper(tx?.type);
  const paymentMethodRaw = normalizeUpper(tx?.method || tx?.paymentMethod);
  const paymentMethodTokens = paymentMethodRaw
    .split('+')
    .map((token) => token.trim())
    .filter(Boolean);
  const allowedPdvRevenueMethods = new Set(['DEBITO', 'PIX', 'CREDITO', 'DINHEIRO']);
  const hasAllowedPdvMethod = paymentMethodTokens.some((token) => allowedPdvRevenueMethods.has(token));

  // Receitas somente: crédito plano, crédito cantina e venda avulsa PDV.
  const isCantinaCredit = description.includes('CREDITO LIVRE CANTINA');
  const isPlanCredit = description.includes('RECARGA DE PLANO') || description.includes('CREDITO PLANO');
  const isPdvSale = description.includes('COMPRA PDV') && hasAllowedPdvMethod;

  if (isCantinaCredit || isPlanCredit || isPdvSale) return true;

  // fallback: alguns registros antigos podem vir como VENDA_BALCAO
  if (rawType === 'VENDA_BALCAO' && hasAllowedPdvMethod) return true;

  return false;
};

const mapRawTransactionToFinancial = (tx: any): FinancialTx | null => {
  const timestamp = tx?.timestamp ? new Date(tx.timestamp) : null;
  const hasValidTimestamp = timestamp && !Number.isNaN(timestamp.getTime());
  const date = tx?.date || (hasValidTimestamp ? toLocalDateKey(timestamp as Date) : '');
  const time = tx?.time || (hasValidTimestamp
    ? (timestamp as Date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : '');

  const amount = Number(tx?.amount ?? tx?.total ?? tx?.value ?? 0);
  const safeAmount = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  const rawType = normalizeUpper(tx?.type);
  const userName = String(
    tx?.deletedByName
    || tx?.createdByName
    || tx?.sessionUserName
    || tx?.updatedByName
    || 'SISTEMA'
  ).trim();

  const financeKind = normalizeUpper(tx?.financeKind);
  const isManualFinance = Boolean(tx?.financeEntry);

  if (rawType.includes('AUDITORIA')) {
    const quantity = Number(tx?.deletedTransactionCount || tx?.quantity || 1);
    const normalizedQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
    const normalizedUnitPrice = Number(tx?.unitPrice);
    const unitPrice = Number.isFinite(normalizedUnitPrice)
      ? Math.max(0, normalizedUnitPrice)
      : Number((safeAmount / normalizedQuantity).toFixed(2));
    return {
      id: String(tx?.id || `tx_${Date.now()}`),
      date,
      time,
      client: String(tx?.clientName || tx?.client || 'Administração'),
      description: String(tx?.description || tx?.item || 'Registro de auditoria'),
      type: 'RECEITA',
      amount: safeAmount,
      method: String(tx?.method || tx?.paymentMethod || 'AUDITORIA'),
      category: String(tx?.financeCategory || tx?.category || 'AUDITORIA'),
      quantity: normalizedQuantity,
      unitPrice,
      isManual: false,
      rawType,
      userName,
      payerResponsibleId: String(tx?.payerResponsibleId || '').trim() || undefined,
      payerResponsibleName: String(tx?.payerResponsibleName || '').trim() || undefined,
      isAudit: true,
      auditedItemType: inferAuditItemType(tx),
      auditedQuantity: normalizedQuantity,
    };
  }

  if (financeKind === 'RECEITA' || financeKind === 'DESPESA') {
    return {
      id: String(tx?.id || `tx_${Date.now()}`),
      date,
      time,
      client: String(tx?.clientName || tx?.client || 'Administração'),
      description: String(tx?.description || tx?.item || 'Sem descrição'),
      type: financeKind as EntryType,
      amount: safeAmount,
      method: String(tx?.method || tx?.paymentMethod || 'N/A'),
      category: String(tx?.financeCategory || 'SEM CATEGORIA'),
      quantity: Number(tx?.quantity || 1),
      unitPrice: Number(tx?.unitPrice || safeAmount || 0),
      dueDate: tx?.dueDate ? String(tx.dueDate) : undefined,
      reminderDate: tx?.reminderDate ? String(tx.reminderDate) : undefined,
      monthReference: tx?.monthReference ? String(tx.monthReference) : undefined,
      isManual: isManualFinance,
      rawType,
      userName,
      payerResponsibleId: String(tx?.payerResponsibleId || '').trim() || undefined,
      payerResponsibleName: String(tx?.payerResponsibleName || '').trim() || undefined,
      isAudit: false,
    };
  }

  if (inferRevenueByBusinessRule(tx)) {
    const description = String(tx?.description || tx?.item || 'Receita');
    const normalizedDesc = normalizeUpper(description);
    let category = 'VENDA AVULSA PDV';
    if (normalizedDesc.includes('CREDITO LIVRE CANTINA')) category = 'CRÉDITO CANTINA';
    if (normalizedDesc.includes('RECARGA DE PLANO') || normalizedDesc.includes('CREDITO PLANO')) category = 'CRÉDITO PLANO';

    return {
      id: String(tx?.id || `tx_${Date.now()}`),
      date,
      time,
      client: String(tx?.clientName || tx?.client || 'Consumidor Final'),
      description,
      type: 'RECEITA',
      amount: safeAmount,
      method: String(tx?.method || tx?.paymentMethod || 'N/A'),
      category,
      quantity: Number(tx?.quantity || 1),
      unitPrice: safeAmount,
      isManual: false,
      rawType,
      userName,
      payerResponsibleId: String(tx?.payerResponsibleId || '').trim() || undefined,
      payerResponsibleName: String(tx?.payerResponsibleName || '').trim() || undefined,
      isAudit: false,
    };
  }

  // Demais transações não entram no financeiro por regra de negócio solicitada.
  return null;
};

const FinancialPage: React.FC<FinancialPageProps> = ({ activeEnterprise, currentUser }) => {
  const [summaryTimeFilter, setSummaryTimeFilter] = useState<TimeFilter>('TODAY');
  const [summarySpecificDate, setSummarySpecificDate] = useState(toLocalDateKey(new Date()));
  const [pendingSearch, setPendingSearch] = useState('');
  const [pendingTypeFilter, setPendingTypeFilter] = useState<'ALL' | 'ALUNO' | 'COLABORADOR'>('ALL');
  const [reminderTimeFilter, setReminderTimeFilter] = useState<TimeFilter>('TODAY');
  const [reminderSpecificDate, setReminderSpecificDate] = useState(toLocalDateKey(new Date()));
  const [reminderSearch, setReminderSearch] = useState('');
  const [launchTimeFilter, setLaunchTimeFilter] = useState<TimeFilter>('TODAY');
  const [launchSpecificDate, setLaunchSpecificDate] = useState(toLocalDateKey(new Date()));
  const [launchTypeFilter, setLaunchTypeFilter] = useState<'ALL' | 'RECEITA' | 'DESPESA'>('ALL');
  const [launchSearch, setLaunchSearch] = useState('');
  const [auditTimeFilter, setAuditTimeFilter] = useState<TimeFilter>('TODAY');
  const [auditSpecificDate, setAuditSpecificDate] = useState(toLocalDateKey(new Date()));
  const [auditSearch, setAuditSearch] = useState('');
  const [activeSectionTab, setActiveSectionTab] = useState<FinancialSectionTab>('PENDING');
  const [paymentMethodViewFilter, setPaymentMethodViewFilter] = useState<PaymentMethodViewFilter>('ALL');
  const [selectedPendingClientIds, setSelectedPendingClientIds] = useState<string[]>([]);
  const [transactions, setTransactions] = useState<FinancialTx[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const canHardDeleteTransactions = useMemo(() => {
    const role = normalizeUpper(currentUser?.role);
    return role === 'SUPERADMIN' || role === 'ADMIN_SISTEMA';
  }, [currentUser?.role]);

  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
  const [entryType, setEntryType] = useState<EntryType>('RECEITA');
  const [description, setDescription] = useState('');
  const [categoryMode, setCategoryMode] = useState<'SELECT' | 'NEW'>('SELECT');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('0');
  const [entryDate, setEntryDate] = useState(toLocalDateKey(new Date()));
  const [dueDate, setDueDate] = useState('');
  const [hasReminder, setHasReminder] = useState(false);
  const [reminderDate, setReminderDate] = useState('');
  const [monthReference, setMonthReference] = useState('');
  const [isSavingEntry, setIsSavingEntry] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      if (!activeEnterprise?.id) {
        setTransactions([]);
        setClients([]);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const [rawTx, rawClients] = await Promise.all([
          ApiService.getTransactions({ enterpriseId: activeEnterprise.id }),
          ApiService.getClients(activeEnterprise.id)
        ]);

        const normalizedTx = (Array.isArray(rawTx) ? rawTx : [])
          .map(mapRawTransactionToFinancial)
          .filter(Boolean) as FinancialTx[];

        setTransactions(normalizedTx);
        setClients(Array.isArray(rawClients) ? rawClients : []);
      } catch (error) {
        console.error('Erro ao carregar financeiro:', error);
        setTransactions([]);
        setClients([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [activeEnterprise?.id]);

  const revenueCategories = useMemo(() => {
    const fromTransactions = transactions
      .filter((tx) => tx.type === 'RECEITA')
      .map((tx) => tx.category)
      .filter(Boolean);
    return Array.from(new Set([...defaultRevenueCategories, ...fromTransactions]));
  }, [transactions]);

  const expenseCategories = useMemo(() => {
    const fromTransactions = transactions
      .filter((tx) => tx.type === 'DESPESA')
      .map((tx) => tx.category)
      .filter(Boolean);
    return Array.from(new Set([...defaultExpenseCategories, ...fromTransactions]));
  }, [transactions]);

  const availableCategories = entryType === 'RECEITA' ? revenueCategories : expenseCategories;

  useEffect(() => {
    if (!selectedCategory && availableCategories.length > 0) {
      setSelectedCategory(availableCategories[0]);
    }
  }, [availableCategories, selectedCategory]);

  const summaryTransactions = useMemo(() => {
    return filterTransactionsByPeriod(transactions, summaryTimeFilter, summarySpecificDate)
      .filter((tx) => !tx.isAudit);
  }, [transactions, summaryTimeFilter, summarySpecificDate]);

  const totalRevenue = useMemo(() => {
    return summaryTransactions
      .filter((tx) => tx.type === 'RECEITA')
      .reduce((sum, tx) => sum + tx.amount, 0);
  }, [summaryTransactions]);

  const totalExpense = useMemo(() => {
    return summaryTransactions
      .filter((tx) => tx.type === 'DESPESA')
      .reduce((sum, tx) => sum + tx.amount, 0);
  }, [summaryTransactions]);

  const netProfit = useMemo(() => totalRevenue - totalExpense, [totalRevenue, totalExpense]);

  const paymentMethodReport = useMemo(() => {
    const totals = new Map<string, number>();

    summaryTransactions
      .filter((tx) => tx.type === 'RECEITA')
      .forEach((tx) => {
        const methods = splitPaymentMethods(tx.method);
        const divisor = methods.length || 1;
        const amountPerMethod = Number((tx.amount / divisor).toFixed(2));
        methods.forEach((method) => {
          const current = totals.get(method) || 0;
          totals.set(method, Number((current + amountPerMethod).toFixed(2)));
        });
      });

    const rows = Array.from(totals.entries())
      .map(([method, total]) => ({ method, total }))
      .sort((a, b) => b.total - a.total);

    const totalReceived = rows.reduce((sum, row) => sum + row.total, 0);

    return {
      rows: rows.map((row) => ({
        ...row,
        percentage: totalReceived > 0 ? (row.total / totalReceived) * 100 : 0,
      })),
      totalReceived,
    };
  }, [summaryTransactions]);

  const paymentMethodVisibleReport = useMemo(() => {
    const coreMethods = new Set(['PIX', 'DINHEIRO', 'CARTAO DEBITO', 'CARTAO CREDITO']);
    const rows = paymentMethodViewFilter === 'CORE'
      ? paymentMethodReport.rows.filter((row) => coreMethods.has(row.method))
      : paymentMethodReport.rows;

    const totalReceived = rows.reduce((sum, row) => sum + row.total, 0);

    return {
      rows,
      totalReceived,
    };
  }, [paymentMethodReport, paymentMethodViewFilter]);

  const pendingClients = useMemo(() => {
    return clients
      .map((client) => {
        const collaboratorDue = Number(client.amountDue || 0);
        const negativeWallet = Number(client.balance || 0) < 0 ? Math.abs(Number(client.balance || 0)) : 0;
        const pendingAmount = Number((collaboratorDue + negativeWallet).toFixed(2));

        const turma = String(client.class || '').trim() || '-';
        const responsibleName = client.parentName || client.guardianName || '-';
        const responsiblePhone = formatPhoneNumber(client.parentWhatsapp || client.guardianPhone || client.phone);

        const selectedPlansConfig = Array.isArray((client as any).selectedPlansConfig)
          ? ((client as any).selectedPlansConfig as Array<any>)
          : [];
        const selectedPlans = selectedPlansConfig
          .map((cfg: any) => String(cfg?.planName || '').trim())
          .filter(Boolean);
        const basePlans = (client.servicePlans || [])
          .map((plan) => String(plan || '').trim())
          .filter((plan) => Boolean(plan) && normalizeUpper(plan) !== 'PREPAGO');
        const plansActive = Array.from(new Set([...selectedPlans, ...basePlans]));

        return {
          id: client.id,
          name: client.name,
          type: client.type,
          registrationId: client.registrationId,
          turma,
          responsibleName,
          responsiblePhone,
          plansActive,
          pendingAmount,
          collaboratorDue,
          negativeWallet
        };
      })
      .filter((client) => client.pendingAmount > 0)
      .sort((a, b) => b.pendingAmount - a.pendingAmount);
  }, [clients]);

  const filteredPendingClients = useMemo(() => {
    const term = normalizeUpper(pendingSearch);
    return pendingClients.filter((client) => {
      const matchesType = pendingTypeFilter === 'ALL' || client.type === pendingTypeFilter;
      const matchesSearch = !term
        || normalizeUpper(client.name).includes(term)
        || normalizeUpper(client.registrationId).includes(term)
        || normalizeUpper(client.responsibleName).includes(term)
        || normalizeUpper((client.plansActive || []).join(' ')).includes(term);
      return matchesType && matchesSearch;
    });
  }, [pendingClients, pendingSearch, pendingTypeFilter]);

  useEffect(() => {
    const availableIds = new Set(filteredPendingClients.map((client) => client.id));
    setSelectedPendingClientIds((prev) => prev.filter((id) => availableIds.has(id)));
  }, [filteredPendingClients]);

  const allFilteredPendingSelected = useMemo(() => {
    return filteredPendingClients.length > 0 && filteredPendingClients.every((client) => selectedPendingClientIds.includes(client.id));
  }, [filteredPendingClients, selectedPendingClientIds]);

  const toggleSelectAllFilteredPending = (checked: boolean) => {
    if (checked) {
      setSelectedPendingClientIds(filteredPendingClients.map((client) => client.id));
      return;
    }
    setSelectedPendingClientIds([]);
  };

  const toggleSelectPendingClient = (clientId: string, checked: boolean) => {
    setSelectedPendingClientIds((prev) => {
      if (checked) return Array.from(new Set([...prev, clientId]));
      return prev.filter((id) => id !== clientId);
    });
  };

  const exportSelectedPendingToPDF = () => {
    const selectedRows = filteredPendingClients.filter((client) => selectedPendingClientIds.includes(client.id));
    if (selectedRows.length === 0) {
      alert('Selecione pelo menos 1 cliente na lista de pendências.');
      return;
    }

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const leftStartX = 26;
    drawEnterpriseLogoOnPdf(doc, String(activeEnterprise?.logo || '').trim(), 14, 8, 9, 'CS');
    doc.setFontSize(14);
    doc.text(`Pendências e Saldos Negativos - ${activeEnterprise?.name || 'Unidade'}`, leftStartX, 14);
    doc.setFontSize(9);
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, leftStartX, 20);
    doc.text(`Filtro tipo: ${pendingTypeFilter} | Busca: ${pendingSearch || 'SEM FILTRO'} | Selecionados: ${selectedRows.length}`, leftStartX, 25);

    autoTable(doc, {
      startY: 30,
      head: [['Matrícula', 'Aluno/Cliente', 'Tipo', 'Turma', 'Responsável', 'Telefone', 'Planos', 'Pendência']],
      body: selectedRows.map((client) => [
        client.registrationId,
        client.name,
        client.type,
        client.turma || '-',
        client.responsibleName || '-',
        client.responsiblePhone || 'Não informado',
        client.plansActive.length > 0 ? client.plansActive.join(', ') : 'INATIVO',
        `R$ ${client.pendingAmount.toFixed(2)}`
      ]),
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2.2 },
      headStyles: { fillColor: [79, 70, 229] }
    });

    doc.save(`pendencias_selecionadas_${Date.now()}.pdf`);
  };

  const reminders = useMemo(() => {
    const periodList = filterTransactionsByPeriod(transactions, reminderTimeFilter, reminderSpecificDate)
      .filter((tx) => tx.type === 'DESPESA' && tx.reminderDate);
    const term = normalizeUpper(reminderSearch);
    return periodList
      .filter((tx) => !term || normalizeUpper(`${tx.description} ${tx.monthReference || ''} ${tx.category}`).includes(term))
      .sort((a, b) => String(a.reminderDate).localeCompare(String(b.reminderDate)));
  }, [transactions, reminderTimeFilter, reminderSpecificDate, reminderSearch]);

  const filteredLaunchTransactions = useMemo(() => {
    const periodList = filterTransactionsByPeriod(transactions, launchTimeFilter, launchSpecificDate);
    const term = normalizeUpper(launchSearch);
    return periodList.filter((tx) => {
      if (tx.isAudit) return false;
      const matchesType = launchTypeFilter === 'ALL' || tx.type === launchTypeFilter;
      const matchesSearch = !term
        || normalizeUpper(`${tx.description} ${tx.category} ${tx.client} ${tx.payerResponsibleName || ''}`).includes(term);
      return matchesType && matchesSearch;
    });
  }, [transactions, launchTimeFilter, launchSpecificDate, launchTypeFilter, launchSearch]);

  const filteredAuditTransactions = useMemo(() => {
    const periodList = filterTransactionsByPeriod(transactions, auditTimeFilter, auditSpecificDate);
    const term = normalizeUpper(auditSearch);
    return periodList
      .filter((tx) => tx.isAudit)
      .filter((tx) => {
        if (!term) return true;
        return normalizeUpper(`${tx.id} ${tx.description} ${tx.category} ${tx.rawType || tx.type} ${tx.client} ${tx.userName || ''} ${tx.auditedItemType || ''} ${tx.auditedQuantity || ''}`).includes(term);
      })
      .sort((a, b) => {
        const left = new Date(`${a.date || ''}T${a.time || '00:00'}`).getTime();
        const right = new Date(`${b.date || ''}T${b.time || '00:00'}`).getTime();
        return right - left;
      });
  }, [transactions, auditTimeFilter, auditSpecificDate, auditSearch]);

  const resetEntryForm = () => {
    setDescription('');
    setCategoryMode('SELECT');
    setSelectedCategory(availableCategories[0] || '');
    setNewCategory('');
    setQuantity('1');
    setUnitPrice('0');
    setEntryDate(toLocalDateKey(new Date()));
    setDueDate('');
    setHasReminder(false);
    setReminderDate('');
    setMonthReference('');
    setEditingEntryId(null);
  };

  const openEntryModal = (type: EntryType) => {
    setEntryType(type);
    setIsEntryModalOpen(true);
    setEditingEntryId(null);
    setTimeout(() => {
      setSelectedCategory((type === 'RECEITA' ? revenueCategories[0] : expenseCategories[0]) || '');
    }, 0);
    resetEntryForm();
  };

  const openEditReminder = (tx: FinancialTx) => {
    setEntryType('DESPESA');
    setEditingEntryId(tx.id);
    setIsEntryModalOpen(true);
    setDescription(tx.description || '');
    setCategoryMode('SELECT');
    setSelectedCategory(tx.category || expenseCategories[0] || 'OUTROS');
    setNewCategory('');
    setQuantity(String(tx.quantity || 1));
    setUnitPrice(String(tx.unitPrice || 0));
    setEntryDate(tx.date || toLocalDateKey(new Date()));
    setDueDate(tx.dueDate || '');
    setHasReminder(Boolean(tx.reminderDate));
    setReminderDate(tx.reminderDate || '');
    setMonthReference(tx.monthReference || '');
  };

  const closeEntryModal = () => {
    setIsEntryModalOpen(false);
    setIsSavingEntry(false);
    setEditingEntryId(null);
  };

  const handleSaveEntry = async () => {
    if (!activeEnterprise?.id) return;

    const qty = Number(String(quantity).replace(',', '.'));
    const unit = Number(String(unitPrice).replace(',', '.'));
    const normalizedDescription = String(description || '').trim();
    const finalCategory = categoryMode === 'NEW' ? String(newCategory || '').trim() : String(selectedCategory || '').trim();

    if (!normalizedDescription) {
      alert('Informe a descrição.');
      return;
    }

    if (!finalCategory) {
      alert('Informe a categoria.');
      return;
    }

    if (!Number.isFinite(qty) || qty <= 0) {
      alert('Quantidade inválida.');
      return;
    }

    if (!Number.isFinite(unit) || unit < 0) {
      alert('Valor unitário inválido.');
      return;
    }

    if (!entryDate) {
      alert('Informe a data do lançamento.');
      return;
    }

    if (entryType === 'DESPESA' && hasReminder && !reminderDate) {
      alert('Informe a data do lembrete da despesa.');
      return;
    }

    const total = Number((qty * unit).toFixed(2));
    const now = new Date();

    const payload: any = {
      enterpriseId: activeEnterprise.id,
      type: entryType === 'RECEITA' ? 'CREDIT' : 'DEBIT',
      amount: total,
      total,
      value: total,
      description: normalizedDescription,
      item: `${qty} x ${unit.toFixed(2)} (${finalCategory})`,
      paymentMethod: 'MANUAL',
      method: 'MANUAL',
      status: 'CONCLUIDA',
      date: entryDate,
      time: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      timestamp: new Date(`${entryDate}T${now.toTimeString().slice(0, 8)}`).toISOString(),
      clientId: null,
      clientName: 'ADMINISTRAÇÃO',
      financeEntry: true,
      financeKind: entryType,
      financeCategory: finalCategory,
      quantity: qty,
      unitPrice: unit,
      dueDate: entryType === 'DESPESA' && dueDate ? dueDate : undefined,
      reminderDate: entryType === 'DESPESA' && hasReminder ? reminderDate : undefined,
      monthReference: entryType === 'DESPESA' ? String(monthReference || '').trim() || undefined : undefined,
    };

    try {
      setIsSavingEntry(true);

      if (editingEntryId) {
        const updated = await ApiService.updateTransaction(editingEntryId, payload);
        const mappedUpdated = mapRawTransactionToFinancial(updated);
        if (mappedUpdated) {
          setTransactions((prev) => prev.map((tx) => (tx.id === editingEntryId ? mappedUpdated : tx)));
        }
      } else {
        const created = await ApiService.createTransaction(payload);
        const mapped = mapRawTransactionToFinancial(created);
        if (mapped) {
          setTransactions((prev) => [mapped, ...prev]);
        }
      }

      closeEntryModal();
    } catch (error) {
      console.error('Erro ao salvar lançamento financeiro:', error);
      alert('Erro ao salvar lançamento financeiro.');
      setIsSavingEntry(false);
    }
  };

  const handleMarkReminderPaid = async (tx: FinancialTx) => {
    const confirmed = window.confirm('Marcar esta despesa como paga?');
    if (!confirmed) return;

    try {
      const updated = await ApiService.updateTransaction(tx.id, {
        status: 'PAGA',
        reminderDate: null,
        reminderDoneAt: new Date().toISOString()
      });
      const mapped = mapRawTransactionToFinancial(updated);
      if (mapped) {
        setTransactions((prev) => prev.map((item) => (item.id === tx.id ? mapped : item)));
      }
    } catch (error) {
      console.error('Erro ao marcar despesa como paga:', error);
      alert('Erro ao marcar despesa como paga.');
    }
  };

  const handleDeleteReminder = async (tx: FinancialTx) => {
    if (!canHardDeleteTransactions) {
      alert('Exclusão direta bloqueada para este perfil. Use estorno/correção.');
      return;
    }

    const confirmed = window.confirm('Excluir este lembrete/despesa?');
    if (!confirmed) return;

    try {
      await ApiService.deleteTransaction(tx.id);
      setTransactions((prev) => prev.filter((item) => item.id !== tx.id));
    } catch (error) {
      console.error('Erro ao excluir lembrete/despesa:', error);
      alert('Erro ao excluir lembrete/despesa.');
    }
  };

  const exportToCSV = () => {
    const headers = ['ID', 'Data', 'Hora', 'Tipo', 'Categoria', 'Descrição', 'Responsável Pagante', 'Quantidade', 'Valor Unitário', 'Valor Total', 'Vencimento', 'Lembrete', 'Referência'];
    const rows = filteredLaunchTransactions.map((tx) => [
      tx.id,
      tx.date,
      tx.time,
      tx.type,
      tx.category,
      tx.description,
      tx.payerResponsibleName || '',
      tx.quantity.toString(),
      tx.unitPrice.toFixed(2),
      tx.amount.toFixed(2),
      tx.dueDate || '',
      tx.reminderDate || '',
      tx.monthReference || ''
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `financeiro_${Date.now()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const leftStartX = 26;
    drawEnterpriseLogoOnPdf(doc, String(activeEnterprise?.logo || '').trim(), 14, 9, 9, 'CS');
    doc.setFontSize(16);
    doc.text(`Relatório Financeiro - ${activeEnterprise?.name || 'Unidade'}`, leftStartX, 15);
    doc.setFontSize(10);
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, leftStartX, 22);
    doc.text(`Receita: R$ ${totalRevenue.toFixed(2)} | Despesa: R$ ${totalExpense.toFixed(2)} | Lucro: R$ ${netProfit.toFixed(2)}`, leftStartX, 28);

    autoTable(doc, {
      head: [['Data', 'Tipo', 'Categoria', 'Descrição', 'Responsável Pagante', 'Qtd', 'Unitário', 'Total', 'Vencimento', 'Lembrete']],
      body: filteredLaunchTransactions.map((tx) => [
        `${formatDateBr(tx.date)} ${tx.time}`,
        tx.type,
        tx.category,
        tx.description,
        tx.payerResponsibleName || '-',
        String(tx.quantity),
        `R$ ${tx.unitPrice.toFixed(2)}`,
        `R$ ${tx.amount.toFixed(2)}`,
        tx.dueDate ? formatDateBr(tx.dueDate) : '-',
        tx.reminderDate ? `${formatDateBr(tx.reminderDate)} ${tx.monthReference ? `(${tx.monthReference})` : ''}` : '-'
      ]),
      startY: 34,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 }
    });

    const nextStartY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 6 : 42;
    autoTable(doc, {
      startY: nextStartY,
      head: [['Forma de Pagamento', 'Total Recebido', 'Participação']],
      body: paymentMethodVisibleReport.rows.map((row) => [
        row.method,
        `R$ ${row.total.toFixed(2)}`,
        `${row.percentage.toFixed(1)}%`
      ]),
      theme: 'striped',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [16, 185, 129] }
    });

    doc.save(`financeiro_${Date.now()}.pdf`);
  };

  if (!activeEnterprise) {
    return (
      <div className="p-8">
        <div className="bg-white dark:bg-[#121214] rounded-2xl border border-slate-200 dark:border-white/10 ring-1 ring-transparent dark:ring-white/5 p-8 text-center text-gray-500 dark:text-zinc-300 font-bold">
          Selecione uma unidade para acessar o Financeiro.
        </div>
      </div>
    );
  }

  return (
    <div className="dash-shell finance-shell space-y-3">
      <header className="dash-header">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight leading-none uppercase">Financeiro</h1>
          <p className="text-[8px] sm:text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.14em] mt-1">Receita, despesa, lucro, pendências e relatório</p>
        </div>
        <div className="dash-actions gap-1.5 sm:gap-2">
          <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-white dark:bg-[#121214] border border-gray-200 dark:border-white/10">
            <Calendar size={11} className="text-indigo-500" />
            <select
              value={summaryTimeFilter}
              onChange={(e) => setSummaryTimeFilter(e.target.value as TimeFilter)}
              className="px-2 py-1 bg-transparent outline-none text-[9px] font-black uppercase tracking-[0.12em] text-gray-700 dark:text-zinc-100"
            >
              <option value="TODAY">Hoje</option>
              <option value="MONTH">Mês atual</option>
              <option value="YEAR">Ano atual</option>
              <option value="DATE">Data</option>
            </select>
            {summaryTimeFilter === 'DATE' && (
              <input
                type="date"
                value={summarySpecificDate}
                onChange={(e) => setSummarySpecificDate(e.target.value)}
                className="px-2 py-1 rounded-md bg-gray-50 dark:bg-zinc-900 border border-transparent dark:border-white/10 focus:border-indigo-500 outline-none text-[9px] font-black text-gray-700 dark:text-zinc-100"
              />
            )}
          </div>
          <button
            onClick={() => openEntryModal('RECEITA')}
            className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-[9px] font-black uppercase tracking-[0.12em] hover:bg-emerald-700 flex items-center gap-1.5"
          >
            <Plus size={12} /> Inserir Receita
          </button>
          <button
            onClick={() => openEntryModal('DESPESA')}
            className="px-3 py-2 rounded-lg bg-red-600 text-white text-[9px] font-black uppercase tracking-[0.12em] hover:bg-red-700 flex items-center gap-1.5"
          >
            <Plus size={12} /> Inserir Despesa
          </button>
          <button onClick={exportToCSV} className="px-3 py-2 rounded-lg bg-white dark:bg-[#121214] border border-gray-200 dark:border-white/10 text-[9px] font-black uppercase tracking-[0.12em] text-gray-700 dark:text-zinc-100 hover:bg-gray-50 dark:hover:bg-zinc-800 flex items-center gap-1.5">
            <FileSpreadsheet size={12} className="text-emerald-600" /> Exportar CSV
          </button>
          <button onClick={exportToPDF} className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-[9px] font-black uppercase tracking-[0.12em] hover:bg-indigo-700 flex items-center gap-1.5">
            <Printer size={12} /> Relatório PDF
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <MetricCard label="Receita" value={totalRevenue} sub="Crédito plano/cantina e venda avulsa PDV" icon={<TrendingUp size={16} />} color="bg-emerald-600" />
        <MetricCard label="Despesa" value={totalExpense} sub="Saídas operacionais e administrativas" icon={<TrendingDown size={16} />} color="bg-red-600" />
        <MetricCard label="Lucro" value={netProfit} sub="Receita - Despesa" icon={<DollarSign size={16} />} color={netProfit >= 0 ? 'bg-slate-900' : 'bg-amber-700'} />
      </div>

      <div className="dash-panel p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="text-xs font-black uppercase tracking-[0.12em] text-gray-700 flex items-center gap-2">
            <CreditCard size={14} className="text-indigo-500" /> Relatório de Formas de Pagamento (Recebido)
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setPaymentMethodViewFilter('ALL')}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                paymentMethodViewFilter === 'ALL'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => setPaymentMethodViewFilter('CORE')}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                paymentMethodViewFilter === 'CORE'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              Pix/Dinheiro/Cartão
            </button>
            <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg">
              Total recebido: R$ {paymentMethodVisibleReport.totalReceived.toFixed(2)}
            </span>
          </div>
        </div>

        {paymentMethodVisibleReport.rows.length === 0 ? (
          <div className="text-xs font-bold text-gray-400 uppercase tracking-[0.12em] py-4 text-center border border-dashed rounded-xl">
            Sem recebimentos no período selecionado.
          </div>
        ) : (
          <div className="space-y-2">
            {paymentMethodVisibleReport.rows.map((row) => (
              <div key={`payment-method-${row.method}`} className="bg-white border rounded-xl p-2.5">
                <div className="flex items-center justify-between text-xs font-black text-gray-800 mb-1.5">
                  <span>{row.method}</span>
                  <span>R$ {row.total.toFixed(2)} ({row.percentage.toFixed(1)}%)</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full bg-indigo-500"
                    style={{ width: `${Math.min(100, Math.max(0, row.percentage))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="dash-panel p-1.5">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <button
            onClick={() => setActiveSectionTab('LAUNCHES')}
            className={`px-3 py-2.5 rounded-lg text-[9px] font-black uppercase tracking-[0.12em] transition-all ${
              activeSectionTab === 'LAUNCHES'
                ? 'bg-indigo-600 text-white shadow'
                : 'bg-white dark:bg-zinc-900 text-gray-500 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800 border border-transparent dark:border-white/10'
            }`}
          >
            Lançamentos Financeiros
          </button>
          <button
            onClick={() => setActiveSectionTab('PENDING')}
            className={`px-3 py-2 rounded-lg text-[8px] font-black uppercase tracking-[0.1em] transition-all ${
              activeSectionTab === 'PENDING'
                ? 'bg-indigo-600 text-white shadow'
                : 'bg-white dark:bg-zinc-900 text-gray-500 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800 border border-transparent dark:border-white/10'
            }`}
          >
            Pendência e Saldo Negativo de Clientes
          </button>
          <button
            onClick={() => setActiveSectionTab('REMINDERS')}
            className={`px-3 py-2.5 rounded-lg text-[9px] font-black uppercase tracking-[0.12em] transition-all ${
              activeSectionTab === 'REMINDERS'
                ? 'bg-indigo-600 text-white shadow'
                : 'bg-white dark:bg-zinc-900 text-gray-500 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800 border border-transparent dark:border-white/10'
            }`}
          >
            Lembretes de Despesas
          </button>
          <button
            onClick={() => setActiveSectionTab('AUDIT')}
            className={`px-3 py-2.5 rounded-lg text-[9px] font-black uppercase tracking-[0.12em] transition-all ${
              activeSectionTab === 'AUDIT'
                ? 'bg-indigo-600 text-white shadow'
                : 'bg-white dark:bg-zinc-900 text-gray-500 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800 border border-transparent dark:border-white/10'
            }`}
          >
            Auditoria
          </button>
        </div>
      </div>

      {activeSectionTab === 'PENDING' && (
        <div className="dash-panel overflow-hidden">
          <div className="p-2.5 border-b bg-gray-50 flex items-center justify-between">
            <h3 className="text-[10px] font-black uppercase tracking-[0.1em] text-gray-700">Pendência e Saldo Negativo de Clientes</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={exportSelectedPendingToPDF}
                disabled={selectedPendingClientIds.length === 0}
                className={`px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-[0.12em] flex items-center gap-1.5 ${
                  selectedPendingClientIds.length === 0
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700'
                }`}
              >
                <Printer size={14} /> PDF Selecionados
              </button>
              <span className="text-[10px] font-black text-red-600">{filteredPendingClients.length} cliente(s)</span>
            </div>
          </div>
          <div className="p-3 border-b bg-white grid grid-cols-1 md:grid-cols-2 gap-2.5">
            <input
              type="text"
              value={pendingSearch}
              onChange={(e) => setPendingSearch(e.target.value)}
              placeholder="Filtrar por aluno, matrícula, responsável ou plano..."
              className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-transparent focus:border-indigo-500 outline-none text-xs font-semibold"
            />
            <select
              value={pendingTypeFilter}
              onChange={(e) => setPendingTypeFilter(e.target.value as 'ALL' | 'ALUNO' | 'COLABORADOR')}
              className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-transparent focus:border-indigo-500 outline-none text-[10px] font-black uppercase tracking-[0.12em]"
            >
              <option value="ALL">Todos os tipos</option>
              <option value="ALUNO">Somente aluno</option>
              <option value="COLABORADOR">Somente colaborador</option>
            </select>
          </div>
          <div className="overflow-x-auto max-h-[560px] xl:max-h-[680px]">
            <table className="w-full text-xs table-fixed">
              <thead className="sticky top-0 z-10 bg-gray-50 text-[9px] font-black uppercase tracking-[0.12em] text-gray-400">
                <tr>
                  <th className="px-2 py-2.5 text-left w-[3%]">
                    <input
                      type="checkbox"
                      checked={allFilteredPendingSelected}
                      onChange={(e) => toggleSelectAllFilteredPending(e.target.checked)}
                      className="w-3.5 h-3.5"
                    />
                  </th>
                  <th className="px-2 py-2.5 text-left w-[7%]">Matrícula</th>
                  <th className="px-3 py-2.5 text-left">Aluno/Cliente</th>
                  <th className="px-3 py-2.5 text-left">Turma</th>
                  <th className="px-3 py-2.5 text-left w-[12%]">Responsável</th>
                  <th className="px-3 py-2.5 text-left w-[16%]">Telefone</th>
                  <th className="px-3 py-2.5 text-left w-[12%]">Planos</th>
                  <th className="px-3 py-2.5 text-right w-[10%]">Pendência</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredPendingClients.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-400 font-bold uppercase text-xs">Sem pendências</td>
                  </tr>
                ) : filteredPendingClients.map((client) => (
                  <tr key={client.id}>
                    <td className="px-2 py-2.5 text-left">
                      <input
                        type="checkbox"
                        checked={selectedPendingClientIds.includes(client.id)}
                        onChange={(e) => toggleSelectPendingClient(client.id, e.target.checked)}
                        className="w-3.5 h-3.5"
                      />
                    </td>
                    <td className="px-2 py-2.5 text-gray-600 font-bold">{client.registrationId}</td>
                    <td className="px-3 py-3 font-black text-gray-800">
                      <div className="flex items-center gap-2">
                        <User size={12} className="text-indigo-500" />
                        <span>{client.name}</span>
                      </div>
                      <p className="text-[9px] text-gray-400 font-bold uppercase tracking-[0.12em] mt-1">{client.type}</p>
                    </td>
                    <td className="px-3 py-3 text-gray-700 font-bold">{client.turma || '-'}</td>
                    <td className="px-3 py-3 text-gray-700 font-bold">{client.responsibleName || '-'}</td>
                    <td className="px-3 py-3 text-gray-700 font-bold">{client.responsiblePhone || 'Não informado'}</td>
                    <td className="px-3 py-3 text-gray-700 font-bold max-w-[260px]">
                      <p className="truncate" title={client.plansActive.length > 0 ? client.plansActive.join(', ') : 'INATIVO'}>
                        {client.plansActive.length > 0 ? client.plansActive.join(', ') : 'INATIVO'}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-right font-black text-red-600">R$ {client.pendingAmount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeSectionTab === 'REMINDERS' && (
        <div className="dash-panel overflow-hidden">
          <div className="p-3 border-b bg-gray-50 flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-[0.12em] text-gray-700">Lembretes de Despesas</h3>
            <span className="text-[10px] font-black text-amber-600">{reminders.length} lembrete(s)</span>
          </div>
          <div className="p-3 border-b bg-white grid grid-cols-1 md:grid-cols-3 gap-2.5">
            <input
              type="text"
              value={reminderSearch}
              onChange={(e) => setReminderSearch(e.target.value)}
              placeholder="Filtrar por descrição, referência ou categoria..."
              className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-transparent focus:border-indigo-500 outline-none text-xs font-semibold"
            />
            <select
              value={reminderTimeFilter}
              onChange={(e) => setReminderTimeFilter(e.target.value as TimeFilter)}
              className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-transparent focus:border-indigo-500 outline-none text-[10px] font-black uppercase tracking-[0.12em]"
            >
              <option value="TODAY">Hoje</option>
              <option value="MONTH">Mês</option>
              <option value="YEAR">Ano</option>
              <option value="DATE">Data</option>
            </select>
            {reminderTimeFilter === 'DATE' ? (
              <input
                type="date"
                value={reminderSpecificDate}
                onChange={(e) => setReminderSpecificDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-transparent focus:border-indigo-500 outline-none text-[10px] font-black"
              />
            ) : (
              <div className="hidden md:block" />
            )}
          </div>
          <div className="overflow-x-auto max-h-[360px]">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-[9px] font-black uppercase tracking-[0.12em] text-gray-400">
                <tr>
                  <th className="px-3 py-2.5 text-left">Data Lembrete</th>
                  <th className="px-3 py-2.5 text-left">Descrição</th>
                  <th className="px-3 py-2.5 text-left">Referência</th>
                  <th className="px-3 py-2.5 text-right">Valor</th>
                  <th className="px-3 py-2.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {reminders.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-400 font-bold uppercase text-xs">Sem lembretes</td>
                  </tr>
                ) : reminders.map((tx) => (
                  <tr key={`rem_${tx.id}`}>
                    <td className="px-3 py-2.5 font-bold text-gray-700">{formatDateBr(tx.reminderDate)}</td>
                    <td className="px-3 py-2.5 text-gray-800 font-bold">{tx.description}</td>
                    <td className="px-3 py-2.5 text-gray-600 font-bold">{tx.monthReference || '-'}</td>
                    <td className="px-3 py-2.5 text-right font-black text-red-600">R$ {tx.amount.toFixed(2)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEditReminder(tx)}
                          className="px-2.5 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-widest text-indigo-600 border-indigo-200 hover:bg-indigo-50 flex items-center gap-1"
                        >
                          <Pencil size={12} /> Editar
                        </button>
                        <button
                          onClick={() => handleMarkReminderPaid(tx)}
                          className="px-2.5 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-widest text-emerald-600 border-emerald-200 hover:bg-emerald-50 flex items-center gap-1"
                        >
                          <CheckCircle2 size={12} /> Pago
                        </button>
                        {canHardDeleteTransactions && (
                          <button
                            onClick={() => handleDeleteReminder(tx)}
                            className="px-2.5 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-widest text-red-600 border-red-200 hover:bg-red-50 flex items-center gap-1"
                          >
                            <Trash2 size={12} /> Excluir
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeSectionTab === 'LAUNCHES' && (
      <div className="dash-panel overflow-hidden">
        <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
          <h3 className="text-xs font-black uppercase tracking-[0.12em] text-gray-700">Lançamentos Financeiros</h3>
          <span className="text-[10px] font-black text-gray-500">{isLoading ? 'Carregando...' : `${filteredLaunchTransactions.length} registro(s)`}</span>
        </div>
        <div className="p-3 border-b bg-white grid grid-cols-1 md:grid-cols-4 gap-2.5">
          <input
            type="text"
            value={launchSearch}
            onChange={(e) => setLaunchSearch(e.target.value)}
            placeholder="Filtrar por descrição, categoria ou cliente..."
            className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-transparent focus:border-indigo-500 outline-none text-xs font-semibold"
          />
          <select
            value={launchTypeFilter}
            onChange={(e) => setLaunchTypeFilter(e.target.value as 'ALL' | 'RECEITA' | 'DESPESA')}
            className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-transparent focus:border-indigo-500 outline-none text-[10px] font-black uppercase tracking-[0.12em]"
          >
            <option value="ALL">Todos os tipos</option>
            <option value="RECEITA">Receita</option>
            <option value="DESPESA">Despesa</option>
          </select>
          <select
            value={launchTimeFilter}
            onChange={(e) => setLaunchTimeFilter(e.target.value as TimeFilter)}
            className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-transparent focus:border-indigo-500 outline-none text-[10px] font-black uppercase tracking-[0.12em]"
          >
            <option value="TODAY">Hoje</option>
            <option value="MONTH">Mês</option>
            <option value="YEAR">Ano</option>
            <option value="DATE">Data</option>
          </select>
          {launchTimeFilter === 'DATE' ? (
            <input
              type="date"
              value={launchSpecificDate}
              onChange={(e) => setLaunchSpecificDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-transparent focus:border-indigo-500 outline-none text-[10px] font-black"
            />
          ) : (
            <div className="hidden md:block" />
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-[9px] font-black uppercase tracking-[0.12em] text-gray-400">
              <tr>
                <th className="px-3 py-2.5 text-left">Data/Hora</th>
                <th className="px-3 py-2.5 text-left">Tipo</th>
                <th className="px-3 py-2.5 text-left">Categoria</th>
                <th className="px-3 py-2.5 text-left">Descrição</th>
                <th className="px-3 py-2.5 text-left">Responsável Pagante</th>
                <th className="px-3 py-2.5 text-right">Qtd</th>
                <th className="px-3 py-2.5 text-right">Unitário</th>
                <th className="px-3 py-2.5 text-right">Valor</th>
                <th className="px-3 py-2.5 text-left">Vencimento</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredLaunchTransactions.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-400 font-bold uppercase text-xs">Sem lançamentos no período</td>
                </tr>
              ) : filteredLaunchTransactions.map((tx) => {
                const isDeletionAdjustment = isDeletionAdjustmentTx(tx);
                return (
                <tr key={tx.id} className={isDeletionAdjustment ? 'bg-amber-50/40' : undefined}>
                  <td className="px-3 py-2.5 font-bold text-gray-700">{formatDateBr(tx.date)} {tx.time}</td>
                  <td className="px-3 py-2.5">
                    <span className={`text-[10px] font-black uppercase px-2 py-1 rounded ${tx.type === 'RECEITA' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                      {tx.type}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-gray-700 font-bold">
                    <div className="flex items-center gap-2">
                      <span>{tx.category}</span>
                      {isDeletionAdjustment && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200">
                          Ajuste por Exclusao
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-gray-800 font-bold">{tx.description}</td>
                  <td className="px-3 py-2.5 text-gray-700 font-bold">{tx.payerResponsibleName || '-'}</td>
                  <td className="px-3 py-2.5 text-right font-bold">{tx.quantity}</td>
                  <td className="px-3 py-2.5 text-right font-bold">R$ {tx.unitPrice.toFixed(2)}</td>
                  <td className={`px-3 py-2.5 text-right font-black ${tx.type === 'RECEITA' ? 'text-emerald-700' : 'text-red-700'}`}>
                    {tx.type === 'RECEITA' ? '+' : '-'} R$ {tx.amount.toFixed(2)}
                  </td>
                  <td className="px-3 py-2.5 text-gray-600 font-bold">{tx.dueDate ? formatDateBr(tx.dueDate) : '-'}</td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {activeSectionTab === 'AUDIT' && (
      <div className="dash-panel overflow-hidden">
        <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
          <h3 className="text-xs font-black uppercase tracking-[0.12em] text-gray-700">Auditoria</h3>
          <span className="text-[10px] font-black text-gray-500">{isLoading ? 'Carregando...' : `${filteredAuditTransactions.length} registro(s)`}</span>
        </div>
        <div className="p-3 border-b bg-white grid grid-cols-1 md:grid-cols-3 gap-2.5">
          <input
            type="text"
            value={auditSearch}
            onChange={(e) => setAuditSearch(e.target.value)}
            placeholder="Filtrar por ARD, descrição, categoria, tipo, aluno/colaborador ou usuário..."
            className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-transparent focus:border-indigo-500 outline-none text-xs font-semibold"
          />
          <select
            value={auditTimeFilter}
            onChange={(e) => setAuditTimeFilter(e.target.value as TimeFilter)}
            className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-transparent focus:border-indigo-500 outline-none text-[10px] font-black uppercase tracking-[0.12em]"
          >
            <option value="TODAY">Hoje</option>
            <option value="MONTH">Mês</option>
            <option value="YEAR">Ano</option>
            <option value="DATE">Data</option>
          </select>
          {auditTimeFilter === 'DATE' ? (
            <input
              type="date"
              value={auditSpecificDate}
              onChange={(e) => setAuditSpecificDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-transparent focus:border-indigo-500 outline-none text-[10px] font-black"
            />
          ) : (
            <div className="hidden md:block" />
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-[9px] font-black uppercase tracking-[0.12em] text-gray-400">
              <tr>
                <th className="px-3 py-2.5 text-left">Data/Hora</th>
                <th className="px-3 py-2.5 text-left">Tipo</th>
                <th className="px-3 py-2.5 text-left">ARD</th>
                <th className="px-3 py-2.5 text-left">Aluno/Colaborador</th>
                <th className="px-3 py-2.5 text-left">Usuário</th>
                <th className="px-3 py-2.5 text-left">Categoria</th>
                <th className="px-3 py-2.5 text-left">Descrição</th>
                <th className="px-3 py-2.5 text-left">Item/Plano • Qtd Auditada</th>
                <th className="px-3 py-2.5 text-right">Unitário</th>
                <th className="px-3 py-2.5 text-right">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredAuditTransactions.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-gray-400 font-bold uppercase text-xs">Sem registros de auditoria no período</td>
                </tr>
              ) : filteredAuditTransactions.map((tx) => (
                <tr key={`audit_${tx.id}`}>
                  <td className="px-3 py-2.5 font-bold text-gray-700">{formatDateBr(tx.date)} {tx.time}</td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200">
                      {tx.rawType || tx.type}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-black text-gray-700">{tx.id}</td>
                  <td className="px-3 py-2.5 text-gray-800 font-bold">{tx.client || '-'}</td>
                  <td className="px-3 py-2.5 text-gray-700 font-bold">{tx.userName || 'SISTEMA'}</td>
                  <td className="px-3 py-2.5 text-gray-700 font-bold">{tx.category || '-'}</td>
                  <td className="px-3 py-2.5 text-gray-800 font-bold">{tx.description}</td>
                  <td className="px-3 py-2.5">
                    <div className="inline-flex items-center gap-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${tx.auditedItemType === 'PLANO' ? 'bg-indigo-100 text-indigo-800 border-indigo-200' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                        {tx.auditedItemType || 'ITEM'}
                      </span>
                      <span className="text-[10px] font-black text-gray-700 uppercase tracking-wide">
                        Qtd: {Number(tx.auditedQuantity || tx.quantity || 1)}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right font-bold text-gray-700">R$ {Number(tx.unitPrice || 0).toFixed(2)}</td>
                  <td className="px-3 py-2.5 text-right font-black text-indigo-700">R$ {Number(tx.amount || 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {pendingClients.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3 text-amber-800">
          <AlertTriangle size={18} className="mt-0.5" />
          <p className="text-sm font-bold">Existem clientes com pendência financeira. Priorize cobrança/regularização para reduzir inadimplência da unidade.</p>
        </div>
      )}

      {isEntryModalOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={closeEntryModal}></div>
          <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border overflow-hidden">
            <div className={`px-5 py-4 flex items-center justify-between ${entryType === 'RECEITA' ? 'bg-emerald-600' : 'bg-red-600'} text-white`}>
              <h3 className="text-sm font-black uppercase tracking-widest">{editingEntryId ? `Editar ${entryType}` : `Inserir ${entryType}`}</h3>
              <button onClick={closeEntryModal} className="p-1 hover:bg-white/20 rounded">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Descrição</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full mt-1 px-3 py-2.5 rounded-xl bg-gray-50 border-2 border-transparent focus:border-indigo-500 outline-none text-sm font-bold"
                  placeholder={entryType === 'RECEITA' ? 'Ex: Crédito cantina manual' : 'Ex: Compra de material de limpeza'}
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Categoria</label>
                <div className="mt-1 flex items-center gap-2">
                  <select
                    value={categoryMode}
                    onChange={(e) => setCategoryMode(e.target.value as 'SELECT' | 'NEW')}
                    className="px-3 py-2.5 rounded-xl bg-gray-50 border-2 border-transparent focus:border-indigo-500 outline-none text-xs font-black uppercase tracking-widest"
                  >
                    <option value="SELECT">Selecionar</option>
                    <option value="NEW">Nova Categoria</option>
                  </select>
                  {categoryMode === 'SELECT' ? (
                    <select
                      value={selectedCategory}
                      onChange={(e) => setSelectedCategory(e.target.value)}
                      className="flex-1 px-3 py-2.5 rounded-xl bg-gray-50 border-2 border-transparent focus:border-indigo-500 outline-none text-xs font-black uppercase tracking-widest"
                    >
                      {availableCategories.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
                      className="flex-1 px-3 py-2.5 rounded-xl bg-gray-50 border-2 border-transparent focus:border-indigo-500 outline-none text-sm font-bold"
                      placeholder="Digite a nova categoria"
                    />
                  )}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Data do Lançamento</label>
                <input
                  type="date"
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  className="w-full mt-1 px-3 py-2.5 rounded-xl bg-gray-50 border-2 border-transparent focus:border-indigo-500 outline-none text-xs font-black"
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Quantidade</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full mt-1 px-3 py-2.5 rounded-xl bg-gray-50 border-2 border-transparent focus:border-indigo-500 outline-none text-sm font-bold"
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Valor Unitário (R$)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                  className="w-full mt-1 px-3 py-2.5 rounded-xl bg-gray-50 border-2 border-transparent focus:border-indigo-500 outline-none text-sm font-bold"
                />
              </div>

              {entryType === 'DESPESA' && (
                <>
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Vencimento (opcional)</label>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="w-full mt-1 px-3 py-2.5 rounded-xl bg-gray-50 border-2 border-transparent focus:border-indigo-500 outline-none text-xs font-black"
                    />
                  </div>

                  <div className="md:col-span-2 border rounded-xl p-3 bg-gray-50 space-y-3">
                    <label className="flex items-center gap-2 text-xs font-black text-gray-700 uppercase tracking-widest">
                      <input
                        type="checkbox"
                        checked={hasReminder}
                        onChange={(e) => setHasReminder(e.target.checked)}
                        className="w-4 h-4"
                      />
                      Criar lembrete de despesa
                    </label>

                    {hasReminder && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Data do lembrete</label>
                          <input
                            type="date"
                            value={reminderDate}
                            onChange={(e) => setReminderDate(e.target.value)}
                            className="w-full mt-1 px-3 py-2.5 rounded-xl bg-white border-2 border-transparent focus:border-indigo-500 outline-none text-xs font-black"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Descrição referência do mês</label>
                          <input
                            type="text"
                            value={monthReference}
                            onChange={(e) => setMonthReference(e.target.value)}
                            placeholder="Ex: Março/2026 - Vale transporte"
                            className="w-full mt-1 px-3 py-2.5 rounded-xl bg-white border-2 border-transparent focus:border-indigo-500 outline-none text-sm font-bold"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              <div className="md:col-span-2 bg-indigo-50 border border-indigo-100 rounded-xl p-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500">Total</p>
                <p className="text-2xl font-black text-indigo-700">R$ {(Number(quantity || 0) * Number(unitPrice || 0)).toFixed(2)}</p>
              </div>
            </div>
            <div className="p-4 border-t bg-gray-50 flex justify-end gap-2">
              <button onClick={closeEntryModal} className="px-4 py-2 rounded-xl bg-white border text-xs font-black uppercase tracking-widest text-gray-600">Cancelar</button>
              <button
                onClick={handleSaveEntry}
                disabled={isSavingEntry}
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest text-white ${entryType === 'RECEITA' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'} disabled:opacity-60`}
              >
                {isSavingEntry ? 'Salvando...' : (editingEntryId ? `Atualizar ${entryType}` : `Salvar ${entryType}`)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const MetricCard = ({ label, value, sub, icon, color }: { label: string; value: number; sub: string; icon: React.ReactElement; color: string }) => (
  <div className={`${color} rounded-xl px-3 py-2 text-white flex items-center justify-between min-h-[64px]`}>
    <div>
      <p className="text-[8px] font-black uppercase tracking-[0.12em] opacity-80">{label}</p>
      <p className="text-sm sm:text-base font-black leading-tight">R$ {Number(value || 0).toFixed(2)}</p>
      <p className="text-[7px] font-bold uppercase tracking-[0.09em] opacity-80">{sub}</p>
    </div>
    <div className="p-1.5 rounded-md bg-white/15">
      {icon}
    </div>
  </div>
);

export default FinancialPage;
