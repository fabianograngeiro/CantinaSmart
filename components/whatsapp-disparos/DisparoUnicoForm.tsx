import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCheck, Loader2, Paperclip, Search, Send } from 'lucide-react';
import ApiService from '../../services/api';
import { Enterprise, Plan } from '../../types';
import { DispatchAutomationConfig } from './types';

type AudienciaType = 'TODOS' | 'COLABORADOR' | 'RESPONSAVEL' | 'INDIVIDUAL';
type ColaboradorFilter = 'TODOS' | 'INADIMPLENTES';
type ResponsavelFilter = 'TODOS' | 'NEGATIVOS';

type IndividualRecipient = {
  id: string;
  nome: string;
  telefone: string;
  saldo?: string;
  aluno?: string;
};

type ClienteOption = {
  id: string;
  nome: string;
  telefone: string;
  aluno: string;
  saldo: string;
  saldoNumerico: number;
  inadimplente: boolean;
  tipo: 'RESPONSAVEL' | 'COLABORADOR';
};

const CLIENTES_MOCK: ClienteOption[] = [
  { id: 'c1', nome: 'Fabiano Araujo', telefone: '5548988237072', aluno: 'Eloah', saldo: 'R$ 135,00', saldoNumerico: 135, inadimplente: false, tipo: 'RESPONSAVEL' },
  { id: 'c2', nome: 'Bruno Silva', telefone: '5548999990001', aluno: 'Melissa', saldo: '-R$ 23,50', saldoNumerico: -23.5, inadimplente: true, tipo: 'RESPONSAVEL' },
  { id: 'c3', nome: 'Aline Cassiano', telefone: '5548999990002', aluno: 'Victor', saldo: 'R$ 210,00', saldoNumerico: 210, inadimplente: false, tipo: 'RESPONSAVEL' },
  { id: 'c4', nome: 'Roberta Vasques', telefone: '5548999990003', aluno: 'Laura', saldo: '-R$ 45,00', saldoNumerico: -45, inadimplente: false, tipo: 'RESPONSAVEL' },
  { id: 'col1', nome: 'Carlos Ferreira', telefone: '5548999990010', aluno: 'â€”', saldo: 'R$ 0,00', saldoNumerico: 0, inadimplente: false, tipo: 'COLABORADOR' },
  { id: 'col2', nome: 'Marta Oliveira', telefone: '5548999990011', aluno: 'â€”', saldo: '-R$ 120,00', saldoNumerico: -120, inadimplente: true, tipo: 'COLABORADOR' },
];

const TEMPLATE_RELATORIO_SEMANAL = `Mensagem automÃ¡tica da cantina.
OlÃ¡ {{nome_pai}}, segue o relatÃ³rio semanal do(s) seu(s) filho(s).
PerÃ­odo : {{periodo_referencia}}
Filhos/Alunos: {{alunos}}
Saldos atuais por aluno:
{{saldo_por_aluno}}
Total consumido no perÃ­odo: {{consumo_total_periodo}}
Consumo por aluno no perÃ­odo:
{{consumo_total_por_aluno}}`;
type LogEnvio = {
  id: string;
  nome: string;
  status: 'Sucesso' | 'Erro' | 'Agendado';
  horario: Date;
};

type PlanVariableItem = {
  planId: string;
  planName: string;
  token: string;
};

const formatarHoraAtual = () =>
  new Date().toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, Math.max(0, ms)));

const normalizePhone = (value: string) => String(value || '').replace(/\D/g, '');

const normalizePlanTokenKey = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'plano';

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result || '');
      const base64 = raw.includes(',') ? raw.split(',')[1] || '' : raw;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Falha ao converter arquivo para Base64.'));
    reader.readAsDataURL(file);
  });

const WhatsAppPreview: React.FC<{
  clienteNome: string;
  mensagemCorpo: string;
  horario: string;
}> = ({ clienteNome, mensagemCorpo, horario }) => {
  const mensagemFormatada = useMemo(() => {
    const nome = clienteNome || 'Cliente';
    const aluno = 'Aluno(s)';
    return String(mensagemCorpo || '')
      .replace(/{{nome}}/g, nome)
      .replace(/{{nome_pai}}/g, nome)
      .replace(/{{saldo}}/g, 'R$ 0,00')
      .replace(/{{aluno}}/g, aluno)
      .replace(/{{alunos}}/g, aluno)
      .replace(/{{periodo_referencia}}/g, '[perÃ­odo]')
      .replace(/{{saldo_por_aluno}}/g, `${aluno}: R$ 0,00`)
      .replace(/{{consumo_total_periodo}}/g, 'R$ 0,00')
      .replace(/{{consumo_total_por_aluno}}/g, `${aluno}: R$ 0,00`);
  }, [mensagemCorpo, clienteNome]);

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-zinc-700 shadow-lg overflow-hidden bg-white dark:bg-zinc-900">
      <div className="px-4 py-3 bg-emerald-700 text-white">
        <p className="text-sm font-black">{clienteNome || 'Cliente'}</p>
        <p className="text-[11px] font-semibold text-emerald-100">online</p>
      </div>

      <div className="p-4 min-h-[360px] flex items-start bg-[#e5ddd5] dark:bg-zinc-800">
        <div className="ml-auto max-w-[92%] rounded-2xl px-4 py-3 shadow-md border border-emerald-200 dark:border-emerald-700/40 bg-[#dcf8c6] dark:bg-emerald-900/40">
          <p className="text-sm font-medium text-slate-800 dark:text-zinc-100 whitespace-pre-wrap">
            {mensagemFormatada || 'Sua mensagem aparecerÃ¡ aqui...'}
          </p>
          <div className="mt-1.5 flex items-center justify-end gap-1">
            <span className="text-[11px] text-slate-500 dark:text-zinc-400">{horario}</span>
            <CheckCheck size={14} className="text-sky-500" />
          </div>
        </div>
      </div>
    </div>
  );
};

type DisparoUnicoFormProps = {
  activeEnterprise?: Enterprise | null;
  onOpenProfileTab?: () => void;
};

const DisparoUnicoForm: React.FC<DisparoUnicoFormProps> = ({ activeEnterprise, onOpenProfileTab }) => {
  const [audienciaType, setAudienciaType] = useState<AudienciaType>('INDIVIDUAL');
  const [colaboradorFilter, setColaboradorFilter] = useState<ColaboradorFilter>('TODOS');
  const [responsavelFilter, setResponsavelFilter] = useState<ResponsavelFilter>('TODOS');

  const [clienteId, setClienteId] = useState('');
  const [clienteNome, setClienteNome] = useState('');
  const [individualRecipientList, setIndividualRecipientList] = useState<IndividualRecipient[]>([]);
  const [mensagemCorpo, setMensagemCorpo] = useState(
    'Olá, {{nome}}! Tudo bem? 😊\n\nPassando para informar o status financeiro atual.\n\n👤 Aluno: {{aluno}}\n💰 Saldo atual: {{saldo}}\n\nSe precisar de algo, estamos à disposição! 🤝'
  );
  const [dataAgendamento, setDataAgendamento] = useState('');
  const [delayMode, setDelayMode] = useState<'RANDOM' | 'INTERVAL'>('RANDOM');
  const [delayMin, setDelayMin] = useState(2);
  const [delayMax, setDelayMax] = useState(5);
  const [intervalSeconds, setIntervalSeconds] = useState(3);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [buscaCliente, setBuscaCliente] = useState('');
  const [horaAtual, setHoraAtual] = useState(formatarHoraAtual());
  const [isSending, setIsSending] = useState(false);
  const [waitingSeconds, setWaitingSeconds] = useState(0);
  const [totalWaitingSeconds, setTotalWaitingSeconds] = useState(0);
  const [logs, setLogs] = useState<LogEnvio[]>(() => {
    try {
      const raw = localStorage.getItem('whatsapp_disparo_unico_form_logs');
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed.map((item) => ({
        ...item,
        horario: new Date(item.horario),
      }));
    } catch {
      return [];
    }
  });
  const [feedback, setFeedback] = useState('');
  const [planVariables, setPlanVariables] = useState<PlanVariableItem[]>([]);
  const messageTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isAgendaMonitoring, setIsAgendaMonitoring] = useState(false);
  const scheduleStatusByIdRef = useRef<Record<string, string>>({});

  const [useExternalText, setUseExternalText] = useState(true);
  const [useExternalMedia, setUseExternalMedia] = useState(false);
  const [useExternalMenu, setUseExternalMenu] = useState(false);
  const [useExternalCarousel, setUseExternalCarousel] = useState(false);
  const [useExternalPayment, setUseExternalPayment] = useState(false);

  const [menuType, setMenuType] = useState<'button' | 'list' | 'poll'>('button');
  const [menuChoicesCsv, setMenuChoicesCsv] = useState('Confirmar, Falar com atendimento');

  const [carouselTitle, setCarouselTitle] = useState('Oferta especial da cantina');
  const [carouselImageUrl, setCarouselImageUrl] = useState('https://images.unsplash.com/photo-1542838132-92c53300491e?w=1200');

  const [pixAmount, setPixAmount] = useState(25);
  const [pixItemName, setPixItemName] = useState('Recarga de saldo');
  const [pixKey, setPixKey] = useState('');

  const [externalProviderEnabled, setExternalProviderEnabled] = useState(false);

  const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

  useEffect(() => {
    const timer = window.setInterval(() => setHoraAtual(formatarHoraAtual()), 15000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('whatsapp_disparo_unico_form_logs', JSON.stringify(logs.slice(0, 100)));
    } catch {
      // ignore
    }
  }, [logs]);

  useEffect(() => {
    let cancelled = false;
    const loadProvider = async () => {
      try {
        const result = await ApiService.getWhatsAppProviderConfig();
        const cfg = result?.config;
        const enabled = String(cfg?.mode || '').toUpperCase() === 'EXTERNAL' && Boolean(cfg?.external?.enabled);
        if (!cancelled) setExternalProviderEnabled(enabled);
      } catch {
        if (!cancelled) setExternalProviderEnabled(false);
      }
    };

    loadProvider();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadPlansAsVariables = async () => {
      try {
        const result = await ApiService.getPlans();
        const rawPlans = Array.isArray(result)
          ? result
          : Array.isArray((result as any)?.plans)
            ? (result as any).plans
            : [];

        const usedTokens = new Set<string>();
        const mapped = rawPlans
          .map((plan: Plan) => {
            const planName = String(plan?.name || '').trim();
            if (!planName) return null;
            const baseKey = normalizePlanTokenKey(planName);
            let tokenKey = `plano_${baseKey}`;
            let token = `{{${tokenKey}}}`;
            let suffix = 2;
            while (usedTokens.has(token)) {
              tokenKey = `plano_${baseKey}_${suffix}`;
              token = `{{${tokenKey}}}`;
              suffix += 1;
            }
            usedTokens.add(token);
            return {
              planId: String(plan?.id || tokenKey),
              planName,
              token,
            };
          })
          .filter(Boolean) as PlanVariableItem[];

        if (!cancelled) setPlanVariables(mapped);
      } catch {
        if (!cancelled) setPlanVariables([]);
      }
    };

    loadPlansAsVariables();
    const intervalId = window.setInterval(loadPlansAsVariables, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!isAgendaMonitoring || !activeEnterprise?.id) return undefined;
    let cancelled = false;

    const tick = async () => {
      try {
        await syncAgendaLogs();
      } catch {
        if (!cancelled) {
          setFeedback('Falha ao consultar agenda de envios em tempo real.');
        }
      }
    };

    tick();
    const timer = window.setInterval(tick, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isAgendaMonitoring, activeEnterprise?.id]);

  const insertMessageToken = (token: string) => {
    const safeToken = String(token || '').trim();
    if (!safeToken) return;

    const textarea = messageTextareaRef.current;
    const currentValue = String(mensagemCorpo || '');
    if (!textarea) {
      setMensagemCorpo((prev) => {
        const safePrev = String(prev || '');
        return `${safePrev}${safePrev && !safePrev.endsWith(' ') ? ' ' : ''}${safeToken}`;
      });
      return;
    }

    const start = textarea.selectionStart ?? currentValue.length;
    const end = textarea.selectionEnd ?? currentValue.length;
    const nextValue = `${currentValue.slice(0, start)}${safeToken}${currentValue.slice(end)}`;
    setMensagemCorpo(nextValue);

    window.requestAnimationFrame(() => {
      textarea.focus();
      const cursor = start + safeToken.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  };

  const clientesFiltrados = useMemo(() => {
    const termo = String(buscaCliente || '').toLowerCase().trim();
    let lista: ClienteOption[] = CLIENTES_MOCK;

    if (audienciaType === 'COLABORADOR') {
      lista = lista.filter((c) => c.tipo === 'COLABORADOR');
      if (colaboradorFilter === 'INADIMPLENTES') {
        lista = lista.filter((c) => c.inadimplente);
      }
    } else if (audienciaType === 'RESPONSAVEL') {
      lista = lista.filter((c) => c.tipo === 'RESPONSAVEL');
      if (responsavelFilter === 'NEGATIVOS') {
        lista = lista.filter((c) => c.saldoNumerico < 0);
      }
    } else if (audienciaType === 'INDIVIDUAL') {
      lista = lista;
    }

    if (!termo) return lista;
    return lista.filter((item) => item.nome.toLowerCase().includes(termo));
  }, [buscaCliente, audienciaType, colaboradorFilter, responsavelFilter]);

  const clienteSelecionado = useMemo(
    () => CLIENTES_MOCK.find((item) => item.id === clienteId) || null,
    [clienteId]
  );

  const buildMensagem = (mensagemBase: string, destinatario?: Partial<IndividualRecipient>) => {
    const nome = String(destinatario?.nome || clienteSelecionado?.nome || clienteNome || 'Cliente');
    const saldo = String(destinatario?.saldo || clienteSelecionado?.saldo || 'R$ 0,00');
    const aluno = String(destinatario?.aluno || clienteSelecionado?.aluno || 'Aluno');
    return String(mensagemBase || '')
      .replace(/{{nome}}/g, nome)
      .replace(/{{nome_pai}}/g, nome)
      .replace(/{{saldo}}/g, saldo)
      .replace(/{{aluno}}/g, aluno)
      .replace(/{{alunos}}/g, aluno)
      .replace(/{{periodo_referencia}}/g, '[perÃ­odo]')
      .replace(/{{saldo_por_aluno}}/g, `${aluno}: ${saldo}`)
      .replace(/{{consumo_total_periodo}}/g, '[consumo total]')
      .replace(/{{consumo_total_por_aluno}}/g, `${aluno}: [consumo]`);
  };

  const previewRecipient = useMemo<Partial<IndividualRecipient> | undefined>(() => {
    if (audienciaType === 'INDIVIDUAL') {
      return individualRecipientList[0];
    }
    return clienteSelecionado || undefined;
  }, [audienciaType, individualRecipientList, clienteSelecionado]);

  const mensagemProcessada = useMemo(
    () => buildMensagem(mensagemCorpo, previewRecipient),
    [mensagemCorpo, previewRecipient]
  );

  const addIndividualRecipientFromSearch = () => {
    const firstMatch = clientesFiltrados[0];
    if (!firstMatch) {
      setFeedback('Nenhum contato encontrado na pesquisa para adicionar.');
      return;
    }
    setClienteId(firstMatch.id);
    setClienteNome(firstMatch.nome);
    setIndividualRecipientList((prev) => {
      const exists = prev.some((item) => normalizePhone(item.telefone) === normalizePhone(firstMatch.telefone));
      if (exists) return prev;
      return [
        ...prev,
        {
          id: `cliente_${firstMatch.id}`,
          nome: firstMatch.nome,
          telefone: normalizePhone(firstMatch.telefone),
          saldo: firstMatch.saldo,
          aluno: firstMatch.aluno,
        },
      ];
    });
    setFeedback('Contato da pesquisa adicionado na lista de envio individual.');
  };

  const removeIndividualRecipient = (id: string) => {
    setIndividualRecipientList((prev) => prev.filter((item) => item.id !== id));
  };

  const resolveProfileType = (): DispatchAutomationConfig['profileType'] => {
    if (audienciaType === 'COLABORADOR') return 'COLABORADOR';
    if (audienciaType === 'TODOS') return 'TODOS';
    return 'RESPONSAVEL_PARENTESCO';
  };

  const resolveAudienceFilter = (): DispatchAutomationConfig['filter'] => {
    if (audienciaType === 'COLABORADOR') {
      return colaboradorFilter === 'INADIMPLENTES' ? 'SALDO_BAIXO' : 'COLABORADORES';
    }
    if (audienciaType === 'RESPONSAVEL') {
      return responsavelFilter === 'NEGATIVOS' ? 'SALDO_BAIXO' : 'RESPONSAVEIS';
    }
    return 'TODOS';
  };

  const buildDisparoUnicoProfile = (): DispatchAutomationConfig => {
    const profileType = resolveProfileType();
    const nowIso = new Date().toISOString();
    const scheduleHour = dataAgendamento
      ? new Date(dataAgendamento).toTimeString().slice(0, 5)
      : '09:00';
    return {
      id: `unico_${Date.now()}`,
      nome_perfil: `Disparo Único • ${new Date().toLocaleString('pt-BR')}`,
      tipo_destinatario: profileType === 'COLABORADOR' ? 'colaborador' : 'responsavel',
      campos: ['mensagem', 'nome', 'saldo', 'aluno'],
      frequencia: 'semanal',
      agendamento: {
        hora: scheduleHour,
        dias_expediente_apenas: false,
      },
      layout_estilo: profileType === 'COLABORADOR' ? 'corporativo_sobrio' : 'escolar_premium',
      filter: resolveAudienceFilter(),
      profileType,
      periodMode: 'SEMANAL',
      template: String(mensagemCorpo || '').trim(),
      sendMode: useExternalMedia && arquivo ? 'TEXT_AND_UPLOAD_PDF' : 'TEXT_ONLY',
      uploadPdfAttachment: null,
      delayMin: Math.max(0, Number(delayMin || 0)),
      delayMax: Math.max(0, Number(delayMax || 0)),
      batchLimit: Math.max(1, individualRecipientList.length || 1),
      isSimulation: false,
      paused: true,
      dispatchRuntimeStatus: null,
      enterpriseId: String(activeEnterprise?.id || ''),
      createdAt: nowIso,
      updatedAt: nowIso,
    };
  };

  const handleSaveProfile = async () => {
    if (!activeEnterprise?.id) {
      setFeedback('Selecione uma unidade ativa para salvar perfil de disparo.');
      return;
    }
    const template = String(mensagemCorpo || '').trim();
    if (!template) {
      setFeedback('Digite uma mensagem para salvar no perfil.');
      return;
    }

    setIsSavingProfile(true);
    try {
      const profile = buildDisparoUnicoProfile();
      await ApiService.saveWhatsAppDispatchProfile({
        enterpriseId: activeEnterprise.id,
        profile,
      });
      setFeedback('Perfil salvo com sucesso e disponível em PERFIL DISPARO.');
      onOpenProfileTab?.();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Falha ao salvar perfil de disparo.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const appendAgendaLog = (entry: { nome: string; status: LogEnvio['status']; when?: number }) => {
    setLogs((prev) => [
      {
        id: `agenda_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        nome: entry.nome,
        status: entry.status,
        horario: new Date(entry.when || Date.now()),
      },
      ...prev,
    ]);
  };

  const syncAgendaLogs = async () => {
    if (!activeEnterprise?.id) return;
    const data = await ApiService.getWhatsAppSchedules();
    const schedules = Array.isArray((data as any)?.schedules) ? (data as any).schedules : [];
    for (const item of schedules) {
      const id = String(item?.id || '');
      if (!id) continue;
      const status = String(item?.status || 'pending').toLowerCase();
      const previous = scheduleStatusByIdRef.current[id];
      if (previous === status) continue;
      scheduleStatusByIdRef.current[id] = status;

      const chatLabel = String(item?.chatId || '').trim() || 'contato';
      const when = Number(item?.sentAt || item?.scheduleAt || Date.now());
      const uiStatus: LogEnvio['status'] = status === 'sent'
        ? 'Sucesso'
        : (status === 'failed' || status === 'cancelled' ? 'Erro' : 'Agendado');
      const nome = status === 'pending'
        ? `Agendado: ${chatLabel}`
        : status === 'sent'
          ? `Enviado: ${chatLabel}`
          : `Falha/Cancelado: ${chatLabel}`;
      appendAgendaLog({ nome, status: uiStatus, when });

      try {
        await ApiService.appendWhatsAppDispatchLogs({
          enterpriseId: activeEnterprise.id,
          entries: [{
            id: `unico_schedule_${id}_${status}`,
            timestamp: Date.now(),
            profileName: 'Disparo Único',
            status: status === 'sent' ? 'ENVIADO' : (status === 'pending' ? 'AGENDADO' : 'ERRO'),
            message: `${nome}`,
            chatId: chatLabel,
          }],
        });
      } catch {
        // mantém monitoramento local mesmo se persistência remota falhar
      }
    }
  };

  const aguardarComProgresso = async (ms: number) => {
    const seconds = Math.max(0, Math.ceil(ms / 1000));
    setTotalWaitingSeconds(seconds);
    setWaitingSeconds(seconds);

    if (seconds === 0) {
      await sleep(0);
      return;
    }

    for (let i = seconds; i > 0; i -= 1) {
      setWaitingSeconds(i);
      await sleep(1000);
    }
    setWaitingSeconds(0);
  };

  const processarEnvio = async () => {
    if (audienciaType === 'INDIVIDUAL' && individualRecipientList.length === 0) {
      setFeedback('Adicione ao menos um contato na lista de envio individual.');
      return;
    }
    if (audienciaType !== 'INDIVIDUAL' && !clienteSelecionado) {
      setFeedback('Selecione um responsÃ¡vel antes de enviar.');
      return;
    }
    if (!mensagemProcessada.trim()) {
      setFeedback('Digite a mensagem antes de enviar.');
      return;
    }
    if (delayMax < delayMin) {
      setFeedback('Delay mÃ¡ximo precisa ser maior ou igual ao mÃ­nimo.');
      return;
    }
    if (delayMode === 'INTERVAL' && intervalSeconds < 0) {
      setFeedback('Intervalo deve ser maior ou igual a 0.');
      return;
    }
    if (useExternalMedia && !arquivo) {
      setFeedback('Ative mÃ­dia apenas quando houver anexo selecionado.');
      return;
    }

    const delaySeconds = delayMode === 'INTERVAL'
      ? Math.max(0, Number(intervalSeconds) || 0)
      : Math.floor(Math.random() * (delayMax - delayMin + 1) + delayMin);
    const delayAplicadoMs = delaySeconds * 1000;
    const agendamentoMs = dataAgendamento
      ? Math.max(0, new Date(dataAgendamento).getTime() - Date.now())
      : 0;
    const totalEsperaMs = delayAplicadoMs + agendamentoMs;

    const destinatariosPrevistos = audienciaType === 'INDIVIDUAL' ? individualRecipientList.length : 1;
    const audienciaLabel = audienciaType === 'INDIVIDUAL'
      ? 'INDIVIDUAL'
      : audienciaType === 'RESPONSAVEL'
        ? `RESPONSÁVEIS (${responsavelFilter === 'NEGATIVOS' ? 'somente saldo negativo' : 'todos'})`
        : audienciaType === 'COLABORADOR'
          ? `COLABORADORES (${colaboradorFilter === 'INADIMPLENTES' ? 'somente inadimplentes' : 'todos'})`
          : 'TODOS';

    const canaisSelecionados = [
      useExternalText ? 'Texto' : null,
      useExternalMedia && arquivo ? `Mídia (${arquivo.name || 'anexo'})` : null,
      useExternalMenu ? `Menu (${menuType})` : null,
      useExternalCarousel ? 'Carrossel' : null,
      useExternalPayment ? `Pagamento PIX (R$ ${Math.max(0.01, Number(pixAmount) || 0).toFixed(2)})` : null,
    ].filter(Boolean) as string[];

    const entregaLabel = dataAgendamento
      ? `Agendado para ${new Date(dataAgendamento).toLocaleString('pt-BR')}`
      : 'Envio imediato';
    const esperaLabel = delayMode === 'INTERVAL'
      ? `Intervalo fixo de ${Math.max(0, Number(intervalSeconds) || 0)}s entre envios`
      : `Delay aleatório entre ${delayMin}s e ${delayMax}s por envio`;

    const confirmMessage = [
      'Confirma este disparo?',
      '',
      `Audiência: ${audienciaLabel}`,
      `Destinatários previstos: ${destinatariosPrevistos}`,
      `Forma de envio: ${canaisSelecionados.length > 0 ? canaisSelecionados.join(', ') : 'Texto padrão'}`,
      `Entrega: ${entregaLabel}`,
      `Ritmo: ${esperaLabel}`,
      '',
      'Ao confirmar, o sistema iniciará o envio conforme as opções escolhidas.',
    ].join('\n');

    const confirmed = window.confirm(confirmMessage);
    if (!confirmed) {
      setFeedback('Disparo cancelado antes do envio.');
      return;
    }

    setFeedback('');
    setIsSending(true);

    try {
      await aguardarComProgresso(totalEsperaMs);

      const anexoBase64 = arquivo ? await fileToBase64(arquivo) : null;
      const destinatarios: IndividualRecipient[] = audienciaType === 'INDIVIDUAL'
        ? individualRecipientList
        : [
            {
              id: `cliente_unico_${clienteSelecionado!.id}`,
              nome: clienteSelecionado!.nome,
              telefone: normalizePhone(clienteSelecionado!.telefone),
              saldo: clienteSelecionado!.saldo,
              aluno: clienteSelecionado!.aluno,
            },
          ];

      const executedActions = new Set<string>();
      let successCount = 0;

      for (let index = 0; index < destinatarios.length; index += 1) {
        const destinatario = destinatarios[index];
        const targetPhone = normalizePhone(destinatario.telefone);
        const targetChatId = `${targetPhone}@c.us`;
        const mensagemDoDestinatario = buildMensagem(mensagemCorpo, destinatario);
        let executedForRecipient = 0;

        if (!targetPhone) {
          throw new Error('Foi encontrado contato sem telefone vÃ¡lido na lista de envio.');
        }

        if (index > 0) {
          const perRecipientDelaySeconds = delayMode === 'INTERVAL'
            ? Math.max(0, Number(intervalSeconds) || 0)
            : Math.floor(Math.random() * (delayMax - delayMin + 1) + delayMin);
          await aguardarComProgresso(perRecipientDelaySeconds * 1000);
        }

        if (useExternalText) {
          await ApiService.sendWhatsAppMessage(targetPhone, mensagemDoDestinatario);
          executedActions.add('texto');
          executedForRecipient += 1;
        }

        if (useExternalMedia && arquivo && anexoBase64) {
          const mimeType = String(arquivo.type || '').toLowerCase();
          const mediaType: 'image' | 'audio' | 'video' | 'document' = mimeType.startsWith('image/')
            ? 'image'
            : mimeType.startsWith('audio/')
              ? 'audio'
              : mimeType.startsWith('video/')
                ? 'video'
                : 'document';

          await ApiService.sendWhatsAppMediaToChat(targetChatId, mensagemDoDestinatario, {
            mediaType,
            base64Data: anexoBase64,
            mimeType: arquivo.type || undefined,
            fileName: arquivo.name || undefined,
          });
          executedActions.add('mÃ­dia');
          executedForRecipient += 1;
        }

        if (useExternalMenu) {
          const choices = String(menuChoicesCsv || '')
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean)
            .slice(0, 12);

          if (choices.length === 0) {
            throw new Error('Informe opÃ§Ãµes do menu separadas por vÃ­rgula.');
          }

          await ApiService.sendWhatsAppInteractiveMenu({
            number: targetPhone,
            type: menuType,
            text: mensagemDoDestinatario,
            choices,
            footerText: 'Disparo Ãšnico',
          });
          executedActions.add('menu');
          executedForRecipient += 1;
        }

        if (useExternalCarousel) {
          await ApiService.sendWhatsAppCarousel({
            number: targetPhone,
            text: mensagemDoDestinatario,
            carousel: [
              {
                text: carouselTitle || 'Oferta especial',
                image: carouselImageUrl,
                buttons: [
                  { id: 'btn-1', text: 'Tenho interesse', type: 'REPLY' },
                  { id: 'btn-2', text: 'Falar com atendente', type: 'REPLY' },
                ],
              },
            ],
          });
          executedActions.add('carrossel');
          executedForRecipient += 1;
        }

        if (useExternalPayment) {
          await ApiService.sendWhatsAppRequestPayment({
            number: targetPhone,
            amount: Math.max(0.01, Number(pixAmount) || 0),
            itemName: pixItemName || 'CobranÃ§a',
            text: mensagemDoDestinatario,
            title: 'SolicitaÃ§Ã£o de pagamento',
            pixKey: String(pixKey || '').trim() || undefined,
          });
          executedActions.add('pagamento');
          executedForRecipient += 1;
        }

        if (executedForRecipient === 0) {
          await ApiService.sendWhatsAppMessage(targetPhone, mensagemDoDestinatario);
          executedActions.add('texto');
        }

        setLogs((prev) => [
          {
            id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            nome: destinatario.nome,
            status: 'Sucesso',
            horario: new Date(),
          },
          ...prev,
        ]);
        successCount += 1;
      }

      setFeedback(
        `Mensagem enviada com sucesso para ${successCount} contato(s) (${Array.from(executedActions).join(', ')}).`
      );
    } catch (error) {
      setLogs((prev) => [
        {
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          nome: clienteSelecionado?.nome || 'Lista de envio',
          status: 'Erro',
          horario: new Date(),
        },
        ...prev,
      ]);
      setFeedback(error instanceof Error ? error.message : 'Erro ao enviar mensagem.');
    } finally {
      setIsSending(false);
      setWaitingSeconds(0);
      setTotalWaitingSeconds(0);
    }
  };

  const progressPct = totalWaitingSeconds > 0
    ? Math.round(((totalWaitingSeconds - waitingSeconds) / totalWaitingSeconds) * 100)
    : 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <section className="rounded-[24px] border border-slate-200 dark:border-zinc-700 bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(255,247,237,0.82))] dark:bg-zinc-900 p-5 shadow-[0_16px_38px_-28px_rgba(15,23,42,0.6)] space-y-4">
        <div>
          <h3 className="text-lg font-black text-slate-900 dark:text-zinc-100">Disparo Ãšnico</h3>
          <p className="text-sm font-semibold text-slate-600 dark:text-zinc-400">
            Monte a mensagem e visualize em tempo real no formato WhatsApp.
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400">
            AudiÃªncia
          </label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {(['INDIVIDUAL', 'RESPONSAVEL', 'COLABORADOR', 'TODOS'] as AudienciaType[]).map((tipo) => (
              <button
                key={tipo}
                type="button"
                onClick={() => {
                  setAudienciaType(tipo);
                  setClienteId('');
                  setClienteNome('');
                }}
                className={`px-3 py-2 rounded-xl border-2 text-xs font-black uppercase tracking-wide ${
                  audienciaType === tipo
                    ? 'border-orange-400 bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300'
                    : 'border-slate-200 bg-white text-slate-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                }`}
              >
                {tipo === 'TODOS'
                  ? 'Todos'
                  : tipo === 'COLABORADOR'
                    ? 'Colaboradores'
                    : tipo === 'RESPONSAVEL'
                      ? 'ResponsÃ¡veis'
                      : 'Individual'}
              </button>
            ))}
          </div>

          {audienciaType === 'COLABORADOR' && (
            <div className="rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800/60 p-3 space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400">Filtro colaboradores</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setColaboradorFilter('TODOS')}
                  className={`px-3 py-2 rounded-xl border-2 text-xs font-black uppercase tracking-wide ${
                    colaboradorFilter === 'TODOS'
                      ? 'border-orange-400 bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300'
                      : 'border-slate-200 bg-white text-slate-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                  }`}
                >
                  Todos
                </button>
                <button
                  type="button"
                  onClick={() => setColaboradorFilter('INADIMPLENTES')}
                  className={`px-3 py-2 rounded-xl border-2 text-xs font-black uppercase tracking-wide ${
                    colaboradorFilter === 'INADIMPLENTES'
                      ? 'border-rose-400 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                      : 'border-slate-200 bg-white text-slate-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                  }`}
                >
                  Inadimplentes
                </button>
              </div>
            </div>
          )}

          {audienciaType === 'RESPONSAVEL' && (
            <div className="rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800/60 p-3 space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400">Filtro responsÃ¡veis</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setResponsavelFilter('TODOS')}
                  className={`px-3 py-2 rounded-xl border-2 text-xs font-black uppercase tracking-wide ${
                    responsavelFilter === 'TODOS'
                      ? 'border-orange-400 bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300'
                      : 'border-slate-200 bg-white text-slate-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                  }`}
                >
                  Todos
                </button>
                <button
                  type="button"
                  onClick={() => setResponsavelFilter('NEGATIVOS')}
                  className={`px-3 py-2 rounded-xl border-2 text-xs font-black uppercase tracking-wide ${
                    responsavelFilter === 'NEGATIVOS'
                      ? 'border-rose-400 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                      : 'border-slate-200 bg-white text-slate-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                  }`}
                >
                  Saldo negativo
                </button>
              </div>
              {responsavelFilter === 'NEGATIVOS' && (
                <p className="text-[10px] font-semibold text-rose-600 dark:text-rose-400">
                  Exibindo apenas responsÃ¡veis com saldo negativo em crÃ©dito cantina ou planos.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label className="text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400">
              {audienciaType === 'COLABORADOR'
                ? 'Buscar colaborador'
                : audienciaType === 'RESPONSAVEL'
                  ? 'Buscar responsÃ¡vel'
                  : audienciaType === 'INDIVIDUAL'
                    ? 'Buscar contato para lista'
                    : 'Buscar destinatÃ¡rio'}
            </label>
            {clientesFiltrados.length > 0 && (
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300">
                {clientesFiltrados.length} {clientesFiltrados.length === 1 ? 'resultado' : 'resultados'}
              </span>
            )}
            {clientesFiltrados.length === 0 && (
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                Nenhum resultado
              </span>
            )}
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={buscaCliente}
              onChange={(e) => setBuscaCliente(e.target.value)}
              placeholder="Pesquisar por nome..."
              aria-label="Buscar destinatÃ¡rio por nome"
              title="Buscar destinatÃ¡rio por nome"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border-2 border-slate-200 dark:border-zinc-700 focus:border-orange-400 outline-none text-sm font-semibold bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-200"
            />
          </div>
          {audienciaType !== 'INDIVIDUAL' && (
            <select
              value={clienteId}
              onChange={(e) => {
                const id = e.target.value;
                setClienteId(id);
                const cliente = CLIENTES_MOCK.find((item) => item.id === id);
                setClienteNome(cliente?.nome || '');
              }}
              aria-label="Selecionar destinatÃ¡rio"
              title="Selecionar destinatÃ¡rio"
              className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 dark:border-zinc-700 focus:border-orange-400 outline-none text-sm font-semibold bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-200"
            >
              <option value="">
                {clientesFiltrados.length === 0
                  ? 'Nenhum destinatÃ¡rio encontrado'
                  : `Selecione um ${
                    audienciaType === 'COLABORADOR'
                      ? 'colaborador'
                      : audienciaType === 'RESPONSAVEL'
                        ? 'responsÃ¡vel'
                        : 'destinatÃ¡rio'
                  }`}
              </option>
              {clientesFiltrados.map((cliente) => (
                <option key={cliente.id} value={cliente.id}>
                  {cliente.nome} â€¢ {cliente.telefone}{cliente.aluno !== 'â€”' ? ` â€¢ ${cliente.aluno}` : ''} {cliente.saldoNumerico < 0 ? `âš  ${cliente.saldo}` : ''}
                </option>
              ))}
            </select>
          )}

          {audienciaType === 'INDIVIDUAL' && (
            <div className="rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800/60 p-3 space-y-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400">
                Lista de envio individual (um ou mais)
              </p>
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
                <button
                  type="button"
                  onClick={addIndividualRecipientFromSearch}
                  className="px-3 py-2 rounded-xl border-2 border-orange-300 bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300 text-xs font-black uppercase tracking-wide hover:bg-orange-100"
                >
                  Adicionar da pesquisa
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIndividualRecipientList([]);
                    setFeedback('Lista de envio individual limpa.');
                  }}
                  className="px-3 py-2 rounded-xl border-2 border-rose-200 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 text-xs font-black uppercase tracking-wide hover:bg-rose-100"
                >
                  Limpar lista
                </button>
              </div>

              {individualRecipientList.length === 0 ? (
                <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400">
                  Nenhum contato na lista. Adicione por pesquisa ou somente número.
                </p>
              ) : (
                <div className="space-y-2 max-h-44 overflow-auto pr-1">
                  {individualRecipientList.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2"
                    >
                      <div>
                        <p className="text-xs font-black text-slate-800 dark:text-zinc-100">{item.nome}</p>
                        <p className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400">{item.telefone}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeIndividualRecipient(item.id)}
                        className="px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100"
                      >
                        Remover
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label className="text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400">
              Mensagem
            </label>
            <button
              type="button"
              onClick={() => setMensagemCorpo(TEMPLATE_RELATORIO_SEMANAL)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-50 border border-orange-200 text-orange-700 dark:bg-orange-950/40 dark:border-orange-800 dark:text-orange-300 text-[10px] font-black uppercase tracking-widest hover:bg-orange-100 dark:hover:bg-orange-950/60"
            >
              ðŸ“„ RelatÃ³rio semanal
            </button>
          </div>
          <textarea
            ref={messageTextareaRef}
            rows={8}
            value={mensagemCorpo}
            onChange={(e) => setMensagemCorpo(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 dark:border-zinc-700 focus:border-orange-400 outline-none text-sm font-medium bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-200"
            placeholder="Digite sua mensagem..."
          />
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400">
              Variáveis padrão (clique para inserir):
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                '{{nome}}',
                '{{nome_pai}}',
                '{{saldo}}',
                '{{aluno}}',
                '{{alunos}}',
                '{{periodo_referencia}}',
                '{{saldo_por_aluno}}',
                '{{consumo_total_periodo}}',
                '{{consumo_total_por_aluno}}',
              ].map((token) => (
                <button
                  key={token}
                  type="button"
                  onClick={() => insertMessageToken(token)}
                  className="px-2.5 py-1 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300 text-[11px] font-black hover:bg-emerald-100 dark:hover:bg-emerald-950/60"
                  title={`Inserir ${token}`}
                >
                  {token}
                </button>
              ))}
            </div>

            <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400">
              Variáveis de planos existentes (separadas por plano):
            </p>
            {planVariables.length === 0 ? (
              <p className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400">
                Nenhum plano encontrado no momento.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {planVariables.map((item) => (
                  <button
                    key={item.planId}
                    type="button"
                    onClick={() => insertMessageToken(item.token)}
                    className="px-2.5 py-1 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:border-indigo-800 dark:text-indigo-300 text-[11px] font-black hover:bg-indigo-100 dark:hover:bg-indigo-950/60"
                    title={`${item.planName} • ${item.token}`}
                  >
                    {item.planName}: {item.token}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400">
              Agendamento
            </label>
            <input
              type="datetime-local"
              value={dataAgendamento}
              onChange={(e) => setDataAgendamento(e.target.value)}
              aria-label="Data e hora de agendamento"
              title="Data e hora de agendamento"
              className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 dark:border-zinc-700 focus:border-orange-400 outline-none text-sm font-semibold bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-200"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400">
              Anexo
            </label>
            <label className="w-full inline-flex items-center gap-2 px-3 py-2 rounded-xl border-2 border-slate-200 dark:border-zinc-700 bg-orange-50 dark:bg-zinc-800 text-orange-700 dark:text-orange-300 text-sm font-black cursor-pointer hover:bg-orange-100 dark:hover:bg-zinc-700">
              <Paperclip size={14} />
              {arquivo ? arquivo.name : 'Selecionar arquivo'}
              <input
                type="file"
                className="hidden"
                aria-label="Selecionar arquivo de anexo"
                title="Selecionar arquivo de anexo"
                onChange={(e) => setArquivo(e.target.files?.[0] || null)}
              />
            </label>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5">
            <label className="text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400">
              Modo de delay
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDelayMode('RANDOM')}
                className={`px-3 py-2 rounded-xl border-2 text-xs font-black uppercase tracking-wide ${
                  delayMode === 'RANDOM'
                    ? 'border-orange-400 bg-orange-50 text-orange-700'
                    : 'border-slate-200 bg-white text-slate-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                }`}
              >
                AleatÃ³rio (Min/Max)
              </button>
              <button
                type="button"
                onClick={() => setDelayMode('INTERVAL')}
                className={`px-3 py-2 rounded-xl border-2 text-xs font-black uppercase tracking-wide ${
                  delayMode === 'INTERVAL'
                    ? 'border-orange-400 bg-orange-50 text-orange-700'
                    : 'border-slate-200 bg-white text-slate-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                }`}
              >
                Intervalo fixo
              </button>
            </div>
          </div>

          {delayMode === 'INTERVAL' && (
            <div className="col-span-2 space-y-1.5">
              <label className="text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400">
                Intervalo (s)
              </label>
              <input
                type="number"
                min={0}
                value={intervalSeconds}
                onChange={(e) => setIntervalSeconds(Math.max(0, Number(e.target.value) || 0))}
                aria-label="Intervalo fixo em segundos"
                title="Intervalo fixo em segundos"
                className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 dark:border-zinc-700 focus:border-orange-400 outline-none text-sm font-semibold bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-200"
              />
            </div>
          )}

          {delayMode === 'RANDOM' && (
            <>
          <div className="space-y-1.5">
            <label className="text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400">
              Delay Min (s)
            </label>
            <input
              type="number"
              min={0}
              value={delayMin}
              onChange={(e) => setDelayMin(Math.max(0, Number(e.target.value) || 0))}
              aria-label="Delay mÃ­nimo em segundos"
              title="Delay mÃ­nimo em segundos"
              className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 dark:border-zinc-700 focus:border-orange-400 outline-none text-sm font-semibold bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-200"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400">
              Delay Max (s)
            </label>
            <input
              type="number"
              min={0}
              value={delayMax}
              onChange={(e) => setDelayMax(Math.max(0, Number(e.target.value) || 0))}
              aria-label="Delay mÃ¡ximo em segundos"
              title="Delay mÃ¡ximo em segundos"
              className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 dark:border-zinc-700 focus:border-orange-400 outline-none text-sm font-semibold bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-200"
            />
          </div>
            </>
          )}
        </div>

        <div className="rounded-xl border-2 border-slate-200 dark:border-zinc-700 p-3 space-y-3 bg-white/70 dark:bg-zinc-900/50">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400">
              FunÃ§Ãµes da API externa (toggle)
            </p>
            <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full ${externalProviderEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
              {externalProviderEnabled ? 'API externa ativa' : 'API externa inativa'}
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-zinc-300">
              <input type="checkbox" checked={useExternalText} onChange={(e) => setUseExternalText(e.target.checked)} /> Texto
            </label>
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-zinc-300">
              <input type="checkbox" checked={useExternalMedia} onChange={(e) => setUseExternalMedia(e.target.checked)} /> MÃ­dia
            </label>
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-zinc-300">
              <input type="checkbox" checked={useExternalMenu} onChange={(e) => setUseExternalMenu(e.target.checked)} /> Menu
            </label>
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-zinc-300">
              <input type="checkbox" checked={useExternalCarousel} onChange={(e) => setUseExternalCarousel(e.target.checked)} /> Carrossel
            </label>
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-zinc-300">
              <input type="checkbox" checked={useExternalPayment} onChange={(e) => setUseExternalPayment(e.target.checked)} /> Pagamento PIX
            </label>
          </div>

          {useExternalMenu && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <select
                value={menuType}
                onChange={(e) => setMenuType(e.target.value as 'button' | 'list' | 'poll')}
                aria-label="Tipo de menu interativo"
                title="Tipo de menu interativo"
                className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 dark:border-zinc-700 focus:border-orange-400 outline-none text-sm font-semibold bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-200"
              >
                <option value="button">Menu botÃ£o</option>
                <option value="list">Menu lista</option>
                <option value="poll">Enquete</option>
              </select>
              <input
                value={menuChoicesCsv}
                onChange={(e) => setMenuChoicesCsv(e.target.value)}
                placeholder="OpÃ§Ãµes do menu (separadas por vÃ­rgula)"
                aria-label="OpÃ§Ãµes do menu separadas por vÃ­rgula"
                title="OpÃ§Ãµes do menu separadas por vÃ­rgula"
                className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 dark:border-zinc-700 focus:border-orange-400 outline-none text-sm font-semibold bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-200"
              />
            </div>
          )}

          {useExternalCarousel && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <input
                value={carouselTitle}
                onChange={(e) => setCarouselTitle(e.target.value)}
                placeholder="TÃ­tulo do card do carrossel"
                aria-label="TÃ­tulo do card de carrossel"
                title="TÃ­tulo do card de carrossel"
                className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 dark:border-zinc-700 focus:border-orange-400 outline-none text-sm font-semibold bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-200"
              />
              <input
                value={carouselImageUrl}
                onChange={(e) => setCarouselImageUrl(e.target.value)}
                placeholder="URL da imagem do carrossel"
                aria-label="URL da imagem do carrossel"
                title="URL da imagem do carrossel"
                className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 dark:border-zinc-700 focus:border-orange-400 outline-none text-sm font-semibold bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-200"
              />
            </div>
          )}

          {useExternalPayment && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <input
                type="number"
                min={0.01}
                step={0.01}
                value={pixAmount}
                onChange={(e) => setPixAmount(Math.max(0.01, Number(e.target.value) || 0.01))}
                placeholder="Valor"
                aria-label="Valor da cobranÃ§a PIX"
                title="Valor da cobranÃ§a PIX"
                className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 dark:border-zinc-700 focus:border-orange-400 outline-none text-sm font-semibold bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-200"
              />
              <input
                value={pixItemName}
                onChange={(e) => setPixItemName(e.target.value)}
                placeholder="DescriÃ§Ã£o do item"
                aria-label="DescriÃ§Ã£o do item da cobranÃ§a"
                title="DescriÃ§Ã£o do item da cobranÃ§a"
                className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 dark:border-zinc-700 focus:border-orange-400 outline-none text-sm font-semibold bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-200"
              />
              <input
                value={pixKey}
                onChange={(e) => setPixKey(e.target.value)}
                placeholder="Chave PIX (opcional)"
                aria-label="Chave PIX opcional"
                title="Chave PIX opcional"
                className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 dark:border-zinc-700 focus:border-orange-400 outline-none text-sm font-semibold bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-200"
              />
            </div>
          )}
        </div>

        {isSending && (
          <div className="rounded-xl border border-orange-200 dark:border-orange-900/50 bg-orange-50 dark:bg-orange-950/30 p-3 space-y-2">
            <div className="flex items-center gap-2 text-orange-700 dark:text-orange-300">
              <Loader2 size={14} className="animate-spin" />
              <p className="text-xs font-black uppercase tracking-widest">
                Aguardando envio {waitingSeconds > 0 ? `(${waitingSeconds}s)` : ''}
              </p>
            </div>
            <div className="h-2 rounded-full bg-orange-100 dark:bg-orange-950/40 overflow-hidden">
              <progress
                value={Math.min(100, Math.max(0, progressPct))}
                max={100}
                aria-label="Progresso do aguardo para envio"
                title="Progresso do aguardo para envio"
                className="h-full w-full [&::-webkit-progress-bar]:bg-orange-100 [&::-webkit-progress-value]:bg-orange-500 [&::-moz-progress-bar]:bg-orange-500"
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <p className={`text-sm font-semibold ${feedback ? 'text-orange-700 dark:text-orange-300' : 'text-slate-500 dark:text-zinc-400'}`}>
            {feedback || 'Configure e clique em processar envio.'}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSaveProfile}
              disabled={isSavingProfile}
              className="inline-flex items-center gap-2 px-3 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-60 text-slate-700 text-[11px] font-black uppercase tracking-widest"
            >
              {isSavingProfile ? <Loader2 size={12} className="animate-spin" /> : null}
              {isSavingProfile ? 'Salvando...' : 'Salvar Perfil'}
            </button>
            <button
              type="button"
              onClick={() => {
                if (!activeEnterprise?.id) {
                  setFeedback('Selecione uma unidade ativa para monitorar a agenda de envios.');
                  return;
                }
                setIsAgendaMonitoring((prev) => {
                  const next = !prev;
                  setFeedback(next
                    ? 'Monitoramento da agenda iniciado. Logs atualizados em tempo real.'
                    : 'Monitoramento da agenda pausado.');
                  return next;
                });
              }}
              className="inline-flex items-center gap-2 px-3 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-black uppercase tracking-widest"
            >
              {isAgendaMonitoring ? 'Pausar Agenda' : 'Agenda Envios'}
            </button>
            <button
              type="button"
              onClick={processarEnvio}
              disabled={isSending || (audienciaType === 'INDIVIDUAL' && individualRecipientList.length === 0)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:bg-slate-300 text-white text-xs font-black uppercase tracking-widest"
            >
              {isSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {isSending ? 'Enviando...' : 'Processar envio'}
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-[24px] border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-5 shadow-[0_16px_38px_-28px_rgba(15,23,42,0.6)] space-y-3">
        <h3 className="text-lg font-black text-slate-900 dark:text-zinc-100">Preview WhatsApp</h3>
        <WhatsAppPreview
          clienteNome={previewRecipient?.nome || clienteNome}
          mensagemCorpo={mensagemCorpo}
          horario={horaAtual}
        />
      </section>
      </div>

      <section className="rounded-[24px] border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-5 shadow-[0_16px_38px_-28px_rgba(15,23,42,0.6)] space-y-3">
        <h3 className="text-lg font-black text-slate-900 dark:text-zinc-100">Logs em tempo real</h3>
        {logs.length === 0 ? (
          <p className="text-sm font-semibold text-slate-500 dark:text-zinc-400">Nenhum envio processado ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-zinc-800 text-left">
                  <th className="py-2 pr-4 text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400">Nome</th>
                  <th className="py-2 pr-4 text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400">Status</th>
                  <th className="py-2 pr-4 text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400">HorÃ¡rio</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-slate-100 dark:border-zinc-800">
                    <td className="py-2 pr-4 font-semibold text-slate-800 dark:text-zinc-200">{log.nome}</td>
                    <td className="py-2 pr-4">
                      <span
                        className={`px-2 py-1 rounded-full text-[11px] font-black ${
                          log.status === 'Sucesso'
                            ? 'bg-emerald-50 text-emerald-700'
                            : log.status === 'Agendado'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-rose-50 text-rose-700'
                        }`}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td className="py-2 pr-4 font-semibold text-slate-600 dark:text-zinc-400">
                      {log.horario.toLocaleString('pt-BR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

export default DisparoUnicoForm;









