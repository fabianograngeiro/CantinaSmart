import React, { useEffect, useMemo, useState } from 'react';
import {
  Search, Trash2, Phone, MessageSquare, Copy, CheckCircle2, AlertCircle, RefreshCw
} from 'lucide-react';
import { User, Enterprise } from '../types';
import ApiService from '../services/api';
import notificationService from '../services/notificationService';

interface WhatsAppContact {
  chatId: string;
  phone: string;
  name: string;
  unreadCount: number;
  lastMessage: string;
  lastTimestamp: number;
  initiatedByClient: boolean;
  labels?: string[];
  avatarUrl?: string | null;
}

interface AdminContactsPageProps {
  currentUser: User;
  activeEnterprise: Enterprise | null;
}

type SyncDiscardedEvent = {
  at: number;
  reason: string;
  chatJid: string;
  chatId: string;
  messageId?: string;
  timestampSec?: number;
  detail?: string;
};

type SyncDiagnosticsSnapshot = {
  counters: Record<string, number>;
  events: SyncDiscardedEvent[];
  totalEvents: number;
  appliedFilters?: {
    reason?: string | null;
    fromMs?: number | null;
    toMs?: number | null;
    limit?: number;
  };
};

const SYNC_REASON_LABELS: Record<string, string> = {
  outside_sync_period_message: 'Mensagem fora do período',
  technical_notice_message: 'Aviso técnico do WhatsApp',
  chat_without_timestamp: 'Chat sem timestamp',
  outside_sync_period_chat: 'Chat fora do período',
  chat_update_without_timestamp: 'Update sem timestamp',
  outside_sync_period_chat_update: 'Update fora do período',
};

const formatSyncReasonLabel = (reason: string) => {
  const key = String(reason || '').trim();
  return SYNC_REASON_LABELS[key] || key || 'Motivo desconhecido';
};

const AdminContactsPage: React.FC<AdminContactsPageProps> = ({ currentUser, activeEnterprise }) => {
  const [contacts, setContacts] = useState<WhatsAppContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [filterType, setFilterType] = useState<'all' | 'with-messages' | 'without-messages'>('all');
  const [isDeleting, setIsDeleting] = useState(false);
  const [syncDiagnostics, setSyncDiagnostics] = useState<SyncDiagnosticsSnapshot>({ counters: {}, events: [], totalEvents: 0 });
  const [syncDiagnosticsLoading, setSyncDiagnosticsLoading] = useState(false);
  const [syncDiagnosticsReason, setSyncDiagnosticsReason] = useState('ALL');
  const [syncDiagnosticsRange, setSyncDiagnosticsRange] = useState<'24H' | '7D' | '30D' | 'ALL'>('7D');

  const loadContacts = async (showSpinner = false) => {
    try {
      if (showSpinner) {
        setLoading(true);
      }
      const response = await ApiService.getWhatsAppChats();
      if (response?.success && Array.isArray(response.chats)) {
        setContacts(response.chats);
      } else {
        setContacts([]);
      }
    } catch (err) {
      console.error('Erro ao carregar contatos WhatsApp:', err);
      notificationService.alerta('Erro ao carregar contatos WhatsApp', 'Não foi possível carregar os contatos. Tente novamente.');
      setContacts([]);
    } finally {
      if (showSpinner) {
        setLoading(false);
      }
    }
  };

  const loadSyncDiagnostics = async (showSpinner = false) => {
    try {
      if (showSpinner) setSyncDiagnosticsLoading(true);

      const now = Date.now();
      const to = now;
      let from: number | undefined;
      if (syncDiagnosticsRange === '24H') from = now - (24 * 60 * 60 * 1000);
      if (syncDiagnosticsRange === '7D') from = now - (7 * 24 * 60 * 60 * 1000);
      if (syncDiagnosticsRange === '30D') from = now - (30 * 24 * 60 * 60 * 1000);

      const response = await ApiService.getWhatsAppSyncDiagnostics({
        limit: 120,
        reason: syncDiagnosticsReason === 'ALL' ? '' : syncDiagnosticsReason,
        from,
        to,
      });

      setSyncDiagnostics({
        counters: response?.counters && typeof response.counters === 'object' ? response.counters : {},
        events: Array.isArray(response?.events) ? response.events : [],
        totalEvents: Number(response?.totalEvents || 0),
        appliedFilters: response?.appliedFilters && typeof response.appliedFilters === 'object' ? response.appliedFilters : undefined,
      });
    } catch (err) {
      console.error('Erro ao carregar diagnóstico de sync:', err);
      setSyncDiagnostics({ counters: {}, events: [], totalEvents: 0 });
    } finally {
      if (showSpinner) setSyncDiagnosticsLoading(false);
    }
  };

  useEffect(() => {
    loadContacts(true);
  }, []);

  useEffect(() => {
    loadSyncDiagnostics(true);
  }, [syncDiagnosticsReason, syncDiagnosticsRange]);

  useEffect(() => {
    const interval = setInterval(() => {
      loadContacts(false);
      loadSyncDiagnostics(false);
    }, 30000);
    return () => clearInterval(interval);
  }, [syncDiagnosticsReason, syncDiagnosticsRange]);

  const syncReasonOptions = useMemo(() => {
    const keys = new Set<string>();
    Object.keys(syncDiagnostics.counters || {}).forEach((key) => keys.add(String(key || '').trim()));
    (syncDiagnostics.events || []).forEach((item) => {
      const reason = String(item?.reason || '').trim();
      if (reason) keys.add(reason);
    });
    return ['ALL', ...Array.from(keys).filter(Boolean).sort()];
  }, [syncDiagnostics]);

  const filteredContacts = useMemo(() => {
    let result = contacts;

    if (filterType === 'with-messages') {
      result = result.filter((c) => String(c.lastMessage || '').trim().length > 0);
    } else if (filterType === 'without-messages') {
      result = result.filter((c) => !String(c.lastMessage || '').trim().length);
    }

    if (searchTerm.trim()) {
      const term = searchTerm.trim().toLowerCase();
      result = result.filter((c) =>
        c.name.toLowerCase().includes(term) ||
        c.phone.includes(term.replace(/\D/g, ''))
      );
    }

    return result.sort((a, b) => Number(b.lastTimestamp || 0) - Number(a.lastTimestamp || 0));
  }, [contacts, searchTerm, filterType]);

  const formatTimestamp = (timestamp?: number) => {
    if (!timestamp) return 'Sem data';
    const ts = timestamp < 1e11 ? timestamp * 1000 : timestamp;
    const date = new Date(ts);
    if (!Number.isFinite(date.getTime())) return 'Sem data';

    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const timeLabel = new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);

    if (date.toDateString() === today.toDateString()) return `Hoje, ${timeLabel}`;
    if (date.toDateString() === yesterday.toDateString()) return `Ontem, ${timeLabel}`;

    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  const handleCopyPhone = (phone: string) => {
    navigator.clipboard.writeText(phone).then(() => {
      notificationService.informativo('Sucesso', 'Telefone copiado para a área de transferência!');
    });
  };

  const toggleSelectContact = (chatId: string) => {
    const newSelected = new Set(selectedContacts);
    if (newSelected.has(chatId)) {
      newSelected.delete(chatId);
    } else {
      newSelected.add(chatId);
    }
    setSelectedContacts(newSelected);
  };

  const handleDeleteContacts = async () => {
    if (selectedContacts.size === 0) return;

    const confirmed = window.confirm(
      `Tem certeza que deseja excluir ${selectedContacts.size} contato(s)? Esta ação não pode ser desfeita.`
    );
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      const deletedCount = selectedContacts.size;
      setContacts((prev) =>
        prev.filter((c) => !selectedContacts.has(c.chatId))
      );
      setSelectedContacts(new Set());
      notificationService.informativo('Sucesso', `${deletedCount} contato(s) excluído(s)`);
    } catch (err) {
      console.error('Erro ao excluir contatos:', err);
      notificationService.alerta('Erro ao excluir contatos', 'Não foi possível excluir os contatos selecionados.');
    } finally {
      setIsDeleting(false);
    }
  };

  const selectAllVisible = () => {
    const allIds = new Set(filteredContacts.map((c) => c.chatId));
    setSelectedContacts(allIds);
  };

  const clearSelection = () => {
    setSelectedContacts(new Set());
  };

  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-slate-50 to-white dark:from-zinc-900 dark:to-zinc-950 p-6">
      <div className="mb-6 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-black text-gray-800 dark:text-zinc-100">
              Gerenciador de Contatos WhatsApp
            </h1>
            <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">
              Gerencie todos os contatos sincronizados do WhatsApp
            </p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-black text-blue-600">{filteredContacts.length}</p>
            <p className="text-xs text-gray-500 dark:text-zinc-400">Contatos</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={18} />
            <input
              type="text"
              placeholder="Buscar por nome ou telefone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-700 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as any)}
            className="px-4 py-2.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-700 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Todos os contatos</option>
            <option value="with-messages">Com mensagens</option>
            <option value="without-messages">Sem mensagens</option>
          </select>

          {selectedContacts.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-600 dark:text-zinc-300">
                {selectedContacts.size} selecionado(s)
              </span>
              <button
                onClick={handleDeleteContacts}
                disabled={isDeleting}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold text-sm disabled:opacity-50 transition-all"
              >
                <Trash2 size={16} />
                Excluir
              </button>
            </div>
          )}
        </div>

        {selectedContacts.size > 0 && (
          <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-500/10 rounded-lg border border-blue-200 dark:border-blue-500/30">
            <AlertCircle size={18} className="text-blue-600 dark:text-blue-400 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                {selectedContacts.size} contato(s) selecionado(s)
              </p>
            </div>
            <button
              onClick={selectAllVisible}
              className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
            >
              Selecionar Todos
            </button>
            <button
              onClick={clearSelection}
              className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
            >
              Limpar
            </button>
          </div>
        )}

        <div className="rounded-xl border border-orange-200 dark:border-orange-500/30 bg-orange-50/70 dark:bg-orange-500/5 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black text-orange-800 dark:text-orange-300 uppercase tracking-wide">Quarentena de Sync WhatsApp</p>
              <p className="text-xs text-orange-700 dark:text-orange-200/80">Eventos descartados por filtros técnicos do sincronismo.</p>
            </div>
            <button
              type="button"
              onClick={() => loadSyncDiagnostics(true)}
              disabled={syncDiagnosticsLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-orange-300 text-orange-800 dark:text-orange-300 text-xs font-black uppercase tracking-widest hover:bg-orange-100 dark:hover:bg-orange-500/10 disabled:opacity-60"
            >
              <RefreshCw size={13} className={syncDiagnosticsLoading ? 'animate-spin' : ''} />
              Atualizar
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] font-black text-orange-700 dark:text-orange-300 uppercase tracking-widest">Motivo</label>
              <select
                value={syncDiagnosticsReason}
                onChange={(e) => setSyncDiagnosticsReason(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-lg border border-orange-200 dark:border-orange-500/30 bg-white dark:bg-zinc-800 text-xs font-semibold"
              >
                {syncReasonOptions.map((reason) => (
                  <option key={reason} value={reason}>
                    {reason === 'ALL' ? 'Todos os motivos' : formatSyncReasonLabel(reason)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black text-orange-700 dark:text-orange-300 uppercase tracking-widest">Período</label>
              <select
                value={syncDiagnosticsRange}
                onChange={(e) => setSyncDiagnosticsRange(e.target.value as '24H' | '7D' | '30D' | 'ALL')}
                className="w-full mt-1 px-3 py-2 rounded-lg border border-orange-200 dark:border-orange-500/30 bg-white dark:bg-zinc-800 text-xs font-semibold"
              >
                <option value="24H">Últimas 24h</option>
                <option value="7D">Últimos 7 dias</option>
                <option value="30D">Últimos 30 dias</option>
                <option value="ALL">Todo período</option>
              </select>
            </div>
            <div className="rounded-lg border border-orange-200 dark:border-orange-500/30 bg-white dark:bg-zinc-800 px-3 py-2.5 flex flex-col justify-center">
              <p className="text-[10px] font-black text-orange-700 dark:text-orange-300 uppercase tracking-widest">Total de descartes</p>
              <p className="text-2xl font-black text-orange-700 dark:text-orange-300">{syncDiagnostics.totalEvents}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {Object.entries(syncDiagnostics.counters || {}).length === 0 ? (
              <span className="text-xs font-semibold text-orange-700/80 dark:text-orange-200/80">Sem descartes no filtro atual.</span>
            ) : (
              Object.entries(syncDiagnostics.counters || {})
                .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))
                .map(([reason, count]) => (
                  <span key={reason} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white dark:bg-zinc-800 border border-orange-200 dark:border-orange-500/30 text-[11px] font-black text-orange-700 dark:text-orange-300">
                    {formatSyncReasonLabel(reason)}: {Number(count || 0)}
                  </span>
                ))
            )}
          </div>

          {syncDiagnostics.events.length > 0 && (
            <div className="rounded-lg border border-orange-200 dark:border-orange-500/30 bg-white dark:bg-zinc-800 overflow-hidden">
              <table className="min-w-full text-xs">
                <thead className="bg-orange-100/60 dark:bg-orange-500/10">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-black uppercase tracking-widest text-orange-700 dark:text-orange-300">Quando</th>
                    <th className="px-2 py-1.5 text-left font-black uppercase tracking-widest text-orange-700 dark:text-orange-300">Motivo</th>
                    <th className="px-2 py-1.5 text-left font-black uppercase tracking-widest text-orange-700 dark:text-orange-300">Conversa</th>
                    <th className="px-2 py-1.5 text-left font-black uppercase tracking-widest text-orange-700 dark:text-orange-300">Detalhe</th>
                  </tr>
                </thead>
                <tbody>
                  {syncDiagnostics.events.slice(0, 8).map((item, idx) => (
                    <tr key={`${item.at}_${item.chatId}_${idx}`} className="border-t border-orange-100 dark:border-orange-500/20">
                      <td className="px-2 py-1.5 text-slate-700 dark:text-zinc-200">{formatTimestamp(item.at)}</td>
                      <td className="px-2 py-1.5 text-slate-700 dark:text-zinc-200">{formatSyncReasonLabel(item.reason)}</td>
                      <td className="px-2 py-1.5 text-slate-700 dark:text-zinc-200">{String(item.chatId || item.chatJid || '-')}</td>
                      <td className="px-2 py-1.5 text-slate-700 dark:text-zinc-200">{String(item.detail || item.messageId || '-')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center space-y-3">
              <div className="animate-spin inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
              <p className="text-sm text-gray-600 dark:text-zinc-400">Carregando contatos...</p>
            </div>
          </div>
        ) : filteredContacts.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center space-y-3">
              <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-zinc-800 flex items-center justify-center mx-auto">
                <MessageSquare className="text-gray-400" size={32} />
              </div>
              <p className="text-gray-600 dark:text-zinc-400 font-medium">Nenhum contato encontrado</p>
              <p className="text-xs text-gray-500 dark:text-zinc-500">
                Sincronize o WhatsApp para importar contatos
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-slate-100 dark:bg-zinc-700/60">
                  <tr>
                    <th className="px-3 py-3 text-left w-10">
                      <input
                        type="checkbox"
                        checked={filteredContacts.length > 0 && selectedContacts.size === filteredContacts.length}
                        onChange={(e) => (e.target.checked ? selectAllVisible() : clearSelection())}
                        className="w-4 h-4 accent-blue-600 cursor-pointer"
                      />
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-black uppercase tracking-wide text-slate-600 dark:text-zinc-200">Contato</th>
                    <th className="px-3 py-3 text-left text-xs font-black uppercase tracking-wide text-slate-600 dark:text-zinc-200">Telefone</th>
                    <th className="px-3 py-3 text-left text-xs font-black uppercase tracking-wide text-slate-600 dark:text-zinc-200">Última mensagem</th>
                    <th className="px-3 py-3 text-left text-xs font-black uppercase tracking-wide text-slate-600 dark:text-zinc-200">Última conversa</th>
                    <th className="px-3 py-3 text-left text-xs font-black uppercase tracking-wide text-slate-600 dark:text-zinc-200">Status</th>
                    <th className="px-3 py-3 text-right text-xs font-black uppercase tracking-wide text-slate-600 dark:text-zinc-200">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-zinc-700">
                  {filteredContacts.map((contact) => (
                    <tr key={contact.chatId} className="hover:bg-slate-50 dark:hover:bg-zinc-700/30 transition-colors">
                      <td className="px-3 py-3 align-middle">
                        <input
                          type="checkbox"
                          checked={selectedContacts.has(contact.chatId)}
                          onChange={() => toggleSelectContact(contact.chatId)}
                          className="w-4 h-4 accent-blue-600 cursor-pointer"
                        />
                      </td>
                      <td className="px-3 py-3 align-middle">
                        <div className="flex items-center gap-3 min-w-[220px]">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-sm shrink-0 overflow-hidden">
                            {contact.avatarUrl ? (
                              <img src={contact.avatarUrl} alt={contact.name} className="w-full h-full object-cover" />
                            ) : (
                              <span>{String(contact.name || '?').charAt(0).toUpperCase()}</span>
                            )}
                          </div>
                          <p className="font-bold text-gray-800 dark:text-zinc-100 truncate max-w-[260px]">{contact.name || 'Sem nome'}</p>
                        </div>
                      </td>
                      <td className="px-3 py-3 align-middle">
                        <button
                          onClick={() => handleCopyPhone(contact.phone)}
                          className="text-sm text-blue-600 dark:text-blue-400 hover:underline font-semibold inline-flex items-center gap-1"
                        >
                          <Phone size={12} />
                          {contact.phone}
                        </button>
                      </td>
                      <td className="px-3 py-3 align-middle">
                        <p className="text-sm text-gray-700 dark:text-zinc-200 truncate max-w-[360px]">
                          {String(contact.lastMessage || '').trim() || 'Sem mensagens'}
                        </p>
                      </td>
                      <td className="px-3 py-3 align-middle">
                        <p className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                          {formatTimestamp(contact.lastTimestamp)}
                        </p>
                      </td>
                      <td className="px-3 py-3 align-middle">
                        <div className="flex flex-wrap gap-1.5">
                          {contact.unreadCount > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 text-[11px] font-bold">
                              <AlertCircle size={11} />
                              {contact.unreadCount}
                            </span>
                          )}
                          {contact.initiatedByClient && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-500/20 text-green-800 dark:text-green-300 text-[11px] font-bold">
                              <CheckCircle2 size={11} />
                              Cliente
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 align-middle text-right">
                        <button
                          onClick={() => handleCopyPhone(contact.phone)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
                        >
                          <Copy size={12} />
                          Copiar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {!loading && contacts.length > 0 && (
        <div className="mt-6 pt-6 border-t border-slate-200 dark:border-zinc-700">
          <div className="grid grid-cols-4 gap-4">
            <div className="p-4 bg-blue-50 dark:bg-blue-500/10 rounded-lg border border-blue-200 dark:border-blue-500/30">
              <p className="text-xs text-blue-600 dark:text-blue-400 font-bold uppercase">Total de Contatos</p>
              <p className="text-2xl font-black text-blue-700 dark:text-blue-300">{contacts.length}</p>
            </div>
            <div className="p-4 bg-green-50 dark:bg-green-500/10 rounded-lg border border-green-200 dark:border-green-500/30">
              <p className="text-xs text-green-600 dark:text-green-400 font-bold uppercase">Com Mensagens</p>
              <p className="text-2xl font-black text-green-700 dark:text-green-300">
                {contacts.filter((c) => c.lastMessage).length}
              </p>
            </div>
            <div className="p-4 bg-amber-50 dark:bg-amber-500/10 rounded-lg border border-amber-200 dark:border-amber-500/30">
              <p className="text-xs text-amber-600 dark:text-amber-400 font-bold uppercase">Não Lidas</p>
              <p className="text-2xl font-black text-amber-700 dark:text-amber-300">
                {contacts.reduce((sum, c) => sum + (c.unreadCount || 0), 0)}
              </p>
            </div>
            <div className="p-4 bg-purple-50 dark:bg-purple-500/10 rounded-lg border border-purple-200 dark:border-purple-500/30">
              <p className="text-xs text-purple-600 dark:text-purple-400 font-bold uppercase">Iniciado por Cliente</p>
              <p className="text-2xl font-black text-purple-700 dark:text-purple-300">
                {contacts.filter((c) => c.initiatedByClient).length}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminContactsPage;
