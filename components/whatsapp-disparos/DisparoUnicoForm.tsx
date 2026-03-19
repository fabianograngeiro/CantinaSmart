import React, { useEffect, useMemo, useState } from 'react';
import { CheckCheck, Loader2, Paperclip, Search, Send } from 'lucide-react';

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
    <div className="rounded-2xl border border-slate-200 shadow-lg overflow-hidden bg-white">
      <div className="px-4 py-3 bg-emerald-700 text-white">
        <p className="text-sm font-black">{clienteNome || 'Cliente'}</p>
        <p className="text-[11px] font-semibold text-emerald-100">online</p>
      </div>

      <div
        className="p-4 min-h-[360px] flex items-start"
        style={{ backgroundColor: '#e5ddd5' }}
      >
        <div
          className="ml-auto max-w-[92%] rounded-2xl px-4 py-3 shadow-md border border-emerald-200"
          style={{ backgroundColor: '#dcf8c6' }}
        >
          <p className="text-sm font-medium text-slate-800 whitespace-pre-wrap">
            {mensagemFormatada || 'Sua mensagem aparecerá aqui...'}
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

const DisparoUnicoForm: React.FC = () => {
  const [clienteId, setClienteId] = useState('');
  const [clienteNome, setClienteNome] = useState('');
  const [mensagemCorpo, setMensagemCorpo] = useState(
    'Olá {{nome}}, tudo bem?\nSeu saldo atual é {{saldo}}.\nAluno relacionado: {{aluno}}.'
  );
  const [dataAgendamento, setDataAgendamento] = useState('');
  const [delayMin, setDelayMin] = useState(2);
  const [delayMax, setDelayMax] = useState(5);
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

    setFeedback('');
    setIsSending(true);

    const delayAleatorioMs = Math.floor(Math.random() * (delayMax - delayMin + 1) + delayMin) * 1000;
    const agendamentoMs = dataAgendamento
      ? Math.max(0, new Date(dataAgendamento).getTime() - Date.now())
      : 0;
    const totalEsperaMs = delayAleatorioMs + agendamentoMs;

    try {
      await aguardarComProgresso(totalEsperaMs);

      const anexoBase64 = arquivo ? await fileToBase64(arquivo) : null;
      const payload = {
        numero: clienteSelecionado.telefone,
        mensagem: mensagemProcessada,
        arquivo: anexoBase64
          ? {
              nome: arquivo?.name || 'anexo',
              mimeType: arquivo?.type || 'application/octet-stream',
              base64: anexoBase64,
            }
          : null,
      };

      // Simulando axios.post com fetch e mantendo URL via VITE_API_URL
      const response = await fetch(`${apiBaseUrl}/whatsapp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: payload.numero,
          message: payload.mensagem,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Falha ao disparar mensagem.');
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
      setFeedback('Mensagem enviada com sucesso.');
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
      <section className="rounded-2xl border border-cyan-100 bg-white p-5 shadow-sm space-y-4">
        <div>
          <h3 className="text-lg font-black text-slate-900">Disparo Único</h3>
          <p className="text-sm font-semibold text-slate-500">
            Monte a mensagem e visualize em tempo real no formato WhatsApp.
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-[11px] font-black uppercase tracking-widest text-slate-500">
            Buscar responsável
          </label>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={buscaCliente}
              onChange={(e) => setBuscaCliente(e.target.value)}
              placeholder="Pesquisar por nome..."
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-semibold"
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
            className="w-full px-3 py-2.5 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-semibold"
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
          <label className="text-[11px] font-black uppercase tracking-widest text-slate-500">
            Mensagem
          </label>
          <textarea
            rows={8}
            value={mensagemCorpo}
            onChange={(e) => setMensagemCorpo(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-medium"
            placeholder="Digite sua mensagem..."
          />
          <p className="text-xs font-semibold text-slate-500">
            Variáveis disponíveis: <span className="font-black">{'{{nome}}'}</span>,{' '}
            <span className="font-black">{'{{saldo}}'}</span>,{' '}
            <span className="font-black">{'{{aluno}}'}</span>.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[11px] font-black uppercase tracking-widest text-slate-500">
              Agendamento
            </label>
            <input
              type="datetime-local"
              value={dataAgendamento}
              onChange={(e) => setDataAgendamento(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-semibold"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-black uppercase tracking-widest text-slate-500">
              Anexo
            </label>
            <label className="w-full inline-flex items-center gap-2 px-3 py-2 rounded-xl border-2 border-cyan-100 bg-cyan-50 text-cyan-700 text-sm font-black cursor-pointer hover:bg-cyan-100">
              <Paperclip size={14} />
              {arquivo ? arquivo.name : 'Selecionar arquivo'}
              <input
                type="file"
                className="hidden"
                onChange={(e) => setArquivo(e.target.files?.[0] || null)}
              />
            </label>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[11px] font-black uppercase tracking-widest text-slate-500">
              Delay Min (s)
            </label>
            <input
              type="number"
              min={0}
              value={delayMin}
              onChange={(e) => setDelayMin(Math.max(0, Number(e.target.value) || 0))}
              className="w-full px-3 py-2 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-semibold"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-black uppercase tracking-widest text-slate-500">
              Delay Max (s)
            </label>
            <input
              type="number"
              min={0}
              value={delayMax}
              onChange={(e) => setDelayMax(Math.max(0, Number(e.target.value) || 0))}
              className="w-full px-3 py-2 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-semibold"
            />
          </div>
        </div>

        {isSending && (
          <div className="rounded-xl border border-cyan-100 bg-cyan-50 p-3 space-y-2">
            <div className="flex items-center gap-2 text-cyan-700">
              <Loader2 size={14} className="animate-spin" />
              <p className="text-xs font-black uppercase tracking-widest">
                Aguardando envio {waitingSeconds > 0 ? `(${waitingSeconds}s)` : ''}
              </p>
            </div>
            <div className="h-2 rounded-full bg-cyan-100 overflow-hidden">
              <div
                className="h-full bg-cyan-500 transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(0, progressPct))}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <p className={`text-sm font-semibold ${feedback ? 'text-cyan-700' : 'text-slate-500'}`}>
            {feedback || 'Configure e clique em processar envio.'}
          </p>
          <button
            type="button"
            onClick={processarEnvio}
            disabled={isSending}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-xs font-black uppercase tracking-widest"
          >
            {isSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {isSending ? 'Enviando...' : 'Processar envio'}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-cyan-100 bg-white p-5 shadow-sm space-y-3">
        <h3 className="text-lg font-black text-slate-900">Preview WhatsApp</h3>
        <WhatsAppPreview clienteNome={clienteNome} mensagemCorpo={mensagemCorpo} horario={horaAtual} />
      </section>
      </div>

      <section className="rounded-2xl border border-cyan-100 bg-white p-5 shadow-sm space-y-3">
        <h3 className="text-lg font-black text-slate-900">Logs em tempo real</h3>
        {logs.length === 0 ? (
          <p className="text-sm font-semibold text-slate-500">Nenhum envio processado ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left">
                  <th className="py-2 pr-4 text-[11px] font-black uppercase tracking-widest text-slate-500">Nome</th>
                  <th className="py-2 pr-4 text-[11px] font-black uppercase tracking-widest text-slate-500">Status</th>
                  <th className="py-2 pr-4 text-[11px] font-black uppercase tracking-widest text-slate-500">Horário</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4 font-semibold text-slate-800">{log.nome}</td>
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
                    <td className="py-2 pr-4 font-semibold text-slate-600">
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
