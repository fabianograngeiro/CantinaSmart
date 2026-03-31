import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, MessageCircle, Power, QrCode, RefreshCw, Settings, Clock3, CheckCircle2 } from 'lucide-react';
import ApiService from '../services/api';

type WhatsAppQrSnapshot = {
  state: 'DISCONNECTED' | 'INITIALIZING' | 'QR_READY' | 'CONNECTED' | 'ERROR';
  connected: boolean;
  qrAvailable: boolean;
  qrDataUrl: string | null;
  phoneNumber: string | null;
  lastError: string | null;
  sessionName?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  syncFullHistory?: boolean;
  safeSyncMode?: boolean;
  syncProgress?: {
    active: boolean;
    mode: 'SAFE' | 'NORMAL';
    phase: 'IDLE' | 'BOOTSTRAP' | 'AWAITING_QR_SCAN' | 'CONNECTING' | 'SYNCING_HISTORY' | 'RESYNC_LABELS' | 'FINALIZING' | 'DONE' | 'ERROR';
    progressPct: number;
    message: string;
    startedAt: number | null;
    finishedAt: number | null;
    elapsedSec: number;
    etaSec: number | null;
    estimatedTotalSec: number | null;
    processedChats: number;
    processedContacts: number;
    restoredConversations: number;
    processedMessages: number;
    throttledFeatures: string[];
  };
};

const DEFAULT_STATUS: WhatsAppQrSnapshot = {
  state: 'DISCONNECTED',
  connected: false,
  qrAvailable: false,
  qrDataUrl: null,
  phoneNumber: null,
  lastError: null,
};

type WhatsAppQrConnectorProps = {
  variant?: 'default' | 'session';
};

const WhatsAppQrConnector: React.FC<WhatsAppQrConnectorProps> = ({ variant = 'default' }) => {
  const [status, setStatus] = useState<WhatsAppQrSnapshot>(DEFAULT_STATUS);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [sessionName, setSessionName] = useState('');
  const [periodMode, setPeriodMode] = useState<'days' | 'range'>('days');
  const [durationDays, setDurationDays] = useState('30');
  const [startDateInput, setStartDateInput] = useState('');
  const [endDateInput, setEndDateInput] = useState('');
  const [syncFullHistory, setSyncFullHistory] = useState(true);
  const [safeSyncMode, setSafeSyncMode] = useState(true);
  const [syncContacts, setSyncContacts] = useState(true);
  const [syncHistories, setSyncHistories] = useState(true);
  const hasInitializedRef = useRef(false);
  const isLoadingStatusRef = useRef(false);
  const hasLoggedOfflineRef = useRef(false);

  const STORAGE_KEYS = {
    sessionName: 'whatsapp_session_name',
    periodMode: 'whatsapp_session_period_mode',
    durationDays: 'whatsapp_session_duration_days',
    startDate: 'whatsapp_session_start_date',
    endDate: 'whatsapp_session_end_date',
    syncFullHistory: 'whatsapp_session_sync_full_history',
    safeSyncMode: 'whatsapp_session_safe_sync_mode',
    syncContacts: 'whatsapp_session_sync_contacts',
    syncHistories: 'whatsapp_session_sync_histories',
  } as const;

  const isBackendUnreachableError = (err: unknown) => {
    if (!err) return false;
    const message = String((err as any)?.message || err).toLowerCase();
    return (
      message.includes('failed to fetch')
      || message.includes('networkerror')
      || message.includes('err_connection_refused')
      || message.includes('backend do whatsapp indisponivel')
      || message.includes('backend do whatsapp indisponível')
    );
  };

  const loadStatus = async () => {
    if (isLoadingStatusRef.current) return;
    isLoadingStatusRef.current = true;
    try {
      const snapshot = await ApiService.getWhatsAppQr();
      hasLoggedOfflineRef.current = false;
      setStatus({
        state: snapshot?.state || 'DISCONNECTED',
        connected: Boolean(snapshot?.connected),
        qrAvailable: Boolean(snapshot?.qrAvailable),
        qrDataUrl: snapshot?.qrDataUrl || null,
        phoneNumber: snapshot?.phoneNumber || null,
        lastError: snapshot?.lastError || null,
        sessionName: snapshot?.sessionName || null,
        startDate: snapshot?.startDate || null,
        endDate: snapshot?.endDate || null,
        syncFullHistory: Boolean(snapshot?.syncFullHistory),
        safeSyncMode: snapshot?.safeSyncMode !== false,
        syncProgress: snapshot?.syncProgress || undefined,
      });
    } catch (err) {
      const unreachable = isBackendUnreachableError(err);
      if (!unreachable || !hasLoggedOfflineRef.current) {
        if (unreachable) {
          console.warn('Backend do WhatsApp indisponível no momento.');
          hasLoggedOfflineRef.current = true;
        } else {
          console.error('Erro ao buscar status do WhatsApp:', err);
        }
      }
      setStatus((prev) => ({
        ...prev,
        state: 'ERROR',
        lastError: unreachable
          ? 'Backend do WhatsApp indisponível (http://localhost:3001). Verifique se o servidor backend está em execução.'
          : (err instanceof Error ? err.message : 'Falha ao buscar status do WhatsApp.'),
      }));
    } finally {
      isLoadingStatusRef.current = false;
      setLoading(false);
    }
  };

  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    const bootstrap = async () => {
      try {
        const todayDate = new Date();
        const historyStartDate = new Date(todayDate);
        historyStartDate.setDate(historyStartDate.getDate() - 29);
        const today = todayDate.toISOString().slice(0, 10);
        const defaultHistoryStart = historyStartDate.toISOString().slice(0, 10);
        const savedSessionName = localStorage.getItem(STORAGE_KEYS.sessionName) || '';
        const savedPeriodMode = localStorage.getItem(STORAGE_KEYS.periodMode) === 'range' ? 'range' : 'days';
        const savedDurationDays = localStorage.getItem(STORAGE_KEYS.durationDays) || '30';
        const savedStartDate = localStorage.getItem(STORAGE_KEYS.startDate) || defaultHistoryStart;
        const savedEndDate = localStorage.getItem(STORAGE_KEYS.endDate) || today;
        const savedSync = localStorage.getItem(STORAGE_KEYS.syncFullHistory);
        const savedSafeMode = localStorage.getItem(STORAGE_KEYS.safeSyncMode);
        const savedSyncContacts = localStorage.getItem(STORAGE_KEYS.syncContacts);
        const savedSyncHistories = localStorage.getItem(STORAGE_KEYS.syncHistories);

        setSessionName(savedSessionName);
        setPeriodMode(savedPeriodMode);
        setDurationDays(savedDurationDays);
        setStartDateInput(savedStartDate);
        setEndDateInput(savedEndDate);
        setSyncFullHistory(savedSync !== 'false');
        setSafeSyncMode(savedSafeMode !== 'false');
        setSyncContacts(savedSyncContacts !== 'false');
        setSyncHistories(savedSyncHistories !== 'false');

        const snapshot = await ApiService.getWhatsAppQr();
        setStatus({
          state: snapshot?.state || 'DISCONNECTED',
          connected: Boolean(snapshot?.connected),
          qrAvailable: Boolean(snapshot?.qrAvailable),
          qrDataUrl: snapshot?.qrDataUrl || null,
          phoneNumber: snapshot?.phoneNumber || null,
          lastError: snapshot?.lastError || null,
          sessionName: snapshot?.sessionName || null,
          startDate: snapshot?.startDate || null,
          endDate: snapshot?.endDate || null,
          syncFullHistory: Boolean(snapshot?.syncFullHistory),
          safeSyncMode: snapshot?.safeSyncMode !== false,
          syncProgress: snapshot?.syncProgress || undefined,
        });
      } catch (err) {
        if (!isBackendUnreachableError(err)) {
          console.error('Erro ao inicializar sessão do WhatsApp:', err);
        }
        await loadStatus();
      } finally {
        setLoading(false);
      }
    };

    bootstrap();
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.sessionName, sessionName);
    localStorage.setItem(STORAGE_KEYS.periodMode, periodMode);
    localStorage.setItem(STORAGE_KEYS.durationDays, durationDays);
    localStorage.setItem(STORAGE_KEYS.startDate, startDateInput);
    localStorage.setItem(STORAGE_KEYS.endDate, endDateInput);
    localStorage.setItem(STORAGE_KEYS.syncFullHistory, String(syncFullHistory));
    localStorage.setItem(STORAGE_KEYS.safeSyncMode, String(safeSyncMode));
    localStorage.setItem(STORAGE_KEYS.syncContacts, String(syncContacts));
    localStorage.setItem(STORAGE_KEYS.syncHistories, String(syncHistories));
  }, [sessionName, periodMode, durationDays, startDateInput, endDateInput, syncFullHistory, safeSyncMode, syncContacts, syncHistories]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      loadStatus();
    }, isBackendUnreachableError(status.lastError) ? 12000 : 4000);

    return () => window.clearInterval(interval);
  }, [status.lastError]);

  const handleStart = async () => {
    const normalizedSessionName = String(sessionName || '').trim();
    if (!normalizedSessionName) {
      setStatus((prev) => ({
        ...prev,
        state: 'ERROR',
        lastError: 'Informe um nome para a sessão WhatsApp antes de gerar o QR Code.',
      }));
      return;
    }

    const today = new Date();
    const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);
    let computedStart = '';
    let computedEnd = '';
    if (periodMode === 'days') {
      const days = Math.max(1, Number(durationDays) || 1);
      const start = new Date(today);
      start.setDate(start.getDate() - (days - 1));
      computedStart = toIsoDate(start);
      computedEnd = toIsoDate(today);
    } else {
      computedStart = String(startDateInput || '').trim();
      computedEnd = String(endDateInput || '').trim();
      if (!computedStart || !computedEnd) {
        setStatus((prev) => ({
          ...prev,
          state: 'ERROR',
          lastError: 'Informe data de início e fim da sessão para gerar o QR Code.',
        }));
        return;
      }
      if (computedEnd < computedStart) {
        setStatus((prev) => ({
          ...prev,
          state: 'ERROR',
          lastError: 'A data final deve ser maior ou igual à data inicial.',
        }));
        return;
      }
    }

    setStarting(true);
    try {
      await ApiService.startWhatsAppSession({
        forceNewSession: true,
        sessionName: normalizedSessionName,
        startDate: computedStart,
        endDate: computedEnd,
        syncFullHistory,
        safeSyncMode,
        syncContacts,
        syncHistories
      });
      await loadStatus();
      window.setTimeout(() => {
        loadStatus();
      }, 1200);
    } catch (err) {
      console.error('Erro ao iniciar sessão do WhatsApp:', err);
      setStatus((prev) => ({
        ...prev,
        state: 'ERROR',
        lastError: err instanceof Error ? err.message : 'Falha ao iniciar sessão do WhatsApp.',
      }));
    } finally {
      setStarting(false);
    }
  };

  const handleStop = async () => {
    setStopping(true);
    try {
      await ApiService.stopWhatsAppSession();
      await loadStatus();
    } catch (err) {
      console.error('Erro ao encerrar sessão do WhatsApp:', err);
      setStatus((prev) => ({
        ...prev,
        state: 'ERROR',
        lastError: err instanceof Error ? err.message : 'Falha ao encerrar sessão do WhatsApp.',
      }));
    } finally {
      setStopping(false);
    }
  };

  const statusLabel = status.connected
    ? 'Conectado'
    : status.state === 'QR_READY'
      ? 'Aguardando leitura do QR Code'
      : status.state === 'INITIALIZING'
        ? 'Inicializando sessão'
        : status.state === 'ERROR'
          ? 'Erro na sessão'
          : 'Desconectado';
  const formLocked = status.connected;
  const syncProgress = status.syncProgress;
  const showSyncProgress = Boolean(syncProgress && (syncProgress.active || syncProgress.phase === 'DONE' || syncProgress.phase === 'ERROR'));
  const isConversationSyncRunning = Boolean(
    syncProgress
    && syncProgress.phase !== 'DONE'
    && syncProgress.phase !== 'ERROR'
    && (syncProgress.active || status.connected)
  );
  const showConversationSyncIndicator = Boolean(status.connected || showSyncProgress);
  const conversationSyncIndicator = isConversationSyncRunning
    ? {
      label: 'Sincronizando histórico',
      description: 'Carregando conversas antigas e consolidando cache local.',
      badgeClass: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
      dotClass: 'bg-amber-500',
      pulse: true,
    }
    : {
      label: 'Escutando novas mensagens',
      description: 'Sincronização concluída. Novas conversas serão capturadas em tempo real.',
      badgeClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
      dotClass: 'bg-emerald-500',
      pulse: false,
    };

  const formatDuration = (totalSec: number | null | undefined) => {
    const safe = Number(totalSec || 0);
    if (!Number.isFinite(safe) || safe <= 0) return '--';
    const h = Math.floor(safe / 3600);
    const m = Math.floor((safe % 3600) / 60);
    const s = safe % 60;
    if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
    if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
    return `${s}s`;
  };

  const syncPhaseLabelMap: Record<string, string> = {
    IDLE: 'Parado',
    BOOTSTRAP: 'Preparação',
    AWAITING_QR_SCAN: 'Aguardando QR',
    CONNECTING: 'Conectando',
    SYNCING_HISTORY: 'Sincronizando histórico',
    RESYNC_LABELS: 'Sincronizando etiquetas',
    FINALIZING: 'Finalizando',
    DONE: 'Concluído',
    ERROR: 'Com erro',
  };

  const canGenerateQr = Boolean(
    String(sessionName || '').trim()
    && (
      periodMode === 'days'
        ? Number(durationDays) > 0
        : String(startDateInput || '').trim() && String(endDateInput || '').trim() && endDateInput >= startDateInput
    )
  );

  const syncHistorySelection = periodMode === 'days'
    ? (['7', '15', '30', '60'].includes(String(durationDays)) ? String(durationDays) : '30')
    : 'custom';

  const handleSyncHistorySelection = (value: string) => {
    if (formLocked) return;
    if (value === 'custom') {
      setPeriodMode('range');
      return;
    }
    setPeriodMode('days');
    setDurationDays(value);
  };

  if (variant === 'session') {
    return (
      <section className="max-w-3xl mx-auto rounded-[20px] border border-emerald-100 bg-white shadow-[0_12px_36px_rgba(2,6,23,0.1)] overflow-hidden dark:bg-[#121214] dark:border-white/10 dark:ring-1 dark:ring-white/5">
        <div className="px-4 py-3 border-b border-slate-200 flex items-start justify-between dark:border-white/10 dark:bg-zinc-900/70">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <Settings size={16} />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-800 dark:text-zinc-100 leading-tight">Configuração da Sessão</h3>
              <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400">Configure a conexão do WhatsApp da unidade</p>
            </div>
          </div>
          <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.12em] ${formLocked ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-300'}`}>
            {formLocked ? 'Campos bloqueados' : 'Edição liberada'}
          </span>
        </div>

        <div className="p-4 space-y-3 bg-gradient-to-b from-white to-slate-50/70 dark:from-[#121214] dark:to-zinc-900">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2.5 flex items-center justify-between dark:bg-zinc-900/80 dark:border-emerald-500/30">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <CheckCircle2 size={16} />
              </div>
              <div>
                <p className="text-sm font-black text-slate-800 dark:text-zinc-100">Status da Conexão</p>
                <p className="text-xs font-semibold text-emerald-600">
                  {status.connected ? 'WhatsApp conectado com sucesso' : statusLabel}
                </p>
              </div>
            </div>
            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.12em] ${status.connected ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
              {status.connected ? 'Online' : 'Offline'}
            </span>
          </div>

          {showConversationSyncIndicator && (
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 flex items-center justify-between gap-3 dark:bg-zinc-900 dark:border-white/10">
              <div className="min-w-0">
                <p className="text-sm font-black text-slate-800 dark:text-zinc-100">Sincronização de conversas</p>
                <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400 truncate">{conversationSyncIndicator.description}</p>
              </div>
              <span className={`shrink-0 inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.08em] ${conversationSyncIndicator.badgeClass}`}>
                <span className={`w-2 h-2 rounded-full ${conversationSyncIndicator.dotClass} ${conversationSyncIndicator.pulse ? 'animate-pulse' : ''}`} />
                {conversationSyncIndicator.label}
              </span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-black text-slate-800 dark:text-zinc-100">Nome da sessão</label>
            <input
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              disabled={formLocked}
              placeholder="Ex: Vendas São Paulo"
              className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 focus:border-emerald-400 outline-none text-sm font-semibold text-slate-800 bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed dark:bg-zinc-900 dark:border-white/10 dark:text-zinc-100 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
            />
          </div>

          <label className="flex items-center justify-between rounded-xl border-2 border-slate-200 bg-white px-3 py-2 dark:bg-zinc-900 dark:border-white/10">
            <div>
              <p className="text-sm font-black text-slate-800 dark:text-zinc-100">Sincronizar conversa completa</p>
              <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400">Inclui etiquetas, foto de perfil e demais dados da conversa.</p>
            </div>
            <button
              type="button"
              disabled={formLocked}
              onClick={() => setSyncFullHistory((prev) => !prev)}
              className={`relative inline-flex h-8 w-16 items-center rounded-full transition-colors ${syncFullHistory ? 'bg-emerald-500' : 'bg-slate-300'} disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${syncFullHistory ? 'translate-x-9' : 'translate-x-1'}`} />
            </button>
          </label>

          <label className="flex items-center justify-between rounded-xl border-2 border-slate-200 bg-white px-3 py-2 dark:bg-zinc-900 dark:border-white/10">
            <div>
              <p className="text-sm font-black text-slate-800 dark:text-zinc-100">Modo protegido de sincronização</p>
              <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400">Reduz tarefas paralelas para priorizar CPU/RAM na sincronização.</p>
            </div>
            <button
              type="button"
              disabled={formLocked}
              onClick={() => setSafeSyncMode((prev) => !prev)}
              className={`relative inline-flex h-8 w-16 items-center rounded-full transition-colors ${safeSyncMode ? 'bg-indigo-600' : 'bg-slate-300'} disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${safeSyncMode ? 'translate-x-9' : 'translate-x-1'}`} />
            </button>
          </label>

          <div className="space-y-2">
            <p className="text-sm font-black text-slate-800 dark:text-zinc-100">Opções de sincronização</p>
            <label className="flex items-center justify-between rounded-xl border-2 border-slate-200 bg-white px-3 py-2 dark:bg-zinc-900 dark:border-white/10">
              <div>
                <p className="text-sm font-semibold text-slate-700 dark:text-zinc-100">Sincronizar contatos</p>
                <p className="text-xs font-medium text-slate-500 dark:text-zinc-400">Importar nomes, fotos e informações dos contatos.</p>
              </div>
              <button
                type="button"
                disabled={formLocked}
                onClick={() => setSyncContacts((prev) => !prev)}
                className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors ${syncContacts ? 'bg-blue-500' : 'bg-slate-300'} disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${syncContacts ? 'translate-x-7' : 'translate-x-1'}`} />
              </button>
            </label>

            <label className="flex items-center justify-between rounded-xl border-2 border-slate-200 bg-white px-3 py-2 dark:bg-zinc-900 dark:border-white/10">
              <div>
                <p className="text-sm font-semibold text-slate-700 dark:text-zinc-100">Sincronizar histórico de conversas</p>
                <p className="text-xs font-medium text-slate-500 dark:text-zinc-400">Restaurar mensagens do período selecionado.</p>
              </div>
              <button
                type="button"
                disabled={formLocked}
                onClick={() => setSyncHistories((prev) => !prev)}
                className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors ${syncHistories ? 'bg-purple-500' : 'bg-slate-300'} disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${syncHistories ? 'translate-x-7' : 'translate-x-1'}`} />
              </button>
            </label>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-black text-slate-800 dark:text-zinc-100">Período de sincronização</label>
            <div className="relative">
              <Clock3 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <select
                value={syncHistorySelection}
                onChange={(e) => handleSyncHistorySelection(e.target.value)}
                disabled={formLocked}
                className="w-full pl-10 pr-3 py-2 rounded-xl border-2 border-slate-200 focus:border-emerald-400 outline-none text-sm font-semibold text-slate-700 bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed dark:bg-zinc-900 dark:border-white/10 dark:text-zinc-100 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
              >
                <option value="7">Últimos 7 dias</option>
                <option value="15">Últimos 15 dias</option>
                <option value="30">Últimos 30 dias</option>
                <option value="60">Últimos 60 dias</option>
                <option value="custom">Período personalizado</option>
              </select>
            </div>
            {periodMode === 'range' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <input
                  type="date"
                  value={startDateInput}
                  onChange={(e) => setStartDateInput(e.target.value)}
                  disabled={formLocked}
                  className="px-3 py-2 rounded-xl border-2 border-slate-200 focus:border-emerald-400 outline-none text-sm font-semibold disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed dark:bg-zinc-900 dark:border-white/10 dark:text-zinc-100 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
                />
                <input
                  type="date"
                  value={endDateInput}
                  onChange={(e) => setEndDateInput(e.target.value)}
                  disabled={formLocked}
                  className="px-3 py-2 rounded-xl border-2 border-slate-200 focus:border-emerald-400 outline-none text-sm font-semibold disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed dark:bg-zinc-900 dark:border-white/10 dark:text-zinc-100 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
                />
              </div>
            )}
            <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400">
              A sincronização pode levar alguns minutos, conforme o volume de mensagens.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 min-h-[190px] flex items-center justify-center dark:bg-zinc-900 dark:border-white/10">
            {loading ? (
              <div className="text-center space-y-3">
                <div className="animate-spin inline-block w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full"></div>
                <p className="text-sm font-medium text-gray-600 dark:text-zinc-300">Carregando status do WhatsApp...</p>
              </div>
            ) : status.connected ? (
              <div className="text-center space-y-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                  <MessageCircle size={20} />
                </div>
                <p className="text-sm font-black text-gray-800 dark:text-zinc-100">Sessão conectada</p>
                <p className="text-xs font-medium text-gray-500 dark:text-zinc-400">O QR Code foi ocultado porque a sessão já está ativa.</p>
              </div>
            ) : status.qrDataUrl ? (
              <img
                src={status.qrDataUrl}
                alt="QR Code do WhatsApp"
                className="w-44 h-44 rounded-xl bg-white p-2 border border-gray-200 dark:bg-zinc-900 dark:border-white/10"
              />
            ) : (
            <div className="text-center space-y-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                <MessageCircle size={20} />
              </div>
              <p className="text-sm font-black text-gray-800 dark:text-zinc-100">{statusLabel}</p>
              <p className="text-xs font-medium text-gray-500 dark:text-zinc-400">Clique em "Gerar QR Code" para iniciar o pareamento.</p>
            </div>
          )}
          </div>

          {showSyncProgress && syncProgress && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 px-3 py-3 space-y-2 dark:border-indigo-500/30 dark:bg-zinc-900/80">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-black uppercase tracking-widest text-indigo-700 dark:text-indigo-300">
                  Progresso da sincronização
                </p>
                <span className="text-[11px] font-black text-indigo-700 dark:text-indigo-300">
                  {Math.max(0, Math.min(100, Math.round(Number(syncProgress.progressPct || 0))))}%
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-indigo-100 dark:bg-zinc-800 overflow-hidden">
                <div
                  className="h-full bg-indigo-600 transition-all duration-500"
                  style={{ width: `${Math.max(0, Math.min(100, Number(syncProgress.progressPct || 0)))}%` }}
                />
              </div>
              <p className="text-xs font-semibold text-slate-700 dark:text-zinc-200">
                {syncProgress.message || 'Sincronização em andamento...'}
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px] font-semibold text-slate-600 dark:text-zinc-300">
                <span>Fase: <strong>{syncPhaseLabelMap[syncProgress.phase] || syncProgress.phase}</strong></span>
                <span>Decorrido: <strong>{formatDuration(syncProgress.elapsedSec)}</strong></span>
                <span>Estimado: <strong>{formatDuration(syncProgress.estimatedTotalSec)}</strong></span>
                <span>ETA: <strong>{syncProgress.etaSec == null ? '--' : formatDuration(syncProgress.etaSec)}</strong></span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px] font-semibold text-slate-700 dark:text-zinc-200">
                <span>Contatos sincronizados: <strong>{Math.max(0, Number(syncProgress.processedContacts || 0))}</strong></span>
                <span>Conversas restauradas: <strong>{Math.max(0, Number(syncProgress.restoredConversations || 0))}</strong></span>
                <span>Chats processados: <strong>{Math.max(0, Number(syncProgress.processedChats || 0))}</strong></span>
                <span>Mensagens processadas: <strong>{Math.max(0, Number(syncProgress.processedMessages || 0))}</strong></span>
              </div>
              {syncProgress.mode === 'SAFE' && Array.isArray(syncProgress.throttledFeatures) && syncProgress.throttledFeatures.length > 0 && (
                <p className="text-[11px] font-semibold text-indigo-700/90 dark:text-indigo-300">
                  Modo protegido ativo: {syncProgress.throttledFeatures.join(', ')}.
                </p>
              )}
            </div>
          )}

          {status.lastError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 flex items-center gap-2">
              <AlertTriangle size={14} />
              {status.lastError}
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-slate-200 bg-slate-100/80 flex items-center justify-end gap-1.5 dark:bg-zinc-900 dark:border-white/10">
          <button
            type="button"
            onClick={loadStatus}
            className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-xs font-black hover:bg-white dark:bg-zinc-900 dark:text-zinc-300 dark:border-white/10 dark:hover:bg-zinc-800"
          >
            Atualizar
          </button>
          <button
            type="button"
            onClick={handleStop}
            disabled={stopping || !status.connected}
            className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-black hover:bg-rose-700 disabled:opacity-60 flex items-center gap-1.5"
          >
            <Power size={14} />
            {stopping ? 'Desconectando...' : 'Desconectar'}
          </button>
          <button
            type="button"
            onClick={handleStart}
            disabled={starting || !canGenerateQr || status.connected}
            className="px-4 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-black hover:bg-emerald-600 disabled:opacity-60 flex items-center gap-1.5"
          >
            <QrCode size={14} />
            {starting ? 'Iniciando...' : (status.qrAvailable ? 'Gerar novo QR Code' : 'Gerar QR Code')}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-[26px] border border-gray-100 bg-white p-5 shadow-sm space-y-4 dark:bg-[#121214] dark:border-white/10 dark:ring-1 dark:ring-white/5">
      <div className="rounded-2xl border border-cyan-100 bg-cyan-50/40 p-4 space-y-3 dark:bg-zinc-900 dark:border-cyan-500/30">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-cyan-700">Configuração da Sessão</p>
          <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${formLocked ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-300'}`}>
            {formLocked ? 'Edição bloqueada' : 'Edição liberada'}
          </span>
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-zinc-400">Nome da sessão</label>
          <input
            value={sessionName}
            onChange={(e) => setSessionName(e.target.value)}
            disabled={formLocked}
            placeholder="Ex: Caixa Tarde Cantina Alfa"
            className="w-full px-4 py-2.5 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-medium bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed dark:bg-zinc-900 dark:border-white/10 dark:text-zinc-100 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setPeriodMode('days')}
            disabled={formLocked}
            className={`px-3 py-2 rounded-xl border-2 text-xs font-black uppercase tracking-widest disabled:opacity-60 disabled:cursor-not-allowed ${periodMode === 'days' ? 'border-cyan-400 bg-cyan-100 text-cyan-800 dark:bg-cyan-500/20 dark:text-cyan-300' : 'border-gray-200 bg-white text-gray-500 dark:bg-zinc-900 dark:text-zinc-300 dark:border-white/10'}`}
          >
            Definir por dias
          </button>
          <button
            type="button"
            onClick={() => setPeriodMode('range')}
            disabled={formLocked}
            className={`px-3 py-2 rounded-xl border-2 text-xs font-black uppercase tracking-widest disabled:opacity-60 disabled:cursor-not-allowed ${periodMode === 'range' ? 'border-cyan-400 bg-cyan-100 text-cyan-800 dark:bg-cyan-500/20 dark:text-cyan-300' : 'border-gray-200 bg-white text-gray-500 dark:bg-zinc-900 dark:text-zinc-300 dark:border-white/10'}`}
          >
            Definir por calendário
          </button>
        </div>

        {periodMode === 'days' ? (
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-zinc-400">Quantidade de dias do histórico</label>
            <input
              type="number"
              min={1}
              value={durationDays}
              onChange={(e) => setDurationDays(e.target.value)}
              disabled={formLocked}
              className="w-full px-4 py-2.5 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-medium bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed dark:bg-zinc-900 dark:border-white/10 dark:text-zinc-100 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-zinc-400">Data início</label>
              <input
                type="date"
                value={startDateInput}
                onChange={(e) => setStartDateInput(e.target.value)}
                disabled={formLocked}
                className="w-full px-4 py-2.5 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-medium bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed dark:bg-zinc-900 dark:border-white/10 dark:text-zinc-100 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-zinc-400">Data fim</label>
              <input
                type="date"
                value={endDateInput}
                onChange={(e) => setEndDateInput(e.target.value)}
                disabled={formLocked}
                className="w-full px-4 py-2.5 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-medium bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed dark:bg-zinc-900 dark:border-white/10 dark:text-zinc-100 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
              />
            </div>
          </div>
        )}

        <label className="flex items-center justify-between rounded-xl border border-cyan-100 bg-white px-3 py-2.5 cursor-pointer dark:bg-zinc-900 dark:border-white/10">
          <div className="min-w-0">
            <p className="text-xs font-black text-gray-800 dark:text-zinc-100 uppercase tracking-wide">Sincronizar conversa completa</p>
            <p className="text-[11px] text-gray-500 dark:text-zinc-400 font-semibold">Inclui histórico completo, etiquetas, foto de perfil e demais dados.</p>
          </div>
          <input
            type="checkbox"
            checked={syncFullHistory}
            onChange={(e) => setSyncFullHistory(e.target.checked)}
            disabled={formLocked}
            className="w-4 h-4 accent-cyan-600 disabled:cursor-not-allowed"
          />
        </label>

        <label className="flex items-center justify-between rounded-xl border border-cyan-100 bg-white px-3 py-2.5 cursor-pointer dark:bg-zinc-900 dark:border-white/10">
          <div className="min-w-0">
            <p className="text-xs font-black text-gray-800 dark:text-zinc-100 uppercase tracking-wide">Modo protegido de sincronização</p>
            <p className="text-[11px] text-gray-500 dark:text-zinc-400 font-semibold">Reduz processos paralelos para priorizar CPU/RAM no sync.</p>
          </div>
          <input
            type="checkbox"
            checked={safeSyncMode}
            onChange={(e) => setSafeSyncMode(e.target.checked)}
            disabled={formLocked}
            className="w-4 h-4 accent-indigo-600 disabled:cursor-not-allowed"
          />
        </label>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-zinc-400">Conexão WhatsApp</p>
          <p className="text-sm font-black text-gray-800 dark:text-zinc-100 mt-1">{statusLabel}</p>
          {showConversationSyncIndicator && (
            <p className="text-[11px] font-semibold text-gray-600 dark:text-zinc-300 mt-1">
              {conversationSyncIndicator.label}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadStatus}
            className="px-3 py-2 rounded-xl bg-gray-100 text-gray-700 text-xs font-black uppercase tracking-widest hover:bg-gray-200 flex items-center gap-2 dark:bg-zinc-900 dark:text-zinc-300 dark:border dark:border-white/10 dark:hover:bg-zinc-800"
          >
            <RefreshCw size={14} />
            Atualizar
          </button>
          <button
            onClick={handleStart}
            disabled={starting || !canGenerateQr || status.connected}
            className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black uppercase tracking-widest hover:bg-emerald-700 disabled:opacity-60 flex items-center gap-2"
          >
            <QrCode size={14} />
            {starting ? 'Iniciando...' : (status.qrAvailable ? 'Novo QR' : 'Gerar QR')}
          </button>
          <button
            onClick={handleStop}
            disabled={stopping || !status.connected}
            className="px-3 py-2 rounded-xl bg-red-600 text-white text-xs font-black uppercase tracking-widest hover:bg-red-700 disabled:opacity-60 flex items-center gap-2"
          >
            <Power size={14} />
            {stopping ? 'Encerrando...' : 'Desconectar'}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 min-h-[320px] flex items-center justify-center dark:bg-zinc-900 dark:border-white/10">
        {loading ? (
          <div className="text-center space-y-3">
            <div className="animate-spin inline-block w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full"></div>
            <p className="text-sm font-medium text-gray-600 dark:text-zinc-300">Carregando status do WhatsApp...</p>
          </div>
        ) : status.connected ? (
          <div className="text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
              <MessageCircle size={28} />
            </div>
            <p className="text-sm font-black text-gray-800 dark:text-zinc-100">Sessão conectada</p>
            <p className="text-xs font-medium text-gray-500 dark:text-zinc-400">
              O QR Code foi ocultado porque a sessão já está ativa.
            </p>
          </div>
        ) : status.qrDataUrl ? (
          <img
            src={status.qrDataUrl}
            alt="QR Code do WhatsApp"
            className="w-64 h-64 rounded-xl bg-white p-3 border border-gray-200 dark:bg-zinc-900 dark:border-white/10"
          />
        ) : (
          <div className="text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
              <MessageCircle size={28} />
            </div>
            <p className="text-sm font-black text-gray-800 dark:text-zinc-100">{statusLabel}</p>
            <p className="text-xs font-medium text-gray-500 dark:text-zinc-400">
              {status.connected
                ? 'A sessão está ativa e pronta para uso.'
                : 'Clique em "Gerar QR" para iniciar o pareamento.'}
            </p>
          </div>
        )}
      </div>

      {showSyncProgress && syncProgress && (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-4 space-y-2 dark:border-indigo-500/30 dark:bg-zinc-900 dark:text-zinc-200">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-700 dark:text-indigo-300">Progresso da sincronização</p>
            <span className="text-xs font-black text-indigo-700 dark:text-indigo-300">
              {Math.max(0, Math.min(100, Math.round(Number(syncProgress.progressPct || 0))))}%
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-indigo-100 dark:bg-zinc-800 overflow-hidden">
            <div
              className="h-full bg-indigo-600 transition-all duration-500"
              style={{ width: `${Math.max(0, Math.min(100, Number(syncProgress.progressPct || 0)))}%` }}
            />
          </div>
          <p className="text-xs font-semibold text-slate-700 dark:text-zinc-200">{syncProgress.message || 'Sincronização em andamento...'}</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px] font-semibold text-slate-600 dark:text-zinc-300">
            <span>Fase: <strong>{syncPhaseLabelMap[syncProgress.phase] || syncProgress.phase}</strong></span>
            <span>Decorrido: <strong>{formatDuration(syncProgress.elapsedSec)}</strong></span>
            <span>Estimado: <strong>{formatDuration(syncProgress.estimatedTotalSec)}</strong></span>
            <span>ETA: <strong>{syncProgress.etaSec == null ? '--' : formatDuration(syncProgress.etaSec)}</strong></span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px] font-semibold text-slate-700 dark:text-zinc-200">
            <span>Contatos sincronizados: <strong>{Math.max(0, Number(syncProgress.processedContacts || 0))}</strong></span>
            <span>Conversas restauradas: <strong>{Math.max(0, Number(syncProgress.restoredConversations || 0))}</strong></span>
            <span>Chats processados: <strong>{Math.max(0, Number(syncProgress.processedChats || 0))}</strong></span>
            <span>Mensagens processadas: <strong>{Math.max(0, Number(syncProgress.processedMessages || 0))}</strong></span>
          </div>
          {syncProgress.mode === 'SAFE' && Array.isArray(syncProgress.throttledFeatures) && syncProgress.throttledFeatures.length > 0 && (
            <p className="text-[11px] font-semibold text-indigo-700/90 dark:text-indigo-300">
              Modo protegido ativo: {syncProgress.throttledFeatures.join(', ')}.
            </p>
          )}
        </div>
      )}

      <div className="rounded-2xl border border-gray-100 bg-white p-4 text-sm space-y-2 dark:bg-zinc-900 dark:border-white/10 dark:text-zinc-300">
        <p><span className="font-black text-gray-700 dark:text-zinc-100">Estado:</span> {status.state}</p>
        <p><span className="font-black text-gray-700 dark:text-zinc-100">Telefone:</span> {status.phoneNumber || '-'}</p>
        <p><span className="font-black text-gray-700 dark:text-zinc-100">Sessão:</span> {status.sessionName || '-'}</p>
        <p><span className="font-black text-gray-700 dark:text-zinc-100">Período:</span> {status.startDate && status.endDate ? `${status.startDate} até ${status.endDate}` : '-'}</p>
        <p><span className="font-black text-gray-700 dark:text-zinc-100">Sync completo:</span> {status.syncFullHistory ? 'Sim' : 'Não'}</p>
        <p><span className="font-black text-gray-700 dark:text-zinc-100">Modo protegido:</span> {status.safeSyncMode !== false ? 'Ativo' : 'Desativado'}</p>
        {status.lastError && (
          <p className="text-red-600 font-bold flex items-center gap-2">
            <AlertTriangle size={14} />
            {status.lastError}
          </p>
        )}
      </div>
    </section>
  );
};

export default WhatsAppQrConnector;
