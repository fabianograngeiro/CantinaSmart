import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, RefreshCw, Send } from 'lucide-react';
import { Role, User } from '../types';
import ApiService from '../services/api';

interface ErrorTicketsPageProps {
  currentUser: User;
}

type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';

type ErrorTicket = {
  id: string;
  title?: string;
  message: string;
  details?: string;
  source?: string;
  page?: string;
  status: TicketStatus;
  enterpriseName?: string;
  enterpriseId?: string;
  userName?: string;
  userRole?: string;
  createdAt?: string;
  updatedAt?: string;
  resolvedAt?: string;
  resolutionNote?: string;
  patchAppliedByAi?: boolean;
  humanValidationStatus?: 'PENDING' | 'APPROVED' | 'REJECTED' | string;
  humanValidatedBy?: string;
  humanValidatedAt?: string;
  aiPatch?: {
    id?: string;
    label?: string;
    generatedBy?: string;
    isTemporary?: boolean;
    active?: boolean;
    createdAt?: string;
    removedAt?: string;
    removedBy?: string;
    summary?: string;
    instructions?: string[];
  };
  context?: Record<string, any>;
};

const statusLabel: Record<TicketStatus, string> = {
  OPEN: 'ABERTO',
  IN_PROGRESS: 'EM ANÁLISE',
  RESOLVED: 'RESOLVIDO',
};

const statusBadgeClass: Record<TicketStatus, string> = {
  OPEN: 'bg-red-50 text-red-700 border-red-200',
  IN_PROGRESS: 'bg-amber-50 text-amber-700 border-amber-200',
  RESOLVED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const formatDateTime = (iso?: string) => {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const ErrorTicketsPage: React.FC<ErrorTicketsPageProps> = ({ currentUser }) => {
  const isSuperAdmin = String(currentUser?.role || '').toUpperCase() === Role.SUPERADMIN;
  const [tickets, setTickets] = useState<ErrorTicket[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'ALL' | TicketStatus>('ALL');
  const [updatingTicketId, setUpdatingTicketId] = useState<string | null>(null);

  const loadTickets = async () => {
    setLoading(true);
    try {
      const payload = await ApiService.getErrorTickets(statusFilter === 'ALL' ? {} : { status: statusFilter });
      setTickets(Array.isArray(payload) ? payload : []);
    } catch (error) {
      console.error('Erro ao carregar tickets:', error);
      alert(error instanceof Error ? error.message : 'Falha ao carregar tickets de erro');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTickets();
  }, [statusFilter]);

  const counts = useMemo(() => {
    return tickets.reduce(
      (acc, ticket) => {
        const key = String(ticket?.status || '').toUpperCase() as TicketStatus;
        if (key === 'OPEN' || key === 'IN_PROGRESS' || key === 'RESOLVED') {
          acc[key] += 1;
        }
        return acc;
      },
      { OPEN: 0, IN_PROGRESS: 0, RESOLVED: 0 }
    );
  }, [tickets]);

  const updateStatus = async (ticketId: string, status: TicketStatus) => {
    setUpdatingTicketId(ticketId);
    try {
      const resolutionNote = status === 'RESOLVED'
        ? `Resolvido por ${currentUser?.name || 'SUPERADMIN'} em ${new Date().toLocaleString('pt-BR')}`
        : '';
      await ApiService.updateErrorTicket(ticketId, {
        status,
        resolutionNote,
      });
      await loadTickets();
    } catch (error) {
      console.error('Erro ao atualizar status do ticket:', error);
      alert(error instanceof Error ? error.message : 'Falha ao atualizar ticket');
    } finally {
      setUpdatingTicketId(null);
    }
  };

  const removeAiPatch = async (ticketId: string) => {
    setUpdatingTicketId(ticketId);
    try {
      await ApiService.removeAiPatchFromTicket(ticketId);
      await loadTickets();
    } catch (error) {
      console.error('Erro ao remover patch IA:', error);
      alert(error instanceof Error ? error.message : 'Falha ao remover patch IA');
    } finally {
      setUpdatingTicketId(null);
    }
  };

  const validateHuman = async (ticketId: string) => {
    setUpdatingTicketId(ticketId);
    try {
      await ApiService.validateErrorTicketHuman(ticketId);
      await loadTickets();
    } catch (error) {
      console.error('Erro ao validar ticket manualmente:', error);
      alert(error instanceof Error ? error.message : 'Falha ao validar ticket manualmente');
    } finally {
      setUpdatingTicketId(null);
    }
  };

  if (!isSuperAdmin) {
    return <div className="p-6 text-sm font-bold text-red-600">Acesso restrito ao SUPERADMIN.</div>;
  }

  return (
    <div className="dash-shell space-y-4 p-4">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-red-600 text-white flex items-center justify-center">
            <AlertTriangle size={16} />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-zinc-100 uppercase tracking-tight">Ticket Erro</h1>
            <p className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-[0.16em]">
              Fila de erros enviados ao suporte técnico
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as 'ALL' | TicketStatus)}
            className="h-9 px-3 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-bold text-slate-700 dark:text-zinc-200 outline-none"
          >
            <option value="ALL">Todos os status</option>
            <option value="OPEN">Abertos</option>
            <option value="IN_PROGRESS">Em análise</option>
            <option value="RESOLVED">Resolvidos</option>
          </select>
          <button
            onClick={loadTickets}
            className="px-3 py-2 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[11px] font-black uppercase tracking-wider text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800 flex items-center gap-1.5"
          >
            <RefreshCw size={12} />
            Atualizar
          </button>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <MetricCard title="Abertos" value={String(counts.OPEN)} />
        <MetricCard title="Em análise" value={String(counts.IN_PROGRESS)} />
        <MetricCard title="Resolvidos" value={String(counts.RESOLVED)} />
      </section>

      <section className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-700 overflow-hidden">
        <div className="overflow-auto">
          <table className="w-full min-w-[1200px] text-xs">
            <thead className="bg-slate-50 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-3 py-2 text-left">Data</th>
                <th className="px-3 py-2 text-left">Erro</th>
                <th className="px-3 py-2 text-left">Usuário</th>
                <th className="px-3 py-2 text-left">Unidade</th>
                <th className="px-3 py-2 text-center">Status</th>
                <th className="px-3 py-2 text-center">Patch IA</th>
                <th className="px-3 py-2 text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket) => {
                const status = (String(ticket?.status || 'OPEN').toUpperCase() as TicketStatus);
                const patchActive = Boolean(ticket?.aiPatch?.active);
                const patchGeneratedByAi = Boolean(ticket?.patchAppliedByAi || ticket?.aiPatch);
                const isHumanValidated = String(ticket?.humanValidationStatus || '').toUpperCase() === 'APPROVED';
                const canResolve = !patchActive || isHumanValidated;
                return (
                  <tr key={ticket.id} className="border-b border-slate-100 dark:border-zinc-800 align-top">
                    <td className="px-3 py-3 font-bold text-slate-600 dark:text-zinc-300 whitespace-nowrap">{formatDateTime(ticket.createdAt)}</td>
                    <td className="px-3 py-3">
                      <p className="font-black text-slate-800 dark:text-zinc-100">{ticket.title || 'Erro no sistema'}</p>
                      <p className="font-bold text-slate-700 dark:text-zinc-200 mt-1">{ticket.message}</p>
                      {patchGeneratedByAi && (
                        <div className="mt-2 inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-indigo-700">
                          Correção por IA
                        </div>
                      )}
                      {ticket.details && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-[10px] font-black uppercase tracking-widest text-indigo-600">Detalhes técnicos</summary>
                          <pre className="mt-2 whitespace-pre-wrap break-words text-[11px] leading-5 text-slate-600 dark:text-zinc-300 bg-slate-50 dark:bg-zinc-800 rounded-md p-2 border border-slate-200 dark:border-zinc-700 max-h-40 overflow-auto">{ticket.details}</pre>
                        </details>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-black text-slate-800 dark:text-zinc-100">{ticket.userName || '-'}</p>
                      <p className="font-bold text-[10px] text-slate-500 dark:text-zinc-400">{ticket.userRole || '-'}</p>
                      <p className="font-bold text-[10px] text-slate-500 dark:text-zinc-400 mt-1">Origem: {ticket.source || '-'}</p>
                    </td>
                    <td className="px-3 py-3 font-bold text-slate-700 dark:text-zinc-200">{ticket.enterpriseName || ticket.enterpriseId || '-'}</td>
                    <td className="px-3 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${statusBadgeClass[status] || statusBadgeClass.OPEN}`}>
                        {statusLabel[status] || statusLabel.OPEN}
                      </span>
                      <p className="mt-2 text-[10px] font-black uppercase tracking-wider text-slate-500">
                        Validação: {isHumanValidated ? 'MANUAL OK' : 'PENDENTE'}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <div className="space-y-2">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${patchActive ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                          {patchActive ? 'ATIVO' : 'INATIVO'}
                        </span>
                        {patchGeneratedByAi && (
                          <div className="text-left rounded-md border border-indigo-100 bg-indigo-50 p-2">
                            <p className="text-[10px] font-black uppercase tracking-wider text-indigo-700">Patch temporário IA</p>
                            <p className="text-[11px] font-bold text-indigo-700 mt-1 break-words">{ticket?.aiPatch?.summary || 'Patch temporário aplicado automaticamente.'}</p>
                            {ticket?.aiPatch?.generatedBy && (
                              <p className="text-[10px] font-bold text-indigo-500 mt-1">Motor: {ticket.aiPatch.generatedBy}</p>
                            )}
                          </div>
                        )}
                        {patchGeneratedByAi && (
                          <button
                            onClick={() => removeAiPatch(ticket.id)}
                            disabled={updatingTicketId === ticket.id || !patchActive}
                            className="w-full px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wider border border-red-200 text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            REMOVER PATCH IA
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-center gap-1.5">
                        <StatusButton
                          label="Abrir"
                          disabled={updatingTicketId === ticket.id}
                          active={status === 'OPEN'}
                          onClick={() => updateStatus(ticket.id, 'OPEN')}
                        />
                        <StatusButton
                          label="Em análise"
                          disabled={updatingTicketId === ticket.id}
                          active={status === 'IN_PROGRESS'}
                          onClick={() => updateStatus(ticket.id, 'IN_PROGRESS')}
                        />
                        <StatusButton
                          label="Resolver"
                          disabled={updatingTicketId === ticket.id || !canResolve}
                          active={status === 'RESOLVED'}
                          onClick={() => updateStatus(ticket.id, 'RESOLVED')}
                          resolved
                        />
                        <StatusButton
                          label="Validar"
                          disabled={updatingTicketId === ticket.id || isHumanValidated}
                          active={isHumanValidated}
                          onClick={() => validateHuman(ticket.id)}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}

              {!loading && tickets.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-xs font-bold text-slate-500 dark:text-zinc-400">
                    Nenhum ticket encontrado para o filtro selecionado.
                  </td>
                </tr>
              )}

              {loading && (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-xs font-bold text-slate-500 dark:text-zinc-400">
                    Carregando tickets...
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

const StatusButton = ({
  label,
  disabled,
  active,
  onClick,
  resolved,
}: {
  label: string;
  disabled?: boolean;
  active?: boolean;
  resolved?: boolean;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    disabled={disabled || active}
    className={`px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wider border transition-colors ${
      resolved
        ? (active
          ? 'bg-emerald-100 border-emerald-300 text-emerald-700'
          : 'bg-white border-emerald-200 text-emerald-700 hover:bg-emerald-50')
        : (active
          ? 'bg-indigo-100 border-indigo-300 text-indigo-700'
          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50')
    } disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-1`}
  >
    <Send size={10} />
    {label}
  </button>
);

export default ErrorTicketsPage;
