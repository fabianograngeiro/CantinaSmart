import React, { useEffect, useMemo, useState } from 'react';
import {
  MessageCircle,
  QrCode,
  Power,
  Send,
  Users,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  MessagesSquare
} from 'lucide-react';
import { Client, Enterprise, User } from '../types';
import ApiService from '../services/api';

interface WhatsAppPageProps {
  currentUser: User;
  activeEnterprise: Enterprise;
}

type WhatsAppStatusSnapshot = {
  state: 'DISCONNECTED' | 'INITIALIZING' | 'QR_READY' | 'CONNECTED' | 'ERROR';
  connected: boolean;
  qrAvailable: boolean;
  qrDataUrl: string | null;
  phoneNumber: string | null;
  lastError: string | null;
};

type ChatSummary = {
  chatId: string;
  phone: string;
  name: string;
  unreadCount: number;
  lastMessage: string;
  lastTimestamp: number;
  initiatedByClient: boolean;
};

type ChatMessage = {
  id: string;
  body: string;
  fromMe: boolean;
  timestamp: number;
};

type WhatsTab = 'BROADCAST' | 'CHATS';

const WhatsAppPage: React.FC<WhatsAppPageProps> = ({ currentUser: _currentUser, activeEnterprise }) => {
  if (!activeEnterprise) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center space-y-4">
          <div className="animate-spin inline-block w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full"></div>
          <p className="text-gray-600 font-medium">Carregando WhatsApp...</p>
        </div>
      </div>
    );
  }

  const [activeTab, setActiveTab] = useState<WhatsTab>('BROADCAST');
  const [status, setStatus] = useState<WhatsAppStatusSnapshot>({
    state: 'DISCONNECTED',
    connected: false,
    qrAvailable: false,
    qrDataUrl: null,
    phoneNumber: null,
    lastError: null,
  });
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState('');
  const [selectedPhones, setSelectedPhones] = useState<string[]>([]);
  const [message, setMessage] = useState('Olá! Este é um comunicado da cantina.');
  const [loading, setLoading] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [feedback, setFeedback] = useState('');

  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [chatSearch, setChatSearch] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [chatReply, setChatReply] = useState('');
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [introProgress, setIntroProgress] = useState(0);
  const [connectionAttempted, setConnectionAttempted] = useState(false);
  const [autoTriedStart, setAutoTriedStart] = useState(false);
  const [packetFrame, setPacketFrame] = useState(0);

  const normalizePhone = (raw?: string) => String(raw || '').replace(/\D/g, '');

  const resolveClientPhone = (client: Client) => {
    const candidates = [
      (client as any).parentWhatsapp,
      (client as any).guardianPhone,
      client.phone
    ];
    const picked = candidates.map(normalizePhone).find((phone) => phone.length >= 10);
    return picked || '';
  };

  const clientByPhone = useMemo(() => {
    const map = new Map<string, Client>();
    clients.forEach((client) => {
      const phone = resolveClientPhone(client);
      if (phone) map.set(phone, client);
      const phone55 = phone.startsWith('55') ? phone : `55${phone}`;
      if (phone && !map.has(phone55)) map.set(phone55, client);
    });
    return map;
  }, [clients]);

  const refreshStatus = async () => {
    try {
      const data = await ApiService.getWhatsAppStatus();
      setStatus({
        state: data?.state || 'DISCONNECTED',
        connected: Boolean(data?.connected),
        qrAvailable: Boolean(data?.qrAvailable),
        qrDataUrl: data?.qrDataUrl || null,
        phoneNumber: data?.phoneNumber || null,
        lastError: data?.lastError || null
      });
    } catch (err) {
      console.error('Erro ao buscar status do WhatsApp:', err);
      setStatus(prev => ({
        ...prev,
        state: 'ERROR',
        lastError: 'Não foi possível conectar ao backend do WhatsApp.'
      }));
    }
  };

  const loadChats = async () => {
    if (!status.connected) {
      setChats([]);
      return;
    }
    setChatLoading(true);
    try {
      const data = await ApiService.getWhatsAppChats();
      setChats(Array.isArray(data?.chats) ? data.chats : []);
    } catch (err) {
      console.error('Erro ao carregar conversas WhatsApp:', err);
      setChats([]);
    } finally {
      setChatLoading(false);
    }
  };

  const loadMessages = async (chatId: string) => {
    setMessagesLoading(true);
    try {
      const data = await ApiService.getWhatsAppChatMessages(chatId, 100);
      setMessages(Array.isArray(data?.messages) ? data.messages : []);
    } catch (err) {
      console.error('Erro ao carregar mensagens:', err);
      setMessages([]);
    } finally {
      setMessagesLoading(false);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [clientsData] = await Promise.all([
        ApiService.getClients(activeEnterprise.id),
        refreshStatus()
      ]);
      setClients(Array.isArray(clientsData) ? clientsData : []);
    } catch (err) {
      console.error('Erro ao carregar página WhatsApp:', err);
      setClients([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeEnterprise.id]);

  useEffect(() => {
    if (status.connected && activeTab === 'CHATS') {
      loadChats();
    }
  }, [status.connected, activeTab]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      refreshStatus();
      if (activeTab === 'CHATS' && status.connected) {
        loadChats();
        if (selectedChatId) loadMessages(selectedChatId);
      }
    }, 6000);
    return () => window.clearInterval(timer);
  }, [activeTab, status.connected, selectedChatId]);

  useEffect(() => {
    const inHandshake =
      isStarting
      || status.state === 'INITIALIZING'
      || status.state === 'QR_READY'
      || status.connected;

    if (!inHandshake) {
      setPacketFrame(0);
      return;
    }

    const timer = window.setInterval(() => {
      setPacketFrame((prev) => (prev >= 100 ? 0 : prev + 4));
    }, 70);
    return () => window.clearInterval(timer);
  }, [isStarting, status.state, status.connected]);

  useEffect(() => {
    let target = 0;
    if (status.connected) {
      target = 100;
    } else if (status.qrAvailable || status.state === 'QR_READY') {
      target = 72;
    } else if (isStarting || status.state === 'INITIALIZING') {
      target = 38;
    } else if ((status.state === 'ERROR' || status.state === 'DISCONNECTED') && connectionAttempted) {
      target = 88;
    }

    const timer = window.setInterval(() => {
      setIntroProgress((prev) => {
        if (Math.abs(prev - target) <= 1) return target;
        if (prev < target) return prev + Math.min(3, target - prev);
        return prev - Math.min(4, prev - target);
      });
    }, 30);

    return () => window.clearInterval(timer);
  }, [status.connected, status.qrAvailable, status.state, isStarting, connectionAttempted]);

  const recipients = useMemo(() => {
    const term = search.trim().toLowerCase();
    return clients
      .map((client) => ({
        client,
        phone: resolveClientPhone(client)
      }))
      .filter((entry) => Boolean(entry.phone))
      .filter((entry) => {
        if (!term) return true;
        return (
          entry.client.name.toLowerCase().includes(term)
          || entry.phone.includes(term.replace(/\D/g, ''))
          || String(entry.client.registrationId || '').toLowerCase().includes(term)
        );
      })
      .sort((a, b) => a.client.name.localeCompare(b.client.name, 'pt-BR', { sensitivity: 'base' }));
  }, [clients, search]);

  const visibleChats = useMemo(() => {
    const term = chatSearch.trim().toLowerCase();
    return chats
      .map((chat) => {
        const mappedClient = clientByPhone.get(chat.phone) || clientByPhone.get(`55${chat.phone}`);
        const displayName = mappedClient?.name || chat.name || chat.phone;
        return {
          ...chat,
          displayName,
          registrationId: mappedClient?.registrationId || ''
        };
      })
      .filter((chat) => {
        if (!term) return true;
        return (
          chat.displayName.toLowerCase().includes(term)
          || chat.phone.includes(term.replace(/\D/g, ''))
          || String(chat.registrationId || '').toLowerCase().includes(term)
        );
      })
      .sort((a, b) => b.lastTimestamp - a.lastTimestamp);
  }, [chats, chatSearch, clientByPhone]);

  const selectedChat = useMemo(
    () => visibleChats.find((chat) => chat.chatId === selectedChatId) || null,
    [visibleChats, selectedChatId]
  );
  const unreadCount = useMemo(
    () => visibleChats.reduce((sum, chat) => sum + Number(chat.unreadCount || 0), 0),
    [visibleChats]
  );
  const showConnectionCard = status.connected || status.qrAvailable || status.state === 'QR_READY';
  const showInitialConnectionPanel = !status.connected && !status.qrAvailable;
  const initialConnectionFailed =
    (status.state === 'ERROR' || status.state === 'DISCONNECTED')
    && connectionAttempted
    && !isStarting;
  const connectionPhaseLabel = status.connected
    ? 'Conexao estabelecida'
    : status.qrAvailable || status.state === 'QR_READY'
      ? 'Aguardando leitura do QR Code'
      : isStarting || status.state === 'INITIALIZING'
        ? 'Enviando requisicao para WhatsApp'
        : initialConnectionFailed
          ? 'Falha ao conectar automaticamente'
          : 'Aguardando tentativa de conexao';

  const toggleRecipient = (phone: string, checked: boolean) => {
    setSelectedPhones((prev) => {
      if (checked) return Array.from(new Set([...prev, phone]));
      return prev.filter((p) => p !== phone);
    });
  };

  const startSession = async (mode: 'auto' | 'manual') => {
    setIsStarting(true);
    if (mode === 'manual') {
      setFeedback('');
    }
    setConnectionAttempted(true);
    try {
      await ApiService.startWhatsAppSession();
      await refreshStatus();
      if (mode === 'manual') {
        setFeedback('Sessão iniciada. Escaneie o QR Code no WhatsApp.');
      }
    } catch (err) {
      if (mode === 'manual') {
        setFeedback(err instanceof Error ? err.message : 'Erro ao iniciar sessão.');
      }
    } finally {
      setIsStarting(false);
    }
  };

  useEffect(() => {
    if (loading || autoTriedStart) return;
    if (status.connected || status.qrAvailable || status.state === 'QR_READY') return;

    setAutoTriedStart(true);
    (async () => {
      setIsStarting(true);
      setConnectionAttempted(true);
      try {
        await ApiService.startWhatsAppSession();
        await refreshStatus();
      } catch {
        // estado de erro é refletido pelo refreshStatus
      } finally {
        setIsStarting(false);
      }
    })();
  }, [loading, autoTriedStart, status.connected, status.qrAvailable, status.state]);

  const handleStart = async () => {
    await startSession('manual');
  };

  const handleStop = async () => {
    setIsStopping(true);
    setFeedback('');
    try {
      await ApiService.stopWhatsAppSession();
      await refreshStatus();
      setChats([]);
      setMessages([]);
      setSelectedChatId(null);
      setFeedback('Sessão encerrada com sucesso.');
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erro ao encerrar sessão.');
    } finally {
      setIsStopping(false);
    }
  };

  const handleSendBulk = async () => {
    if (!status.connected) {
      setFeedback('Conecte o WhatsApp antes de enviar mensagens.');
      return;
    }
    if (!message.trim()) {
      setFeedback('Digite uma mensagem.');
      return;
    }
    if (selectedPhones.length === 0) {
      setFeedback('Selecione ao menos um cliente.');
      return;
    }

    setIsSending(true);
    setFeedback('');
    try {
      const result = await ApiService.sendWhatsAppBulk(selectedPhones, message.trim());
      setFeedback(`Mensagens enviadas: ${result?.successCount || 0}/${result?.total || selectedPhones.length}.`);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erro ao enviar mensagens.');
    } finally {
      setIsSending(false);
    }
  };

  const handleSelectChat = async (chatId: string) => {
    setSelectedChatId(chatId);
    await loadMessages(chatId);
  };

  const handleReply = async () => {
    if (!selectedChatId || !chatReply.trim()) return;
    setIsSendingChat(true);
    try {
      await ApiService.sendWhatsAppMessageToChat(selectedChatId, chatReply.trim());
      setChatReply('');
      await loadMessages(selectedChatId);
      await loadChats();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erro ao enviar resposta no chat.');
    } finally {
      setIsSendingChat(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center space-y-4">
          <div className="animate-spin inline-block w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full"></div>
          <p className="text-gray-600 font-medium">Carregando integração WhatsApp...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 animate-in fade-in duration-500">
      <header className="rounded-[30px] border border-emerald-100 bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 text-white p-6 shadow-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight">WhatsApp Admin</h1>
            <p className="text-[11px] uppercase tracking-[2px] font-black text-emerald-50/90 mt-1">
              Central de disparos e atendimento dos clientes
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={refreshStatus}
              className="px-4 py-2.5 rounded-xl bg-white/90 text-emerald-700 text-xs font-black uppercase tracking-widest hover:bg-white flex items-center gap-2"
            >
              <RefreshCw size={14} />
              Atualizar
            </button>
            <button
              onClick={handleStart}
              disabled={isStarting || status.connected}
              className="px-4 py-2.5 rounded-xl bg-emerald-900/85 text-white text-xs font-black uppercase tracking-widest hover:bg-emerald-900 disabled:opacity-60 flex items-center gap-2"
            >
              <QrCode size={14} />
              {isStarting ? 'Iniciando...' : 'Gerar QR'}
            </button>
            <button
              onClick={handleStop}
              disabled={isStopping || !status.connected}
              className="px-4 py-2.5 rounded-xl bg-red-600/90 text-white text-xs font-black uppercase tracking-widest hover:bg-red-700 disabled:opacity-60 flex items-center gap-2"
            >
              <Power size={14} />
              {isStopping ? 'Encerrando...' : 'Desconectar'}
            </button>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Sessão</p>
          <p className={`text-lg font-black mt-1 ${status.connected ? 'text-emerald-600' : 'text-gray-600'}`}>
            {status.connected ? 'Conectado' : status.state}
          </p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Clientes com Telefone</p>
          <p className="text-lg font-black text-gray-800 mt-1">{recipients.length}</p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Conversas Ativas</p>
          <p className="text-lg font-black text-gray-800 mt-1">{visibleChats.length}</p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Não Lidas</p>
          <p className="text-lg font-black text-amber-600 mt-1">{unreadCount}</p>
        </div>
      </div>

      <div className="bg-white rounded-[24px] border border-gray-100 p-2 grid grid-cols-2 gap-2 shadow-sm">
        <button
          onClick={() => setActiveTab('BROADCAST')}
          className={`px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest ${activeTab === 'BROADCAST' ? 'bg-indigo-600 text-white' : 'bg-gray-50 text-gray-500'}`}
        >
          Disparos
        </button>
        <button
          onClick={() => setActiveTab('CHATS')}
          className={`px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest ${activeTab === 'CHATS' ? 'bg-indigo-600 text-white' : 'bg-gray-50 text-gray-500'}`}
        >
          Conversas
        </button>
      </div>

      {activeTab === 'BROADCAST' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          {showInitialConnectionPanel && (
            <section className="xl:col-span-12 rounded-[26px] border border-amber-200 bg-gradient-to-r from-white to-amber-50 p-5 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex-1 space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">Conexao Inicial</p>
                  <p className="text-sm font-black text-gray-800">{connectionPhaseLabel}</p>
                  <div className="max-w-2xl rounded-2xl border border-gray-200 bg-white px-4 py-3">
                    <div className="relative h-8">
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 text-[11px] font-black text-indigo-700">Sistema</div>
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 text-[11px] font-black text-emerald-700">WhatsApp</div>
                      <div className="absolute left-16 right-20 top-1/2 -translate-y-1/2 h-[2px] bg-gradient-to-r from-indigo-300 via-emerald-300 to-emerald-500" />
                      <div
                        className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(79,70,229,0.6)]"
                        style={{ left: `calc(4rem + (${packetFrame}% * (100% - 9rem) / 100))` }}
                      />
                      <div
                        className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.6)]"
                        style={{ left: `calc(4rem + (${100 - packetFrame}% * (100% - 9rem) / 100))` }}
                      />
                    </div>
                  </div>
                  <div className="w-full max-w-2xl rounded-full bg-amber-100 h-3 overflow-hidden border border-amber-200">
                    <div
                      className={`h-full transition-all duration-150 ${initialConnectionFailed ? 'bg-red-500' : 'bg-emerald-500'}`}
                      style={{ width: `${introProgress}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between max-w-2xl text-[11px] font-bold">
                    <span className="text-gray-500">Status real da conexao com WhatsApp</span>
                    <span className={initialConnectionFailed ? 'text-red-600' : 'text-emerald-600'}>{Math.round(introProgress)}%</span>
                  </div>
                  {initialConnectionFailed && (
                    <p className="text-sm font-black text-red-600">
                      Nao conectou automaticamente. Clique para conectar o QR Code no WhatsApp.
                    </p>
                  )}
                  {status.lastError && (
                    <p className="text-xs font-bold text-red-600">{status.lastError}</p>
                  )}
                </div>
                <div className="flex flex-col items-center gap-3 min-w-[220px]">
                  <div className="w-16 h-16 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-lg">
                    <MessageCircle size={30} />
                  </div>
                  <button
                    onClick={handleStart}
                    disabled={isStarting}
                    className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-black uppercase tracking-widest hover:bg-emerald-700 disabled:opacity-60 flex items-center gap-2"
                  >
                    <QrCode size={14} />
                    {isStarting ? 'Conectando...' : 'Conectar QR Code'}
                  </button>
                </div>
              </div>
            </section>
          )}

          {showConnectionCard && (
            <section className="xl:col-span-4 rounded-[26px] border border-emerald-100 bg-white p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Conexão WhatsApp</p>
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                status.connected ? 'bg-emerald-100 text-emerald-700'
                  : status.state === 'QR_READY' ? 'bg-amber-100 text-amber-700'
                  : status.state === 'INITIALIZING' ? 'bg-indigo-100 text-indigo-700'
                  : status.state === 'ERROR' ? 'bg-red-100 text-red-700'
                  : 'bg-gray-100 text-gray-600'
              }`}>
                {status.connected ? 'Conectado' : status.state}
              </span>
            </div>

            <div className="rounded-2xl border-2 border-dashed border-emerald-200 bg-emerald-50/40 p-4 text-center min-h-[280px] flex items-center justify-center">
              {status.qrDataUrl ? (
                <img src={status.qrDataUrl} alt="QR Code WhatsApp" className="w-56 h-56 rounded-xl bg-white p-2 border border-gray-200" />
              ) : (
                <div className="space-y-2">
                  <MessageCircle size={36} className="mx-auto text-emerald-500" />
                  <p className="text-xs font-black uppercase tracking-widest text-gray-500">
                    {status.connected ? 'Sessão ativa' : 'QR Code aparecerá aqui'}
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-1 text-xs">
              <p><span className="font-black text-gray-700">Telefone conectado:</span> {status.phoneNumber || '-'}</p>
              {status.lastError && (
                <p className="text-red-600 font-bold flex items-center gap-1"><AlertTriangle size={14} /> {status.lastError}</p>
              )}
            </div>
            </section>
          )}

          <section className={`${showConnectionCard ? 'xl:col-span-8' : 'xl:col-span-12'} rounded-[26px] border border-gray-100 bg-white p-5 shadow-sm space-y-4`}>
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Campanha de Mensagem ({selectedPhones.length} selecionados)</p>
              <button
                onClick={handleSendBulk}
                disabled={isSending || !status.connected}
                className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-black uppercase tracking-widest hover:bg-indigo-700 disabled:opacity-60 flex items-center gap-2"
              >
                <Send size={14} />
                {isSending ? 'Enviando...' : 'Enviar Mensagem'}
              </button>
            </div>

            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Mensagem</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                className="w-full mt-1 px-4 py-3 rounded-2xl border-2 border-gray-100 focus:border-indigo-500 outline-none text-sm font-medium"
                placeholder="Digite a mensagem que será enviada..."
              />
            </div>

            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome, matrícula ou telefone"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border-2 border-gray-100 focus:border-indigo-500 outline-none text-sm font-medium"
              />
            </div>

            <div className="border border-gray-100 rounded-2xl overflow-hidden">
              <div className="max-h-[380px] overflow-y-auto">
                {recipients.length === 0 ? (
                  <div className="p-8 text-center text-gray-500 text-sm font-semibold">
                    Nenhum cliente com telefone encontrado.
                  </div>
                ) : (
                  recipients.map(({ client, phone }) => {
                    const isChecked = selectedPhones.includes(phone);
                    return (
                      <label key={client.id} className="flex items-center justify-between px-4 py-3 border-b border-gray-100 last:border-b-0 hover:bg-indigo-50/40 cursor-pointer">
                        <div className="flex items-center gap-3 min-w-0">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => toggleRecipient(phone, e.target.checked)}
                            className="w-4 h-4"
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-black text-gray-800 truncate">{client.name}</p>
                            <p className="text-[11px] text-gray-500 font-bold truncate">{phone}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {isChecked && <CheckCircle2 size={14} className="text-emerald-600" />}
                          <Users size={14} className="text-gray-300" />
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          </section>
        </div>
      )}

      {activeTab === 'CHATS' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          <section className="xl:col-span-4 rounded-[26px] border border-gray-100 bg-white p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Conversas de Clientes ({visibleChats.length})</p>
              {chatLoading && <RefreshCw size={14} className="animate-spin text-gray-400" />}
            </div>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={chatSearch}
                onChange={(e) => setChatSearch(e.target.value)}
                placeholder="Buscar conversa"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border-2 border-gray-100 focus:border-indigo-500 outline-none text-sm font-medium"
              />
            </div>
            <div className="max-h-[620px] overflow-y-auto rounded-xl border border-gray-100">
              {!status.connected ? (
                <div className="p-8 text-center text-gray-500 text-sm font-semibold">Conecte o WhatsApp para visualizar conversas.</div>
              ) : visibleChats.length === 0 ? (
                <div className="p-8 text-center text-gray-500 text-sm font-semibold">Sem conversas iniciadas por clientes.</div>
              ) : (
                visibleChats.map((chat) => (
                  <button
                    key={chat.chatId}
                    onClick={() => handleSelectChat(chat.chatId)}
                    className={`w-full text-left px-4 py-3 border-b border-gray-100 last:border-b-0 hover:bg-indigo-50/40 transition ${selectedChatId === chat.chatId ? 'bg-indigo-50' : 'bg-white'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-black text-gray-800 truncate">{chat.displayName}</p>
                        <p className="text-[11px] text-gray-500 font-bold truncate">{chat.lastMessage || 'Sem mensagem'}</p>
                      </div>
                      {chat.unreadCount > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-black">
                          {chat.unreadCount}
                        </span>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </section>

          <section className="xl:col-span-8 rounded-[26px] border border-gray-100 bg-white shadow-sm flex flex-col min-h-[680px] overflow-hidden">
            {!selectedChat ? (
              <div className="flex-1 flex items-center justify-center text-center text-gray-400 p-8">
                <div className="space-y-2">
                  <MessagesSquare size={36} className="mx-auto" />
                  <p className="text-sm font-bold">Selecione uma conversa para abrir o histórico.</p>
                </div>
              </div>
            ) : (
              <>
                <div className="border-b border-gray-100 px-5 py-4 bg-gray-50">
                  <p className="text-sm font-black text-gray-800">{selectedChat.displayName}</p>
                  <p className="text-[11px] text-gray-500 font-bold">{selectedChat.phone}</p>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-gradient-to-b from-gray-50 to-white">
                  {messagesLoading ? (
                    <div className="text-center text-gray-500 text-sm font-semibold py-10">Carregando mensagens...</div>
                  ) : messages.length === 0 ? (
                    <div className="text-center text-gray-500 text-sm font-semibold py-10">Sem mensagens neste chat.</div>
                  ) : (
                    messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`max-w-[82%] px-3 py-2 rounded-2xl text-sm font-medium shadow-sm ${
                          msg.fromMe
                            ? 'ml-auto bg-emerald-600 text-white rounded-br-md'
                            : 'mr-auto bg-white border border-gray-100 text-gray-800 rounded-bl-md'
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                      </div>
                    ))
                  )}
                </div>

                <div className="p-4 border-t border-gray-100 bg-white flex gap-2">
                  <textarea
                    rows={2}
                    value={chatReply}
                    onChange={(e) => setChatReply(e.target.value)}
                    placeholder="Digite sua resposta..."
                    className="flex-1 px-3 py-2 rounded-xl border-2 border-gray-100 focus:border-indigo-500 outline-none text-sm"
                  />
                  <button
                    onClick={handleReply}
                    disabled={isSendingChat || !chatReply.trim()}
                    className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black uppercase tracking-widest hover:bg-emerald-700 disabled:opacity-60 flex items-center gap-2"
                  >
                    <Send size={14} />
                    {isSendingChat ? 'Enviando' : 'Responder'}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {feedback && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm font-bold text-indigo-700">
          {feedback}
        </div>
      )}
    </div>
  );
};

export default WhatsAppPage;
