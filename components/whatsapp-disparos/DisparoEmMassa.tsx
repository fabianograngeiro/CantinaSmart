import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCheck, Loader2, Play, Users } from 'lucide-react';
import ApiService from '../../services/api';
import { Enterprise } from '../../types';

type AudienceFilter =
  | 'TODOS'
  | 'RESPONSAVEIS'
  | 'COLABORADORES'
  | 'SALDO_BAIXO'
  | 'PLANO_A_VENCER'
  | 'RELATORIO_ENTREGA';

type AudienceRecipient = {
  id: string;
  tipo: 'RESPONSAVEL' | 'COLABORADOR';
  nome: string;
  telefone: string;
  alunos: string[];
  variables: {
    nome?: string;
    alunos?: string;
    saldo?: string;
    plano?: string;
    consumo_hoje?: string;
    status_entrega?: string;
  };
  impact?: string;
};

type MassLog = {
  id: string;
  nome: string;
  telefone: string;
  status: 'Sucesso' | 'Erro' | 'Simulado' | 'Inválido';
  horario: Date;
  detalhe?: string;
};

type ProgressState = {
  total: number;
  processados: number;
  enviados: number;
  erros: number;
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, Math.max(0, ms));
  });

const normalizePhone = (value: string) => String(value || '').replace(/\D/g, '');

const isValidPhone = (value: string) => {
  const normalized = normalizePhone(value);
  return normalized.length >= 10 && normalized.length <= 15;
};

const toWhatsAppChatId = (phone: string) => `${normalizePhone(phone)}@c.us`;

const toCurrency = (value: unknown) => {
  const parsed = Number(value || 0);
  if (Number.isNaN(parsed)) return 'R$ 0,00';
  return parsed.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const cleanupMessage = (text: string) =>
  String(text || '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const renderizarMensagem = (template: string, usuario: AudienceRecipient) => {
  const alunosArray = Array.isArray(usuario?.alunos) ? usuario.alunos.filter(Boolean) : [];
  const alunosNomes = String(usuario?.variables?.alunos || alunosArray.join(', ') || '').trim();
  const financeiroSaldo =
    (usuario as any)?.financeiro?.saldo
    ?? (usuario as any)?.saldo
    ?? usuario?.variables?.saldo
    ?? 0;

  const planoNome =
    (usuario as any)?.planoAtivo?.nome
    || usuario?.variables?.plano
    || 'Sem plano ativo';

  const consumoHojeRaw =
    Array.isArray((usuario as any)?.transacoesHoje)
      ? (usuario as any).transacoesHoje
          .map((tx: any) => String(tx?.item || tx?.description || '').trim())
          .filter(Boolean)
          .join(' | ')
      : (usuario?.variables?.consumo_hoje || '');

  const vars: Record<string, string> = {
    nome: String(usuario?.nome || usuario?.variables?.nome || 'Cliente'),
    saldo: typeof financeiroSaldo === 'string' && financeiroSaldo.includes('R$')
      ? financeiroSaldo
      : toCurrency(financeiroSaldo),
    alunos: alunosNomes || 'Aluno',
    plano: String(planoNome || 'Sem plano ativo'),
    consumo_hoje: String(consumoHojeRaw || 'Sem consumo hoje'),
    status_entrega: String(usuario?.variables?.status_entrega || 'Pendente'),
    filhos_label: alunosArray.length > 1 ? 'seus filhos' : 'seu filho',
  };

  const rendered = String(template || '').replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key: string) => {
    const safeKey = String(key || '').toLowerCase();
    return vars[safeKey] ?? '';
  });

  return cleanupMessage(rendered);
};

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] || '' : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Falha ao converter anexo para base64.'));
    reader.readAsDataURL(file);
  });

const WhatsAppMassPreview: React.FC<{
  nome: string;
  mensagem: string;
}> = ({ nome, mensagem }) => {
  const horario = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return (
    <div className="rounded-2xl border border-slate-200 shadow-lg overflow-hidden bg-white">
      <div className="px-4 py-3 bg-emerald-700 text-white">
        <p className="text-sm font-black">{nome || 'Cliente'}</p>
        <p className="text-[11px] font-semibold text-emerald-100">online</p>
      </div>
      <div className="p-4 min-h-[320px] bg-[#e5ddd5]">
        <div className="ml-auto max-w-[92%] rounded-2xl bg-[#dcf8c6] px-4 py-3 shadow-md border border-emerald-200">
          <p className="text-sm font-medium text-slate-800 whitespace-pre-wrap">
            {mensagem || 'Sem mensagem para pré-visualização.'}
          </p>
          <div className="mt-1.5 flex items-center justify-end gap-1">
            <span className="text-[11px] text-slate-500">{horario}</span>
            <CheckCheck size={14} className="text-sky-500" />
          </div>
        </div>
      </div>
    </div>
  );
};

type DisparoEmMassaProps = {
  activeEnterprise: Enterprise | null;
};

const DisparoEmMassa: React.FC<DisparoEmMassaProps> = ({ activeEnterprise }) => {
  const [audienceFilter, setAudienceFilter] = useState<AudienceFilter>('TODOS');
  const [template, setTemplate] = useState(
    'Olá {{nome}}, segue seu resumo.\nAlunos vinculados: {{alunos}}\nSaldo atual: {{saldo}}'
  );
  const [delayMin, setDelayMin] = useState(2);
  const [delayMax, setDelayMax] = useState(6);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [isSimulation, setIsSimulation] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [recipients, setRecipients] = useState<AudienceRecipient[]>([]);
  const [isLoadingRecipients, setIsLoadingRecipients] = useState(false);
  const [logs, setLogs] = useState<MassLog[]>([]);
  const [progress, setProgress] = useState<ProgressState>({ total: 0, processados: 0, enviados: 0, erros: 0 });
  const [mensagemStatus, setMensagemStatus] = useState('Aguardando início do disparo.');
  const [showResumoModal, setShowResumoModal] = useState(false);
  const [batchLimit, setBatchLimit] = useState(50);
  const [usuarioSelecionadoId, setUsuarioSelecionadoId] = useState('');
  const [previewText, setPreviewText] = useState('Sem audiência para pré-visualização.');
  const stopSignal = useRef(false);

  const templatesRapidos = useMemo(
    () => [
      {
        id: 'saldo-baixo',
        label: '🔔 Aviso de Saldo Baixo',
        text: 'Olá {{nome}}, identificamos saldo baixo ({{saldo}}). Para evitar bloqueio, recarregue hoje.',
      },
      {
        id: 'lanche-entregue',
        label: '🍱 Lanche Entregue',
        text: 'Olá {{nome}}, confirmamos a entrega de hoje. Status: {{status_entrega}}.',
      },
      {
        id: 'renovacao-plano',
        label: '📅 Renovação de Plano',
        text: 'Olá {{nome}}, o plano {{plano}} está próximo do vencimento. Posso te ajudar com a renovação?',
      },
      {
        id: 'resumo',
        label: '📊 Resumo de Hoje',
        text: 'Olá {{nome}}.\n{{filhos_label}}: {{alunos}}\nSaldo: {{saldo}}\nPlano: {{plano}}\nConsumo de hoje: {{consumo_hoje}}',
      },
    ],
    []
  );

  useEffect(() => {
    if (!activeEnterprise?.id) return;
    let cancelled = false;

    const run = async () => {
      try {
        setIsLoadingRecipients(true);
        const data = await ApiService.getWhatsAppDispatchAudience({
          enterpriseId: activeEnterprise.id,
          filter: audienceFilter,
        });
        if (!cancelled) {
          const list = Array.isArray(data?.recipients) ? data.recipients : [];
          setRecipients(list);
          setUsuarioSelecionadoId((prev) => {
            if (prev && list.some((item: AudienceRecipient) => item.id === prev)) return prev;
            return list[0]?.id || '';
          });
        }
      } catch (error) {
        if (!cancelled) {
          setRecipients([]);
          setUsuarioSelecionadoId('');
          setFeedback(error instanceof Error ? error.message : 'Falha ao buscar audiência.');
        }
      } finally {
        if (!cancelled) setIsLoadingRecipients(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [activeEnterprise?.id, audienceFilter]);

  const usuarioSelecionado = useMemo(
    () => recipients.find((item) => item.id === usuarioSelecionadoId) || recipients[0] || null,
    [recipients, usuarioSelecionadoId]
  );

  useEffect(() => {
    if (!usuarioSelecionado) {
      setPreviewText('Sem audiência para pré-visualização.');
      return;
    }
    setPreviewText(renderizarMensagem(template, usuarioSelecionado));
  }, [template, usuarioSelecionado]);

  const previewName = usuarioSelecionado?.nome || 'Cliente';

  const progressPct = progress.total > 0
    ? Math.round((progress.processados / progress.total) * 100)
    : 0;

  const processarEnvio = async (usuario: AudienceRecipient): Promise<MassLog['status']> => {
    const logBase = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      nome: usuario.nome,
      telefone: usuario.telefone,
      horario: new Date(),
    };

    if (!isValidPhone(usuario.telefone)) {
      setLogs((prev) => [{ ...logBase, status: 'Inválido', detalhe: 'Telefone vazio ou inválido.' }, ...prev]);
      return 'Inválido';
    }

    const waitMs = Math.floor(Math.random() * (delayMax - delayMin + 1) + delayMin) * 1000;
    setMensagemStatus(`Aguardando intervalo aleatório (${Math.round(waitMs / 1000)}s) para ${usuario.nome}...`);
    await sleep(waitMs);

    if (stopSignal.current) {
      setLogs((prev) => [{ ...logBase, status: 'Erro', detalhe: 'Disparo cancelado manualmente.' }, ...prev]);
      return 'Erro';
    }

    setMensagemStatus(`Enviando para ${usuario.nome} (${usuario.telefone})...`);
    const message = renderizarMensagem(template, usuario);

    if (isSimulation) {
      setLogs((prev) => [{ ...logBase, status: 'Simulado', detalhe: message.slice(0, 120) }, ...prev]);
      return 'Simulado';
    }

    try {
      if (attachment) {
        const base64 = await fileToBase64(attachment);
        const mediaType: 'image' | 'audio' | 'document' = String(attachment.type || '').startsWith('image/')
          ? 'image'
          : String(attachment.type || '').startsWith('audio/')
            ? 'audio'
            : 'document';

        await ApiService.sendWhatsAppMediaToChat(toWhatsAppChatId(usuario.telefone), message, {
          mediaType,
          base64Data: base64,
          mimeType: attachment.type || undefined,
          fileName: attachment.name || undefined,
        });
      } else {
        await ApiService.sendWhatsAppMessage(usuario.telefone, message);
      }

      setLogs((prev) => [{ ...logBase, status: 'Sucesso' }, ...prev]);
      return 'Sucesso';
    } catch (error) {
      setLogs((prev) => [
        {
          ...logBase,
          status: 'Erro',
          detalhe: error instanceof Error ? error.message : 'Falha no envio',
        },
        ...prev,
      ]);
      return 'Erro';
    }
  };

  const iniciarDisparoEmMassa = async () => {
    if (isSending) return;
    if (!recipients.length) {
      setFeedback('Nenhum destinatário encontrado para o filtro atual.');
      return;
    }
    if (delayMax < delayMin) {
      setFeedback('Delay máximo precisa ser maior ou igual ao mínimo.');
      return;
    }
    if (!template.trim()) {
      setFeedback('Digite a mensagem do disparo em massa.');
      return;
    }
    const cappedLimit = Math.max(1, Math.min(50, Number(batchLimit || 50)));
    const targetRecipients = recipients.slice(0, cappedLimit);
    if (!targetRecipients.length) {
      setFeedback('Nenhum destinatário válido para o lote atual.');
      return;
    }

    setFeedback('');
    setShowResumoModal(false);
    stopSignal.current = false;
    setIsSending(true);
    setMensagemStatus('Iniciando disparo...');
    setProgress({ total: targetRecipients.length, processados: 0, enviados: 0, erros: 0 });
    let processados = 0;
    let enviados = 0;
    let erros = 0;

    for (const usuario of targetRecipients) {
      if (stopSignal.current) break;
      const status = await processarEnvio(usuario);
      processados += 1;
      if (status === 'Sucesso' || status === 'Simulado') enviados += 1;
      if (status === 'Erro' || status === 'Inválido') erros += 1;
      setProgress((prev) => ({
        ...prev,
        processados,
        enviados,
        erros,
      }));
    }

    setIsSending(false);
    setMensagemStatus(stopSignal.current ? 'Disparo cancelado pelo usuário.' : 'Concluído!');
    setFeedback(stopSignal.current
      ? `Disparo interrompido em ${processados} de ${targetRecipients.length} destinatário(s).`
      : (isSimulation
        ? `Simulação concluída para ${targetRecipients.length} destinatário(s).`
        : `Disparo concluído para ${targetRecipients.length} destinatário(s).`));
    setShowResumoModal(true);
  };

  const cancelarDisparo = () => {
    if (!isSending) return;
    stopSignal.current = true;
    setMensagemStatus('Cancelamento solicitado. Finalizando envio atual...');
  };

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!isSending) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => {
      window.removeEventListener('beforeunload', handler);
    };
  }, [isSending]);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-cyan-100 bg-white p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-lg font-black text-slate-900">Disparo em Massa</h4>
            <p className="text-sm font-semibold text-slate-500">
              Filtre a audiência direto do banco e envie com delay randômico.
            </p>
          </div>
          <button
            type="button"
            onClick={iniciarDisparoEmMassa}
            disabled={isSending || isLoadingRecipients}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-xs font-black uppercase tracking-widest"
          >
            {isSending ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            {isSending ? 'Processando...' : 'Iniciar disparo'}
          </button>
          {isSending && (
            <button
              type="button"
              onClick={cancelarDisparo}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black uppercase tracking-widest"
            >
              Cancelar disparos
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-3">
            <label className="space-y-1 block">
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Filtro de audiência</span>
              <select
                value={audienceFilter}
                onChange={(e) => setAudienceFilter(e.target.value as AudienceFilter)}
                className="w-full px-3 py-2.5 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-semibold"
              >
                <option value="TODOS">Todos</option>
                <option value="RESPONSAVEIS">Apenas Responsáveis</option>
                <option value="COLABORADORES">Apenas Colaboradores</option>
                <option value="SALDO_BAIXO">Alunos com Saldo Baixo (&lt; R$ 10,00)</option>
                <option value="PLANO_A_VENCER">Plano a Vencer (próx. 5 dias)</option>
                <option value="RELATORIO_ENTREGA">Relatório de Entrega (hoje)</option>
              </select>
            </label>

            <label className="space-y-1 block">
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Mensagem</span>
              <div className="mb-2 flex flex-wrap gap-2">
                {templatesRapidos.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setTemplate(preset.text)}
                    className="px-2.5 py-1.5 rounded-lg border border-cyan-200 bg-cyan-50 hover:bg-cyan-100 text-[11px] font-black text-cyan-700"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <textarea
                rows={7}
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-medium"
              />
              <p className="text-xs font-semibold text-slate-500">
                Variáveis: <span className="font-black">{'{{nome}}'}</span>, <span className="font-black">{'{{alunos}}'}</span>, <span className="font-black">{'{{saldo}}'}</span>, <span className="font-black">{'{{plano}}'}</span>, <span className="font-black">{'{{consumo_hoje}}'}</span>, <span className="font-black">{'{{status_entrega}}'}</span>, <span className="font-black">{'{{filhos_label}}'}</span>
              </p>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 block">
                <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Delay Min (s)</span>
                <input
                  type="number"
                  min={0}
                  value={delayMin}
                  onChange={(e) => setDelayMin(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full px-3 py-2 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-semibold"
                />
              </label>
              <label className="space-y-1 block">
                <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Delay Max (s)</span>
                <input
                  type="number"
                  min={0}
                  value={delayMax}
                  onChange={(e) => setDelayMax(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full px-3 py-2 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-semibold"
                />
              </label>
            </div>
            <label className="space-y-1 block">
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Limite por lote (máx. 50)</span>
              <input
                type="number"
                min={1}
                max={50}
                value={batchLimit}
                onChange={(e) => setBatchLimit(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                className="w-full px-3 py-2 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-semibold"
              />
            </label>

            <label className="space-y-1 block">
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Anexo (opcional)</span>
              <input
                type="file"
                onChange={(e) => setAttachment(e.target.files?.[0] || null)}
                className="w-full px-3 py-2 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-semibold"
              />
            </label>

            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-cyan-100 bg-cyan-50 text-sm font-bold text-cyan-700">
              <input
                type="checkbox"
                checked={isSimulation}
                onChange={(e) => setIsSimulation(e.target.checked)}
              />
              Modo Simulação (não envia para WhatsApp)
            </label>
          </div>

          <div className="space-y-3">
            <div className="space-y-2">
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Prévia da mensagem</p>
              <label className="space-y-1 block">
                <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Contato de prévia</span>
                <select
                  value={usuarioSelecionadoId}
                  onChange={(e) => setUsuarioSelecionadoId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-semibold"
                >
                  {recipients.length === 0 && <option value="">Sem destinatários</option>}
                  {recipients.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nome} ({item.tipo === 'RESPONSAVEL' ? 'Responsável' : 'Colaborador'})
                    </option>
                  ))}
                </select>
              </label>
              <WhatsAppMassPreview nome={previewName} mensagem={previewText} />
            </div>
            <div className="rounded-2xl border border-cyan-100 bg-white p-4">
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Resumo da audiência</p>
              <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Users size={14} />
                {isLoadingRecipients ? 'Carregando destinatários...' : `${recipients.length} destinatário(s) elegível(eis)`}
              </div>
              {!isLoadingRecipients && recipients.length > batchLimit && (
                <p className="mt-2 text-xs font-bold text-amber-700">
                  Serão processados apenas os primeiros {Math.max(1, Math.min(50, batchLimit))} contatos neste lote.
                </p>
              )}
            </div>
            {progress.total > 0 && (
              <div className="rounded-2xl border border-cyan-100 bg-white p-4">
                <div className="flex items-center justify-between text-xs font-black uppercase tracking-widest text-slate-500">
                  <span>Progresso</span>
                  <span>{progress.processados}/{progress.total} ({progressPct}%)</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={`h-full bg-emerald-500 transition-all duration-300 ${isSending ? 'animate-pulse' : ''}`}
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] font-bold text-slate-600">
                  <span>Enviados: {progress.enviados}</span>
                  <span>Erros: {progress.erros}</span>
                </div>
                <p className="mt-2 text-xs font-semibold text-cyan-700">{mensagemStatus}</p>
              </div>
            )}
          </div>
        </div>

        <p className={`text-sm font-semibold ${feedback ? 'text-cyan-700' : 'text-slate-500'}`}>
          {feedback || 'Configure o filtro e inicie o disparo em massa.'}
        </p>
      </section>

      <section className="rounded-2xl border border-cyan-100 bg-white p-5">
        <h4 className="text-lg font-black text-slate-900">Logs do disparo em massa</h4>
        {logs.length === 0 ? (
          <p className="mt-2 text-sm font-semibold text-slate-500">Sem logs ainda.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left">
                  <th className="py-2 pr-4 text-[11px] font-black uppercase tracking-widest text-slate-500">Nome</th>
                  <th className="py-2 pr-4 text-[11px] font-black uppercase tracking-widest text-slate-500">Telefone</th>
                  <th className="py-2 pr-4 text-[11px] font-black uppercase tracking-widest text-slate-500">Status</th>
                  <th className="py-2 pr-4 text-[11px] font-black uppercase tracking-widest text-slate-500">Horário</th>
                </tr>
              </thead>
              <tbody>
                {logs.slice(0, 200).map((log) => (
                  <tr key={log.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4 font-semibold text-slate-800">{log.nome}</td>
                    <td className="py-2 pr-4 font-semibold text-slate-700">{log.telefone}</td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-1 rounded-full text-[11px] font-black ${
                        log.status === 'Sucesso'
                          ? 'bg-emerald-50 text-emerald-700'
                          : log.status === 'Simulado'
                            ? 'bg-cyan-50 text-cyan-700'
                            : log.status === 'Inválido'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-rose-50 text-rose-700'
                      }`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="py-2 pr-4 font-semibold text-slate-600">{log.horario.toLocaleString('pt-BR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showResumoModal && (
        <div className="fixed inset-0 z-[80] bg-slate-900/35 backdrop-blur-[1px] flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-cyan-100 bg-white shadow-2xl p-5">
            <h5 className="text-lg font-black text-slate-900">Resumo do Disparo</h5>
            <p className="mt-2 text-sm font-semibold text-slate-700">
              {progress.enviados} mensagens enviadas com sucesso e {progress.erros} falhas.
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              Processados: {progress.processados} de {progress.total}
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setLogs([])}
                className="px-3 py-2 rounded-lg border border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100 text-xs font-black uppercase tracking-widest"
              >
                Limpar Logs
              </button>
              <button
                type="button"
                onClick={() => setShowResumoModal(false)}
                className="px-3 py-2 rounded-lg border border-cyan-200 text-cyan-700 bg-cyan-50 hover:bg-cyan-100 text-xs font-black uppercase tracking-widest"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DisparoEmMassa;
