import React, { useEffect, useMemo, useState } from 'react';
import { BellRing, CalendarDays, CheckCircle2, Clock3, Plus, Trash2 } from 'lucide-react';
import ApiService from '../services/api';
import notificationService from '../services/notificationService';
import { User } from '../types';

interface TaskRemindersDashboardPageProps {
  currentUser: User;
}

type TaskReminder = {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  reminderDate: string;
  relatedData: string;
  status: 'PENDING' | 'DONE';
  createdAt: string;
  updatedAt?: string;
  completedAt?: string;
  createdByUserId?: string;
  createdByName?: string;
};

const toDateOnly = (value: string) => new Date(`${String(value || '').slice(0, 10)}T00:00:00`);
const daysDiff = (value: string) => {
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const target = toDateOnly(value);
  return Math.floor((target.getTime() - startToday.getTime()) / (1000 * 60 * 60 * 24));
};

const TaskRemindersDashboardPage: React.FC<TaskRemindersDashboardPageProps> = () => {
  const [items, setItems] = useState<TaskReminder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    dueDate: '',
    reminderDate: '',
    relatedData: '',
  });

  const loadReminders = async () => {
    try {
      setIsLoading(true);
      const data = await ApiService.getTaskReminders();
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Erro ao carregar lembretes de tarefas:', err);
      notificationService.critico('Falha ao carregar', 'Nao foi possivel carregar os lembretes de tarefas.');
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadReminders();
  }, []);

  const dashboard = useMemo(() => {
    const total = items.length;
    const done = items.filter((item) => item.status === 'DONE').length;
    const pendingItems = items.filter((item) => item.status === 'PENDING');
    const pending = pendingItems.length;
    const overdue = pendingItems.filter((item) => daysDiff(item.dueDate) < 0).length;
    const dueToday = pendingItems.filter((item) => daysDiff(item.dueDate) === 0).length;
    const upcoming = pendingItems.filter((item) => {
      const d = daysDiff(item.reminderDate || item.dueDate);
      return d >= 0 && d <= 3;
    }).length;

    return { total, done, pending, overdue, dueToday, upcoming };
  }, [items]);

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      if (a.status !== b.status) return a.status === 'PENDING' ? -1 : 1;
      return daysDiff(a.reminderDate || a.dueDate) - daysDiff(b.reminderDate || b.dueDate);
    });
  }, [items]);

  const handleCreate = async () => {
    if (!form.title.trim() || !form.dueDate || !form.reminderDate) {
      notificationService.alerta('Campos obrigatorios', 'Informe titulo, data de vencimento e data do lembrete.');
      return;
    }

    try {
      setIsSaving(true);
      const created = await ApiService.createTaskReminder({
        title: form.title.trim(),
        description: form.description.trim(),
        dueDate: form.dueDate,
        reminderDate: form.reminderDate,
        relatedData: form.relatedData.trim(),
        status: 'PENDING',
      });
      setItems((prev) => [created, ...prev]);
      setForm({ title: '', description: '', dueDate: '', reminderDate: '', relatedData: '' });
      notificationService.informativo('Lembrete criado', 'Nova tarefa adicionada com sucesso.');
    } catch (err) {
      console.error('Erro ao criar lembrete de tarefa:', err);
      notificationService.critico('Falha ao criar', 'Nao foi possivel criar o lembrete de tarefa.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleDone = async (item: TaskReminder) => {
    const nextStatus = item.status === 'DONE' ? 'PENDING' : 'DONE';
    try {
      const updated = await ApiService.updateTaskReminder(item.id, {
        status: nextStatus,
        completedAt: nextStatus === 'DONE' ? new Date().toISOString() : '',
      });
      setItems((prev) => prev.map((it) => (it.id === item.id ? updated : it)));
      notificationService.informativo('Lembrete atualizado', nextStatus === 'DONE' ? 'Tarefa marcada como concluida.' : 'Tarefa reaberta.');
    } catch (err) {
      console.error('Erro ao atualizar lembrete de tarefa:', err);
      notificationService.critico('Falha ao atualizar', 'Nao foi possivel atualizar o lembrete de tarefa.');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await ApiService.deleteTaskReminder(id);
      setItems((prev) => prev.filter((it) => it.id !== id));
      notificationService.informativo('Lembrete removido', 'Tarefa removida com sucesso.');
    } catch (err) {
      console.error('Erro ao excluir lembrete de tarefa:', err);
      notificationService.critico('Falha ao excluir', 'Nao foi possivel excluir o lembrete de tarefa.');
    }
  };

  return (
    <div className="dash-shell space-y-4 p-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
            <BellRing size={16} />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-zinc-100 uppercase tracking-tight">Lembretes de Tarefas</h1>
            <p className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-[0.16em]">
              Dashboard de vencimentos e tarefas
            </p>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Metric title="Total" value={String(dashboard.total)} tone="slate" />
        <Metric title="Pendentes" value={String(dashboard.pending)} tone="amber" />
        <Metric title="Concluidas" value={String(dashboard.done)} tone="emerald" />
        <Metric title="Atrasadas" value={String(dashboard.overdue)} tone="rose" />
        <Metric title="Vence Hoje" value={String(dashboard.dueToday)} tone="orange" />
        <Metric title="Proximas" value={String(dashboard.upcoming)} tone="blue" />
      </section>

      <section className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-black text-slate-800 dark:text-zinc-100 uppercase tracking-wider">Criar lembrete de tarefa</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="text-xs font-bold text-slate-500">
            Titulo
            <input
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              className="mt-1 h-9 w-full px-2 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-bold"
              placeholder="Ex: Cobrar cliente Rede Alfa"
            />
          </label>
          <label className="text-xs font-bold text-slate-500">
            Data de vencimento
            <input
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm((prev) => ({ ...prev, dueDate: e.target.value }))}
              className="mt-1 h-9 w-full px-2 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-bold"
            />
          </label>
          <label className="text-xs font-bold text-slate-500">
            Data do lembrete
            <input
              type="date"
              value={form.reminderDate}
              onChange={(e) => setForm((prev) => ({ ...prev, reminderDate: e.target.value }))}
              className="mt-1 h-9 w-full px-2 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-bold"
            />
          </label>
          <label className="text-xs font-bold text-slate-500">
            Dados relacionados
            <input
              value={form.relatedData}
              onChange={(e) => setForm((prev) => ({ ...prev, relatedData: e.target.value }))}
              className="mt-1 h-9 w-full px-2 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-bold"
              placeholder="Cliente, unidade, pedido, contrato..."
            />
          </label>
          <label className="text-xs font-bold text-slate-500 md:col-span-2">
            Descricao
            <textarea
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              className="mt-1 min-h-[86px] w-full px-2 py-2 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-bold"
              placeholder="Detalhes da tarefa e observacoes"
            />
          </label>
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleCreate}
            disabled={isSaving}
            className="h-9 px-4 rounded-md bg-indigo-600 text-white text-xs font-black uppercase tracking-wider hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
          >
            <Plus size={14} />
            {isSaving ? 'Salvando...' : 'Criar lembrete'}
          </button>
        </div>
      </section>

      <section className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl p-4">
        <h3 className="text-sm font-black text-slate-800 dark:text-zinc-100 uppercase tracking-wider mb-3">Dashboard de tarefas</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-zinc-700">
                <th className="text-left py-2 font-black uppercase tracking-wider text-slate-500">Titulo</th>
                <th className="text-left py-2 font-black uppercase tracking-wider text-slate-500">Descricao</th>
                <th className="text-left py-2 font-black uppercase tracking-wider text-slate-500">Dados relacionados</th>
                <th className="text-left py-2 font-black uppercase tracking-wider text-slate-500">Lembrete</th>
                <th className="text-left py-2 font-black uppercase tracking-wider text-slate-500">Vencimento</th>
                <th className="text-left py-2 font-black uppercase tracking-wider text-slate-500">Status</th>
                <th className="text-right py-2 font-black uppercase tracking-wider text-slate-500">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {sortedItems.map((item) => {
                const dueDiff = daysDiff(item.dueDate);
                const isOverdue = item.status === 'PENDING' && dueDiff < 0;
                const isDueToday = item.status === 'PENDING' && dueDiff === 0;

                return (
                  <tr key={item.id} className="border-b border-slate-100 dark:border-zinc-800">
                    <td className="py-2.5 font-bold text-slate-700 dark:text-zinc-200">{item.title}</td>
                    <td className="py-2.5 text-slate-600 dark:text-zinc-300">{item.description || '-'}</td>
                    <td className="py-2.5 text-slate-600 dark:text-zinc-300">{item.relatedData || '-'}</td>
                    <td className="py-2.5 font-bold text-slate-500">{new Date(item.reminderDate).toLocaleDateString('pt-BR')}</td>
                    <td className="py-2.5 font-bold text-slate-500">{new Date(item.dueDate).toLocaleDateString('pt-BR')}</td>
                    <td className="py-2.5">
                      {item.status === 'DONE' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-black text-[10px]">
                          <CheckCircle2 size={11} /> Concluida
                        </span>
                      ) : isOverdue ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 font-black text-[10px]">
                          <Clock3 size={11} /> Atrasada
                        </span>
                      ) : isDueToday ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-black text-[10px]">
                          <CalendarDays size={11} /> Vence hoje
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-black text-[10px]">
                          <BellRing size={11} /> Pendente
                        </span>
                      )}
                    </td>
                    <td className="py-2.5">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleToggleDone(item)}
                          className="h-7 px-2 rounded-md bg-indigo-600 text-white text-[10px] font-black uppercase tracking-wider hover:bg-indigo-700"
                        >
                          {item.status === 'DONE' ? 'Reabrir' : 'Concluir'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(item.id)}
                          className="h-7 w-7 rounded-md border border-rose-200 text-rose-600 hover:bg-rose-50 flex items-center justify-center"
                          title="Excluir"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {sortedItems.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[11px] font-bold text-slate-400">
                    {isLoading ? 'Carregando lembretes...' : 'Nenhum lembrete cadastrado ainda.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

const Metric = ({ title, value, tone }: { title: string; value: string; tone: 'slate' | 'amber' | 'emerald' | 'rose' | 'orange' | 'blue' }) => {
  const tones: Record<string, string> = {
    slate: 'text-slate-700 bg-slate-100',
    amber: 'text-amber-700 bg-amber-100',
    emerald: 'text-emerald-700 bg-emerald-100',
    rose: 'text-rose-700 bg-rose-100',
    orange: 'text-orange-700 bg-orange-100',
    blue: 'text-blue-700 bg-blue-100',
  };

  return (
    <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl p-3">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400 dark:text-zinc-400">{title}</p>
      <p className={`mt-1 inline-flex px-2.5 py-1 rounded-full text-sm font-black ${tones[tone]}`}>{value}</p>
    </div>
  );
};

export default TaskRemindersDashboardPage;
