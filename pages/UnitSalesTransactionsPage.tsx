
import React, { useState, useMemo, useEffect } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  ReceiptText, Calendar, Filter, Clock, Search, 
  Smartphone, CreditCard, Banknote, Wallet, 
  ArrowUpRight, ArrowDownRight, User, Sparkles,
  ChevronRight, ArrowRight, Layers, FileSpreadsheet,
  Printer, DollarSign, History, AlertCircle, ShoppingBag,
  Building, ChevronDown, CheckCircle2, Store, ListFilter,
  Tag, UserCircle, Eye, X, Trash2, Pencil
} from 'lucide-react';
import { Client, Enterprise, TransactionRecord } from '../types';
import { ApiService } from '../services/api';
import { formatPhoneWithCountryTag } from '../utils/phone';

interface UnitSalesTransactionsPageProps {
  activeEnterprise: Enterprise;
  transactions: TransactionRecord[];
}

type TimeFilter = 'TODAY' | '7DAYS' | 'MONTH' | 'YEAR' | 'CUSTOM';
type TransactionType = 'ALL' | 'CONSUMO' | 'VENDA_BALCAO' | 'CREDITO';
type EditCartItem = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  type: 'PRODUCT' | 'PLAN';
  planId?: string;
};
type ExtendedTransactionRecord = TransactionRecord & {
  raw?: any;
  clientId?: string | null;
  planId?: string;
  referenceDate?: string;
  quantity?: number;
  unitPrice?: number;
  description?: string;
  executionSource?: 'USUARIO' | 'SISTEMA';
};

type TransactionItemDetail = {
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

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
  return parsed.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
};

const resolveTransactionReferenceDate = (tx: any): string => {
  const fromPayload = String(tx?.deliveryDate || tx?.scheduledDate || tx?.mealDate || '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(fromPayload)) return fromPayload;

  const description = String(tx?.description || tx?.item || '');
  const isoMatch = description.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (isoMatch?.[1]) return isoMatch[1];

  const brMatch = description.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
  if (brMatch) {
    const [, dd, mm, yyyy] = brMatch;
    return `${yyyy}-${mm}-${dd}`;
  }

  return '';
};

const normalizeSearchText = (value?: string) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const getTransactionItemDetails = (row: ExtendedTransactionRecord): TransactionItemDetail[] => {
  const rawItems = Array.isArray(row.raw?.items) ? row.raw.items : [];
  if (rawItems.length > 0) {
    return rawItems.map((item: any, idx: number) => {
      const name = String(item?.name || item?.productName || `Item ${idx + 1}`).trim() || `Item ${idx + 1}`;
      const quantity = Math.max(1, Number(item?.quantity || 1));
      const unitPrice = Number(item?.price ?? item?.unitPrice ?? 0) || 0;
      const total = Number(item?.total ?? (quantity * unitPrice)) || 0;
      return { name, quantity, unitPrice, total };
    });
  }

  const parts = String(row.item || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length > 0) {
    const parsed = parts.map((part) => {
      const qtyMatch = /^(\d+)x\s+(.+)$/i.exec(part);
      if (qtyMatch) {
        return {
          name: qtyMatch[2].trim(),
          quantity: Math.max(1, Number(qtyMatch[1] || 1)),
        };
      }
      return { name: part, quantity: 1 };
    });
    const rowTotal = Number(row.value || row.total || 0);
    const safeTotal = Number.isFinite(rowTotal) ? rowTotal : 0;
    const unitFallback = parsed.length > 0 ? safeTotal / parsed.reduce((sum, item) => sum + item.quantity, 0) : 0;
    return parsed.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unitPrice: unitFallback,
      total: unitFallback * item.quantity,
    }));
  }

  return [];
};

const formatTransactionItemsForExport = (row: ExtendedTransactionRecord) => {
  const items = getTransactionItemDetails(row);
  if (items.length === 0) return String(row.item || '-');
  return items
    .map((item) => `${item.quantity}x ${item.name} (R$ ${item.total.toFixed(2)})`)
    .join(' | ');
};

const formatUnitsProgressValue = (value: number) => {
  const safe = Number(value || 0);
  if (!Number.isFinite(safe)) return '0';
  const rounded = Math.round((safe + Number.EPSILON) * 100) / 100;
  if (Math.abs(rounded - Math.trunc(rounded)) < 0.000001) return String(Math.trunc(rounded));
  return rounded.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

const buildUnitsProgressLabel = (remaining: number, total: number) =>
  `${formatUnitsProgressValue(remaining)}/${formatUnitsProgressValue(total)}`;

const resolveExecutionSource = (tx: any): 'USUARIO' | 'SISTEMA' => {
  const rawSource = String(tx?.executionSource || tx?.source || tx?.origin || '').trim().toUpperCase();
  if (rawSource === 'SISTEMA') return 'SISTEMA';
  if (rawSource === 'USUARIO' || rawSource === 'USUÁRIO') return 'USUARIO';

  const txId = String(tx?.id || '').toLowerCase();
  if (txId.startsWith('tx_autodeliv_')) return 'SISTEMA';
  return 'USUARIO';
};

const UnitSalesTransactionsPage: React.FC<UnitSalesTransactionsPageProps> = ({ activeEnterprise, transactions }) => {
  // Guard clause: se não houver enterprise ativa, retornar carregamento
  if (!activeEnterprise) {
    return (
      <div className="dash-shell transactions-shell min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin inline-block w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full"></div>
          <p className="text-gray-600 dark:text-zinc-300 font-medium">Carregando transações...</p>
        </div>
      </div>
    );
  }

  const [timeFilter, setTimeFilter] = useState<TimeFilter>('TODAY');
  const [typeFilter, setTypeFilter] = useState<TransactionType>('ALL');
  const [planFilter, setPlanFilter] = useState<string>('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTransaction, setSelectedTransaction] = useState<ExtendedTransactionRecord | null>(null);
  const [backendTransactions, setBackendTransactions] = useState<ExtendedTransactionRecord[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [editingTransaction, setEditingTransaction] = useState<ExtendedTransactionRecord | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSavingCreate, setIsSavingCreate] = useState(false);
  const [editProducts, setEditProducts] = useState<any[]>([]);
  const [editPlans, setEditPlans] = useState<any[]>([]);
  const [createClients, setCreateClients] = useState<any[]>([]);
  const [editSearch, setEditSearch] = useState('');
  const [editActiveCategory, setEditActiveCategory] = useState('TODOS');
  const [editCart, setEditCart] = useState<EditCartItem[]>([]);
  const [editPaymentMethod, setEditPaymentMethod] = useState('N/A');
  const [editCreditType, setEditCreditType] = useState<'CANTINA' | 'PLAN'>('CANTINA');
  const [editCreditPlanId, setEditCreditPlanId] = useState('');
  const [editCreditValue, setEditCreditValue] = useState('0');
  const [createSearch, setCreateSearch] = useState('');
  const [createActiveCategory, setCreateActiveCategory] = useState('TODOS');
  const [createCart, setCreateCart] = useState<EditCartItem[]>([]);
  const [createPaymentMethod, setCreatePaymentMethod] = useState('PIX');
  const [createClientName, setCreateClientName] = useState('');
  const [createIsConsumerFinal, setCreateIsConsumerFinal] = useState(false);
  const [showCreateClientSuggestions, setShowCreateClientSuggestions] = useState(false);
  const [createDate, setCreateDate] = useState('');
  const [createTime, setCreateTime] = useState('');
  const [hasLoadedBackendTransactions, setHasLoadedBackendTransactions] = useState(false);
  const [isClearingTransactions, setIsClearingTransactions] = useState(false);
  const [reloadTransactionsKey, setReloadTransactionsKey] = useState(0);
  const [deletingTransactionId, setDeletingTransactionId] = useState<string | null>(null);

  useEffect(() => {
    const enterpriseId = activeEnterprise?.id;
    if (!enterpriseId) {
      setBackendTransactions([]);
      setHasLoadedBackendTransactions(true);
      return;
    }

    const loadBackendTransactions = async () => {
      setHasLoadedBackendTransactions(false);
      try {
        const rawTransactions = await ApiService.getTransactions({ enterpriseId });
        const normalized = (Array.isArray(rawTransactions) ? rawTransactions : [])
          .map((tx: any): ExtendedTransactionRecord | null => {
            const rawType = String(tx?.type || '').toUpperCase();
            const mappedType = rawType === 'VENDA_BALCAO'
              ? 'VENDA_BALCAO'
              : (rawType === 'DEBIT' || rawType === 'CONSUMO'
                ? 'CONSUMO'
                : (rawType === 'CREDIT' || rawType === 'CREDITO' ? 'CREDITO' : null));

            if (!mappedType) return null;

            const timestamp = tx?.timestamp ? new Date(tx.timestamp) : null;
            const hasValidTimestamp = timestamp && !Number.isNaN(timestamp.getTime());
            const date = tx?.date || (hasValidTimestamp ? toLocalDateKey(timestamp as Date) : '');
            const time = tx?.time || (hasValidTimestamp
              ? timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
              : '');

            const total = Number(tx?.total ?? tx?.amount ?? tx?.value ?? 0);
            const executionSource = resolveExecutionSource(tx);
            const referenceDate = resolveTransactionReferenceDate(tx);

            return {
              id: String(tx?.id || `tx_${Date.now()}`),
              date,
              time,
              client: String(tx?.client || tx?.clientName || 'Consumidor Final'),
              plan: String(tx?.plan || (tx?.clientId ? 'PLANO' : 'AVULSO')),
              item: String(tx?.item || tx?.description || 'Sem itens'),
              type: mappedType,
              method: String(tx?.method || tx?.paymentMethod || 'N/A'),
              total: Number.isFinite(total) ? total : 0,
              status: executionSource === 'SISTEMA' ? 'SISTEMA' : 'USUÁRIO',
              executionSource,
              referenceDate,
              raw: tx,
              clientId: tx?.clientId || null,
              planId: tx?.planId,
              quantity: Number(tx?.quantity || 1),
              unitPrice: Number(tx?.unitPrice || (Number.isFinite(total) && total > 0 ? total / Math.max(1, Number(tx?.quantity || 1)) : 0)),
              description: String(tx?.description || tx?.item || '')
            };
          })
          .filter(Boolean) as ExtendedTransactionRecord[];

        setBackendTransactions(normalized);
      } catch (err) {
        console.error('Erro ao carregar transações do backend:', err);
        setBackendTransactions([]);
      } finally {
        setHasLoadedBackendTransactions(true);
      }
    };

    loadBackendTransactions();
  }, [activeEnterprise?.id, reloadTransactionsKey]);

  useEffect(() => {
    const enterpriseId = activeEnterprise?.id;
    if (!enterpriseId) {
      setClients([]);
      return;
    }
    let mounted = true;
    ApiService.getClients(enterpriseId)
      .then((list) => {
        if (!mounted) return;
        setClients(Array.isArray(list) ? list : []);
      })
      .catch((err) => {
        console.error('Erro ao carregar clientes para relatório de transações:', err);
      });
    return () => {
      mounted = false;
    };
  }, [activeEnterprise?.id]);

  useEffect(() => {
    const enterpriseId = activeEnterprise?.id;
    if (!enterpriseId) {
      setEditProducts([]);
      setEditPlans([]);
      setCreateClients([]);
      return;
    }

    const loadCatalog = async () => {
      try {
        const [products, plans, clients] = await Promise.all([
          ApiService.getProducts(enterpriseId),
          ApiService.getPlans(enterpriseId),
          ApiService.getClients(enterpriseId)
        ]);
        setEditProducts(Array.isArray(products) ? products.filter((p: any) => p.isActive !== false) : []);
        setEditPlans(Array.isArray(plans) ? plans.filter((p: any) => p.isActive !== false) : []);
        setCreateClients(Array.isArray(clients) ? clients : []);
      } catch (error) {
        console.error('Erro ao carregar catálogo para edição:', error);
        setEditProducts([]);
        setEditPlans([]);
        setCreateClients([]);
      }
    };

    loadCatalog();
  }, [activeEnterprise?.id]);

  const handleClearAllTransactions = async () => {
    const confirmed = window.confirm('Tem certeza que deseja apagar TODAS as transações do sistema? Esta ação não pode ser desfeita.');
    if (!confirmed) return;

    setIsClearingTransactions(true);
    try {
      await ApiService.clearAllTransactions();
      setBackendTransactions([]);
      setReloadTransactionsKey(prev => prev + 1);
      setSelectedTransaction(null);
      alert('✅ Todas as transações foram removidas.');
    } catch (err) {
      console.error('Erro ao limpar transações:', err);
      alert('❌ Erro ao limpar transações.');
    } finally {
      setIsClearingTransactions(false);
    }
  };

  const sourceTransactions: ExtendedTransactionRecord[] = hasLoadedBackendTransactions
    ? backendTransactions
    : (transactions || []).map((tx) => ({ ...tx, raw: tx }));

  const normalizedPlanName = (value?: string) => String(value || '').trim().toUpperCase();
  const GENERIC_ORIGIN_NAMES = new Set(['', 'PLANO', 'PREPAGO', 'AVULSO', 'CANTINA', 'CREDITO CANTINA', 'CRÉDITO CANTINA', 'VENDA']);

  const createdPlansById = useMemo(() => {
    const map = new Map<string, string>();
    editPlans.forEach((plan: any) => {
      const id = String(plan?.id || '').trim();
      const name = String(plan?.name || '').trim();
      if (id && name) map.set(id, name);
    });
    return map;
  }, [editPlans]);

  const createdPlansByName = useMemo(() => {
    const map = new Map<string, string>();
    editPlans.forEach((plan: any) => {
      const name = String(plan?.name || '').trim();
      if (!name) return;
      map.set(normalizedPlanName(name), name);
    });
    return map;
  }, [editPlans]);

  const resolvePlanOrigin = (row: ExtendedTransactionRecord) => {
    const rawType = normalizedPlanName(String(row.raw?.type || row.type || ''));
    const planId = String(row.raw?.planId || row.planId || '').trim();
    const rawPlan = String(row.raw?.plan || row.plan || '').trim();
    const rawPlanUpper = normalizedPlanName(rawPlan);
    const rawMethod = normalizedPlanName(String(row.raw?.method || row.raw?.paymentMethod || row.method || ''));
    const description = normalizedPlanName(String(row.raw?.description || row.description || row.item || ''));
    const item = normalizedPlanName(String(row.raw?.item || row.item || ''));

    if (planId && createdPlansById.has(planId)) {
      return createdPlansById.get(planId) as string;
    }

    if (rawPlanUpper && createdPlansByName.has(rawPlanUpper)) {
      return createdPlansByName.get(rawPlanUpper) as string;
    }

    if (rawPlanUpper && !GENERIC_ORIGIN_NAMES.has(rawPlanUpper)) {
      return rawPlan;
    }

    const isCantinaCredit = (rawType === 'CREDIT' || rawType === 'CREDITO')
      && (description.includes('CANTINA') || item.includes('CANTINA') || rawPlanUpper === 'PREPAGO' || rawPlanUpper === 'CANTINA');

    if (isCantinaCredit) return 'Crédito Cantina';

    const isCantinaBalanceConsumption = (rawType === 'DEBIT' || rawType === 'CONSUMO' || rawType === 'VENDA_BALCAO')
      && (rawMethod === 'SALDO' || rawMethod === 'CARTEIRA' || description.includes('SALDO CANTINA') || item.includes('SALDO CANTINA'));
    if (isCantinaBalanceConsumption) return 'Crédito Cantina';

    if (rawType === 'VENDA_BALCAO') return 'Venda';

    if (rawType === 'CREDIT' || rawType === 'CREDITO') return 'Crédito Cantina';

    return 'Venda';
  };

  const normalizedTransactions = useMemo(() => {
    return sourceTransactions.map((row) => ({
      ...row,
      plan: resolvePlanOrigin(row)
    }));
  }, [sourceTransactions, createdPlansById, createdPlansByName]);

  const clientPlanProgressLookup = useMemo(() => {
    const byClientPlanId = new Map<string, string>();
    const byClientPlanName = new Map<string, string>();
    clients.forEach((client: any) => {
      const clientId = String(client?.id || '').trim();
      if (!clientId) return;
      const balances = client?.planCreditBalances && typeof client.planCreditBalances === 'object'
        ? Object.values(client.planCreditBalances)
        : [];
      (Array.isArray(balances) ? balances : []).forEach((entry: any) => {
        const planId = String(entry?.planId || '').trim();
        const planName = normalizedPlanName(String(entry?.planName || ''));
        const directProgress = String(entry?.unitsProgress || '').trim();
        const balanceUnits = Number(entry?.balanceUnits);
        const totalUnits = Number(entry?.totalUnits);
        const resolvedProgress = directProgress
          || (Number.isFinite(balanceUnits) && Number.isFinite(totalUnits) && totalUnits > 0
            ? buildUnitsProgressLabel(Math.max(0, balanceUnits), Math.max(balanceUnits, totalUnits))
            : '');
        if (!resolvedProgress) return;
        if (planId) byClientPlanId.set(`${clientId}|${planId}`, resolvedProgress);
        if (planName) byClientPlanName.set(`${clientId}|${planName}`, resolvedProgress);
      });
    });
    return { byClientPlanId, byClientPlanName };
  }, [clients]);

  const consumedPlanProgressLookup = useMemo(() => {
    const byClientPlanId = new Map<string, string>();
    const byClientPlanName = new Map<string, string>();
    const planUnitValueByClientPlanId = new Map<string, number>();
    const planUnitValueByClientPlanName = new Map<string, number>();
    const catalogUnitByPlanName = new Map<string, number>();

    editPlans.forEach((plan: any) => {
      const planName = normalizedPlanName(String(plan?.name || ''));
      const unitValue = Number(plan?.price ?? plan?.unitPrice ?? plan?.amount ?? plan?.value ?? 0);
      if (planName && Number.isFinite(unitValue) && unitValue > 0) {
        catalogUnitByPlanName.set(planName, unitValue);
      }
    });

    clients.forEach((client: any) => {
      const clientId = String(client?.id || '').trim();
      if (!clientId) return;
      const balances = client?.planCreditBalances && typeof client.planCreditBalances === 'object'
        ? Object.values(client.planCreditBalances)
        : [];
      (Array.isArray(balances) ? balances : []).forEach((entry: any) => {
        const planId = String(entry?.planId || '').trim();
        const planName = normalizedPlanName(String(entry?.planName || ''));
        const unitValue = Number(entry?.unitValue ?? entry?.planPrice ?? entry?.price ?? 0);
        if (!Number.isFinite(unitValue) || unitValue <= 0) return;
        if (planId) planUnitValueByClientPlanId.set(`${clientId}|${planId}`, unitValue);
        if (planName) planUnitValueByClientPlanName.set(`${clientId}|${planName}`, unitValue);
      });
    });

    const resolveTxTimestamp = (row: ExtendedTransactionRecord) => {
      const rawTs = new Date(String(row.raw?.timestamp || '')).getTime();
      if (Number.isFinite(rawTs) && rawTs > 0) return rawTs;
      const dateKey = String(row.date || '').slice(0, 10);
      const timeKey = String(row.time || '00:00').slice(0, 5);
      const composed = new Date(`${dateKey}T${timeKey || '00:00'}:00`).getTime();
      if (Number.isFinite(composed) && composed > 0) return composed;
      const fallbackDate = parseDateOnly(row.date);
      return fallbackDate ? fallbackDate.getTime() : 0;
    };
    const resolveEffectiveDateKey = (row: ExtendedTransactionRecord) => {
      const direct = String(row.raw?.deliveryDate || row.raw?.scheduledDate || row.raw?.mealDate || row.date || '').slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) return direct;
      const description = String(row.raw?.description || row.raw?.item || row.description || row.item || '');
      const isoMatch = description.match(/\b(\d{4}-\d{2}-\d{2})\b/);
      if (isoMatch?.[1]) return isoMatch[1];
      const brMatch = description.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
      if (brMatch) {
        const [, dd, mm, yyyy] = brMatch;
        return `${yyyy}-${mm}-${dd}`;
      }
      return '0000-00-00';
    };

    const readAmount = (row: ExtendedTransactionRecord) => {
      const raw = Number(row.raw?.amount ?? row.raw?.total ?? row.raw?.value ?? row.total ?? row.value ?? 0);
      return Number.isFinite(raw) ? raw : 0;
    };

    const resolveUnits = (row: ExtendedTransactionRecord, unitValue: number) => {
      const rawDirect = Number(row.raw?.planUnits ?? row.raw?.balanceUnits ?? row.raw?.units ?? row.raw?.quantity ?? row.quantity);
      if (Number.isFinite(rawDirect) && Math.abs(rawDirect) > 0) return Math.abs(rawDirect);

      const amount = Math.abs(readAmount(row));
      if (amount > 0 && unitValue > 0) return amount / unitValue;

      const text = normalizedPlanName(`${row.raw?.description || ''} ${row.raw?.item || ''} ${row.description || ''} ${row.item || ''}`);
      if (text.includes('ENTREGA DO DIA') || text.includes('CONSUMO DE 1 UNIDADE')) return 1;
      if (row.type === 'CONSUMO') return 1;
      return 0;
    };

    type State = { purchasedUnits: number; consumedUnits: number };
    const stateByClientPlan = new Map<string, State>();
    const canonicalKeyByClientPlanId = new Map<string, string>();
    const canonicalKeyByClientPlanName = new Map<string, string>();
    const resolveCanonicalKey = (clientId: string, planId: string, planName: string) => {
      const byIdKey = planId ? canonicalKeyByClientPlanId.get(`${clientId}|${planId}`) : '';
      if (byIdKey) {
        if (planName) canonicalKeyByClientPlanName.set(`${clientId}|${planName}`, byIdKey);
        return byIdKey;
      }
      const byNameKey = planName ? canonicalKeyByClientPlanName.get(`${clientId}|${planName}`) : '';
      if (byNameKey) {
        if (planId) canonicalKeyByClientPlanId.set(`${clientId}|${planId}`, byNameKey);
        return byNameKey;
      }
      const fresh = `${clientId}|${planId || planName}`;
      if (planId) canonicalKeyByClientPlanId.set(`${clientId}|${planId}`, fresh);
      if (planName) canonicalKeyByClientPlanName.set(`${clientId}|${planName}`, fresh);
      return fresh;
    };
    const sorted = [...normalizedTransactions].sort((a, b) => {
      const aDateKey = resolveEffectiveDateKey(a);
      const bDateKey = resolveEffectiveDateKey(b);
      if (aDateKey !== bDateKey) return aDateKey.localeCompare(bDateKey);
      const aTs = resolveTxTimestamp(a);
      const bTs = resolveTxTimestamp(b);
      if (aTs !== bTs) return aTs - bTs;
      return String(a.id || '').localeCompare(String(b.id || ''));
    });

    sorted.forEach((row) => {
      const clientId = String(row.clientId || row.raw?.clientId || '').trim();
      const planId = String(row.raw?.planId || row.planId || '').trim();
      const planName = normalizedPlanName(String(row.raw?.plan || row.raw?.planName || row.plan || row.item || ''));
      const isPlanRow = row.plan !== 'Venda' && row.plan !== 'Crédito Cantina';
      if (!clientId || !isPlanRow || (!planId && !planName)) return;

      const key = resolveCanonicalKey(clientId, planId, planName);
      const state = stateByClientPlan.get(key) || { purchasedUnits: 0, consumedUnits: 0 };
      const lookupKeyById = `${clientId}|${planId}`;
      const lookupKeyByName = `${clientId}|${planName}`;
      const resolvedUnitValue = Number(
        row.raw?.planUnitValue
        ?? row.raw?.unitValue
        ?? row.raw?.planPrice
        ?? (planId ? planUnitValueByClientPlanId.get(lookupKeyById) : undefined)
        ?? planUnitValueByClientPlanName.get(lookupKeyByName)
        ?? catalogUnitByPlanName.get(planName)
        ?? 0
      );
      const unitValue = Number.isFinite(resolvedUnitValue) && resolvedUnitValue > 0 ? resolvedUnitValue : 0;
      const units = Math.max(0, Number(resolveUnits(row, unitValue) || 0));
      if (units <= 0) return;

      if (row.type === 'CREDITO') {
        state.purchasedUnits += units;
        stateByClientPlan.set(key, state);
        return;
      }

      if (row.type === 'CONSUMO') {
        state.consumedUnits += units;
        if (state.consumedUnits < 0) state.consumedUnits = 0;
        if (state.purchasedUnits < state.consumedUnits) state.purchasedUnits = state.consumedUnits;
        stateByClientPlan.set(key, state);
      }
    });

    const labelByCanonical = new Map<string, string>();
    stateByClientPlan.forEach((state, canonicalKey) => {
      labelByCanonical.set(
        canonicalKey,
        buildUnitsProgressLabel(
          Math.max(0, state.consumedUnits),
          Math.max(0, state.purchasedUnits, state.consumedUnits)
        )
      );
    });

    canonicalKeyByClientPlanId.forEach((canonicalKey, lookupKey) => {
      const label = labelByCanonical.get(canonicalKey);
      if (label) byClientPlanId.set(lookupKey, label);
    });
    canonicalKeyByClientPlanName.forEach((canonicalKey, lookupKey) => {
      const label = labelByCanonical.get(canonicalKey);
      if (label) byClientPlanName.set(lookupKey, label);
    });

    return { byClientPlanId, byClientPlanName };
  }, [normalizedTransactions, clients, editPlans]);

  const resolveRowUnitsProgress = (row: ExtendedTransactionRecord) => {
    const fromSnapshot = String(row.raw?.unitsProgressSnapshot || row.raw?.unitsProgress || '').trim();
    if (fromSnapshot) return fromSnapshot;

    const clientId = String(row.clientId || row.raw?.clientId || '').trim();
    const planId = String(row.raw?.planId || row.planId || '').trim();
    const planName = normalizedPlanName(String(row.raw?.plan || row.raw?.planName || row.plan || ''));
    const isPlanConsumption = row.type === 'CONSUMO' && row.plan !== 'Venda' && row.plan !== 'Crédito Cantina';
    if (isPlanConsumption && clientId && (planId || planName)) {
      if (planId) {
        const consumedById = consumedPlanProgressLookup.byClientPlanId.get(`${clientId}|${planId}`);
        if (consumedById) return consumedById;
      }
      if (planName) {
        const consumedByName = consumedPlanProgressLookup.byClientPlanName.get(`${clientId}|${planName}`);
        if (consumedByName) return consumedByName;
      }
    }

    if (!clientId || (!planId && !planName)) return '';

    if (planId) {
      const byId = clientPlanProgressLookup.byClientPlanId.get(`${clientId}|${planId}`);
      if (byId) return byId;
    }
    if (planName) {
      const byName = clientPlanProgressLookup.byClientPlanName.get(`${clientId}|${planName}`);
      if (byName) return byName;
    }
    return '';
  };

  const parseTransactionDate = (row: ExtendedTransactionRecord): Date | null => {
    return parseDateOnly(row?.date);
  };

  const readTxAmount = (tx: any) => {
    const raw = Number(tx?.amount ?? tx?.total ?? tx?.value ?? 0);
    return Number.isFinite(raw) ? raw : 0;
  };

  const isCreditTransaction = (row: ExtendedTransactionRecord | null) => {
    if (!row) return false;
    if (row.type !== 'CREDITO') return false;
    const text = String(row.raw?.description || row.raw?.item || row.item || '').toUpperCase();
    return text.includes('CRÉDITO') || text.includes('RECARGA') || text.includes('CREDITO');
  };

  const openEditModal = (row: ExtendedTransactionRecord) => {
    const method = String(row.raw?.method || row.raw?.paymentMethod || row.method || 'N/A');
    const existingItems = Array.isArray(row.raw?.items) ? row.raw.items : [];
    let initialCart: EditCartItem[] = [];

    if (existingItems.length > 0) {
      initialCart = existingItems.map((item: any, idx: number) => ({
        id: String(item?.productId || item?.id || `item_${idx}`),
        name: String(item?.name || 'Item'),
        price: Number(item?.price || 0),
        quantity: Number(item?.quantity || 1),
        type: String(item?.planId || '').trim() ? 'PLAN' : 'PRODUCT',
        planId: item?.planId
      }));
    } else {
      const parsed = String(row.item || '').split(',').map((part) => part.trim()).filter(Boolean);
      if (parsed.length > 0) {
        const fallbackTotal = Number(row.raw?.total ?? row.raw?.amount ?? row.total ?? row.value ?? 0);
        const fallbackUnit = parsed.length > 0 ? Number((fallbackTotal / parsed.length).toFixed(2)) : 0;
        initialCart = parsed.map((entry, idx) => {
          const match = entry.match(/^(\d+)x\s+(.+)$/i);
          const quantity = match ? Number(match[1]) : 1;
          const name = match ? match[2] : entry;
          return {
            id: `parsed_${idx}`,
            name,
            price: fallbackUnit,
            quantity,
            type: 'PRODUCT'
          };
        });
      }
    }

    setEditingTransaction(row);
    setEditCart(initialCart);
    setEditPaymentMethod(method);
    setEditSearch('');
    setEditActiveCategory('TODOS');
    const creditAmount = Number(row.raw?.amount ?? row.raw?.total ?? row.total ?? row.value ?? 0);
    const planOriginUpper = String(row.plan || '').trim().toUpperCase();
    const hasPlanRef = Boolean(
      row.planId
      || row.raw?.planId
      || (planOriginUpper && !['PREPAGO', 'AVULSO', 'VENDA', 'CRÉDITO CANTINA', 'CREDITO CANTINA'].includes(planOriginUpper))
    );
    setEditCreditType(hasPlanRef ? 'PLAN' : 'CANTINA');
    setEditCreditPlanId(String(row.planId || row.raw?.planId || ''));
    setEditCreditValue(Number.isFinite(creditAmount) ? creditAmount.toFixed(2) : '0.00');
    if (isCreditTransaction(row)) {
      setEditCart([]);
      setEditActiveCategory('PLANOS');
    }
  };

  const closeEditModal = () => {
    setEditingTransaction(null);
    setIsSavingEdit(false);
    setEditCart([]);
    setEditSearch('');
    setEditActiveCategory('TODOS');
    setEditCreditType('CANTINA');
    setEditCreditPlanId('');
    setEditCreditValue('0');
  };

  const openCreateModal = () => {
    const now = new Date();
    const nowDate = toLocalDateKey(now);
    const nowTime = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false });
    setCreateSearch('');
    setCreateActiveCategory('TODOS');
    setCreateCart([]);
    setCreatePaymentMethod('PIX');
    setCreateClientName('');
    setCreateIsConsumerFinal(false);
    setShowCreateClientSuggestions(false);
    setCreateDate(nowDate);
    setCreateTime(nowTime);
    setIsCreateModalOpen(true);
  };

  const closeCreateModal = () => {
    setIsCreateModalOpen(false);
    setIsSavingCreate(false);
    setCreateSearch('');
    setCreateActiveCategory('TODOS');
    setCreateCart([]);
    setShowCreateClientSuggestions(false);
  };

  const editCategories = useMemo(() => {
    const categories = Array.from(new Set(editProducts.map((p: any) => String(p.category || 'GERAL').toUpperCase())));
    return ['TODOS', ...categories, 'PLANOS'];
  }, [editProducts]);

  const filteredEditProducts = useMemo(() => {
    const term = normalizeSearchText(editSearch);
    const activeCat = String(editActiveCategory || 'TODOS').toUpperCase();
    if (activeCat === 'PLANOS') return [];
    return editProducts.filter((p: any) => {
      const cat = String(p.category || 'GERAL').toUpperCase();
      const matchesCat = activeCat === 'TODOS' || cat === activeCat || cat === 'GERAL';
      const matchesSearch = !term || normalizeSearchText(p.name).includes(term);
      return matchesCat && matchesSearch;
    });
  }, [editProducts, editSearch, editActiveCategory]);

  const filteredEditPlans = useMemo(() => {
    if (String(editActiveCategory || '').toUpperCase() !== 'PLANOS') return [];
    const term = normalizeSearchText(editSearch);
    return editPlans.filter((p: any) => !term || normalizeSearchText(p.name).includes(term));
  }, [editPlans, editSearch, editActiveCategory]);

  const createCategories = useMemo(() => {
    const categories = Array.from(new Set(editProducts.map((p: any) => String(p.category || 'GERAL').toUpperCase())));
    return ['TODOS', ...categories, 'PLANOS'];
  }, [editProducts]);

  const filteredCreateProducts = useMemo(() => {
    const term = normalizeSearchText(createSearch);
    const activeCat = String(createActiveCategory || 'TODOS').toUpperCase();
    if (activeCat === 'PLANOS') return [];
    return editProducts.filter((p: any) => {
      const cat = String(p.category || 'GERAL').toUpperCase();
      const matchesCat = activeCat === 'TODOS' || cat === activeCat || cat === 'GERAL';
      const matchesSearch = !term || normalizeSearchText(p.name).includes(term);
      return matchesCat && matchesSearch;
    });
  }, [editProducts, createSearch, createActiveCategory]);

  const filteredCreatePlans = useMemo(() => {
    if (String(createActiveCategory || '').toUpperCase() !== 'PLANOS') return [];
    const term = normalizeSearchText(createSearch);
    return editPlans.filter((p: any) => !term || normalizeSearchText(p.name).includes(term));
  }, [editPlans, createSearch, createActiveCategory]);

  const filteredCreateClients = useMemo(() => {
    const term = normalizeSearchText(createClientName);
    if (!term || createIsConsumerFinal) return [];
    return createClients
      .filter((client: any) => {
        const name = normalizeSearchText(client?.name);
        const registrationId = normalizeSearchText(client?.registrationId);
        return name.includes(term) || registrationId.includes(term);
      })
      .slice(0, 8);
  }, [createClients, createClientName, createIsConsumerFinal]);

  useEffect(() => {
    if (!editingTransaction) return;
    if (!isCreditTransaction(editingTransaction)) return;
    if (editCreditType !== 'PLAN') return;
    if (!editCreditPlanId) return;
    const selectedPlan = editPlans.find((p: any) => String(p.id) === String(editCreditPlanId));
    if (!selectedPlan) return;
    const planValue = Number(selectedPlan.price || 0);
    if (!Number.isFinite(planValue)) return;
    setEditCreditValue(planValue.toFixed(2));
  }, [editingTransaction, editCreditType, editCreditPlanId, editPlans]);

  const editCartTotal = useMemo(() => {
    return editCart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  }, [editCart]);

  const createCartTotal = useMemo(() => {
    return createCart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  }, [createCart]);

  const addProductToEditCart = (product: any) => {
    setEditCart((prev) => {
      const idx = prev.findIndex((i) => i.id === String(product.id));
      if (idx >= 0) {
        return prev.map((i, n) => n === idx ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [
        ...prev,
        {
          id: String(product.id),
          name: String(product.name || 'Produto'),
          price: Number(product.price || 0),
          quantity: 1,
          type: 'PRODUCT'
        }
      ];
    });
  };

  const addPlanToEditCart = (plan: any) => {
    setEditCart((prev) => {
      const lineId = `PLAN_${plan.id}`;
      const idx = prev.findIndex((i) => i.id === lineId);
      if (idx >= 0) {
        return prev.map((i, n) => n === idx ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [
        ...prev,
        {
          id: lineId,
          name: `Consumo plano ${String(plan.name || 'PLANO')}`,
          price: Number(plan.price || 0),
          quantity: 1,
          type: 'PLAN',
          planId: String(plan.id)
        }
      ];
    });
  };

  const updateEditCartQuantity = (id: string, nextQty: number) => {
    setEditCart((prev) => {
      if (nextQty <= 0) return prev.filter((item) => item.id !== id);
      return prev.map((item) => item.id === id ? { ...item, quantity: nextQty } : item);
    });
  };

  const removeEditCartItem = (id: string) => {
    setEditCart((prev) => prev.filter((item) => item.id !== id));
  };

  const addProductToCreateCart = (product: any) => {
    setCreateCart((prev) => {
      const idx = prev.findIndex((i) => i.id === String(product.id));
      if (idx >= 0) {
        return prev.map((i, n) => n === idx ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [
        ...prev,
        {
          id: String(product.id),
          name: String(product.name || 'Produto'),
          price: Number(product.price || 0),
          quantity: 1,
          type: 'PRODUCT'
        }
      ];
    });
  };

  const addPlanToCreateCart = (plan: any) => {
    setCreateCart((prev) => {
      const lineId = `PLAN_${plan.id}`;
      const idx = prev.findIndex((i) => i.id === lineId);
      if (idx >= 0) {
        return prev.map((i, n) => n === idx ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [
        ...prev,
        {
          id: lineId,
          name: `Consumo plano ${String(plan.name || 'PLANO')}`,
          price: Number(plan.price || 0),
          quantity: 1,
          type: 'PLAN',
          planId: String(plan.id)
        }
      ];
    });
  };

  const updateCreateCartQuantity = (id: string, nextQty: number) => {
    setCreateCart((prev) => {
      if (nextQty <= 0) return prev.filter((item) => item.id !== id);
      return prev.map((item) => item.id === id ? { ...item, quantity: nextQty } : item);
    });
  };

  const removeCreateCartItem = (id: string) => {
    setCreateCart((prev) => prev.filter((item) => item.id !== id));
  };

  const handleCreateTransaction = async () => {
    if (createCart.length === 0) {
      alert('Adicione pelo menos um item no carrinho.');
      return;
    }
    if (!createDate || !createTime) {
      alert('Informe data e hora da transação.');
      return;
    }

    const normalizedClientName = createIsConsumerFinal
      ? 'Consumidor Final'
      : String(createClientName || '').trim();
    if (!normalizedClientName) {
      alert('Informe o cliente ou marque Consumidor Final.');
      return;
    }

    const total = Number(createCartTotal.toFixed(2));
    const totalQuantity = createCart.reduce((sum, item) => sum + item.quantity, 0);
    const itemDescription = createCart.map((item) => `${item.quantity}x ${item.name}`).join(', ');
    const firstPlanItem = createCart.find((item) => item.type === 'PLAN');
    const isPlanConsumption = Boolean(firstPlanItem);
    const parsedDate = new Date(`${createDate}T${createTime}:00`);
    const txDate = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;

    const payload: any = {
      enterpriseId: activeEnterprise.id,
      type: isPlanConsumption ? 'CONSUMO' : 'VENDA_BALCAO',
      client: normalizedClientName,
      clientName: normalizedClientName,
      plan: isPlanConsumption
        ? firstPlanItem!.name.replace(/^Consumo plano\s+/i, '')
        : 'AVULSO',
      planId: firstPlanItem?.planId,
      item: itemDescription,
      description: itemDescription,
      method: createPaymentMethod,
      paymentMethod: createPaymentMethod,
      quantity: totalQuantity,
      unitPrice: totalQuantity > 0 ? Number((total / totalQuantity).toFixed(2)) : 0,
      amount: total,
      total,
      status: 'CONCLUIDA',
      date: toLocalDateKey(txDate),
      time: createTime,
      timestamp: txDate.toISOString(),
      items: createCart.map((item) => ({
        productId: item.id,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        planId: item.planId
      }))
    };

    try {
      setIsSavingCreate(true);
      await ApiService.createTransaction(payload);
      setReloadTransactionsKey(prev => prev + 1);
      closeCreateModal();
    } catch (error) {
      console.error('Erro ao criar transação:', error);
      alert('Erro ao registrar transação.');
      setIsSavingCreate(false);
    }
  };

  const handleDeleteTransaction = async (row: ExtendedTransactionRecord) => {
    const confirmed = window.confirm(`Excluir a transação #${row.id}? Esta ação não pode ser desfeita.`);
    if (!confirmed) return;

    try {
      setDeletingTransactionId(row.id);
      await ApiService.deleteTransaction(row.id);
      if (selectedTransaction?.id === row.id) setSelectedTransaction(null);
      if (editingTransaction?.id === row.id) closeEditModal();
      setReloadTransactionsKey(prev => prev + 1);
    } catch (error) {
      console.error('Erro ao excluir transação:', error);
      alert('Erro ao excluir transação.');
    } finally {
      setDeletingTransactionId(null);
    }
  };

  const handleSaveEditTransaction = async () => {
    if (!editingTransaction) return;
    if (isCreditTransaction(editingTransaction)) {
      const value = Number(editCreditValue);
      if (!Number.isFinite(value) || value < 0) {
        alert('Valor de crédito inválido.');
        return;
      }
      if (editCreditType === 'PLAN' && !editCreditPlanId) {
        alert('Selecione um plano para crédito de plano.');
        return;
      }

      const selectedPlan = editPlans.find((p: any) => String(p.id) === String(editCreditPlanId));
      const isPlanCredit = editCreditType === 'PLAN';
      const planName = selectedPlan?.name || editingTransaction.plan || 'PLANO';
      const description = isPlanCredit
        ? `Recarga de plano ${planName} via edição de transação`
        : 'Crédito livre cantina via edição de transação';
      const item = isPlanCredit ? `Crédito plano ${planName}` : 'Crédito livre cantina';

      const creditPayload: any = {
        type: 'CREDIT',
        item,
        description,
        method: editPaymentMethod,
        paymentMethod: editPaymentMethod,
        quantity: 1,
        unitPrice: value,
        amount: value,
        total: value,
        plan: isPlanCredit ? planName : 'PREPAGO',
        planId: isPlanCredit ? String(selectedPlan?.id || editCreditPlanId || '') : undefined,
        items: undefined,
        applyClientEffects: true
      };

      try {
        setIsSavingEdit(true);
        await ApiService.updateTransaction(editingTransaction.id, creditPayload);
        setReloadTransactionsKey(prev => prev + 1);
        closeEditModal();
      } catch (error) {
        console.error('Erro ao editar crédito:', error);
        alert('Erro ao salvar edição do crédito.');
        setIsSavingEdit(false);
      }
      return;
    }

    if (editCart.length === 0) {
      alert('Adicione pelo menos um item no carrinho.');
      return;
    }

    const total = Number(editCartTotal.toFixed(2));
    const totalQuantity = editCart.reduce((sum, item) => sum + item.quantity, 0);
    const itemDescription = editCart.map((item) => `${item.quantity}x ${item.name}`).join(', ');
    const firstPlanItem = editCart.find((item) => item.type === 'PLAN');

    const payload: any = {
      item: itemDescription,
      description: itemDescription,
      method: editPaymentMethod,
      paymentMethod: editPaymentMethod,
      quantity: totalQuantity,
      unitPrice: totalQuantity > 0 ? Number((total / totalQuantity).toFixed(2)) : 0,
      amount: total,
      total,
      plan: firstPlanItem ? firstPlanItem.name.replace(/^Consumo plano\\s+/i, '') : (editingTransaction.plan || editingTransaction.raw?.plan || 'AVULSO'),
      planId: firstPlanItem?.planId || editingTransaction.planId || editingTransaction.raw?.planId,
      items: editCart.map((item) => ({
        productId: item.id,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        planId: item.planId
      })),
      applyClientEffects: true
    };

    try {
      setIsSavingEdit(true);
      await ApiService.updateTransaction(editingTransaction.id, payload);
      setReloadTransactionsKey(prev => prev + 1);
      closeEditModal();
    } catch (error) {
      console.error('Erro ao editar transação:', error);
      alert('Erro ao salvar edição da transação.');
      setIsSavingEdit(false);
    }
  };

  const filteredTransactions = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    return normalizedTransactions.filter(row => {
      const normalizedSearch = normalizeSearchText(searchTerm);
      const matchesSearch =
        !normalizedSearch
        || normalizeSearchText(row.client).includes(normalizedSearch)
        || normalizeSearchText(row.item).includes(normalizedSearch)
        || normalizeSearchText(row.id).includes(normalizedSearch);
      
      const matchesType = typeFilter === 'ALL' || row.type === typeFilter;
      
      const matchesPlan = planFilter === 'ALL' || row.plan === planFilter;

      const rowDate = parseTransactionDate(row);
      let matchesTime = true;

      if (!rowDate) {
        matchesTime = false;
      } else if (timeFilter === 'TODAY') {
        matchesTime = rowDate >= todayStart && rowDate <= todayEnd;
      } else if (timeFilter === '7DAYS') {
        const start = new Date(todayStart);
        start.setDate(start.getDate() - 6);
        matchesTime = rowDate >= start && rowDate <= todayEnd;
      } else if (timeFilter === 'MONTH') {
        matchesTime = rowDate.getFullYear() === now.getFullYear() && rowDate.getMonth() === now.getMonth();
      } else if (timeFilter === 'YEAR') {
        matchesTime = rowDate.getFullYear() === now.getFullYear();
      } else if (timeFilter === 'CUSTOM') {
        const customStart = startDate ? new Date(`${startDate}T00:00:00`) : null;
        const customEnd = endDate ? new Date(`${endDate}T23:59:59.999`) : null;

        if (customStart && Number.isNaN(customStart.getTime())) return false;
        if (customEnd && Number.isNaN(customEnd.getTime())) return false;
        if (customStart && rowDate < customStart) return false;
        if (customEnd && rowDate > customEnd) return false;
        matchesTime = true;
      }

      return matchesSearch && matchesType && matchesPlan && matchesTime;
    });
  }, [normalizedTransactions, searchTerm, typeFilter, planFilter, timeFilter, startDate, endDate]);

  const totalRevenueFiltered = useMemo(() => {
    return filteredTransactions
      .filter((t) => t.type === 'CREDITO' || t.type === 'VENDA_BALCAO')
      .reduce((sum, t) => sum + Number(t.total || t.value || 0), 0);
  }, [filteredTransactions]);

  const totalConsumptionDiscountFiltered = useMemo(() => {
    return filteredTransactions
      .filter((t) => t.type === 'CONSUMO')
      .reduce((sum, t) => sum + readTxAmount(t), 0);
  }, [filteredTransactions]);

  const monthlyTicketAverage = useMemo(() => {
    const now = new Date();
    const monthlySales = sourceTransactions.filter((tx) => {
      if (tx.type !== 'VENDA_BALCAO') return false;
      const txDate = parseTransactionDate(tx);
      if (!txDate) return false;
      return txDate.getFullYear() === now.getFullYear() && txDate.getMonth() === now.getMonth();
    });

    if (monthlySales.length === 0) return 0;

    const totalSales = monthlySales.reduce((sum, tx) => sum + readTxAmount(tx), 0);
    return totalSales / monthlySales.length;
  }, [sourceTransactions]);

  const ticketAverageRevenueFiltered = useMemo(() => {
    const revenueTransactions = filteredTransactions.filter((t) => t.type === 'CREDITO' || t.type === 'VENDA_BALCAO');
    if (revenueTransactions.length === 0) return 0;
    const total = revenueTransactions.reduce((sum, t) => sum + readTxAmount(t), 0);
    return total / revenueTransactions.length;
  }, [filteredTransactions]);

  const plansList = useMemo(() => {
    const plans = new Set(normalizedTransactions.map(t => t.plan));
    return Array.from(plans);
  }, [normalizedTransactions]);

  const exportToCSV = () => {
    const headers = ["ID", "Data", "Hora", "Referência", "Cliente", "Plano", "Itens Detalhados", "Tipo", "Metodo", "Valor", "Status"];
    const rows = filteredTransactions.map(t => [
      t.id,
      t.date,
      t.time,
      formatDateBr(t.referenceDate) || '-',
      t.client,
      t.plan,
      formatTransactionItemsForExport(t),
      t.type,
      t.method,
      readTxAmount(t).toFixed(2),
      t.status
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(e => e.join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `vendas_unidade_${activeEnterprise.name.toLowerCase().replace(/\s+/g, '_')}_${new Date().getTime()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToPDF = () => {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    const formatCurrencyBr = (value: number) =>
      `R$ ${Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const formatNumber = (value: number) =>
      Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

    const safePlanName = (value?: string) => {
      const normalized = String(value || '').trim();
      if (!normalized) return 'PRÉ-PAGA';
      const upper = normalized.toUpperCase();
      if (['AVULSO', 'N/A', 'SEM PLANO', 'PREPAGO', 'PRÉ-PAGA', 'GERAL'].includes(upper)) return 'PRÉ-PAGA';
      return normalized;
    };

    const periodLabel = timeFilter === 'TODAY'
      ? 'Hoje'
      : timeFilter === '7DAYS'
        ? '7 Dias'
        : timeFilter === 'MONTH'
          ? 'Mês'
          : timeFilter === 'YEAR'
            ? 'Ano'
            : 'Customizado';
    const typeFilterLabel = typeFilter === 'ALL'
      ? 'Todos'
      : typeFilter === 'CREDITO'
        ? 'Crédito'
        : typeFilter === 'CONSUMO'
          ? 'Consumo'
          : 'Venda balcão';
    const planFilterLabel = planFilter === 'ALL' ? 'Todos' : String(planFilter || '').replace(/_/g, ' ');

    const reportClientIds = new Set(
      filteredTransactions
        .map((tx) => String(tx.clientId || '').trim())
        .filter(Boolean)
    );
    const reportClients = clients.filter((client) => reportClientIds.has(String(client.id)));

    const studentsInReport = reportClients.filter((client) => String(client.type).toUpperCase() === 'ALUNO');
    const responsibleNames = Array.from(new Set(
      studentsInReport
        .map((client) => String(client.parentName || '').trim())
        .filter(Boolean)
    ));
    const studentNames = Array.from(new Set(studentsInReport.map((client) => String(client.name || '').trim()).filter(Boolean)));
    const planUnitPriceByName = new Map<string, number>();
    (Array.isArray(editPlans) ? editPlans : []).forEach((plan: any) => {
      const key = normalizeSearchText(String(plan?.name || ''));
      if (!key) return;
      const price = Number(plan?.price || 0);
      if (Number.isFinite(price) && price > 0) {
        planUnitPriceByName.set(key, price);
      }
    });
    const responsibleContacts = Array.from(
      new Map(
        studentsInReport
          .map((student) => {
            const name = String(student.parentName || '').trim();
            const phone = String(student.parentWhatsapp || student.guardianPhone || '').trim();
            if (!name && !phone) return null;
            return [`${name}|${phone}`, { name, phone }];
          })
          .filter(Boolean) as Array<[string, { name: string; phone: string }]>
      ).values()
    );

    const creditByPlanMap = new Map<string, number>();
    const consumedQtyByPlanMap = new Map<string, number>();
    const consumedValueByPlanMap = new Map<string, number>();
    const planGroups = new Map<string, ExtendedTransactionRecord[]>();
    const isReversalTx = (tx: ExtendedTransactionRecord) => {
      const description = normalizeSearchText(String(tx.description || tx.item || tx.raw?.description || ''));
      return description.includes('estorno');
    };
    const classifyTxKind = (tx: ExtendedTransactionRecord): 'CREDITO' | 'CONSUMO' | 'ESTORNO' | 'CREDITO_ESTORNO' => {
      const isReversal = isReversalTx(tx);
      if (isReversal && tx.type === 'CREDITO') return 'CREDITO_ESTORNO';
      if (isReversal) return 'ESTORNO';
      if (tx.type === 'CREDITO') return 'CREDITO';
      return 'CONSUMO';
    };

    filteredTransactions.forEach((tx) => {
      const amount = readTxAmount(tx);
      const planName = safePlanName(tx.plan);
      const kind = classifyTxKind(tx);
      if (!planGroups.has(planName)) planGroups.set(planName, []);
      planGroups.get(planName)!.push(tx);

      if (kind === 'CREDITO' || kind === 'CREDITO_ESTORNO') {
        creditByPlanMap.set(planName, (creditByPlanMap.get(planName) || 0) + amount);
      }
      if (kind === 'CONSUMO' || kind === 'ESTORNO') {
        const itemDetails = getTransactionItemDetails(tx);
        const qty = itemDetails.length > 0
          ? itemDetails.reduce((acc, item) => acc + Number(item.quantity || 0), 0)
          : Math.max(1, Number(tx.quantity || 1));
        consumedQtyByPlanMap.set(planName, (consumedQtyByPlanMap.get(planName) || 0) + qty);
        consumedValueByPlanMap.set(planName, (consumedValueByPlanMap.get(planName) || 0) + Math.abs(amount));
      }
    });

    const resolvePlanCurrentBalanceInfo = (planName: string) => {
      const normalizedPlan = normalizeSearchText(planName);
      if (normalizedPlan === normalizeSearchText('PRÉ-PAGA') || normalizedPlan === normalizeSearchText('PREPAGA')) {
        const saldoCantina = reportClients.reduce((acc, client) => acc + Number(client.balance || 0), 0);
        const consumedTotal = Number(consumedValueByPlanMap.get(planName) || 0);
        return {
          mode: 'PREPAGA' as const,
          consumedTotal,
          consumedQty: 0,
          totalQty: 0,
          saldoQty: 0,
          saldoValue: saldoCantina,
          unitValue: 0,
        };
      }

      let saldoMoney = 0;
      let saldoUnits = 0;
      let unitValueFromBalances = 0;
      reportClients.forEach((client) => {
        const balances = (client as any)?.planCreditBalances || {};
        Object.values(balances).forEach((entry: any) => {
          const entryName = normalizeSearchText(String(entry?.planName || ''));
          if (entryName === normalizedPlan) {
            const entryBalance = Number(entry?.balance || 0);
            const entryUnitValue = Number(entry?.unitValue || entry?.planPrice || 0);
            const entryUnitsDirect = Number(entry?.balanceUnits);
            const entryUnits = Number.isFinite(entryUnitsDirect)
              ? Math.max(0, entryUnitsDirect)
              : (entryUnitValue > 0 ? Math.max(0, entryBalance / entryUnitValue) : 0);

            saldoMoney += entryBalance;
            saldoUnits += entryUnits;
            if (!unitValueFromBalances && Number.isFinite(entryUnitValue) && entryUnitValue > 0) {
              unitValueFromBalances = entryUnitValue;
            }
          }
        });
      });

      const planRows = (planGroups.get(planName) || []);
      const creditedRows = planRows.filter((tx) => {
        const kind = classifyTxKind(tx);
        return kind === 'CREDITO' || kind === 'CREDITO_ESTORNO';
      });
      let unitAccumulator = 0;
      let qtyAccumulator = 0;
      creditedRows.forEach((tx) => {
        const qty = Math.max(1, Number(tx.quantity || tx.raw?.quantity || 1));
        const amount = Math.abs(readTxAmount(tx));
        if (qty > 0 && amount > 0) {
          unitAccumulator += amount;
          qtyAccumulator += qty;
        }
      });
      const definedPlanUnit = Number(planUnitPriceByName.get(normalizedPlan) || 0);
      const unitValue = definedPlanUnit > 0
        ? definedPlanUnit
        : (unitValueFromBalances > 0 ? unitValueFromBalances : (qtyAccumulator > 0 ? (unitAccumulator / qtyAccumulator) : 0));
      const saldoValue = Number(saldoMoney || 0);
      const saldoQty = saldoUnits > 0
        ? saldoUnits
        : (unitValue > 0 ? (saldoValue / unitValue) : 0);
      const consumedQty = Number(consumedQtyByPlanMap.get(planName) || 0);
      const consumedTotalRaw = Number(consumedValueByPlanMap.get(planName) || 0);
      const consumedTotal = consumedTotalRaw > 0 ? consumedTotalRaw : (consumedQty * unitValue);
      const totalQty = consumedQty + saldoQty;

      return {
        mode: 'PLANO' as const,
        consumedQty,
        consumedTotal,
        totalQty,
        saldoQty,
        saldoValue,
        unitValue,
      };
    };

    const totalCredits = filteredTransactions
      .filter((tx) => {
        const kind = classifyTxKind(tx);
        return kind === 'CREDITO' || kind === 'CREDITO_ESTORNO';
      })
      .reduce((acc, tx) => acc + Math.abs(readTxAmount(tx)), 0);
    const totalConsumption = filteredTransactions
      .filter((tx) => {
        const kind = classifyTxKind(tx);
        return kind === 'CONSUMO' || kind === 'ESTORNO';
      })
      .reduce((acc, tx) => acc + Math.abs(readTxAmount(tx)), 0);
    const finalBalance = totalCredits - totalConsumption;

    doc.setFillColor(37, 99, 235);
    doc.rect(0, 0, 297, 16, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('EXTRATO DE TRANSAÇÕES DA UNIDADE', 14, 10.4);

    const logoSize = 16;
    const logoX = 14;
    const logoY = 20;
    doc.setDrawColor(203, 213, 225);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(logoX, logoY, logoSize, logoSize, 2, 2, 'FD');
    const enterpriseLogo = String((activeEnterprise as any)?.logo || '').trim();
    if (enterpriseLogo.startsWith('data:image/')) {
      try {
        const imageType = enterpriseLogo.startsWith('data:image/png') ? 'PNG' : 'JPEG';
        doc.addImage(enterpriseLogo, imageType, logoX + 1.1, logoY + 1.1, logoSize - 2.2, logoSize - 2.2);
      } catch {
        doc.setTextColor(51, 65, 85);
        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'bold');
        doc.text('CA', logoX + (logoSize / 2), logoY + 10, { align: 'center' });
      }
    } else {
      doc.setTextColor(51, 65, 85);
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'bold');
      doc.text('CA', logoX + (logoSize / 2), logoY + 10, { align: 'center' });
    }

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text(activeEnterprise.name, logoX + logoSize + 4, 26.8);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.6);
    const enterpriseInfo = [
      activeEnterprise.attachedSchoolName ? `Escola: ${activeEnterprise.attachedSchoolName}` : null,
      activeEnterprise.phone1 ? `Contato: ${formatPhoneWithCountryTag(activeEnterprise.phone1, '-')}` : null,
      activeEnterprise.address ? activeEnterprise.address : null,
    ].filter(Boolean).join(' • ');
    const enterpriseInfoLines = doc.splitTextToSize(enterpriseInfo || '-', 247);
    doc.text(enterpriseInfoLines, logoX + logoSize + 4, 32.5);
    const enterpriseBottomY = 32.5 + ((enterpriseInfoLines.length - 1) * 3.9);

    const infoBoxY = enterpriseBottomY + 4;
    const infoBoxHeight = 23;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(14, infoBoxY, 269, infoBoxHeight, 2.5, 2.5, 'FD');

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.7);
    doc.text(`Responsável(is): ${responsibleNames.join(', ') || '-'}`, 17, infoBoxY + 6.3);

    const responsibleLine = responsibleContacts.length > 0
      ? responsibleContacts.map((resp) => `${resp.name || 'Responsável'} (${formatPhoneWithCountryTag(resp.phone, '-')})`).join(' | ')
      : '-';
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.2);
    const respLines = doc.splitTextToSize(`Contato responsável: ${responsibleLine}`, 175);
    doc.text(respLines.slice(0, 2), 17, infoBoxY + 11.3);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.1);
    const studentLabel = `Aluno(s): ${studentNames.join(', ') || '-'}`;
    const studentLabelLines = doc.splitTextToSize(studentLabel, 82);
    doc.text(studentLabelLines.slice(0, 2), 196, infoBoxY + 7.2);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.1);
    doc.text(`Filtro: ${periodLabel} | Tipo: ${typeFilterLabel} | Plano: ${planFilterLabel}`, 14, infoBoxY + infoBoxHeight + 6);
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 283, infoBoxY + infoBoxHeight + 6, { align: 'right' });

    const summaryTopY = infoBoxY + infoBoxHeight + 9;

    const tableColumn = ['Data/Hora', 'Descrição', 'Tipo', 'Valor', 'Status'];
    const orderedPlans = Array.from(planGroups.keys()).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const tableRows: any[] = [];
    const planSummaryCards: Array<{ planName: string; consumedText: string; balanceText: string; isPrepaid: boolean }> = [];

    const drawPlanSummaryCards = (x: number, y: number) => {
      if (planSummaryCards.length === 0) return y;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(30, 64, 175);
      doc.text('Resumo por plano', x, y);

      const cardWidth = 85;
      const cardHeight = 21;
      const gapX = 6;
      const gapY = 5;
      const cols = 3;
      const startY = y + 4;

      planSummaryCards.forEach((summary, index) => {
        const row = Math.floor(index / cols);
        const col = index % cols;
        const cardX = x + col * (cardWidth + gapX);
        const cardY = startY + row * (cardHeight + gapY);

        if (summary.isPrepaid) {
          doc.setFillColor(255, 247, 237);
          doc.setDrawColor(251, 146, 60);
        } else {
          doc.setFillColor(239, 246, 255);
          doc.setDrawColor(96, 165, 250);
        }
        doc.roundedRect(cardX, cardY, cardWidth, cardHeight, 2.5, 2.5, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(30, 41, 59);
        const title = doc.splitTextToSize(summary.planName, cardWidth - 6);
        doc.text(title[0] || '-', cardX + 3, cardY + 5.8);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.4);
        doc.setTextColor(51, 65, 85);
        const consumedLines = doc.splitTextToSize(summary.consumedText, cardWidth - 6);
        doc.text(consumedLines[0] || '-', cardX + 3, cardY + 11.5);
        const balanceLines = doc.splitTextToSize(summary.balanceText, cardWidth - 6);
        doc.text(balanceLines[0] || '-', cardX + 3, cardY + 16.8);
      });

      const rows = Math.ceil(planSummaryCards.length / cols);
      return startY + rows * cardHeight + (rows - 1) * gapY;
    };

    orderedPlans.forEach((planName) => {
      const entries = (planGroups.get(planName) || []).slice().sort((a, b) => {
        const ad = parseTransactionDate(a)?.getTime() || 0;
        const bd = parseTransactionDate(b)?.getTime() || 0;
        return bd - ad;
      });
      const balanceInfo = resolvePlanCurrentBalanceInfo(planName);

      const consumedText = balanceInfo.mode === 'PREPAGA'
        ? `Consumo: ${formatCurrencyBr(balanceInfo.consumedTotal)}`
        : `Consumido: ${formatNumber(balanceInfo.consumedQty || 0)}/${formatNumber(balanceInfo.totalQty || 0)} un. (${formatCurrencyBr(balanceInfo.consumedTotal)})`;
      const balanceText = balanceInfo.mode === 'PREPAGA'
        ? `Saldo atual: ${formatCurrencyBr(balanceInfo.saldoValue)}`
        : `Restante: ${formatNumber(balanceInfo.saldoQty || 0)} un. (${formatCurrencyBr(Number(balanceInfo.saldoValue || 0))})`;
      planSummaryCards.push({
        planName,
        consumedText,
        balanceText,
        isPrepaid: balanceInfo.mode === 'PREPAGA',
      });

      const planLineSuffix = balanceInfo.mode === 'PREPAGA'
        ? ''
        : ` • ${formatNumber(balanceInfo.consumedQty || 0)}/${formatNumber(balanceInfo.totalQty || 0)} un.`;

      tableRows.push([
        {
          content: `PLANO: ${planName}${planLineSuffix}`,
          colSpan: 5,
          styles: {
            fillColor: [219, 234, 254],
            textColor: [30, 64, 175],
            fontStyle: 'bold',
            minCellHeight: 7.2,
            halign: 'left',
          },
        },
      ]);

      entries.forEach((t) => {
        const amount = readTxAmount(t);
        const kind = classifyTxKind(t);
        const isCredit = kind === 'CREDITO' || kind === 'CREDITO_ESTORNO';
        const valueLabel = `${isCredit ? '+' : '-'} R$ ${Math.abs(amount).toFixed(2)}`;
        const baseDescription = formatTransactionItemsForExport(t) || String(t.description || t.item || '-');
        const referenceDateLabel = formatDateBr(t.referenceDate) || formatDateBr(t.date) || '-';
        const decoratedDescription = kind === 'ESTORNO'
          ? `[ESTORNO] ${baseDescription}`
          : kind === 'CREDITO_ESTORNO'
            ? `[CRÉDITO DE ESTORNO • Ref. ${referenceDateLabel}] ${baseDescription}`
            : baseDescription;
        const typeLabel = kind === 'ESTORNO'
          ? 'ESTORNO'
          : kind === 'CREDITO_ESTORNO'
            ? 'CRÉDITO/ESTORNO'
            : t.type.replace('_', ' ');
        tableRows.push([
          `${formatDateBr(t.date)} ${t.time}`,
          decoratedDescription,
          typeLabel,
          valueLabel,
          t.status,
        ]);
      });
    });

    const tableStartY = drawPlanSummaryCards(14, summaryTopY) + 6;

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: tableStartY,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2.8, overflow: 'linebreak' },
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 28 },
        1: { cellWidth: 150 },
        2: { cellWidth: 27, halign: 'center' },
        3: { cellWidth: 28, halign: 'right' },
        4: { cellWidth: 30, halign: 'center' },
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      didParseCell: (hook) => {
        if (hook.section !== 'body') return;
        const row = hook.row.raw as any[];
        if (Array.isArray(row) && row.length === 1 && row[0]?.colSpan) return;
        const rawType = String((row?.[2] || '')).toUpperCase();
        const normalizedType = normalizeSearchText(rawType).toUpperCase();
        if (normalizedType.includes('ESTORNO') && !normalizedType.includes('CREDITO')) {
          if (hook.column.index === 2 || hook.column.index === 3) {
            hook.cell.styles.textColor = [180, 83, 9];
          }
        } else if (normalizedType.includes('CONSUMO') || normalizedType.includes('DEBIT')) {
          if (hook.column.index === 2 || hook.column.index === 3) {
            hook.cell.styles.textColor = [185, 28, 28];
          }
        } else if (normalizedType.includes('CREDITO')) {
          if (hook.column.index === 2 || hook.column.index === 3) {
            hook.cell.styles.textColor = [21, 128, 61];
          }
        }
      },
    });

    const tableFinalY = (doc as any).lastAutoTable?.finalY || tableStartY + 8;
    const cardYBase = tableFinalY + 6;
    const cardHeight = 14;
    const cardWidth = 86;
    const pageBottom = doc.internal.pageSize.getHeight() - 14;
    const totalsY = (cardYBase + cardHeight > pageBottom) ? 194 : cardYBase;
    if (totalsY === 194) {
      doc.addPage();
    }
    const drawTotalCard = (x: number, y: number, title: string, value: string, tone: 'green' | 'red' | 'blue') => {
      if (tone === 'green') {
        doc.setFillColor(236, 253, 245);
        doc.setDrawColor(134, 239, 172);
        doc.setTextColor(21, 128, 61);
      } else if (tone === 'red') {
        doc.setFillColor(254, 242, 242);
        doc.setDrawColor(252, 165, 165);
        doc.setTextColor(185, 28, 28);
      } else {
        doc.setFillColor(239, 246, 255);
        doc.setDrawColor(147, 197, 253);
        doc.setTextColor(30, 64, 175);
      }
      doc.roundedRect(x, y, cardWidth, cardHeight, 2.8, 2.8, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.1);
      doc.text(title, x + 3.5, y + 5.2);
      doc.setFontSize(10.2);
      doc.text(value, x + 3.5, y + 10.7);
    };

    drawTotalCard(14, totalsY, 'Total Créditos', formatCurrencyBr(totalCredits), 'green');
    drawTotalCard(105, totalsY, 'Total Consumo', formatCurrencyBr(totalConsumption), 'red');
    drawTotalCard(196, totalsY, 'Saldo Final', formatCurrencyBr(finalBalance), 'blue');

    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(
        `Página ${i} de ${pageCount} - Gerado em ${new Date().toLocaleString('pt-BR')}`,
        doc.internal.pageSize.getWidth() / 2,
        doc.internal.pageSize.getHeight() - 10,
        { align: 'center' }
      );
    }
    
    doc.save(`relatorio_vendas_${activeEnterprise.name.toLowerCase().replace(/\s+/g, '_')}_${new Date().getTime()}.pdf`);
  };

  return (
    <div className="dash-shell transactions-shell">
      
      {/* Header Contextual */}
      <header className="dash-header">
        <div>
           <div className="flex items-center gap-2 mb-1.5">
              <div className="p-2 bg-indigo-600 rounded-lg text-white shadow-md shadow-indigo-100">
                 <ReceiptText size={18} />
              </div>
              <div>
                 <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight leading-none uppercase">Consumo de Pacotes e Créditos</h1>
                 <p className="text-[8px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.14em] mt-1 flex items-center gap-1">
                    <Building size={10} className="text-indigo-400"/> {activeEnterprise.name}
                 </p>
              </div>
           </div>
        </div>

        <div className="dash-actions gap-1.5 sm:gap-2">
           <button
             onClick={openCreateModal}
             className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-lg font-black text-[9px] uppercase tracking-[0.12em] hover:bg-emerald-700 transition-all shadow-md shadow-emerald-100"
           >
             <ReceiptText size={12} />
             Registrar Transação
           </button>
           <button
             onClick={handleClearAllTransactions}
             disabled={isClearingTransactions}
             className="flex items-center gap-1.5 px-3 py-2 bg-red-600 text-white rounded-lg font-black text-[9px] uppercase tracking-[0.12em] hover:bg-red-700 transition-all shadow-md shadow-red-100 disabled:opacity-60 disabled:cursor-not-allowed"
           >
             <Trash2 size={12} />
             {isClearingTransactions ? 'Limpando...' : 'Limpar Transações'}
           </button>
           <button 
             onClick={exportToCSV}
             className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg font-black text-[9px] uppercase tracking-[0.12em] hover:bg-gray-50 transition-all shadow-sm"
           >
             <FileSpreadsheet size={12} className="text-emerald-500" /> Exportar CSV
           </button>
           <button 
             onClick={exportToPDF}
             className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-lg font-black text-[9px] uppercase tracking-[0.12em] hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100"
           >
             <Printer size={12} /> Imprimir Relatório
           </button>
        </div>
      </header>

      {/* MOTOR DE FILTRAGEM AVANÇADA UNIFICADO */}
      <div className="dash-filterbar space-y-4">
         
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* Pesquisa por Nome/ID */}
            <div className="space-y-1.5">
               <label className="text-[9px] font-black text-gray-400 uppercase tracking-[0.14em] ml-1 flex items-center gap-1.5">
                  <UserCircle size={12} className="text-indigo-400"/> Nome ou Registro
               </label>
               <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                  <input 
                    type="text" 
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder="Pesquisar..." 
                    className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-transparent focus:border-indigo-500 rounded-xl outline-none font-semibold text-xs transition-all" 
                  />
               </div>
            </div>

            {/* Filtro por Tipo */}
            <div className="space-y-1.5">
               <label className="text-[9px] font-black text-gray-400 uppercase tracking-[0.14em] ml-1 flex items-center gap-1.5">
                  <ListFilter size={12} className="text-indigo-400"/> Tipo de Registro
               </label>
               <div className="relative">
                  <select 
                    value={typeFilter}
                    onChange={e => setTypeFilter(e.target.value as TransactionType)}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-transparent focus:border-indigo-500 rounded-xl outline-none font-black text-[9px] uppercase tracking-[0.12em] appearance-none cursor-pointer"
                  >
                     <option value="ALL">Todos os Tipos</option>
                     <option value="CREDITO">Crédito</option>
                     <option value="CONSUMO">Consumo de Planos</option>
                     <option value="VENDA_BALCAO">Venda Direta (Balcão)</option>
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
               </div>
            </div>

            {/* Filtro por Plano/Origem */}
            <div className="space-y-1.5">
               <label className="text-[9px] font-black text-gray-400 uppercase tracking-[0.14em] ml-1 flex items-center gap-1.5">
                  <Tag size={12} className="text-indigo-400"/> Plano / Origem
               </label>
               <div className="relative">
                  <select 
                    value={planFilter}
                    onChange={e => setPlanFilter(e.target.value)}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-transparent focus:border-indigo-500 rounded-xl outline-none font-black text-[9px] uppercase tracking-[0.12em] appearance-none cursor-pointer"
                  >
                     <option value="ALL">Todos</option>
                     {plansList.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
               </div>
            </div>

            {/* Filtro por Data */}
            <div className="space-y-1.5">
               <label className="text-[9px] font-black text-gray-400 uppercase tracking-[0.14em] ml-1 flex items-center gap-1.5">
                  <Calendar size={12} className="text-indigo-400"/> Período de Busca
               </label>
               <div className="relative">
                  <select 
                    value={timeFilter}
                    onChange={e => setTimeFilter(e.target.value as TimeFilter)}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-transparent focus:border-indigo-500 rounded-xl outline-none font-black text-[9px] uppercase tracking-[0.12em] appearance-none cursor-pointer"
                  >
                     <option value="TODAY">Hoje</option>
                     <option value="7DAYS">Últimos 7 dias</option>
                     <option value="MONTH">Mês Atual</option>
                     <option value="YEAR">Ano Atual</option>
                     <option value="CUSTOM">Customizado...</option>
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
               </div>
            </div>

         </div>

         {timeFilter === 'CUSTOM' && (
           <div className="flex items-center gap-4 pt-4 border-t border-gray-100 animate-in slide-in-from-top-2">
              <div className="flex items-center gap-2">
                 <span className="text-[9px] font-black text-gray-400 uppercase">Início:</span>
                 <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-gray-50 px-4 py-2 rounded-xl text-xs font-black outline-none border-2 border-transparent focus:border-indigo-500" />
              </div>
              <div className="flex items-center gap-2">
                 <span className="text-[9px] font-black text-gray-400 uppercase">Fim:</span>
                 <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-gray-50 px-4 py-2 rounded-xl text-xs font-black outline-none border-2 border-transparent focus:border-indigo-500" />
              </div>
           </div>
         )}
      </div>

      {/* TABELA UNIFICADA DE RESULTADOS */}
      <div className="dash-panel rounded-[28px] shadow-xl overflow-hidden animate-in slide-in-from-bottom-4">
        <div className="p-4 sm:p-5 border-b bg-gray-50/50 flex items-center justify-between gap-3">
           <div>
              <h3 className="text-sm sm:text-base font-black text-indigo-900 uppercase tracking-tight flex items-center gap-2">
                 <History size={18} className="text-indigo-600" /> Histórico Operacional Consolidado
              </h3>
              <p className="text-[8px] sm:text-[9px] text-gray-400 font-bold uppercase tracking-[0.14em] mt-1">Auditória de baixas automáticas, créditos e vendas diretas</p>
           </div>
           <div className="bg-indigo-50 px-3 py-1.5 rounded-lg text-[10px] font-black text-indigo-600 border border-indigo-100 uppercase whitespace-nowrap">
              Total: {filteredTransactions.length} Operações
           </div>
        </div>

        <div className="overflow-x-auto">
           <table className="w-full text-left table-fixed min-w-[1120px]">
              <thead className="bg-gray-50 text-[8px] sm:text-[9px] font-black text-gray-400 uppercase tracking-[0.12em] border-b">
                 <tr>
                    <th className="px-3 py-3.5 w-[6%] text-center">Data</th>
                    <th className="px-3 py-3.5 w-[7%] text-center">REF.</th>
                    <th className="px-3 py-3.5 w-[12%] text-center">Cliente</th>
                    <th className="px-3 py-3.5 w-[8%] text-center">Plano / Origem</th>
                    <th className="px-3 py-3.5 w-[12%] text-center">Itens</th>
                    <th className="px-3 py-3.5 w-[6%] text-center">Tipo</th>
                    <th className="px-3 py-3.5 w-[6%] text-center">FLUXO</th>
                    <th className="px-3 py-3.5 w-[8%] text-center">Valor Final</th>
                    <th className="px-3 py-3.5 w-[6%] text-center">Status</th>
                    <th className="px-3 py-3.5 w-[10%] text-center">Ações</th>
                 </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 text-xs">
                 {filteredTransactions.length === 0 ? (
                   <tr>
                     <td colSpan={10} className="px-8 py-20 text-center text-gray-300 font-black uppercase text-xs tracking-widest">Nenhum registro corresponde aos filtros</td>
                   </tr>
                 ) : filteredTransactions.map(row => {
                   const rowUnitsProgress = resolveRowUnitsProgress(row);
                   const isPlanRow = row.plan !== 'Venda' && row.plan !== 'Crédito Cantina';
                   const planLabel = rowUnitsProgress && isPlanRow
                     ? `${row.plan} • ${rowUnitsProgress}`
                     : row.plan;
                   const itemLabel = rowUnitsProgress && isPlanRow && row.type === 'CONSUMO'
                     ? `${row.item} • ${rowUnitsProgress}`
                     : row.item;
                   return (
                   <tr key={row.id} className="hover:bg-indigo-50/30 transition-colors group">
                      <td className="px-3 py-3.5 align-top">
                        <span className="text-[9px] font-bold text-gray-400 flex items-center gap-1 uppercase tracking-tighter">
                          <Calendar size={10}/>
                          {formatDateBr(row.date)}
                          {String(row.method || '').toUpperCase() !== 'PLANO' ? ` • ${row.time}` : ''}
                        </span>
                      </td>
                      <td className="px-3 py-3.5 align-top text-center">
                         <span className="text-[11px] font-black text-gray-700 uppercase tracking-tight">
                           {formatDateBr(row.referenceDate) || '-'}
                         </span>
                      </td>
                      <td className="px-3 py-3.5 align-top">
                         <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${row.client === 'Consumidor Final' ? 'bg-gray-100 text-gray-400' : 'bg-indigo-50 text-indigo-600'}`}>
                               <User size={14}/>
                            </div>
                            <p className="font-black text-indigo-900 uppercase tracking-tight break-words leading-tight text-[11px]">{row.client}</p>
                         </div>
                      </td>
                      <td className="px-3 py-3.5 align-top text-center">
                         <span className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-tight shadow-sm border ${
                           row.plan === 'Venda'
                             ? 'bg-gray-50 text-gray-500 border-gray-100'
                             : row.plan === 'Crédito Cantina'
                               ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                               : 'bg-white text-indigo-600 border-indigo-100'
                         }`}>
                           {planLabel}
                         </span>
                      </td>
                      <td className="px-3 py-3.5 align-top text-center">
                         <p className="font-bold text-gray-700 uppercase text-[10px] leading-tight max-w-[180px] truncate mx-auto text-center" title={itemLabel}>
                           {itemLabel}
                         </p>
                      </td>
                      <td className="px-3 py-3.5 align-top text-center">
                         <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-md border ${
                           row.type === 'CREDITO'
                             ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                             : row.type === 'CONSUMO'
                               ? 'bg-indigo-50 text-indigo-600 border-indigo-100'
                               : 'bg-blue-50 text-blue-600 border-blue-100'
                         }`}>
                           {row.type.replace('_', ' ')}
                         </span>
                      </td>
                      <td className="px-3 py-3.5 align-top text-center">
                         <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-md border ${
                           row.type === 'CREDITO'
                             ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                             : 'bg-red-50 text-red-700 border-red-200'
                         }`}>
                           {row.type === 'CREDITO' ? 'ENTRADA' : 'SAÍDA'}
                         </span>
                      </td>
                      <td className="px-3 py-3.5 text-center align-top">
                         <div className="flex flex-col items-center">
                            <p className={`font-black ${(row.value || row.total) > 0 ? 'text-sm text-indigo-900' : 'text-[10px] text-gray-500'} uppercase tracking-tight`}>
                               { (row.value || row.total) > 0 ? `R$ ${(row.value || row.total).toFixed(2)}` : 'BAIXA' }
                            </p>
                            <span className="text-[8px] font-black text-gray-400 uppercase tracking-tighter">{row.method}</span>
                         </div>
                      </td>
                      <td className="px-3 py-3.5 text-center align-top">
                         <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase border ${
                           row.status === 'SISTEMA'
                             ? 'bg-indigo-50 text-indigo-700 border-indigo-100'
                             : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                         }`}>
                            {row.status}
                         </span>
                      </td>
                      <td className="px-3 py-3.5 text-left align-top">
                         <div className="flex justify-start gap-1 flex-wrap">
                           <button
                             onClick={() => openEditModal(row)}
                             className="p-1.5 bg-white border text-gray-400 rounded-lg hover:text-amber-600 hover:bg-amber-50 transition-all shadow-sm flex items-center gap-1"
                             title="Editar Transação"
                           >
                              <Pencil size={13} />
                           </button>
                           <button 
                             onClick={() => setSelectedTransaction(row)}
                             className="p-1.5 bg-white border text-gray-400 rounded-lg hover:text-indigo-600 hover:bg-indigo-50 transition-all shadow-sm flex items-center gap-1"
                             title="Ver"
                           >
                              <Eye size={13} />
                           </button>
                           <button
                             onClick={() => handleDeleteTransaction(row)}
                             disabled={deletingTransactionId === row.id}
                             className="p-1.5 bg-white border text-red-400 rounded-lg hover:text-red-600 hover:bg-red-50 transition-all shadow-sm flex items-center gap-1 disabled:opacity-50"
                             title="Excluir Transação"
                           >
                              <Trash2 size={13} />
                            </button>
                         </div>
                      </td>
                   </tr>
                 )})}
              </tbody>
           </table>
        </div>
      </div>

      {/* SUMÁRIO RÁPIDO NO RODAPÉ */}
      <div className="grid grid-cols-1 gap-6 animate-in fade-in duration-700">
         <QuickSummaryCard label="Total Receitas R$" value={`R$ ${totalRevenueFiltered.toFixed(2)}`} sub="Entradas conforme filtros selecionados" icon={<Store />} color="bg-emerald-600" />
         <QuickSummaryCard label="Total Descontos de Consumos R$" value={`R$ ${totalConsumptionDiscountFiltered.toFixed(2)}`} sub="Saídas de consumo conforme filtros" icon={<Sparkles />} color="bg-indigo-600" />
         <QuickSummaryCard label="Ticket Médio Mês" value={`R$ ${monthlyTicketAverage.toFixed(2)}`} sub="Vendas do mês (balcão)" icon={<DollarSign />} color="bg-slate-900" />
      </div>

      {/* MODAL DE DETALHES DA VENDA */}
      {selectedTransaction && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 animate-in fade-in">
           <div className="absolute inset-0 bg-indigo-950/80 backdrop-blur-md" onClick={() => setSelectedTransaction(null)}></div>
           <div className="relative w-full max-w-lg bg-white rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col">
              <div className="bg-gray-900 p-8 text-white flex items-center justify-between">
                 <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center"><ShoppingBag size={24} /></div>
                    <div>
                       <h2 className="text-lg font-black uppercase tracking-tight">Detalhes da Venda</h2>
                       <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">ID: #{selectedTransaction.id}</p>
                    </div>
                 </div>
                 <button onClick={() => setSelectedTransaction(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X size={24} /></button>
              </div>
              
              <div className="p-8 space-y-8">
                 <div className="flex items-center justify-between pb-6 border-b border-gray-100">
                    <div>
                       <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Cliente</p>
                       <p className="text-lg font-black text-indigo-900 uppercase">{selectedTransaction.client}</p>
                    </div>
                    <div className="text-right">
                       <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Data / Hora</p>
                       <p className="text-sm font-bold text-gray-600 uppercase">{formatDateBr(selectedTransaction.date)} • {selectedTransaction.time}</p>
                    </div>
                 </div>

                 <div className="space-y-4">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                       <Layers size={14} className="text-indigo-600" /> Itens Comprados
                    </p>
                    <div className="space-y-2">
                       {getTransactionItemDetails(selectedTransaction).length > 0 ? (
                         getTransactionItemDetails(selectedTransaction).map((item, idx) => (
                            <div key={`${item.name}-${idx}`} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100">
                               <div>
                                 <span className="text-sm font-black text-gray-800 uppercase">{item.name}</span>
                                 <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                                   Qtd: {item.quantity} • Unit: R$ {item.unitPrice.toFixed(2)}
                                 </p>
                               </div>
                               <span className="text-xs font-black text-indigo-700">R$ {item.total.toFixed(2)}</span>
                            </div>
                         ))
                       ) : (
                         <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                           <p className="text-sm font-bold text-gray-700 uppercase">{selectedTransaction.item || 'Sem itens detalhados'}</p>
                         </div>
                       )}
                    </div>
                 </div>

                 <div className="bg-indigo-50 p-6 rounded-[32px] border border-indigo-100 flex items-center justify-between">
                    <div>
                       <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Total Pago</p>
                       <p className="text-3xl font-black text-indigo-900 tracking-tighter">R$ {(selectedTransaction.total || 0).toFixed(2)}</p>
                    </div>
                    <div className="text-right">
                       <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Método</p>
                       <p className="text-xs font-black text-indigo-600 uppercase bg-white px-3 py-1 rounded-full border border-indigo-100 shadow-sm">{selectedTransaction.method}</p>
                    </div>
                 </div>
              </div>

              <div className="p-6 bg-gray-50 border-t text-center">
                 <button onClick={() => setSelectedTransaction(null)} className="px-10 py-4 bg-white border-2 border-gray-100 text-[10px] font-black text-gray-400 uppercase tracking-widest rounded-2xl hover:text-gray-600 hover:border-gray-200 transition-all shadow-sm">Fechar Detalhes</button>
              </div>
           </div>
        </div>
      )}

      {editingTransaction && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4 animate-in fade-in">
          <div className="absolute inset-0 bg-indigo-950/80 backdrop-blur-md" onClick={closeEditModal}></div>
          <div className="relative w-full max-w-2xl bg-white rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="bg-amber-600 p-6 text-white flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black uppercase tracking-tight">Editar Transação</h2>
                <p className="text-[10px] font-bold text-amber-100 uppercase tracking-widest mt-1">ID: #{editingTransaction.id}</p>
              </div>
              <button onClick={closeEditModal} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X size={20} /></button>
            </div>

            <div className="p-6 space-y-4">
              {isCreditTransaction(editingTransaction) ? (
                <>
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Forma de Pagamento</label>
                    <select
                      value={editPaymentMethod}
                      onChange={(e) => setEditPaymentMethod(e.target.value)}
                      className="w-full mt-1 px-3 py-2.5 bg-gray-50 border-2 border-transparent focus:border-amber-500 rounded-xl outline-none text-xs font-black uppercase tracking-widest"
                    >
                      <option value="SALDO">SALDO</option>
                      <option value="PIX">PIX</option>
                      <option value="DINHEIRO">DINHEIRO</option>
                      <option value="DEBITO">DEBITO</option>
                      <option value="CREDITO">CREDITO</option>
                      <option value="CREDITO_COLABORADOR">CREDITO_COLABORADOR</option>
                    </select>
                  </div>

                  <div className="bg-gray-50 border rounded-2xl p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Tipo de Crédito</label>
                      <select
                        value={editCreditType}
                        onChange={(e) => setEditCreditType(e.target.value as 'CANTINA' | 'PLAN')}
                        className="w-full mt-1 px-3 py-2.5 bg-white border-2 border-transparent focus:border-amber-500 rounded-xl outline-none text-xs font-black uppercase tracking-widest"
                      >
                        <option value="CANTINA">Crédito Cantina</option>
                        <option value="PLAN">Crédito Plano</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Plano</label>
                      <select
                        value={editCreditPlanId}
                        onChange={(e) => setEditCreditPlanId(e.target.value)}
                        disabled={editCreditType !== 'PLAN'}
                        className="w-full mt-1 px-3 py-2.5 bg-white border-2 border-transparent focus:border-amber-500 rounded-xl outline-none text-xs font-black uppercase tracking-widest disabled:bg-gray-100 disabled:text-gray-400"
                      >
                        <option value="">Selecionar plano</option>
                        {editPlans.map((plan: any) => (
                          <option key={plan.id} value={plan.id}>
                            {plan.name} • R$ {Number(plan.price || 0).toFixed(2)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Ajustar Valor (R$)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={editCreditValue}
                        onChange={(e) => setEditCreditValue(e.target.value)}
                        className="w-full mt-1 px-3 py-2.5 bg-white border-2 border-transparent focus:border-amber-500 rounded-xl outline-none text-sm font-black"
                      />
                    </div>
                  </div>

                  <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-black text-amber-600 uppercase tracking-widest">
                        {editCreditType === 'PLAN' ? 'Crédito Plano Selecionado' : 'Crédito Cantina'}
                      </p>
                      {editCreditType === 'PLAN' && editCreditPlanId && (
                        <p className="text-[11px] font-black text-amber-700 mt-1">
                          {editPlans.find((p: any) => String(p.id) === String(editCreditPlanId))?.name || 'Plano'}
                        </p>
                      )}
                    </div>
                    <p className="text-2xl font-black text-amber-700">R$ {Number(editCreditValue || 0).toFixed(2)}</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                    {editCategories.map((category) => (
                      <button
                        key={category}
                        onClick={() => setEditActiveCategory(category)}
                        className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border ${
                          editActiveCategory === category
                            ? 'bg-amber-600 text-white border-amber-600'
                            : 'bg-white text-gray-500 border-gray-200 hover:border-amber-300'
                        }`}
                      >
                        {category}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="md:col-span-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Pesquisa</label>
                      <div className="relative mt-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                        <input
                          type="text"
                          value={editSearch}
                          onChange={(e) => setEditSearch(e.target.value)}
                          placeholder="Pesquisar produtos ou planos..."
                          className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border-2 border-transparent focus:border-amber-500 rounded-xl outline-none text-sm font-bold"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Forma de Pagamento</label>
                      <select
                        value={editPaymentMethod}
                        onChange={(e) => setEditPaymentMethod(e.target.value)}
                        className="w-full mt-1 px-3 py-2.5 bg-gray-50 border-2 border-transparent focus:border-amber-500 rounded-xl outline-none text-xs font-black uppercase tracking-widest"
                      >
                        <option value="SALDO">SALDO</option>
                        <option value="PIX">PIX</option>
                        <option value="DINHEIRO">DINHEIRO</option>
                        <option value="DEBITO">DEBITO</option>
                        <option value="CREDITO">CREDITO</option>
                        <option value="CREDITO_COLABORADOR">CREDITO_COLABORADOR</option>
                        <option value="PLANO">PLANO</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="bg-gray-50 border rounded-2xl p-3">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Produtos e Planos</p>
                      <div className="max-h-[280px] overflow-y-auto space-y-2">
                        {String(editActiveCategory).toUpperCase() !== 'PLANOS' && filteredEditProducts.map((product: any) => (
                          <button
                            key={`prod_${product.id}`}
                            onClick={() => addProductToEditCart(product)}
                            className="w-full p-3 bg-white border rounded-xl text-left hover:border-amber-300 transition-colors"
                          >
                            <p className="text-sm font-black text-gray-800 uppercase">{product.name}</p>
                            <p className="text-[10px] font-bold text-gray-400 uppercase">{product.category}</p>
                            <p className="text-xs font-black text-amber-600 mt-1">R$ {Number(product.price || 0).toFixed(2)}</p>
                          </button>
                        ))}
                        {String(editActiveCategory).toUpperCase() === 'PLANOS' && filteredEditPlans.map((plan: any) => (
                          <button
                            key={`plan_${plan.id}`}
                            onClick={() => addPlanToEditCart(plan)}
                            className="w-full p-3 bg-white border rounded-xl text-left hover:border-amber-300 transition-colors"
                          >
                            <p className="text-sm font-black text-gray-800 uppercase">{plan.name}</p>
                            <p className="text-[10px] font-bold text-indigo-400 uppercase">Plano</p>
                            <p className="text-xs font-black text-amber-600 mt-1">R$ {Number(plan.price || 0).toFixed(2)}</p>
                          </button>
                        ))}
                        {filteredEditProducts.length === 0 && filteredEditPlans.length === 0 && (
                          <p className="text-xs font-black text-gray-300 uppercase tracking-widest text-center py-8">Nenhum item encontrado</p>
                        )}
                      </div>
                    </div>

                    <div className="bg-gray-50 border rounded-2xl p-3">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Carrinho</p>
                      <div className="max-h-[280px] overflow-y-auto space-y-2">
                        {editCart.length === 0 ? (
                          <p className="text-xs font-black text-gray-300 uppercase tracking-widest text-center py-8">Carrinho vazio</p>
                        ) : editCart.map((item) => (
                          <div key={item.id} className="p-3 bg-white border rounded-xl">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-black text-gray-800">{item.name}</p>
                              <button onClick={() => removeEditCartItem(item.id)} className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
                            </div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase">{item.type === 'PLAN' ? 'PLANO' : 'PRODUTO'}</p>
                            <div className="mt-2 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <button onClick={() => updateEditCartQuantity(item.id, item.quantity - 1)} className="w-6 h-6 rounded border text-xs font-black">-</button>
                                <span className="text-xs font-black">{item.quantity}</span>
                                <button onClick={() => updateEditCartQuantity(item.id, item.quantity + 1)} className="w-6 h-6 rounded border text-xs font-black">+</button>
                              </div>
                              <p className="text-xs font-black text-amber-700">R$ {(item.quantity * item.price).toFixed(2)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex items-center justify-between">
                    <p className="text-xs font-black text-amber-600 uppercase tracking-widest">Valor Total Atualizado</p>
                    <p className="text-2xl font-black text-amber-700">R$ {editCartTotal.toFixed(2)}</p>
                  </div>
                </>
              )}
            </div>

            <div className="p-5 bg-gray-50 border-t flex justify-end gap-2">
              <button onClick={closeEditModal} className="px-5 py-3 bg-white border rounded-xl text-[10px] font-black uppercase tracking-widest text-gray-500">Cancelar</button>
              <button
                onClick={handleSaveEditTransaction}
                disabled={isSavingEdit}
                className="px-5 py-3 bg-amber-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-amber-700 disabled:opacity-60"
              >
                {isSavingEdit ? 'Salvando...' : 'Salvar Edição'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isCreateModalOpen && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4 animate-in fade-in">
          <div className="absolute inset-0 bg-indigo-950/80 backdrop-blur-md" onClick={closeCreateModal}></div>
          <div className="relative w-full max-w-3xl bg-white rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="bg-emerald-600 p-6 text-white flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black uppercase tracking-tight">Registrar Transação</h2>
                <p className="text-[10px] font-bold text-emerald-100 uppercase tracking-widest mt-1">Lançamento manual no padrão PDV</p>
              </div>
              <button onClick={closeCreateModal} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X size={20} /></button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="md:col-span-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Cliente</label>
                  <label className="mt-1 inline-flex items-center gap-2 text-[10px] font-black text-gray-500 uppercase tracking-widest">
                    <input
                      type="checkbox"
                      checked={createIsConsumerFinal}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setCreateIsConsumerFinal(checked);
                        if (checked) {
                          setCreateClientName('');
                          setShowCreateClientSuggestions(false);
                        }
                      }}
                      className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    Consumidor Final
                  </label>
                  <div className="relative mt-1">
                    <input
                      type="text"
                      value={createClientName}
                      onChange={(e) => {
                        setCreateClientName(e.target.value);
                        setShowCreateClientSuggestions(true);
                      }}
                      onFocus={() => !createIsConsumerFinal && setShowCreateClientSuggestions(true)}
                      onBlur={() => {
                        window.setTimeout(() => setShowCreateClientSuggestions(false), 120);
                      }}
                      placeholder="Digite o nome do cliente..."
                      disabled={createIsConsumerFinal}
                      className="w-full px-3 py-2.5 bg-gray-50 border-2 border-transparent focus:border-emerald-500 rounded-xl outline-none text-sm font-bold disabled:bg-gray-100 disabled:text-gray-400"
                    />
                    {showCreateClientSuggestions && !createIsConsumerFinal && filteredCreateClients.length > 0 && (
                      <div className="absolute z-20 top-[calc(100%+6px)] left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                        <div className="max-h-56 overflow-y-auto">
                          {filteredCreateClients.map((client: any) => (
                            <button
                              key={`create-client-${client.id}`}
                              type="button"
                              onClick={() => {
                                setCreateClientName(String(client.name || 'Consumidor Final'));
                                setShowCreateClientSuggestions(false);
                              }}
                              className="w-full text-left px-3 py-2.5 hover:bg-emerald-50 border-b last:border-b-0 transition-colors"
                            >
                              <p className="text-xs font-black text-gray-800 uppercase">{client.name}</p>
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                Matrícula: {client.registrationId || '-'}
                              </p>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Data</label>
                  <input
                    type="date"
                    value={createDate}
                    onChange={(e) => setCreateDate(e.target.value)}
                    className="w-full mt-1 px-3 py-2.5 bg-gray-50 border-2 border-transparent focus:border-emerald-500 rounded-xl outline-none text-sm font-bold"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Hora</label>
                  <input
                    type="time"
                    value={createTime}
                    onChange={(e) => setCreateTime(e.target.value)}
                    className="w-full mt-1 px-3 py-2.5 bg-gray-50 border-2 border-transparent focus:border-emerald-500 rounded-xl outline-none text-sm font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                {createCategories.map((category) => (
                  <button
                    key={category}
                    onClick={() => setCreateActiveCategory(category)}
                    className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border ${
                      createActiveCategory === category
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white text-gray-500 border-gray-200 hover:border-emerald-300'
                    }`}
                  >
                    {category}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Pesquisa</label>
                  <div className="relative mt-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                    <input
                      type="text"
                      value={createSearch}
                      onChange={(e) => setCreateSearch(e.target.value)}
                      placeholder="Pesquisar produtos ou planos..."
                      className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border-2 border-transparent focus:border-emerald-500 rounded-xl outline-none text-sm font-bold"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Forma de Pagamento</label>
                  <select
                    value={createPaymentMethod}
                    onChange={(e) => setCreatePaymentMethod(e.target.value)}
                    className="w-full mt-1 px-3 py-2.5 bg-gray-50 border-2 border-transparent focus:border-emerald-500 rounded-xl outline-none text-xs font-black uppercase tracking-widest"
                  >
                    <option value="SALDO">SALDO</option>
                    <option value="PIX">PIX</option>
                    <option value="DINHEIRO">DINHEIRO</option>
                    <option value="DEBITO">DEBITO</option>
                    <option value="CREDITO">CREDITO</option>
                    <option value="CREDITO_COLABORADOR">CREDITO_COLABORADOR</option>
                    <option value="PLANO">PLANO</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-gray-50 border rounded-2xl p-3">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Produtos e Planos</p>
                  <div className="max-h-[280px] overflow-y-auto space-y-2">
                    {String(createActiveCategory).toUpperCase() !== 'PLANOS' && filteredCreateProducts.map((product: any) => (
                      <button
                        key={`create_prod_${product.id}`}
                        onClick={() => addProductToCreateCart(product)}
                        className="w-full p-3 bg-white border rounded-xl text-left hover:border-emerald-300 transition-colors"
                      >
                        <p className="text-sm font-black text-gray-800 uppercase">{product.name}</p>
                        <p className="text-[10px] font-bold text-gray-400 uppercase">{product.category}</p>
                        <p className="text-xs font-black text-emerald-600 mt-1">R$ {Number(product.price || 0).toFixed(2)}</p>
                      </button>
                    ))}
                    {String(createActiveCategory).toUpperCase() === 'PLANOS' && filteredCreatePlans.map((plan: any) => (
                      <button
                        key={`create_plan_${plan.id}`}
                        onClick={() => addPlanToCreateCart(plan)}
                        className="w-full p-3 bg-white border rounded-xl text-left hover:border-emerald-300 transition-colors"
                      >
                        <p className="text-sm font-black text-gray-800 uppercase">{plan.name}</p>
                        <p className="text-[10px] font-bold text-indigo-400 uppercase">Plano</p>
                        <p className="text-xs font-black text-emerald-600 mt-1">R$ {Number(plan.price || 0).toFixed(2)}</p>
                      </button>
                    ))}
                    {filteredCreateProducts.length === 0 && filteredCreatePlans.length === 0 && (
                      <p className="text-xs font-black text-gray-300 uppercase tracking-widest text-center py-8">Nenhum item encontrado</p>
                    )}
                  </div>
                </div>

                <div className="bg-gray-50 border rounded-2xl p-3">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Carrinho</p>
                  <div className="max-h-[280px] overflow-y-auto space-y-2">
                    {createCart.length === 0 ? (
                      <p className="text-xs font-black text-gray-300 uppercase tracking-widest text-center py-8">Carrinho vazio</p>
                    ) : createCart.map((item) => (
                      <div key={item.id} className="p-3 bg-white border rounded-xl">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-black text-gray-800">{item.name}</p>
                          <button onClick={() => removeCreateCartItem(item.id)} className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
                        </div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase">{item.type === 'PLAN' ? 'PLANO' : 'PRODUTO'}</p>
                        <div className="mt-2 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <button onClick={() => updateCreateCartQuantity(item.id, item.quantity - 1)} className="w-6 h-6 rounded border text-xs font-black">-</button>
                            <span className="text-xs font-black">{item.quantity}</span>
                            <button onClick={() => updateCreateCartQuantity(item.id, item.quantity + 1)} className="w-6 h-6 rounded border text-xs font-black">+</button>
                          </div>
                          <p className="text-xs font-black text-emerald-700">R$ {(item.quantity * item.price).toFixed(2)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 flex items-center justify-between">
                <p className="text-xs font-black text-emerald-600 uppercase tracking-widest">Valor Total</p>
                <p className="text-2xl font-black text-emerald-700">R$ {createCartTotal.toFixed(2)}</p>
              </div>
            </div>

            <div className="p-5 bg-gray-50 border-t flex justify-end gap-2">
              <button onClick={closeCreateModal} className="px-5 py-3 bg-white border rounded-xl text-[10px] font-black uppercase tracking-widest text-gray-500">Cancelar</button>
              <button
                onClick={handleCreateTransaction}
                disabled={isSavingCreate}
                className="px-5 py-3 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 disabled:opacity-60"
              >
                {isSavingCreate ? 'Salvando...' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

const QuickSummaryCard = ({ label, value, sub, icon, color }: any) => (
  <div className={`${color} w-full p-8 rounded-[40px] text-white shadow-2xl flex items-center justify-between group overflow-hidden relative border-b-8 border-black/10`}>
     <div className="relative z-10">
        <p className="text-[10px] font-black uppercase tracking-[3px] opacity-60 mb-2">{label}</p>
        <p className="text-3xl font-black tracking-tighter mb-1">{value}</p>
        <p className="text-[10px] font-bold opacity-40 uppercase tracking-widest">{sub}</p>
     </div>
     <div className="p-5 bg-white/10 rounded-[28px] backdrop-blur-md relative z-10 group-hover:scale-110 transition-transform duration-500">
        {React.cloneElement(icon as React.ReactElement, { size: 32 })}
     </div>
     <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 blur-2xl"></div>
  </div>
);

export default UnitSalesTransactionsPage;
