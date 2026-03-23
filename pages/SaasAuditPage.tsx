import React, { useMemo, useState } from 'react';
import { Activity, RefreshCw, Trash2, Download } from 'lucide-react';
import { Role, User } from '../types';
import { clearSaasAuditLogs, getSaasAuditLogs, SaasAuditEntry, SaasAuditModule } from '../services/saasAuditLog';

interface SaasAuditPageProps {
  currentUser: User;
}

const formatDateTime = (iso?: string) => {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = String(d.getFullYear()).slice(-2);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hh}:${mm}`;
};

const SaasAuditPage: React.FC<SaasAuditPageProps> = ({ currentUser }) => {
  const isSuperAdmin = String(currentUser.role || '').toUpperCase() === Role.SUPERADMIN;
  const [logs, setLogs] = useState<SaasAuditEntry[]>(() => getSaasAuditLogs());
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState<'ALL' | SaasAuditModule>('ALL');
  const [actorFilter, setActorFilter] = useState('ALL');

  const refreshLogs = () => setLogs(getSaasAuditLogs());

  const clearLogs = () => {
    const confirmed = window.confirm('Deseja limpar o log de auditoria SaaS?');
    if (!confirmed) return;
    clearSaasAuditLogs();
    setLogs([]);
  };

  const actorOptions = useMemo<string[]>(() => {
    const options = Array.from(new Set(logs.map((entry) => String(entry.actorName || '')))).filter(Boolean) as string[];
    return options.sort((a, b) => a.localeCompare(b));
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const term = search.trim().toLowerCase();
    return logs.filter((entry) => {
      const matchesModule = moduleFilter === 'ALL' || entry.module === moduleFilter;
      const matchesActor = actorFilter === 'ALL' || entry.actorName === actorFilter;
      const haystack = [
        entry.summary,
        entry.action,
        entry.entityType,
        entry.entityId,
        entry.enterpriseName,
        entry.actorName
      ]
        .map((item) => String(item || '').toLowerCase())
        .join(' ');
      const matchesSearch = !term || haystack.includes(term);
      return matchesModule && matchesActor && matchesSearch;
    });
  }, [logs, search, moduleFilter, actorFilter]);

  const stats = useMemo(() => {
    const total = filteredLogs.length;
    const byModule = filteredLogs.reduce<Record<string, number>>((acc, entry) => {
      acc[entry.module] = Number(acc[entry.module] || 0) + 1;
      return acc;
    }, {});
    return { total, byModule };
  }, [filteredLogs]);

  const exportCsv = () => {
    const headers = ['Data', 'Usuario', 'Perfil', 'Modulo', 'Acao', 'Entidade', 'EntidadeID', 'Cliente', 'Resumo'];
    const rows = filteredLogs.map((entry) => [
      formatDateTime(entry.at),
      entry.actorName,
      entry.actorRole || '',
      entry.module,
      entry.action,
      entry.entityType,
      entry.entityId || '',
      entry.enterpriseName || '',
      entry.summary
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((col) => `"${String(col || '').replace(/"/g, '""')}"`).join(';'))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `saas-auditoria-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isSuperAdmin) {
    return <div className="p-6 text-sm font-bold text-red-600">Acesso restrito ao SUPERADMIN.</div>;
  }

  return (
    <div className="dash-shell space-y-4 p-4">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
            <Activity size={16} />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-zinc-100 uppercase tracking-tight">Auditoria SaaS</h1>
            <p className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-[0.16em]">
              Trilha de ações críticas do SUPERADMIN
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refreshLogs}
            className="px-3 py-2 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[11px] font-black uppercase tracking-wider text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800 flex items-center gap-1.5"
          >
            <RefreshCw size={12} />
            Atualizar
          </button>
          <button
            onClick={exportCsv}
            className="px-3 py-2 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[11px] font-black uppercase tracking-wider text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800 flex items-center gap-1.5"
          >
            <Download size={12} />
            Exportar CSV
          </button>
          <button
            onClick={clearLogs}
            className="px-3 py-2 rounded-md border border-red-200 bg-red-50 text-[11px] font-black uppercase tracking-wider text-red-700 hover:bg-red-100 flex items-center gap-1.5"
          >
            <Trash2 size={12} />
            Limpar
          </button>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <MetricCard title="Eventos" value={String(stats.total)} />
        <MetricCard title="Planos" value={String(stats.byModule.PLANOS || 0)} />
        <MetricCard title="Cobranças" value={String(stats.byModule.COBRANCAS || 0)} />
        <MetricCard title="WhatsApp" value={String(stats.byModule.WHATSAPP || 0)} />
      </section>

      <section className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl p-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar ação, cliente, usuário..."
            className="h-9 px-3 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-bold text-slate-700 dark:text-zinc-200 outline-none"
          />
          <select
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value as 'ALL' | SaasAuditModule)}
            className="h-9 px-3 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-bold text-slate-700 dark:text-zinc-200 outline-none"
          >
            <option value="ALL">Todos os módulos</option>
            <option value="PLANOS">Planos</option>
            <option value="COBRANCAS">Cobranças</option>
            <option value="WHATSAPP">WhatsApp</option>
            <option value="CLIENTES">Clientes</option>
            <option value="FINANCEIRO">Financeiro</option>
            <option value="SISTEMA">Sistema</option>
          </select>
          <select
            value={actorFilter}
            onChange={(e) => setActorFilter(e.target.value)}
            className="h-9 px-3 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-bold text-slate-700 dark:text-zinc-200 outline-none"
          >
            <option value="ALL">Todos os usuários</option>
            {actorOptions.map((actor) => (
              <option key={actor} value={actor}>{actor}</option>
            ))}
          </select>
        </div>
      </section>

      <section className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-700 overflow-hidden">
        <div className="overflow-auto">
          <table className="w-full min-w-[1100px] text-xs">
            <thead className="bg-slate-50 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-3 py-2 text-left">Data</th>
                <th className="px-3 py-2 text-left">Usuário</th>
                <th className="px-3 py-2 text-center">Módulo</th>
                <th className="px-3 py-2 text-center">Ação</th>
                <th className="px-3 py-2 text-left">Cliente</th>
                <th className="px-3 py-2 text-left">Resumo</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((entry) => (
                <tr key={entry.id} className="border-b border-slate-100 dark:border-zinc-800">
                  <td className="px-3 py-2.5 font-bold text-slate-600 dark:text-zinc-300">{formatDateTime(entry.at)}</td>
                  <td className="px-3 py-2.5">
                    <p className="font-black text-slate-800 dark:text-zinc-100">{entry.actorName}</p>
                    <p className="font-bold text-[10px] text-slate-500 dark:text-zinc-400">{entry.actorRole || '-'}</p>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase border border-indigo-200 bg-indigo-50 text-indigo-700">
                      {entry.module}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center font-black text-slate-700 dark:text-zinc-200">{entry.action}</td>
                  <td className="px-3 py-2.5 font-bold text-slate-700 dark:text-zinc-200">{entry.enterpriseName || '-'}</td>
                  <td className="px-3 py-2.5 font-bold text-slate-600 dark:text-zinc-300">{entry.summary}</td>
                </tr>
              ))}
              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-xs font-bold text-slate-500 dark:text-zinc-400">
                    Nenhum evento encontrado para os filtros selecionados.
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

const MetricCard = ({ title, value }: { title: string; value: string }) => (
  <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl p-3">
    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400 dark:text-zinc-400">{title}</p>
    <p className="text-lg font-black text-slate-900 dark:text-zinc-100 leading-tight">{value}</p>
  </div>
);

export default SaasAuditPage;
