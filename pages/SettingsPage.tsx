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
type ReceiptPaperWidth = '58mm' | '80mm';
type ReceiptFontFamily = 'ARIAL_BLACK' | 'ARIAL' | 'COURIER_NEW' | 'MONOSPACE';
type ReceiptFontSize = 'SMALL' | 'NORMAL' | 'LARGE';

const RECEIPT_FONT_FAMILY_LABELS: Record<ReceiptFontFamily, string> = {
  ARIAL_BLACK: 'Arial Black',
  ARIAL: 'Arial',
  COURIER_NEW: 'Courier New',
  MONOSPACE: 'Monospace'
};

const RECEIPT_FONT_SIZE_LABELS: Record<ReceiptFontSize, string> = {
  SMALL: 'Pequena',
  NORMAL: 'Normal',
  LARGE: 'Grande'
};

const SettingsPage: React.FC<SettingsPageProps> = ({ currentUser: _currentUser, activeEnterprise }) => {
  if (!activeEnterprise) {
    return (
      <div className="settings-shell min-h-[24rem] flex items-center justify-center rounded-2xl">
        <div className="text-center space-y-4">
          <div className="animate-spin inline-block w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full"></div>
          <p className="text-gray-600 dark:text-zinc-300 font-medium">Carregando configurações...</p>
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
  const [receiptPaperWidth, setReceiptPaperWidth] = useState<ReceiptPaperWidth>((activeEnterprise.receiptPaperWidth as ReceiptPaperWidth) || '80mm');
  const [receiptFontFamily, setReceiptFontFamily] = useState<ReceiptFontFamily>((activeEnterprise.receiptFontFamily as ReceiptFontFamily) || 'ARIAL_BLACK');
  const [receiptFontSize, setReceiptFontSize] = useState<ReceiptFontSize>((activeEnterprise.receiptFontSize as ReceiptFontSize) || 'NORMAL');
  const [receiptMarginVertical, setReceiptMarginVertical] = useState<number>(Math.max(0, Math.min(20, Number(activeEnterprise.receiptMarginVertical ?? 2))));
  const [receiptMarginHorizontal, setReceiptMarginHorizontal] = useState<number>(Math.max(0, Math.min(20, Number(activeEnterprise.receiptMarginHorizontal ?? 2))));
  const [receiptItemGapTop, setReceiptItemGapTop] = useState<number>(Math.max(0, Math.min(20, Number(activeEnterprise.receiptItemGapTop ?? 4))));
  const [receiptItemGapBottom, setReceiptItemGapBottom] = useState<number>(Math.max(0, Math.min(20, Number(activeEnterprise.receiptItemGapBottom ?? 4))));
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
    setReceiptPaperWidth((activeEnterprise.receiptPaperWidth as ReceiptPaperWidth) || '80mm');
    setReceiptFontFamily((activeEnterprise.receiptFontFamily as ReceiptFontFamily) || 'ARIAL_BLACK');
    setReceiptFontSize((activeEnterprise.receiptFontSize as ReceiptFontSize) || 'NORMAL');
    setReceiptMarginVertical(Math.max(0, Math.min(20, Number(activeEnterprise.receiptMarginVertical ?? 2))));
    setReceiptMarginHorizontal(Math.max(0, Math.min(20, Number(activeEnterprise.receiptMarginHorizontal ?? 2))));
    setReceiptItemGapTop(Math.max(0, Math.min(20, Number(activeEnterprise.receiptItemGapTop ?? 4))));
    setReceiptItemGapBottom(Math.max(0, Math.min(20, Number(activeEnterprise.receiptItemGapBottom ?? 4))));
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
        localPrintAgentUrl: localPrintAgentUrl || 'http://127.0.0.1:18181',
        receiptPaperWidth,
        receiptFontFamily,
        receiptFontSize,
        receiptMarginVertical: Math.max(0, Math.min(20, Number(receiptMarginVertical || 0))),
        receiptMarginHorizontal: Math.max(0, Math.min(20, Number(receiptMarginHorizontal || 0))),
        receiptItemGapTop: Math.max(0, Math.min(20, Number(receiptItemGapTop || 0))),
        receiptItemGapBottom: Math.max(0, Math.min(20, Number(receiptItemGapBottom || 0)))
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

  const activeServiceDaysCount = (Object.values(openingHours) as OpeningHours[]).filter(day => !day.closed).length;

  return (
    <div className="settings-shell space-y-4 p-4 animate-in fade-in duration-500">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-black text-gray-800 tracking-tight uppercase">Ajustes da Unidade</h1>
        <p className="text-gray-400 text-[10px] font-black uppercase tracking-[2px]">
          Configurações organizadas por abas
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-2 grid grid-cols-2 lg:grid-cols-4 gap-1.5 dark:bg-[#121214] dark:border-white/10 dark:ring-1 dark:ring-white/5">
        <button onClick={() => setActiveTab('FINANCEIRO')} className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${activeTab === 'FINANCEIRO' ? 'bg-indigo-600 text-white' : 'bg-gray-50 text-gray-500'}`}>Pagamento</button>
        <button onClick={() => setActiveTab('ATENDIMENTO')} className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${activeTab === 'ATENDIMENTO' ? 'bg-indigo-600 text-white' : 'bg-gray-50 text-gray-500'}`}>Atendimento</button>
        <button onClick={() => setActiveTab('SALDO')} className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${activeTab === 'SALDO' ? 'bg-indigo-600 text-white' : 'bg-gray-50 text-gray-500'}`}>Saldo/Negativo</button>
        <button onClick={() => setActiveTab('IMPRESSAO')} className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${activeTab === 'IMPRESSAO' ? 'bg-indigo-600 text-white' : 'bg-gray-50 text-gray-500'}`}>Impressão</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4 dark:bg-[#121214] dark:border-white/10 dark:ring-1 dark:ring-white/5">
            {activeTab === 'FINANCEIRO' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2.5 pb-3 border-b border-indigo-100">
                  <div className="w-9 h-9 bg-indigo-100 rounded-xl flex items-center justify-center">
                    <Calendar size={18} className="text-indigo-600" />
                  </div>
                  <div>
                    <h2 className="text-sm font-black text-gray-800 uppercase tracking-widest">Período de Pagamento</h2>
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[2px] mt-0.5">Colaboradores</p>
                  </div>
                </div>

                <div className="space-y-3 p-4 bg-indigo-50 border border-indigo-100 rounded-xl">
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
                    className="w-full px-4 py-3 bg-white border border-indigo-200 rounded-xl font-black text-2xl text-indigo-600 text-center focus:border-indigo-500 outline-none transition-all"
                  />
                </div>

                <div className="space-y-3 p-4 bg-amber-50 border border-amber-100 rounded-xl">
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
                    className="w-full px-4 py-3 bg-white border border-amber-200 rounded-xl font-black text-2xl text-amber-600 text-center focus:border-amber-500 outline-none transition-all"
                  />
                </div>
              </div>
            )}

            {activeTab === 'ATENDIMENTO' && (
              <div className="space-y-4 p-4 bg-emerald-50 border border-emerald-100 rounded-xl">
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

                <div className="space-y-2">
                  {SERVICE_DAY_OPTIONS.map(day => {
                    const config = openingHours[day.key];
                    const isClosed = Boolean(config?.closed);
                    return (
                      <div key={day.key} className="bg-white rounded-xl p-3 border border-emerald-100">
                        <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3">
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
                              className="px-2.5 py-1.5 rounded-lg border border-emerald-200 bg-white text-xs font-black text-emerald-700 disabled:opacity-40"
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
                              className="px-2.5 py-1.5 rounded-lg border border-emerald-200 bg-white text-xs font-black text-emerald-700 disabled:opacity-40"
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
              <div className="space-y-4 p-4 bg-rose-50 border border-rose-100 rounded-xl">
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
                  <div className="bg-white rounded-xl p-3 border border-rose-100 space-y-2.5">
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
                        className="w-full px-3 py-2 rounded-lg border border-rose-200 bg-white text-sm font-black text-rose-700 disabled:opacity-40"
                      />
                    </div>
                  </div>

                  <div className="bg-white rounded-xl p-3 border border-rose-100 space-y-2.5">
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
                        className="w-full px-3 py-2 rounded-lg border border-rose-200 bg-white text-sm font-black text-rose-700 disabled:opacity-40"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'IMPRESSAO' && (
              <div className="space-y-4 p-4 bg-sky-50 border border-sky-100 rounded-xl">
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
                    className="px-2.5 py-1.5 rounded-lg border border-sky-200 bg-white text-[10px] font-black text-sky-700 uppercase tracking-widest flex items-center gap-1.5 disabled:opacity-40"
                  >
                    <RefreshCw size={12} className={printersLoading ? 'animate-spin' : ''} />
                    Atualizar
                  </button>
                </div>

                <div className="bg-white rounded-xl p-3 border border-sky-100 space-y-2.5">
                  <div>
                    <p className="text-[10px] font-black text-sky-700 uppercase tracking-widest mb-1">Modo de Impressão</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setReceiptPrintMode('SERVER_BROWSER')}
                        className={`px-3 py-2 rounded-lg border text-[10px] font-black uppercase tracking-widest ${receiptPrintMode === 'SERVER_BROWSER' ? 'bg-sky-600 border-sky-600 text-white' : 'bg-white border-sky-200 text-sky-700'}`}
                      >
                        Navegador/Servidor
                      </button>
                      <button
                        type="button"
                        onClick={() => setReceiptPrintMode('LOCAL_AGENT')}
                        className={`px-3 py-2 rounded-lg border text-[10px] font-black uppercase tracking-widest ${receiptPrintMode === 'LOCAL_AGENT' ? 'bg-sky-600 border-sky-600 text-white' : 'bg-white border-sky-200 text-sky-700'}`}
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
                          className="flex-1 px-3 py-2 rounded-lg border border-sky-200 bg-white text-sm font-black text-sky-700"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            loadLocalAgentPrinters();
                            checkLocalAgentHealth();
                          }}
                          className="px-2.5 py-2 rounded-lg border border-sky-200 bg-white text-[10px] font-black text-sky-700 uppercase tracking-widest"
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
                      className="w-full px-3 py-2 rounded-lg border border-sky-200 bg-white text-sm font-black text-sky-700"
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
                          className="px-2.5 py-1.5 rounded-lg border border-sky-200 bg-white text-[10px] font-black text-sky-700 uppercase tracking-widest"
                        >
                          Ativar padrão do computador
                        </button>
                        <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                          Ativa: {receiptPrinterName || 'Padrão do sistema'}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <p className="text-[10px] font-black text-sky-700 uppercase tracking-widest mb-1">Largura do Papel</p>
                      <select
                        value={receiptPaperWidth}
                        onChange={(e) => setReceiptPaperWidth(e.target.value as ReceiptPaperWidth)}
                        className="w-full px-3 py-2 rounded-lg border border-sky-200 bg-white text-sm font-black text-sky-700"
                      >
                        <option value="58mm">58mm</option>
                        <option value="80mm">80mm</option>
                      </select>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-sky-700 uppercase tracking-widest mb-1">Fonte</p>
                      <select
                        value={receiptFontFamily}
                        onChange={(e) => setReceiptFontFamily(e.target.value as ReceiptFontFamily)}
                        className="w-full px-3 py-2 rounded-lg border border-sky-200 bg-white text-sm font-black text-sky-700"
                      >
                        <option value="ARIAL_BLACK">Arial Black</option>
                        <option value="ARIAL">Arial</option>
                        <option value="COURIER_NEW">Courier New</option>
                        <option value="MONOSPACE">Monospace</option>
                      </select>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-sky-700 uppercase tracking-widest mb-1">Tamanho da Fonte</p>
                      <select
                        value={receiptFontSize}
                        onChange={(e) => setReceiptFontSize(e.target.value as ReceiptFontSize)}
                        className="w-full px-3 py-2 rounded-lg border border-sky-200 bg-white text-sm font-black text-sky-700"
                      >
                        <option value="SMALL">Pequena</option>
                        <option value="NORMAL">Normal</option>
                        <option value="LARGE">Grande</option>
                      </select>
                    </div>
                  </div>

                  <div className="rounded-xl border border-sky-200 bg-white p-3 space-y-3">
                    <p className="text-[10px] font-black text-sky-700 uppercase tracking-widest">Simulador Visual do Cupom</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                        <div className="flex items-center justify-between rounded-lg border border-sky-200 px-2.5 py-1.5 bg-sky-50">
                          <span className="text-[10px] font-black text-sky-700 uppercase tracking-widest">Margem Superior/Inferior</span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setReceiptMarginVertical((prev) => Math.max(0, prev - 1))}
                              className="px-2 py-1 rounded-lg border border-sky-300 bg-white text-sky-700 text-xs font-black"
                            >
                              -
                            </button>
                            <span className="text-[11px] font-black text-sky-800 min-w-[52px] text-center">{receiptMarginVertical} mm</span>
                            <button
                              type="button"
                              onClick={() => setReceiptMarginVertical((prev) => Math.min(20, prev + 1))}
                              className="px-2 py-1 rounded-lg border border-sky-300 bg-white text-sky-700 text-xs font-black"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center justify-between rounded-lg border border-sky-200 px-2.5 py-1.5 bg-sky-50">
                          <span className="text-[10px] font-black text-sky-700 uppercase tracking-widest">Margem Esquerda/Direita</span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setReceiptMarginHorizontal((prev) => Math.max(0, prev - 1))}
                              className="px-2 py-1 rounded-lg border border-sky-300 bg-white text-sky-700 text-xs font-black"
                            >
                              -
                            </button>
                            <span className="text-[11px] font-black text-sky-800 min-w-[52px] text-center">{receiptMarginHorizontal} mm</span>
                            <button
                              type="button"
                              onClick={() => setReceiptMarginHorizontal((prev) => Math.min(20, prev + 1))}
                              className="px-2 py-1 rounded-lg border border-sky-300 bg-white text-sky-700 text-xs font-black"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center justify-between rounded-lg border border-sky-200 px-2.5 py-1.5 bg-sky-50">
                          <span className="text-[10px] font-black text-sky-700 uppercase tracking-widest">Distância entre itens (Cima)</span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setReceiptItemGapTop((prev) => Math.max(0, prev - 1))}
                              className="px-2 py-1 rounded-lg border border-sky-300 bg-white text-sky-700 text-xs font-black"
                            >
                              -
                            </button>
                            <span className="text-[11px] font-black text-sky-800 min-w-[52px] text-center">{receiptItemGapTop} px</span>
                            <button
                              type="button"
                              onClick={() => setReceiptItemGapTop((prev) => Math.min(20, prev + 1))}
                              className="px-2 py-1 rounded-lg border border-sky-300 bg-white text-sky-700 text-xs font-black"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center justify-between rounded-lg border border-sky-200 px-2.5 py-1.5 bg-sky-50">
                          <span className="text-[10px] font-black text-sky-700 uppercase tracking-widest">Distância entre itens (Baixo)</span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setReceiptItemGapBottom((prev) => Math.max(0, prev - 1))}
                              className="px-2 py-1 rounded-lg border border-sky-300 bg-white text-sky-700 text-xs font-black"
                            >
                              -
                            </button>
                            <span className="text-[11px] font-black text-sky-800 min-w-[52px] text-center">{receiptItemGapBottom} px</span>
                            <button
                              type="button"
                              onClick={() => setReceiptItemGapBottom((prev) => Math.min(20, prev + 1))}
                              className="px-2 py-1 rounded-lg border border-sky-300 bg-white text-sky-700 text-xs font-black"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-lg border border-sky-200 bg-gray-100 p-2.5">
                        <div
                          className="mx-auto rounded-lg border-2 border-sky-300 bg-white relative overflow-hidden"
                          style={{ width: receiptPaperWidth === '58mm' ? 160 : 220, height: 260 }}
                        >
                          <div
                            className="absolute rounded-md border border-dashed border-sky-400 bg-sky-50/40"
                            style={{
                              top: `${Math.min(60, receiptMarginVertical * 2)}px`,
                              bottom: `${Math.min(60, receiptMarginVertical * 2)}px`,
                              left: `${Math.min(60, receiptMarginHorizontal * 2)}px`,
                              right: `${Math.min(60, receiptMarginHorizontal * 2)}px`,
                            }}
                          >
                            <div className="px-2 py-2 text-[8px] font-black text-sky-700 leading-tight">
                              <div className="text-center mb-1">CUPOM NÃO FISCAL</div>
                              <div style={{ marginTop: receiptItemGapTop, marginBottom: receiptItemGapBottom }}>1x COXINHA FRANGO</div>
                              <div>R$ 7,00</div>
                              <div style={{ borderTop: '1px dashed #93c5fd', margin: '2px 0' }}></div>
                              <div style={{ marginTop: receiptItemGapTop, marginBottom: receiptItemGapBottom }}>1x SUCO NATURAL</div>
                              <div>R$ 6,00</div>
                              <div className="mt-2 border-t border-dashed border-sky-300 pt-1">TOTAL: R$ 13,00</div>
                            </div>
                          </div>
                        </div>
                        <p className="text-[10px] font-bold text-gray-600 mt-2 text-center">
                          Simulação {receiptPaperWidth} (área azul = conteúdo impresso)
                        </p>
                      </div>
                    </div>
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

            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-black uppercase tracking-widest text-xs shadow-lg shadow-indigo-100 hover:bg-indigo-700 disabled:opacity-50 active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <Save size={18} />
                {isSaving ? 'Salvando...' : 'Salvar Configurações'}
              </button>
            </div>

            {saveStatus === 'success' && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-2.5">
                <Check size={18} className="text-emerald-600" />
                <p className="text-xs font-bold text-emerald-700">{saveMessage}</p>
              </div>
            )}

            {saveStatus === 'error' && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2.5">
                <AlertCircle size={18} className="text-red-600" />
                <p className="text-xs font-bold text-red-700">{saveMessage}</p>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-2xl border border-indigo-100 p-4 space-y-4 dark:from-zinc-900 dark:to-zinc-900 dark:border-white/10 dark:ring-1 dark:ring-white/5">
            <div>
              <h3 className="text-[11px] font-black text-indigo-900 uppercase tracking-widest mb-3 flex items-center gap-2">
                <Settings size={16} />
                Resumo
              </h3>
              <div className="space-y-2.5 text-sm">
                <div className="bg-white/60 rounded-xl p-2.5 border border-indigo-100">
                  <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-1">Unidade</p>
                  <p className="text-xs text-gray-800 font-bold">{activeEnterprise.name}</p>
                </div>
                <div className="bg-white/60 rounded-xl p-2.5 border border-indigo-100">
                  <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-1">Atendimento</p>
                  <p className="text-xs text-gray-800 font-bold">{activeServiceDaysCount} dias ativos/semana</p>
                </div>
                <div className="bg-white/60 rounded-xl p-2.5 border border-indigo-100">
                  <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-1">Impressão Auto PDV</p>
                  <p className="text-xs text-gray-800 font-bold">{autoPrintPDVReceipt ? 'Ativada' : 'Desativada'}</p>
                </div>
                <div className="bg-white/60 rounded-xl p-2.5 border border-indigo-100">
                  <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-1">Modo Impressão</p>
                  <p className="text-xs text-gray-800 font-bold">{receiptPrintMode === 'LOCAL_AGENT' ? 'Agente Local' : 'Navegador/Servidor'}</p>
                </div>
                <div className="bg-white/60 rounded-xl p-2.5 border border-indigo-100">
                  <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-1">Cupom Não Fiscal</p>
                  <p className="text-xs text-gray-800 font-bold">
                    {receiptPaperWidth} • {RECEIPT_FONT_FAMILY_LABELS[receiptFontFamily]} • {RECEIPT_FONT_SIZE_LABELS[receiptFontSize]} • V:{receiptMarginVertical}mm H:{receiptMarginHorizontal}mm • Itens: +{receiptItemGapTop}px/-{receiptItemGapBottom}px
                  </p>
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
