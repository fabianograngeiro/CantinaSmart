import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, MessageCircle, Power, QrCode, RefreshCw } from 'lucide-react';
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
};

const DEFAULT_STATUS: WhatsAppQrSnapshot = {
  state: 'DISCONNECTED',
  connected: false,
  qrAvailable: false,
  qrDataUrl: null,
  phoneNumber: null,
  lastError: null,
};

const WhatsAppQrConnector: React.FC = () => {
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
  const hasInitializedRef = useRef(false);

  const STORAGE_KEYS = {
    sessionName: 'whatsapp_session_name',
    periodMode: 'whatsapp_session_period_mode',
    durationDays: 'whatsapp_session_duration_days',
    startDate: 'whatsapp_session_start_date',
    endDate: 'whatsapp_session_end_date',
    syncFullHistory: 'whatsapp_session_sync_full_history',
  } as const;

  const loadStatus = async () => {
    try {
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
      });
    } catch (err) {
      console.error('Erro ao buscar status do WhatsApp:', err);
      setStatus((prev) => ({
        ...prev,
        state: 'ERROR',
        lastError: err instanceof Error ? err.message : 'Falha ao buscar status do WhatsApp.',
      }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    const bootstrap = async () => {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const savedSessionName = localStorage.getItem(STORAGE_KEYS.sessionName) || '';
        const savedPeriodMode = localStorage.getItem(STORAGE_KEYS.periodMode) === 'range' ? 'range' : 'days';
        const savedDurationDays = localStorage.getItem(STORAGE_KEYS.durationDays) || '30';
        const savedStartDate = localStorage.getItem(STORAGE_KEYS.startDate) || today;
        const savedEndDate = localStorage.getItem(STORAGE_KEYS.endDate) || '';
        const savedSync = localStorage.getItem(STORAGE_KEYS.syncFullHistory);

        setSessionName(savedSessionName);
        setPeriodMode(savedPeriodMode);
        setDurationDays(savedDurationDays);
        setStartDateInput(savedStartDate);
        setEndDateInput(savedEndDate);
        setSyncFullHistory(savedSync !== 'false');

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
        });
      } catch (err) {
        console.error('Erro ao inicializar sessão do WhatsApp:', err);
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
  }, [sessionName, periodMode, durationDays, startDateInput, endDateInput, syncFullHistory]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      loadStatus();
    }, 4000);

    return () => window.clearInterval(interval);
  }, []);

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
      const end = new Date(today);
      end.setDate(end.getDate() + days);
      computedStart = toIsoDate(today);
      computedEnd = toIsoDate(end);
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
      const forceNewSession = status.state === 'DISCONNECTED' || status.state === 'ERROR';
      await ApiService.startWhatsAppSession({
        forceNewSession,
        sessionName: normalizedSessionName,
        startDate: computedStart,
        endDate: computedEnd,
        syncFullHistory
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

  const canGenerateQr = Boolean(
    String(sessionName || '').trim()
    && (
      periodMode === 'days'
        ? Number(durationDays) > 0
        : String(startDateInput || '').trim() && String(endDateInput || '').trim() && endDateInput >= startDateInput
    )
  );

  return (
    <section className="rounded-[26px] border border-gray-100 bg-white p-5 shadow-sm space-y-4">
      <div className="rounded-2xl border border-cyan-100 bg-cyan-50/40 p-4 space-y-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-cyan-700">Configuração da Sessão</p>
        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Nome da sessão</label>
          <input
            value={sessionName}
            onChange={(e) => setSessionName(e.target.value)}
            placeholder="Ex: Caixa Tarde Cantina Alfa"
            className="w-full px-4 py-2.5 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-medium bg-white"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setPeriodMode('days')}
            className={`px-3 py-2 rounded-xl border-2 text-xs font-black uppercase tracking-widest ${periodMode === 'days' ? 'border-cyan-400 bg-cyan-100 text-cyan-800' : 'border-gray-200 bg-white text-gray-500'}`}
          >
            Definir por dias
          </button>
          <button
            type="button"
            onClick={() => setPeriodMode('range')}
            className={`px-3 py-2 rounded-xl border-2 text-xs font-black uppercase tracking-widest ${periodMode === 'range' ? 'border-cyan-400 bg-cyan-100 text-cyan-800' : 'border-gray-200 bg-white text-gray-500'}`}
          >
            Definir por calendário
          </button>
        </div>

        {periodMode === 'days' ? (
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Quantidade de dias da sessão</label>
            <input
              type="number"
              min={1}
              value={durationDays}
              onChange={(e) => setDurationDays(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-medium bg-white"
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Data início</label>
              <input
                type="date"
                value={startDateInput}
                onChange={(e) => setStartDateInput(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-medium bg-white"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Data fim</label>
              <input
                type="date"
                value={endDateInput}
                onChange={(e) => setEndDateInput(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-medium bg-white"
              />
            </div>
          </div>
        )}

        <label className="flex items-center justify-between rounded-xl border border-cyan-100 bg-white px-3 py-2.5 cursor-pointer">
          <div className="min-w-0">
            <p className="text-xs font-black text-gray-800 uppercase tracking-wide">Sincronizar conversa completa</p>
            <p className="text-[11px] text-gray-500 font-semibold">Inclui histórico completo, etiquetas, foto de perfil e demais dados.</p>
          </div>
          <input
            type="checkbox"
            checked={syncFullHistory}
            onChange={(e) => setSyncFullHistory(e.target.checked)}
            className="w-4 h-4 accent-cyan-600"
          />
        </label>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Conexão WhatsApp</p>
          <p className="text-sm font-black text-gray-800 mt-1">{statusLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadStatus}
            className="px-3 py-2 rounded-xl bg-gray-100 text-gray-700 text-xs font-black uppercase tracking-widest hover:bg-gray-200 flex items-center gap-2"
          >
            <RefreshCw size={14} />
            Atualizar
          </button>
          <button
            onClick={handleStart}
            disabled={starting || !canGenerateQr || status.connected || status.state === 'QR_READY' || status.state === 'INITIALIZING'}
            className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black uppercase tracking-widest hover:bg-emerald-700 disabled:opacity-60 flex items-center gap-2"
          >
            <QrCode size={14} />
            {starting ? 'Iniciando...' : 'Gerar QR'}
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

      <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 min-h-[320px] flex items-center justify-center">
        {loading ? (
          <div className="text-center space-y-3">
            <div className="animate-spin inline-block w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full"></div>
            <p className="text-sm font-medium text-gray-600">Carregando status do WhatsApp...</p>
          </div>
        ) : status.connected ? (
          <div className="text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
              <MessageCircle size={28} />
            </div>
            <p className="text-sm font-black text-gray-800">Sessão conectada</p>
            <p className="text-xs font-medium text-gray-500">
              O QR Code foi ocultado porque a sessão já está ativa.
            </p>
          </div>
        ) : status.qrDataUrl ? (
          <img
            src={status.qrDataUrl}
            alt="QR Code do WhatsApp"
            className="w-64 h-64 rounded-xl bg-white p-3 border border-gray-200"
          />
        ) : (
          <div className="text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
              <MessageCircle size={28} />
            </div>
            <p className="text-sm font-black text-gray-800">{statusLabel}</p>
            <p className="text-xs font-medium text-gray-500">
              {status.connected
                ? 'A sessão está ativa e pronta para uso.'
                : 'Clique em "Gerar QR" para iniciar o pareamento.'}
            </p>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-4 text-sm space-y-2">
        <p><span className="font-black text-gray-700">Estado:</span> {status.state}</p>
        <p><span className="font-black text-gray-700">Telefone:</span> {status.phoneNumber || '-'}</p>
        <p><span className="font-black text-gray-700">Sessão:</span> {status.sessionName || '-'}</p>
        <p><span className="font-black text-gray-700">Período:</span> {status.startDate && status.endDate ? `${status.startDate} até ${status.endDate}` : '-'}</p>
        <p><span className="font-black text-gray-700">Sync completo:</span> {status.syncFullHistory ? 'Sim' : 'Não'}</p>
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
