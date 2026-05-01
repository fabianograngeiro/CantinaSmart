import React, { useEffect, useMemo, useState } from 'react';
import { CheckCheck, Loader2, Paperclip, Search, Send } from 'lucide-react';
import ApiService from '../../services/api';

type ClienteOption = {
  id: string;
  nome: string;
  telefone: string;
  aluno: string;
  saldo: string;
};

const CLIENTES_MOCK: ClienteOption[] = [
  { id: 'c1', nome: 'Fabiano Araujo', telefone: '5548988237072', aluno: 'Eloah', saldo: 'R$ 135,00' },
  { id: 'c2', nome: 'Bruno Silva', telefone: '5548999990001', aluno: 'Melissa', saldo: 'R$ 94,50' },
  { id: 'c3', nome: 'Aline Cassiano', telefone: '5548999990002', aluno: 'Victor', saldo: 'R$ 210,00' },
  { id: 'c4', nome: 'Roberta Vasques', telefone: '5548999990003', aluno: 'Laura', saldo: 'R$ 78,00' },
];

type LogEnvio = {
  id: string;
  nome: string;
  status: 'Sucesso' | 'Erro';
  horario: Date;
};

const formatarHoraAtual = () =>
  new Date().toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, Math.max(0, ms)));

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
    return String(mensagemCorpo || '')
      .replace(/{{nome}}/g, clienteNome || 'Cliente')
      .replace(/{{saldo}}/g, 'R$ 0,00')
      .replace(/{{aluno}}/g, 'Aluno');
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
            {mensagemFormatada || 'Sua mensagem aparecerá aqui...'}
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

const DisparoUnicoForm: React.FC = () => {
  const [clienteId, setClienteId] = useState('');
  const [clienteNome, setClienteNome] = useState('');
  const [mensagemCorpo, setMensagemCorpo] = useState(
    'Olá {{nome}}, tudo bem?\nSeu saldo atual é {{saldo}}.\nAluno relacionado: {{aluno}}.'
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

  const clientesFiltrados = useMemo(() => {
    const termo = String(buscaCliente || '').toLowerCase().trim();
    if (!termo) return CLIENTES_MOCK;
    return CLIENTES_MOCK.filter((item) => item.nome.toLowerCase().includes(termo));
  }, [buscaCliente]);

  const clienteSelecionado = useMemo(
    () => CLIENTES_MOCK.find((item) => item.id === clienteId) || null,
    [clienteId]
  );

  const mensagemProcessada = useMemo(() => {
    const nome = clienteSelecionado?.nome || clienteNome || 'Cliente';
    const saldo = clienteSelecionado?.saldo || 'R$ 0,00';
    const aluno = clienteSelecionado?.aluno || 'Aluno';
    return String(mensagemCorpo || '')
      .replace(/{{nome}}/g, nome)
      .replace(/{{saldo}}/g, saldo)
      .replace(/{{aluno}}/g, aluno);
  }, [mensagemCorpo, clienteSelecionado, clienteNome]);

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
    if (!clienteSelecionado) {
      setFeedback('Selecione um responsável antes de enviar.');
      return;
    }
    if (!mensagemProcessada.trim()) {
      setFeedback('Digite a mensagem antes de enviar.');
      return;
    }
    if (delayMax < delayMin) {
      setFeedback('Delay máximo precisa ser maior ou igual ao mínimo.');
      return;
    }
    if (delayMode === 'INTERVAL' && intervalSeconds < 0) {
      setFeedback('Intervalo deve ser maior ou igual a 0.');
      return;
    }
    if (useExternalMedia && !arquivo) {
      setFeedback('Ative mídia apenas quando houver anexo selecionado.');
      return;
    }

    setFeedback('');
    setIsSending(true);

    const delaySeconds = delayMode === 'INTERVAL'
      ? Math.max(0, Number(intervalSeconds) || 0)
      : Math.floor(Math.random() * (delayMax - delayMin + 1) + delayMin);
    const delayAleatorioMs = delaySeconds * 1000;
    const agendamentoMs = dataAgendamento
      ? Math.max(0, new Date(dataAgendamento).getTime() - Date.now())
      : 0;
    const totalEsperaMs = delayAleatorioMs + agendamentoMs;

    try {
      await aguardarComProgresso(totalEsperaMs);

      const anexoBase64 = arquivo ? await fileToBase64(arquivo) : null;
      const executedActions: string[] = [];
      const targetPhone = clienteSelecionado.telefone;
      const targetChatId = `${String(targetPhone || '').replace(/\D/g, '')}@c.us`;

      if (useExternalText) {
        await ApiService.sendWhatsAppMessage(targetPhone, mensagemProcessada);
        executedActions.push('texto');
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

        await ApiService.sendWhatsAppMediaToChat(targetChatId, mensagemProcessada, {
          mediaType,
          base64Data: anexoBase64,
          mimeType: arquivo.type || undefined,
          fileName: arquivo.name || undefined,
        });
        executedActions.push('mídia');
      }

      if (useExternalMenu) {
        const choices = String(menuChoicesCsv || '')
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, 12);

        if (choices.length === 0) {
          throw new Error('Informe opções do menu separadas por vírgula.');
        }

        await ApiService.sendWhatsAppInteractiveMenu({
          number: targetPhone,
          type: menuType,
          text: mensagemProcessada,
          choices,
          footerText: 'Disparo Único',
        });
        executedActions.push('menu');
      }

      if (useExternalCarousel) {
        await ApiService.sendWhatsAppCarousel({
          number: targetPhone,
          text: mensagemProcessada,
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
        executedActions.push('carrossel');
      }

      if (useExternalPayment) {
        await ApiService.sendWhatsAppRequestPayment({
          number: targetPhone,
          amount: Math.max(0.01, Number(pixAmount) || 0),
          itemName: pixItemName || 'Cobrança',
          text: mensagemProcessada,
          title: 'Solicitação de pagamento',
          pixKey: String(pixKey || '').trim() || undefined,
        });
        executedActions.push('pagamento');
      }

      if (executedActions.length === 0) {
        await ApiService.sendWhatsAppMessage(targetPhone, mensagemProcessada);
        executedActions.push('texto');
      }

      setLogs((prev) => [
        {
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          nome: clienteSelecionado.nome,
          status: 'Sucesso',
          horario: new Date(),
        },
        ...prev,
      ]);
      setFeedback(`Mensagem enviada com sucesso (${executedActions.join(', ')}).`);
    } catch (error) {
      setLogs((prev) => [
        {
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          nome: clienteSelecionado.nome,
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
          <h3 className="text-lg font-black text-slate-900 dark:text-zinc-100">Disparo Único</h3>
          <p className="text-sm font-semibold text-slate-600 dark:text-zinc-400">
            Monte a mensagem e visualize em tempo real no formato WhatsApp.
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400">
            Buscar responsável
          </label>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={buscaCliente}
              onChange={(e) => setBuscaCliente(e.target.value)}
              placeholder="Pesquisar por nome..."
              aria-label="Buscar responsável por nome"
              title="Buscar responsável por nome"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border-2 border-slate-200 dark:border-zinc-700 focus:border-orange-400 outline-none text-sm font-semibold bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-200"
            />
          </div>
          <select
            value={clienteId}
            onChange={(e) => {
              const id = e.target.value;
              setClienteId(id);
              const cliente = CLIENTES_MOCK.find((item) => item.id === id);
              setClienteNome(cliente?.nome || '');
            }}
            aria-label="Selecionar responsável"
            title="Selecionar responsável"
            className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 dark:border-zinc-700 focus:border-orange-400 outline-none text-sm font-semibold bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-200"
          >
            <option value="">Selecione um cliente</option>
            {clientesFiltrados.map((cliente) => (
              <option key={cliente.id} value={cliente.id}>
                {cliente.nome} • {cliente.telefone}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400">
            Mensagem
          </label>
          <textarea
            rows={8}
            value={mensagemCorpo}
            onChange={(e) => setMensagemCorpo(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 dark:border-zinc-700 focus:border-orange-400 outline-none text-sm font-medium bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-200"
            placeholder="Digite sua mensagem..."
          />
          <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400">
            Variáveis disponíveis: <span className="font-black">{'{{nome}}'}</span>,{' '}
            <span className="font-black">{'{{saldo}}'}</span>,{' '}
            <span className="font-black">{'{{aluno}}'}</span>.
          </p>
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
                Aleatório (Min/Max)
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
              aria-label="Delay mínimo em segundos"
              title="Delay mínimo em segundos"
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
              aria-label="Delay máximo em segundos"
              title="Delay máximo em segundos"
              className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 dark:border-zinc-700 focus:border-orange-400 outline-none text-sm font-semibold bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-200"
            />
          </div>
            </>
          )}
        </div>

        <div className="rounded-xl border-2 border-slate-200 dark:border-zinc-700 p-3 space-y-3 bg-white/70 dark:bg-zinc-900/50">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400">
              Funções da API externa (toggle)
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
              <input type="checkbox" checked={useExternalMedia} onChange={(e) => setUseExternalMedia(e.target.checked)} /> Mídia
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
                <option value="button">Menu botão</option>
                <option value="list">Menu lista</option>
                <option value="poll">Enquete</option>
              </select>
              <input
                value={menuChoicesCsv}
                onChange={(e) => setMenuChoicesCsv(e.target.value)}
                placeholder="Opções do menu (separadas por vírgula)"
                aria-label="Opções do menu separadas por vírgula"
                title="Opções do menu separadas por vírgula"
                className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 dark:border-zinc-700 focus:border-orange-400 outline-none text-sm font-semibold bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-200"
              />
            </div>
          )}

          {useExternalCarousel && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <input
                value={carouselTitle}
                onChange={(e) => setCarouselTitle(e.target.value)}
                placeholder="Título do card do carrossel"
                aria-label="Título do card de carrossel"
                title="Título do card de carrossel"
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
                aria-label="Valor da cobrança PIX"
                title="Valor da cobrança PIX"
                className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 dark:border-zinc-700 focus:border-orange-400 outline-none text-sm font-semibold bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-200"
              />
              <input
                value={pixItemName}
                onChange={(e) => setPixItemName(e.target.value)}
                placeholder="Descrição do item"
                aria-label="Descrição do item da cobrança"
                title="Descrição do item da cobrança"
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
          <button
            type="button"
            onClick={processarEnvio}
            disabled={isSending}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:bg-slate-300 text-white text-xs font-black uppercase tracking-widest"
          >
            {isSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {isSending ? 'Enviando...' : 'Processar envio'}
          </button>
        </div>
      </section>

      <section className="rounded-[24px] border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-5 shadow-[0_16px_38px_-28px_rgba(15,23,42,0.6)] space-y-3">
        <h3 className="text-lg font-black text-slate-900 dark:text-zinc-100">Preview WhatsApp</h3>
        <WhatsAppPreview clienteNome={clienteNome} mensagemCorpo={mensagemCorpo} horario={horaAtual} />
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
                  <th className="py-2 pr-4 text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400">Horário</th>
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
