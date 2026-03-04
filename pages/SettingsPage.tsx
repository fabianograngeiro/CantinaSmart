import React, { useState, useEffect } from 'react';
import {
  Settings, Calendar, AlertCircle, Check, Save, Info, Printer, RefreshCw
} from 'lucide-react';
import { User, Enterprise, OpeningHours } from '../types';
import ApiService from '../services/api';

interface SettingsPageProps {
  currentUser: User;
  activeEnterprise: Enterprise;
}

const SERVICE_DAY_OPTIONS = [
  { key: 'SEGUNDA', label: 'Segunda-feira' },
  { key: 'TERCA', label: 'Terça-feira' },
  { key: 'QUARTA', label: 'Quarta-feira' },
  { key: 'QUINTA', label: 'Quinta-feira' },
  { key: 'SEXTA', label: 'Sexta-feira' },
  { key: 'SABADO', label: 'Sábado' },
  { key: 'DOMINGO', label: 'Domingo' },
];

const DAY_KEY_ALIASES: Record<string, string[]> = {
  SEGUNDA: ['SEGUNDA', 'segunda', 'MONDAY', 'monday'],
  TERCA: ['TERCA', 'terça', 'terca', 'TUESDAY', 'tuesday'],
  QUARTA: ['QUARTA', 'quarta', 'WEDNESDAY', 'wednesday'],
  QUINTA: ['QUINTA', 'quinta', 'THURSDAY', 'thursday'],
  SEXTA: ['SEXTA', 'sexta', 'FRIDAY', 'friday'],
  SABADO: ['SABADO', 'sábado', 'sabado', 'SATURDAY', 'saturday'],
  DOMINGO: ['DOMINGO', 'domingo', 'SUNDAY', 'sunday'],
};

const buildDefaultOpeningHours = (): Record<string, OpeningHours> => ({
  SEGUNDA: { open: '07:00', close: '17:00', closed: false },
  TERCA: { open: '07:00', close: '17:00', closed: false },
  QUARTA: { open: '07:00', close: '17:00', closed: false },
  QUINTA: { open: '07:00', close: '17:00', closed: false },
  SEXTA: { open: '07:00', close: '17:00', closed: false },
  SABADO: { open: '07:00', close: '12:00', closed: true },
  DOMINGO: { open: '07:00', close: '12:00', closed: true },
});

const normalizeOpeningHours = (openingHours?: Record<string, OpeningHours>) => {
  const defaults = buildDefaultOpeningHours();
  const source = openingHours || {};
  const normalized: Record<string, OpeningHours> = { ...defaults };

  SERVICE_DAY_OPTIONS.forEach(({ key }) => {
    const aliasMatch = DAY_KEY_ALIASES[key].find(alias => source[alias]);
    if (aliasMatch) {
      const value = source[aliasMatch];
      normalized[key] = {
        open: value?.open || defaults[key].open,
        close: value?.close || defaults[key].close,
        closed: Boolean(value?.closed),
      };
    }
  });

  return normalized;
};

type SettingsTab = 'FINANCEIRO' | 'ATENDIMENTO' | 'SALDO' | 'IMPRESSAO';
type ReceiptPrintMode = 'SERVER_BROWSER' | 'LOCAL_AGENT';
type LocalAgentStatus = 'IDLE' | 'CHECKING' | 'ONLINE' | 'OFFLINE';

const SettingsPage: React.FC<SettingsPageProps> = ({ currentUser: _currentUser, activeEnterprise }) => {
  if (!activeEnterprise) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center space-y-4">
          <div className="animate-spin inline-block w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full"></div>
          <p className="text-gray-600 font-medium">Carregando configurações...</p>
        </div>
      </div>
    );
  }

  const [activeTab, setActiveTab] = useState<SettingsTab>('FINANCEIRO');
  const [paymentStartDay, setPaymentStartDay] = useState<number>(activeEnterprise.collaboratorPaymentStartDay || 1);
  const [paymentDueDay, setPaymentDueDay] = useState<number>(activeEnterprise.collaboratorPaymentDueDay || 10);
  const [allowNegativeSalesForClients, setAllowNegativeSalesForClients] = useState<boolean>(Boolean(activeEnterprise.allowNegativeSalesForClients));
  const [negativeLimitClients, setNegativeLimitClients] = useState<number>(Math.max(0, Number(activeEnterprise.negativeLimitClients || 0)));
  const [allowNegativeSalesForCollaborators, setAllowNegativeSalesForCollaborators] = useState<boolean>(Boolean(activeEnterprise.allowNegativeSalesForCollaborators));
  const [negativeLimitCollaborators, setNegativeLimitCollaborators] = useState<number>(Math.max(0, Number(activeEnterprise.negativeLimitCollaborators || 0)));
  const [openingHours, setOpeningHours] = useState<Record<string, OpeningHours>>(normalizeOpeningHours(activeEnterprise.openingHours));
  const [autoPrintPDVReceipt, setAutoPrintPDVReceipt] = useState<boolean>(Boolean(activeEnterprise.autoPrintPDVReceipt));
  const [receiptPrinterName, setReceiptPrinterName] = useState<string>(String(activeEnterprise.receiptPrinterName || ''));
  const [receiptPrintMode, setReceiptPrintMode] = useState<ReceiptPrintMode>((activeEnterprise.receiptPrintMode as ReceiptPrintMode) || 'SERVER_BROWSER');
  const [localPrintAgentUrl, setLocalPrintAgentUrl] = useState<string>(String(activeEnterprise.localPrintAgentUrl || 'http://127.0.0.1:18181'));
  const [localAgentStatus, setLocalAgentStatus] = useState<LocalAgentStatus>('IDLE');
  const [localAgentStatusMessage, setLocalAgentStatusMessage] = useState('');
  const [printers, setPrinters] = useState<Array<{ name: string; isDefault: boolean }>>([]);
  const [printersLoading, setPrintersLoading] = useState(false);
  const [printersMessage, setPrintersMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [saveMessage, setSaveMessage] = useState('');

  const applyInstalledPrinterAsActive = (list: Array<{ name: string; isDefault: boolean }>) => {
    if (!Array.isArray(list) || list.length === 0) return;
    const hasCurrent = list.some((printer) => printer.name === receiptPrinterName);
    if (hasCurrent) return;
    const preferred = list.find((printer) => printer.isDefault)?.name || list[0].name;
    if (preferred) setReceiptPrinterName(preferred);
  };

  useEffect(() => {
    setPaymentStartDay(activeEnterprise.collaboratorPaymentStartDay || 1);
    setPaymentDueDay(activeEnterprise.collaboratorPaymentDueDay || 10);
    setAllowNegativeSalesForClients(Boolean(activeEnterprise.allowNegativeSalesForClients));
    setNegativeLimitClients(Math.max(0, Number(activeEnterprise.negativeLimitClients || 0)));
    setAllowNegativeSalesForCollaborators(Boolean(activeEnterprise.allowNegativeSalesForCollaborators));
    setNegativeLimitCollaborators(Math.max(0, Number(activeEnterprise.negativeLimitCollaborators || 0)));
    setOpeningHours(normalizeOpeningHours(activeEnterprise.openingHours));
    setAutoPrintPDVReceipt(Boolean(activeEnterprise.autoPrintPDVReceipt));
    setReceiptPrinterName(String(activeEnterprise.receiptPrinterName || ''));
    setReceiptPrintMode((activeEnterprise.receiptPrintMode as ReceiptPrintMode) || 'SERVER_BROWSER');
    setLocalPrintAgentUrl(String(activeEnterprise.localPrintAgentUrl || 'http://127.0.0.1:18181'));
  }, [activeEnterprise]);

  const loadSystemPrinters = async () => {
    setPrintersLoading(true);
    setPrintersMessage('');
    try {
      const response = await ApiService.getSystemPrinters();
      const list = Array.isArray(response?.printers) ? response.printers : [];
      setPrinters(list);
      applyInstalledPrinterAsActive(list);
      if (!response?.success) {
        setPrintersMessage(response?.message || 'Não foi possível listar as impressoras.');
      } else if (list.length === 0) {
        setPrintersMessage('Nenhuma impressora encontrada no servidor.');
      }
    } catch (err) {
      console.error('Erro ao listar impressoras:', err);
      setPrinters([]);
      setPrintersMessage('Erro ao listar impressoras instaladas.');
    } finally {
      setPrintersLoading(false);
    }
  };

  const loadLocalAgentPrinters = async () => {
    const baseUrl = String(localPrintAgentUrl || '').trim().replace(/\/$/, '');
    if (!baseUrl) {
      setPrinters([]);
      setPrintersMessage('Informe a URL do agente local.');
      return;
    }

    setPrintersLoading(true);
    setPrintersMessage('');
    try {
      const response = await fetch(`${baseUrl}/printers`, { method: 'GET' });
      if (!response.ok) throw new Error('Agente local indisponível.');
      const data = await response.json();
      const list = Array.isArray(data?.printers) ? data.printers : [];
      setPrinters(list);
      applyInstalledPrinterAsActive(list);
      if (list.length === 0) {
        setPrintersMessage('Nenhuma impressora encontrada no computador local.');
      }
    } catch (err) {
      console.error('Erro ao listar impressoras locais:', err);
      setPrinters([]);
      setPrintersMessage('Não foi possível conectar ao agente local. Inicie no computador do caixa com: npm run print-agent');
    } finally {
      setPrintersLoading(false);
    }
  };

  const checkLocalAgentHealth = async () => {
    const baseUrl = String(localPrintAgentUrl || '').trim().replace(/\/$/, '');
    if (!baseUrl) {
      setLocalAgentStatus('OFFLINE');
      setLocalAgentStatusMessage('URL do agente local não informada.');
      return;
    }

    setLocalAgentStatus('CHECKING');
    try {
      const response = await fetch(`${baseUrl}/health`, { method: 'GET' });
      if (!response.ok) throw new Error('Agente não respondeu corretamente.');
      const data = await response.json();
      if (data?.success) {
        setLocalAgentStatus('ONLINE');
        setLocalAgentStatusMessage(`Agente online em ${baseUrl}`);
      } else {
        setLocalAgentStatus('OFFLINE');
        setLocalAgentStatusMessage('Agente respondeu com erro.');
      }
    } catch {
      setLocalAgentStatus('OFFLINE');
      setLocalAgentStatusMessage(`Sem conexão com ${baseUrl}`);
    }
  };

  useEffect(() => {
    if (receiptPrintMode === 'LOCAL_AGENT') {
      loadLocalAgentPrinters();
      checkLocalAgentHealth();
      return;
    }
    setLocalAgentStatus('IDLE');
    setLocalAgentStatusMessage('');
    loadSystemPrinters();
  }, [receiptPrintMode]);

  useEffect(() => {
    if (receiptPrintMode !== 'LOCAL_AGENT') return;
    checkLocalAgentHealth();
    const intervalId = window.setInterval(() => {
      checkLocalAgentHealth();
    }, 15000);
    return () => window.clearInterval(intervalId);
  }, [receiptPrintMode, localPrintAgentUrl]);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus('idle');

    try {
      const payload = {
        collaboratorPaymentStartDay: paymentStartDay,
        collaboratorPaymentDueDay: paymentDueDay,
        allowNegativeSalesForClients,
        negativeLimitClients: Math.max(0, Number(negativeLimitClients || 0)),
        allowNegativeSalesForCollaborators,
        negativeLimitCollaborators: Math.max(0, Number(negativeLimitCollaborators || 0)),
        openingHours,
        autoPrintPDVReceipt,
        receiptPrinterName: receiptPrinterName || '',
        receiptPrintMode,
        localPrintAgentUrl: localPrintAgentUrl || 'http://127.0.0.1:18181'
      };
      await ApiService.updateEnterprise(activeEnterprise.id, payload);
      Object.assign(activeEnterprise as any, payload);
      setSaveStatus('success');
      setSaveMessage('Configurações salvas com sucesso!');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (err) {
      console.error('Erro ao salvar configurações:', err);
      setSaveStatus('error');
      setSaveMessage('Erro ao salvar as configurações. Tente novamente.');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const activeServiceDaysCount = Object.values(openingHours).filter(day => !day.closed).length;

  return (
    <div className="space-y-6 p-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-black text-gray-800 tracking-tight uppercase">Ajustes da Unidade</h1>
        <p className="text-gray-400 text-[10px] font-black uppercase tracking-[2px]">
          Configurações organizadas por abas
        </p>
      </div>

      <div className="bg-white rounded-[28px] border border-gray-100 shadow-sm p-3 grid grid-cols-2 lg:grid-cols-4 gap-2">
        <button onClick={() => setActiveTab('FINANCEIRO')} className={`px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest ${activeTab === 'FINANCEIRO' ? 'bg-indigo-600 text-white' : 'bg-gray-50 text-gray-500'}`}>Pagamento</button>
        <button onClick={() => setActiveTab('ATENDIMENTO')} className={`px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest ${activeTab === 'ATENDIMENTO' ? 'bg-indigo-600 text-white' : 'bg-gray-50 text-gray-500'}`}>Atendimento</button>
        <button onClick={() => setActiveTab('SALDO')} className={`px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest ${activeTab === 'SALDO' ? 'bg-indigo-600 text-white' : 'bg-gray-50 text-gray-500'}`}>Saldo/Negativo</button>
        <button onClick={() => setActiveTab('IMPRESSAO')} className={`px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest ${activeTab === 'IMPRESSAO' ? 'bg-indigo-600 text-white' : 'bg-gray-50 text-gray-500'}`}>Impressão</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="bg-white rounded-[32px] shadow-sm border border-gray-100 p-8 space-y-6">
            {activeTab === 'FINANCEIRO' && (
              <div className="space-y-6">
                <div className="flex items-center gap-3 pb-4 border-b-2 border-indigo-100">
                  <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center">
                    <Calendar size={24} className="text-indigo-600" />
                  </div>
                  <div>
                    <h2 className="text-sm font-black text-gray-800 uppercase tracking-widest">Período de Pagamento</h2>
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[2px] mt-0.5">Colaboradores</p>
                  </div>
                </div>

                <div className="space-y-4 p-6 bg-indigo-50 border-2 border-indigo-100 rounded-[24px]">
                  <div className="flex items-start gap-2">
                    <Info size={16} className="text-indigo-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <label className="text-xs font-black text-indigo-900 uppercase tracking-widest block mb-1">
                        Dia de Início do Período de Consumo
                      </label>
                      <p className="text-xs text-indigo-700">Exemplo: se escolher dia 5, o período será de 5 do mês atual até 4 do mês seguinte.</p>
                    </div>
                  </div>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={paymentStartDay}
                    onChange={(e) => setPaymentStartDay(Math.min(31, Math.max(1, parseInt(e.target.value) || 1)))}
                    className="w-full px-6 py-4 bg-white border-2 border-indigo-200 rounded-[20px] font-black text-3xl text-indigo-600 text-center focus:border-indigo-500 outline-none transition-all"
                  />
                </div>

                <div className="space-y-4 p-6 bg-amber-50 border-2 border-amber-100 rounded-[24px]">
                  <div className="flex items-start gap-2">
                    <Info size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <label className="text-xs font-black text-amber-900 uppercase tracking-widest block mb-1">
                        Dia de Vencimento
                      </label>
                      <p className="text-xs text-amber-700">Define o dia limite para pagamento do consumo acumulado.</p>
                    </div>
                  </div>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={paymentDueDay}
                    onChange={(e) => setPaymentDueDay(Math.min(31, Math.max(1, parseInt(e.target.value) || 1)))}
                    className="w-full px-6 py-4 bg-white border-2 border-amber-200 rounded-[20px] font-black text-3xl text-amber-600 text-center focus:border-amber-500 outline-none transition-all"
                  />
                </div>
              </div>
            )}

            {activeTab === 'ATENDIMENTO' && (
              <div className="space-y-5 p-6 bg-emerald-50 border-2 border-emerald-100 rounded-[24px]">
                <div className="flex items-start gap-2">
                  <Calendar size={16} className="text-emerald-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <label className="text-xs font-black text-emerald-900 uppercase tracking-widest block mb-1">
                      Dias e Horários de Atendimento da Filial
                    </label>
                    <p className="text-xs text-emerald-700">
                      Esses dias alimentam calendário de planos, entregas e filtros de hoje/amanhã.
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {SERVICE_DAY_OPTIONS.map(day => {
                    const config = openingHours[day.key];
                    const isClosed = Boolean(config?.closed);
                    return (
                      <div key={day.key} className="bg-white rounded-[16px] p-4 border-2 border-emerald-100">
                        <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
                          <div className="flex-1">
                            <p className="text-xs font-black text-gray-800 uppercase tracking-widest">{day.label}</p>
                          </div>

                          <label className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gray-600">
                            <input
                              type="checkbox"
                              checked={!isClosed}
                              onChange={(e) => {
                                const isOpen = e.target.checked;
                                setOpeningHours(prev => ({
                                  ...prev,
                                  [day.key]: { ...prev[day.key], closed: !isOpen }
                                }));
                              }}
                            />
                            Em Atendimento
                          </label>

                          <div className="flex items-center gap-2">
                            <input
                              type="time"
                              value={config?.open || '07:00'}
                              disabled={isClosed}
                              onChange={(e) => setOpeningHours(prev => ({
                                ...prev,
                                [day.key]: { ...prev[day.key], open: e.target.value }
                              }))}
                              className="px-3 py-2 rounded-xl border-2 border-emerald-200 bg-white text-xs font-black text-emerald-700 disabled:opacity-40"
                            />
                            <span className="text-xs font-black text-gray-400">até</span>
                            <input
                              type="time"
                              value={config?.close || '17:00'}
                              disabled={isClosed}
                              onChange={(e) => setOpeningHours(prev => ({
                                ...prev,
                                [day.key]: { ...prev[day.key], close: e.target.value }
                              }))}
                              className="px-3 py-2 rounded-xl border-2 border-emerald-200 bg-white text-xs font-black text-emerald-700 disabled:opacity-40"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {activeTab === 'SALDO' && (
              <div className="space-y-5 p-6 bg-rose-50 border-2 border-rose-100 rounded-[24px]">
                <div className="flex items-start gap-2">
                  <AlertCircle size={16} className="text-rose-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <label className="text-xs font-black text-rose-900 uppercase tracking-widest block mb-1">
                      Liberação de Venda/Consumo sem Saldo
                    </label>
                    <p className="text-xs text-rose-700">
                      Controle de limite negativo para alunos/clientes e colaboradores.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="bg-white rounded-[16px] p-4 border-2 border-rose-100 space-y-3">
                    <label className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gray-700">
                      <input
                        type="checkbox"
                        checked={allowNegativeSalesForClients}
                        onChange={(e) => setAllowNegativeSalesForClients(e.target.checked)}
                      />
                      Liberar negativo para cliente/aluno
                    </label>
                    <div>
                      <p className="text-[10px] font-black text-rose-700 uppercase tracking-widest mb-1">Limite Negativo (R$)</p>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={negativeLimitClients}
                        disabled={!allowNegativeSalesForClients}
                        onChange={(e) => setNegativeLimitClients(Math.max(0, Number(e.target.value || 0)))}
                        className="w-full px-4 py-3 rounded-xl border-2 border-rose-200 bg-white text-sm font-black text-rose-700 disabled:opacity-40"
                      />
                    </div>
                  </div>

                  <div className="bg-white rounded-[16px] p-4 border-2 border-rose-100 space-y-3">
                    <label className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gray-700">
                      <input
                        type="checkbox"
                        checked={allowNegativeSalesForCollaborators}
                        onChange={(e) => setAllowNegativeSalesForCollaborators(e.target.checked)}
                      />
                      Liberar negativo para colaborador
                    </label>
                    <div>
                      <p className="text-[10px] font-black text-rose-700 uppercase tracking-widest mb-1">Limite Devedor (R$)</p>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={negativeLimitCollaborators}
                        disabled={!allowNegativeSalesForCollaborators}
                        onChange={(e) => setNegativeLimitCollaborators(Math.max(0, Number(e.target.value || 0)))}
                        className="w-full px-4 py-3 rounded-xl border-2 border-rose-200 bg-white text-sm font-black text-rose-700 disabled:opacity-40"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'IMPRESSAO' && (
              <div className="space-y-5 p-6 bg-sky-50 border-2 border-sky-100 rounded-[24px]">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <Printer size={16} className="text-sky-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <label className="text-xs font-black text-sky-900 uppercase tracking-widest block mb-1">
                        Impressão de Cupom Fiscal (PDV)
                      </label>
                      <p className="text-xs text-sky-700">
                        Configure impressão automática ao finalizar venda e escolha a impressora padrão.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => receiptPrintMode === 'LOCAL_AGENT' ? loadLocalAgentPrinters() : loadSystemPrinters()}
                    disabled={printersLoading}
                    className="px-3 py-2 rounded-xl border-2 border-sky-200 bg-white text-[10px] font-black text-sky-700 uppercase tracking-widest flex items-center gap-2 disabled:opacity-40"
                  >
                    <RefreshCw size={12} className={printersLoading ? 'animate-spin' : ''} />
                    Atualizar
                  </button>
                </div>

                <div className="bg-white rounded-[16px] p-4 border-2 border-sky-100 space-y-3">
                  <div>
                    <p className="text-[10px] font-black text-sky-700 uppercase tracking-widest mb-1">Modo de Impressão</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setReceiptPrintMode('SERVER_BROWSER')}
                        className={`px-3 py-3 rounded-xl border-2 text-[10px] font-black uppercase tracking-widest ${receiptPrintMode === 'SERVER_BROWSER' ? 'bg-sky-600 border-sky-600 text-white' : 'bg-white border-sky-200 text-sky-700'}`}
                      >
                        Navegador/Servidor
                      </button>
                      <button
                        type="button"
                        onClick={() => setReceiptPrintMode('LOCAL_AGENT')}
                        className={`px-3 py-3 rounded-xl border-2 text-[10px] font-black uppercase tracking-widest ${receiptPrintMode === 'LOCAL_AGENT' ? 'bg-sky-600 border-sky-600 text-white' : 'bg-white border-sky-200 text-sky-700'}`}
                      >
                        Agente Local
                      </button>
                    </div>
                  </div>

                  {receiptPrintMode === 'LOCAL_AGENT' && (
                    <div className="space-y-2">
                      <p className="text-[10px] font-black text-sky-700 uppercase tracking-widest mb-1">URL do Agente Local</p>
                      <div className="flex gap-2">
                        <input
                          value={localPrintAgentUrl}
                          onChange={(e) => setLocalPrintAgentUrl(e.target.value)}
                          placeholder="http://127.0.0.1:18181"
                          className="flex-1 px-4 py-3 rounded-xl border-2 border-sky-200 bg-white text-sm font-black text-sky-700"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            loadLocalAgentPrinters();
                            checkLocalAgentHealth();
                          }}
                          className="px-3 py-3 rounded-xl border-2 border-sky-200 bg-white text-[10px] font-black text-sky-700 uppercase tracking-widest"
                        >
                          Testar
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                          localAgentStatus === 'ONLINE'
                            ? 'bg-emerald-100 text-emerald-700'
                            : localAgentStatus === 'CHECKING'
                              ? 'bg-amber-100 text-amber-700'
                              : localAgentStatus === 'OFFLINE'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-gray-100 text-gray-600'
                        }`}>
                          Agente: {localAgentStatus === 'ONLINE' ? 'Online' : localAgentStatus === 'CHECKING' ? 'Verificando' : localAgentStatus === 'OFFLINE' ? 'Offline' : 'Inativo'}
                        </span>
                        {localAgentStatusMessage && (
                          <span className="text-[10px] font-bold text-gray-500">{localAgentStatusMessage}</span>
                        )}
                      </div>
                    </div>
                  )}

                  <label className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gray-700">
                    <input
                      type="checkbox"
                      checked={autoPrintPDVReceipt}
                      onChange={(e) => setAutoPrintPDVReceipt(e.target.checked)}
                    />
                    Imprimir cupom automaticamente ao finalizar venda
                  </label>

                  <div>
                    <p className="text-[10px] font-black text-sky-700 uppercase tracking-widest mb-1">Impressora Selecionada</p>
                    <select
                      value={receiptPrinterName}
                      onChange={(e) => setReceiptPrinterName(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border-2 border-sky-200 bg-white text-sm font-black text-sky-700"
                    >
                      <option value="">Padrão do sistema</option>
                      {printers.map((printer) => (
                        <option key={printer.name} value={printer.name}>
                          {printer.name}{printer.isDefault ? ' (Padrão)' : ''}
                        </option>
                      ))}
                    </select>
                    {printers.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <button
                          type="button"
                          onClick={() => {
                            const defaultPrinter = printers.find((printer) => printer.isDefault);
                            if (!defaultPrinter) {
                              setPrintersMessage('Não há impressora padrão definida no computador.');
                              return;
                            }
                            setReceiptPrinterName(defaultPrinter.name);
                            setPrintersMessage(`Impressora padrão ativada: ${defaultPrinter.name}`);
                          }}
                          className="px-3 py-2 rounded-xl border-2 border-sky-200 bg-white text-[10px] font-black text-sky-700 uppercase tracking-widest"
                        >
                          Ativar padrão do computador
                        </button>
                        <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                          Ativa: {receiptPrinterName || 'Padrão do sistema'}
                        </span>
                      </div>
                    )}
                  </div>

                  {printersMessage && (
                    <div className="p-3 rounded-xl bg-amber-50 border border-amber-100 text-[11px] font-bold text-amber-700">
                      {printersMessage}
                    </div>
                  )}

                  <div className="p-3 rounded-xl bg-sky-50 border border-sky-100 text-[11px] font-bold text-sky-700">
                    {receiptPrintMode === 'LOCAL_AGENT'
                      ? 'No modo Agente Local, a lista vem do computador do caixa.'
                      : 'No modo Navegador/Servidor, a lista vem do servidor backend.'}
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex-1 py-4 bg-indigo-600 text-white rounded-[24px] font-black uppercase tracking-widest text-sm shadow-xl shadow-indigo-100 hover:bg-indigo-700 disabled:opacity-50 active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <Save size={18} />
                {isSaving ? 'Salvando...' : 'Salvar Configurações'}
              </button>
            </div>

            {saveStatus === 'success' && (
              <div className="bg-emerald-50 border-2 border-emerald-200 rounded-[20px] p-4 flex items-center gap-3">
                <Check size={20} className="text-emerald-600" />
                <p className="text-sm font-bold text-emerald-700">{saveMessage}</p>
              </div>
            )}

            {saveStatus === 'error' && (
              <div className="bg-red-50 border-2 border-red-200 rounded-[20px] p-4 flex items-center gap-3">
                <AlertCircle size={20} className="text-red-600" />
                <p className="text-sm font-bold text-red-700">{saveMessage}</p>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-[32px] border-2 border-indigo-100 p-6 space-y-6">
            <div>
              <h3 className="text-[11px] font-black text-indigo-900 uppercase tracking-widest mb-3 flex items-center gap-2">
                <Settings size={16} />
                Resumo
              </h3>
              <div className="space-y-3 text-sm">
                <div className="bg-white/60 rounded-[16px] p-3 border border-indigo-100">
                  <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-1">Unidade</p>
                  <p className="text-xs text-gray-800 font-bold">{activeEnterprise.name}</p>
                </div>
                <div className="bg-white/60 rounded-[16px] p-3 border border-indigo-100">
                  <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-1">Atendimento</p>
                  <p className="text-xs text-gray-800 font-bold">{activeServiceDaysCount} dias ativos/semana</p>
                </div>
                <div className="bg-white/60 rounded-[16px] p-3 border border-indigo-100">
                  <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-1">Impressão Auto PDV</p>
                  <p className="text-xs text-gray-800 font-bold">{autoPrintPDVReceipt ? 'Ativada' : 'Desativada'}</p>
                </div>
                <div className="bg-white/60 rounded-[16px] p-3 border border-indigo-100">
                  <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-1">Modo Impressão</p>
                  <p className="text-xs text-gray-800 font-bold">{receiptPrintMode === 'LOCAL_AGENT' ? 'Agente Local' : 'Navegador/Servidor'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
