import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Edit3, Pause, Play, RefreshCw, Trash2 } from 'lucide-react';
import { Enterprise } from '../../types';
import ApiService from '../../services/api';
import { DispatchAutomationConfig } from './types';

type PerfilDisparoTabProps = {
  activeEnterprise: Enterprise | null;
  onEditProfile: (profile: DispatchAutomationConfig) => void;
};

const formatFrequency = (value: DispatchAutomationConfig['frequencia']) => {
  if (value === 'quinzenal') return 'Quinzenal';
  if (value === 'mensal') return 'Mensal';
  return 'Semanal';
};

const formatPeriod = (value: DispatchAutomationConfig['periodMode']) => {
  if (value === 'DESTA_SEMANA') return 'Desta semana';
  if (value === 'QUINZENAL') return 'Quinzenal';
  if (value === 'MENSAL') return 'Mensal';
  return 'Semanal';
};

const formatWeekday = (value?: string) => {
  const day = String(value || '').toUpperCase();
  if (day === 'DOMINGO') return 'Domingo';
  if (day === 'SEGUNDA') return 'Segunda';
  if (day === 'TERCA') return 'Terça';
  if (day === 'QUARTA') return 'Quarta';
  if (day === 'QUINTA') return 'Quinta';
  if (day === 'SEXTA') return 'Sexta';
  if (day === 'SABADO') return 'Sábado';
  return '';
};

const formatProfileType = (value: DispatchAutomationConfig['profileType']) => (
  value === 'COLABORADOR' ? 'Colaborador' : 'Responsável/Parentesco'
);

const formatSendMode = (profile: DispatchAutomationConfig) => {
  const mode = String(profile.sendMode || 'TEXT_ONLY').toUpperCase();
  if (mode === 'TEXT_AND_REPORT_PDF') return 'Texto + PDF automático';
  if (mode === 'TEXT_AND_UPLOAD_PDF') {
    return profile.uploadPdfAttachment?.base64Data
      ? 'Texto + PDF upload'
      : 'Texto + PDF upload (sem arquivo)';
  }
  return 'Apenas texto';
};

const resolveSendModeBadge = (profile: DispatchAutomationConfig) => {
  const mode = String(profile.sendMode || 'TEXT_ONLY').toUpperCase();
  if (mode === 'TEXT_AND_REPORT_PDF') {
    return {
      label: 'Texto + PDF automático',
      className: 'bg-indigo-50 text-indigo-700',
    };
  }

  if (mode === 'TEXT_AND_UPLOAD_PDF') {
    const hasPdf = Boolean(profile.uploadPdfAttachment?.base64Data);
    return {
      label: hasPdf ? 'Texto + PDF upload' : 'Texto + PDF upload (sem arquivo)',
      className: hasPdf ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700',
    };
  }

  return {
    label: 'Apenas texto',
    className: 'bg-orange-50 text-orange-700',
  };
};

const resolveDispatchOperationalStatus = (profile: DispatchAutomationConfig) => {
  if (String(profile.dispatchRuntimeStatus || '').toUpperCase() === 'EM_DISPARO') {
    return {
      label: 'EM DISPARO',
      className: 'bg-rose-50 text-rose-700',
    };
  }

  if (Boolean(profile.paused)) {
    return {
      label: 'APENAS SALVO',
      className: 'bg-slate-100 text-slate-700',
    };
  }

  return {
    label: 'ATIVO AGENDADO',
    className: 'bg-emerald-50 text-emerald-700',
  };
};

const PerfilDisparoTab: React.FC<PerfilDisparoTabProps> = ({ activeEnterprise, onEditProfile }) => {
  const [profiles, setProfiles] = useState<DispatchAutomationConfig[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState('');

  const loadProfiles = useCallback(async () => {
    if (!activeEnterprise?.id) {
      setProfiles([]);
      setFeedback('Selecione uma unidade para gerenciar perfis.');
      return;
    }

    setIsLoading(true);
    try {
      const response = await ApiService.getWhatsAppDispatchProfiles(activeEnterprise.id);
      const list = Array.isArray(response?.profiles) ? response.profiles : [];
      setProfiles(list);
      if (list.length === 0) {
        setFeedback('Nenhum perfil salvo ainda.');
      } else {
        setFeedback('');
      }
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Falha ao carregar perfis.');
      setProfiles([]);
    } finally {
      setIsLoading(false);
    }
  }, [activeEnterprise?.id]);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  const handlePauseToggle = async (profile: DispatchAutomationConfig) => {
    if (!activeEnterprise?.id) return;

    try {
      await ApiService.updateWhatsAppDispatchProfileStatus({
        enterpriseId: activeEnterprise.id,
        profileId: profile.id,
        paused: !Boolean(profile.paused),
      });
      setFeedback(Boolean(profile.paused) ? 'Perfil reativado com sucesso.' : 'Perfil pausado com sucesso.');
      await loadProfiles();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Falha ao atualizar status do perfil.');
    }
  };

  const handleDelete = async (profile: DispatchAutomationConfig) => {
    if (!activeEnterprise?.id) return;

    const ok = window.confirm(`Deseja realmente apagar o perfil "${profile.nome_perfil}"?`);
    if (!ok) return;

    try {
      await ApiService.deleteWhatsAppDispatchProfile({
        enterpriseId: activeEnterprise.id,
        profileId: profile.id,
      });
      setFeedback('Perfil apagado com sucesso.');
      await loadProfiles();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Falha ao apagar perfil.');
    }
  };

  const orderedProfiles = useMemo(
    () => [...profiles].sort((a, b) => {
      const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return bTime - aTime;
    }),
    [profiles]
  );

  return (
    <div className="space-y-4">
      <section className="rounded-[24px] border border-slate-200 dark:border-zinc-700 bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(255,247,237,0.72))] dark:bg-zinc-900 p-5 space-y-4 shadow-[0_16px_38px_-28px_rgba(15,23,42,0.6)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-lg font-black text-slate-900 dark:text-zinc-100">Perfil Disparo</h4>
            <p className="text-sm font-semibold text-slate-600 dark:text-zinc-400">
              Gerencie todos os perfis salvos de disparo: editar, pausar/reativar e apagar.
            </p>
          </div>
          <button
            type="button"
            onClick={loadProfiles}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-60 text-slate-700 text-xs font-black uppercase tracking-widest"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            Atualizar
          </button>
        </div>

        {isLoading ? (
          <p className="text-sm font-semibold text-slate-500 dark:text-zinc-400">Carregando perfis...</p>
        ) : orderedProfiles.length === 0 ? (
          <p className="text-sm font-semibold text-slate-500 dark:text-zinc-400">
            {feedback || 'Nenhum perfil salvo ainda.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-zinc-800 text-left">
                  <th className="py-2 pr-4 text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400">Nome</th>
                  <th className="py-2 pr-4 text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400">Perfil</th>
                  <th className="py-2 pr-4 text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400">Frequência</th>
                  <th className="py-2 pr-4 text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400">Hora</th>
                  <th className="py-2 pr-4 text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400">Modo de envio</th>
                  <th className="py-2 pr-4 text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400">Status</th>
                  <th className="py-2 pr-4 text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400">Status Disparo</th>
                  <th className="py-2 pr-4 text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400">Atualizado</th>
                  <th className="py-2 pr-4 text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400">Ações</th>
                </tr>
              </thead>
              <tbody>
                {orderedProfiles.map((profile) => {
                  const operationalStatus = resolveDispatchOperationalStatus(profile);
                  const sendModeBadge = resolveSendModeBadge(profile);
                  return (
                  <tr key={profile.id} className="border-b border-slate-100 dark:border-zinc-800">
                    <td className="py-2 pr-4 font-semibold text-slate-800 dark:text-zinc-100">{profile.nome_perfil || 'Sem nome'}</td>
                    <td className="py-2 pr-4 font-semibold text-slate-700 dark:text-zinc-200">{formatProfileType(profile.profileType)}</td>
                    <td className="py-2 pr-4 font-semibold text-slate-700 dark:text-zinc-200">
                      {formatFrequency(profile.frequencia)} ({formatPeriod(profile.periodMode)})
                    </td>
                    <td className="py-2 pr-4 font-semibold text-slate-700 dark:text-zinc-200">
                      {profile.periodMode === 'DESTA_SEMANA'
                        ? `${formatWeekday(profile.agendamento?.dia_semana) || '-'} • ${profile.agendamento?.hora_semanal || profile.agendamento?.hora || '-'}`
                        : (profile.agendamento?.hora || '-')}
                    </td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-1 rounded-full text-[11px] font-black ${sendModeBadge.className}`}>
                        {sendModeBadge.label}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      <span
                        className={`px-2 py-1 rounded-full text-[11px] font-black ${
                          profile.paused ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
                        }`}
                      >
                        {profile.paused ? 'Pausado' : 'Ativo'}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-1 rounded-full text-[11px] font-black ${operationalStatus.className}`}>
                        {operationalStatus.label}
                      </span>
                    </td>
                    <td className="py-2 pr-4 font-semibold text-slate-600 dark:text-zinc-300">
                      {new Date(profile.updatedAt || profile.createdAt || Date.now()).toLocaleString('pt-BR')}
                    </td>
                    <td className="py-2 pr-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onEditProfile(profile)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-orange-200 bg-orange-50 hover:bg-orange-100 text-orange-700 text-[11px] font-black uppercase tracking-widest"
                        >
                          <Edit3 size={12} />
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePauseToggle(profile)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-700 text-[11px] font-black uppercase tracking-widest"
                        >
                          {profile.paused ? <Play size={12} /> : <Pause size={12} />}
                          {profile.paused ? 'Ativar' : 'Pausar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(profile)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-black uppercase tracking-widest"
                        >
                          <Trash2 size={12} />
                          Apagar
                        </button>
                      </div>
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        )}

        {orderedProfiles.length > 0 && feedback && (
          <p className="text-sm font-semibold text-orange-700 dark:text-orange-300">{feedback}</p>
        )}
      </section>
    </div>
  );
};

export default PerfilDisparoTab;
