import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Eye, Plus, CheckCircle, MessageCircle, Search } from 'lucide-react';
import ApiService from '../services/api';

interface Contestation {
  id: string;
  clientName: string;
  clientId: string;
  subject: string;
  description: string;
  type: 'saldo' | 'transacao' | 'taxa' | 'outro';
  status: 'pendente' | 'em_analise' | 'resolvido' | 'rejeitado';
  amount?: number;
  createdAt: string;
  resolvedAt?: string;
  resolution?: string;
  priority: 'baixa' | 'media' | 'alta' | 'critica';
}

const normalizeStatus = (value: unknown): Contestation['status'] => {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'PENDENTE') return 'pendente';
  if (normalized === 'EM_ANALISE') return 'em_analise';
  if (normalized === 'RESOLVIDO') return 'resolvido';
  if (normalized === 'REJEITADO') return 'rejeitado';
  return 'pendente';
};

const normalizePriority = (value: unknown): Contestation['priority'] => {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'BAIXA') return 'baixa';
  if (normalized === 'MEDIA') return 'media';
  if (normalized === 'ALTA') return 'alta';
  if (normalized === 'CRITICA') return 'critica';
  return 'media';
};

const normalizeType = (value: unknown): Contestation['type'] => {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'SALDO') return 'saldo';
  if (normalized === 'TRANSACAO' || normalized === 'TRANSAÇÃO') return 'transacao';
  if (normalized === 'TAXA') return 'taxa';
  return 'outro';
};

const toApiStatus = (value: Contestation['status']) => {
  if (value === 'pendente') return 'PENDENTE';
  if (value === 'em_analise') return 'EM_ANALISE';
  if (value === 'resolvido') return 'RESOLVIDO';
  return 'REJEITADO';
};

const mapApiContestation = (entry: any): Contestation => ({
  id: String(entry?.id || '').trim(),
  clientName: String(entry?.clientName || 'Cliente').trim(),
  clientId: String(entry?.clientId || '').trim(),
  subject: String(entry?.subject || 'Sem assunto').trim(),
  description: String(entry?.description || '').trim(),
  type: normalizeType(entry?.type),
  status: normalizeStatus(entry?.status),
  amount: Number(entry?.amount || 0) || 0,
  createdAt: String(entry?.createdAt || new Date().toISOString()).trim(),
  resolvedAt: String(entry?.resolvedAt || '').trim() || undefined,
  resolution: String(entry?.resolution || entry?.resolutionNote || '').trim() || undefined,
  priority: normalizePriority(entry?.priority),
});

const ContestationsPage: React.FC = () => {
  const [contestations, setContestations] = useState<Contestation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingStatus, setIsSavingStatus] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('todos');
  const [selectedPriority, setSelectedPriority] = useState<string>('todos');
  const [selectedContestation, setSelectedContestation] = useState<Contestation | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  const loadContestations = async () => {
    try {
      setIsLoading(true);
      setErrorMessage('');
      const result = await ApiService.getContestacoes();
      const mapped = Array.isArray(result) ? result.map(mapApiContestation) : [];
      setContestations(mapped);
      if (selectedContestation?.id) {
        const refreshed = mapped.find((item) => item.id === selectedContestation.id) || null;
        setSelectedContestation(refreshed);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao carregar contestacoes.';
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadContestations();
  }, []);

  const filteredContestations = useMemo(() => contestations.filter((c) => {
    const matchesSearch = c.clientName.toLowerCase().includes(searchTerm.toLowerCase())
      || c.subject.toLowerCase().includes(searchTerm.toLowerCase())
      || c.description.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = selectedStatus === 'todos' || c.status === selectedStatus;
    const matchesPriority = selectedPriority === 'todos' || c.priority === selectedPriority;

    return matchesSearch && matchesStatus && matchesPriority;
  }), [contestations, searchTerm, selectedStatus, selectedPriority]);

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { bg: string; text: string; label: string }> = {
      pendente: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-800 dark:text-yellow-300', label: 'Pendente' },
      em_analise: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-800 dark:text-blue-300', label: 'Em Analise' },
      resolvido: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-800 dark:text-green-300', label: 'Resolvido' },
      rejeitado: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-800 dark:text-red-300', label: 'Rejeitado' },
    };
    const badge = badges[status] || badges.pendente;
    return (
      <span className={`px-3 py-1 rounded-full text-[11px] font-bold ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    );
  };

  const getPriorityBadge = (priority: string) => {
    const badges: Record<string, { bg: string; text: string; label: string }> = {
      baixa: { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-800 dark:text-slate-300', label: 'Baixa' },
      media: { bg: 'bg-cyan-100 dark:bg-cyan-900/30', text: 'text-cyan-800 dark:text-cyan-300', label: 'Media' },
      alta: { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-800 dark:text-orange-300', label: 'Alta' },
      critica: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-800 dark:text-red-300', label: 'Critica' },
    };
    const badge = badges[priority] || badges.media;
    return (
      <span className={`px-3 py-1 rounded-full text-[11px] font-bold ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    );
  };

  const getTypeLabel = (type: string) => {
    const types: Record<string, string> = {
      saldo: 'Saldo',
      transacao: 'Transacao',
      taxa: 'Taxa',
      outro: 'Outro',
    };
    return types[type] || type;
  };

  const handleStatusChange = async (id: string, newStatus: Contestation['status']) => {
    try {
      setIsSavingStatus(true);
      setErrorMessage('');
      const updated = await ApiService.updateContestation(id, { status: toApiStatus(newStatus) });
      const mappedUpdated = mapApiContestation(updated);
      setContestations((prev) => prev.map((item) => (item.id === id ? mappedUpdated : item)));
      setSelectedContestation((prev) => (prev && prev.id === id ? mappedUpdated : prev));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao atualizar status da contestacao.';
      setErrorMessage(message);
    } finally {
      setIsSavingStatus(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-zinc-900 dark:to-zinc-800 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl md:text-4xl font-black text-slate-900 dark:text-white flex items-center gap-3">
              <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-xl">
                <AlertTriangle size={28} className="text-red-600 dark:text-red-400" />
              </div>
              Contestacoes
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mt-2">
              Gerenciar contestacoes recebidas pelo portal do cliente
            </p>
          </div>
          <button
            className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all shadow-lg disabled:opacity-60"
            onClick={loadContestations}
            disabled={isLoading}
          >
            <Plus size={20} />
            Atualizar
          </button>
        </div>

        {errorMessage && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
            {errorMessage}
          </div>
        )}

        <div className="bg-white dark:bg-zinc-800 rounded-xl shadow-sm p-6 mb-8 border border-slate-200 dark:border-white/5">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-2">
                Buscar
              </label>
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cliente, assunto..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-300 dark:border-white/10 rounded-lg bg-white dark:bg-zinc-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-2">
                Status
              </label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-300 dark:border-white/10 rounded-lg bg-white dark:bg-zinc-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-indigo-500"
              >
                <option value="todos">Todos</option>
                <option value="pendente">Pendente</option>
                <option value="em_analise">Em Analise</option>
                <option value="resolvido">Resolvido</option>
                <option value="rejeitado">Rejeitado</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-2">
                Prioridade
              </label>
              <select
                value={selectedPriority}
                onChange={(e) => setSelectedPriority(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-300 dark:border-white/10 rounded-lg bg-white dark:bg-zinc-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-indigo-500"
              >
                <option value="todos">Todas</option>
                <option value="baixa">Baixa</option>
                <option value="media">Media</option>
                <option value="alta">Alta</option>
                <option value="critica">Critica</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-2">
                Total: {filteredContestations.length}
              </label>
              <div className="px-4 py-2.5 bg-slate-100 dark:bg-zinc-700 rounded-lg text-slate-700 dark:text-slate-300 font-bold text-center">
                {filteredContestations.length} contestacao(oes)
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-800 rounded-xl shadow-sm border border-slate-200 dark:border-white/5 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-zinc-900 border-b border-slate-200 dark:border-white/5">
                <tr>
                  <th className="px-6 py-3 text-left text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-wide">Cliente</th>
                  <th className="px-6 py-3 text-left text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-wide">Assunto</th>
                  <th className="px-6 py-3 text-left text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-wide">Tipo</th>
                  <th className="px-6 py-3 text-left text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-wide">Status</th>
                  <th className="px-6 py-3 text-left text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-wide">Prioridade</th>
                  <th className="px-6 py-3 text-left text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-wide">Data</th>
                  <th className="px-6 py-3 text-center text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-wide">Acoes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-white/5">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center">
                      <p className="text-slate-600 dark:text-slate-400 font-semibold">Carregando contestacoes...</p>
                    </td>
                  </tr>
                ) : filteredContestations.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center">
                      <AlertTriangle size={40} className="mx-auto text-slate-300 dark:text-slate-700 mb-4" />
                      <p className="text-slate-600 dark:text-slate-400 font-semibold">Nenhuma contestacao encontrada</p>
                    </td>
                  </tr>
                ) : (
                  filteredContestations.map((contestation) => (
                    <tr key={contestation.id} className="hover:bg-slate-50 dark:hover:bg-zinc-700 transition-colors">
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white">{contestation.clientName}</p>
                          <p className="text-[11px] text-slate-500">{contestation.clientId}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-semibold text-slate-900 dark:text-white max-w-xs truncate">{contestation.subject}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-3 py-1 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-[10px] font-bold">
                          {getTypeLabel(contestation.type)}
                        </span>
                      </td>
                      <td className="px-6 py-4">{getStatusBadge(contestation.status)}</td>
                      <td className="px-6 py-4">{getPriorityBadge(contestation.priority)}</td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-slate-700 dark:text-slate-300">
                          {new Date(contestation.createdAt).toLocaleDateString('pt-BR')}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {new Date(contestation.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => {
                              setSelectedContestation(contestation);
                              setShowDetail(true);
                            }}
                            className="p-2 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400 transition-all"
                            title="Visualizar detalhes"
                          >
                            <Eye size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showDetail && selectedContestation && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-800 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white p-6 border-b border-indigo-700">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-2xl font-black mb-1">{selectedContestation.subject}</h2>
                  <p className="text-indigo-100">Contestacao #{selectedContestation.id}</p>
                </div>
                <button onClick={() => setShowDetail(false)} className="text-white hover:bg-white/20 rounded-lg p-2 transition-all">X</button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Cliente</label>
                  <p className="text-lg font-bold text-slate-900 dark:text-white mt-1">{selectedContestation.clientName}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{selectedContestation.clientId}</p>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Tipo</label>
                  <p className="text-lg font-bold text-slate-900 dark:text-white mt-1">{getTypeLabel(selectedContestation.type)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Status</label>
                  <div className="mt-2 space-y-2">
                    {getStatusBadge(selectedContestation.status)}
                    <select
                      value={selectedContestation.status}
                      onChange={(e) => handleStatusChange(selectedContestation.id, e.target.value as Contestation['status'])}
                      disabled={isSavingStatus}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-white/10 rounded-lg bg-white dark:bg-zinc-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-indigo-500"
                    >
                      <option value="pendente">Pendente</option>
                      <option value="em_analise">Em Analise</option>
                      <option value="resolvido">Resolvido</option>
                      <option value="rejeitado">Rejeitado</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Prioridade</label>
                  <div className="mt-2">{getPriorityBadge(selectedContestation.priority)}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pb-4 border-b border-slate-200 dark:border-white/5">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Data de Criacao</label>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white mt-1">
                    {new Date(selectedContestation.createdAt).toLocaleDateString('pt-BR', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                {selectedContestation.resolvedAt && (
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Data de Resolucao</label>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white mt-1">
                      {new Date(selectedContestation.resolvedAt).toLocaleDateString('pt-BR', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Descricao</label>
                <div className="mt-3 p-4 bg-slate-50 dark:bg-zinc-700 rounded-lg border border-slate-200 dark:border-white/5">
                  <p className="text-slate-900 dark:text-white leading-relaxed">{selectedContestation.description}</p>
                </div>
              </div>

              {selectedContestation.amount ? (
                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Valor</label>
                  <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-2">R$ {selectedContestation.amount.toFixed(2)}</p>
                </div>
              ) : null}

              {selectedContestation.resolution && (
                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide flex items-center gap-2">
                    <CheckCircle size={14} />
                    Resolucao
                  </label>
                  <div className="mt-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-900/30">
                    <p className="text-green-900 dark:text-green-300 leading-relaxed">{selectedContestation.resolution}</p>
                  </div>
                </div>
              )}

              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide flex items-center gap-2">
                  <MessageCircle size={14} />
                  Comentario interno
                </label>
                <div className="mt-3 space-y-3">
                  <textarea
                    placeholder="Campo visual por enquanto. Persistencia sera ligada no proximo passo."
                    className="w-full px-4 py-3 border border-slate-300 dark:border-white/10 rounded-lg bg-white dark:bg-zinc-700 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 resize-none"
                    rows={3}
                  />
                </div>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-zinc-900 border-t border-slate-200 dark:border-white/5 px-6 py-4 flex justify-end gap-3">
              <button
                onClick={() => setShowDetail(false)}
                className="px-6 py-2.5 border border-slate-300 dark:border-white/10 rounded-lg font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-all"
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

export default ContestationsPage;
