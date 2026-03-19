import React, { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Search, Send } from 'lucide-react';
import { Enterprise } from '../../types';
import WhatsAppPreview from './WhatsAppPreview';
import { useDisparoUnico } from './useDisparoUnico';
import { ResponsibleTarget } from './types';

type DisparoUnicoProps = {
  activeEnterprise: Enterprise | null;
};

type FormValues = {
  responsibleSearch: string;
  responsibleId: string;
  message: string;
  scheduledAt: string;
  delayMin: number;
  delayMax: number;
  attachment: FileList | null;
};

const defaultTemplate = `Olá {{primeiro_nome}}, tudo bem?

Segue seu resumo atualizado de {{data}}.
Alunos vinculados: {{alunos}}`;

const DisparoUnico: React.FC<DisparoUnicoProps> = ({ activeEnterprise }) => {
  const { responsibleTargets, isLoadingClients, isSending, logs, sendMessage } = useDisparoUnico(activeEnterprise);
  const [feedback, setFeedback] = useState('');

  const {
    register,
    watch,
    handleSubmit,
    formState: { errors },
    setValue,
  } = useForm<FormValues>({
    defaultValues: {
      responsibleSearch: '',
      responsibleId: '',
      message: defaultTemplate,
      scheduledAt: '',
      delayMin: 2,
      delayMax: 6,
      attachment: null,
    },
  });

  const search = watch('responsibleSearch');
  const selectedId = watch('responsibleId');
  const message = watch('message');
  const delayMin = Number(watch('delayMin') || 0);
  const delayMax = Number(watch('delayMax') || 0);

  const filteredResponsibles = useMemo(() => {
    const q = String(search || '').trim().toLowerCase();
    if (!q) return responsibleTargets;
    return responsibleTargets.filter((item) => {
      const studentNames = item.students.map((s) => s.name).join(' ');
      const haystack = `${item.name} ${item.phone} ${studentNames}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [responsibleTargets, search]);

  const selectedResponsible = useMemo<ResponsibleTarget | null>(
    () => responsibleTargets.find((item) => item.id === selectedId) || null,
    [responsibleTargets, selectedId]
  );

  const onSubmit = handleSubmit(async (values) => {
    try {
      setFeedback('');
      if (!selectedResponsible) {
        setFeedback('Selecione um responsável para disparar.');
        return;
      }
      const file = values.attachment?.[0] || null;
      await sendMessage({
        responsible: selectedResponsible,
        template: values.message,
        scheduledAt: values.scheduledAt,
        delayMin: Number(values.delayMin || 0),
        delayMax: Number(values.delayMax || 0),
        file,
      });
      setFeedback('Mensagem enviada com sucesso.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Falha ao enviar mensagem.');
    }
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <section className="rounded-2xl border border-cyan-100 bg-white p-5 space-y-4">
          <h4 className="text-lg font-black text-slate-900">Disparo Único</h4>

          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <label className="text-[11px] font-black uppercase tracking-widest text-slate-500">Buscar responsável</label>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  {...register('responsibleSearch')}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-semibold"
                  placeholder="Nome, telefone ou aluno..."
                />
              </div>
              <select
                {...register('responsibleId', { required: 'Selecione um responsável' })}
                className="w-full px-3 py-2.5 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-semibold"
              >
                <option value="">{isLoadingClients ? 'Carregando responsáveis...' : 'Selecione um responsável'}</option>
                {filteredResponsibles.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} • {item.phone} • {item.students.map((s) => s.name).join(', ')}
                  </option>
                ))}
              </select>
              {errors.responsibleId ? <p className="text-xs font-semibold text-rose-600">{errors.responsibleId.message}</p> : null}
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-black uppercase tracking-widest text-slate-500">Mensagem</label>
              <textarea
                {...register('message', { required: 'Digite a mensagem' })}
                rows={8}
                className="w-full px-3 py-2.5 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-medium"
                placeholder="Use variáveis como {{nome}}, {{primeiro_nome}}, {{alunos}}, {{data}}"
              />
              <div className="flex flex-wrap gap-2">
                {['{{nome}}', '{{primeiro_nome}}', '{{alunos}}', '{{data}}'].map((token) => (
                  <button
                    key={token}
                    type="button"
                    onClick={() => setValue('message', `${String(watch('message') || '')}${watch('message') ? ' ' : ''}${token}`)}
                    className="px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-black"
                  >
                    {token}
                  </button>
                ))}
              </div>
              {errors.message ? <p className="text-xs font-semibold text-rose-600">{errors.message.message}</p> : null}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-black uppercase tracking-widest text-slate-500">Anexo (opcional)</label>
                <input
                  {...register('attachment')}
                  type="file"
                  className="w-full px-3 py-2 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-semibold"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-black uppercase tracking-widest text-slate-500">Data/hora (opcional)</label>
                <input
                  {...register('scheduledAt')}
                  type="datetime-local"
                  className="w-full px-3 py-2 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-semibold"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-black uppercase tracking-widest text-slate-500">Delay min (s)</label>
                <input
                  {...register('delayMin', { min: 0 })}
                  type="number"
                  min={0}
                  className="w-full px-3 py-2 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-semibold"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-black uppercase tracking-widest text-slate-500">Delay max (s)</label>
                <input
                  {...register('delayMax', {
                    min: 0,
                    validate: (value) => Number(value) >= delayMin || 'Delay max deve ser maior ou igual ao min',
                  })}
                  type="number"
                  min={0}
                  className="w-full px-3 py-2 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-semibold"
                />
              </div>
            </div>
            {delayMax < delayMin ? (
              <p className="text-xs font-semibold text-rose-600">Delay máximo precisa ser maior ou igual ao mínimo.</p>
            ) : null}

            <div className="flex items-center justify-between gap-2">
              <p className={`text-sm font-semibold ${feedback ? 'text-cyan-700' : 'text-slate-500'}`}>
                {feedback || 'Pronto para disparo.'}
              </p>
              <button
                type="submit"
                disabled={isSending || delayMax < delayMin}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-300 text-white text-xs font-black uppercase tracking-widest"
              >
                <Send size={14} />
                {isSending ? 'Enviando...' : 'Disparar'}
              </button>
            </div>
          </form>
        </section>

        <section className="rounded-2xl border border-cyan-100 bg-white p-5 space-y-4">
          <h4 className="text-lg font-black text-slate-900">Pré-visualização</h4>
          <WhatsAppPreview template={message} selectedResponsible={selectedResponsible} />
        </section>
      </div>

      <section className="rounded-2xl border border-cyan-100 bg-white p-5">
        <h4 className="text-lg font-black text-slate-900">Logs de disparo</h4>
        {logs.length === 0 ? (
          <p className="mt-2 text-sm font-semibold text-slate-500">Nenhum disparo realizado ainda.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-100">
                  <th className="py-2 pr-4 font-black uppercase text-[11px] tracking-widest">Nome</th>
                  <th className="py-2 pr-4 font-black uppercase text-[11px] tracking-widest">Telefone</th>
                  <th className="py-2 pr-4 font-black uppercase text-[11px] tracking-widest">Status</th>
                  <th className="py-2 pr-4 font-black uppercase text-[11px] tracking-widest">Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {logs.slice(0, 50).map((log) => (
                  <tr key={log.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4 font-semibold text-slate-800">{log.nome}</td>
                    <td className="py-2 pr-4 font-semibold text-slate-700">{log.telefone}</td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-1 rounded-full text-[11px] font-black ${
                        log.status === 'ENVIADO'
                          ? 'bg-emerald-50 text-emerald-700'
                          : log.status === 'AGENDADO'
                            ? 'bg-cyan-50 text-cyan-700'
                            : 'bg-rose-50 text-rose-700'
                      }`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="py-2 pr-4 font-semibold text-slate-600">
                      {new Date(log.timestamp).toLocaleString('pt-BR')}
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

export default DisparoUnico;

