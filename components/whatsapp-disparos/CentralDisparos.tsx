import React, { useState } from 'react';
import { Enterprise } from '../../types';
import DisparoUnicoForm from './DisparoUnicoForm';
import DisparoEmMassaDefault, { DisparoEmMassa as DisparoEmMassaNamed } from './DisparoEmMassa';
import PerfilDisparoTab from './PerfilDisparoTab';
import { DispatchAutomationConfig } from './types';

type CentralDisparosProps = {
  activeEnterprise: Enterprise | null;
};

type DisparosTab = 'DISPARO_UNICO' | 'DISPARO_MASSA' | 'PERFIL_DISPARO';

const CentralDisparos: React.FC<CentralDisparosProps> = ({ activeEnterprise }) => {
  const [activeSubTab, setActiveSubTab] = useState<DisparosTab>('DISPARO_UNICO');
  const [profileToEdit, setProfileToEdit] = useState<DispatchAutomationConfig | null>(null);
  const DisparoEmMassa = DisparoEmMassaDefault || DisparoEmMassaNamed;

  return (
    <div className="space-y-4">
      <div className="rounded-[22px] border border-slate-200 dark:border-zinc-700 bg-[linear-gradient(135deg,rgba(255,255,255,1),rgba(255,247,237,0.95))] dark:bg-zinc-900 p-4 shadow-[0_12px_30px_-24px_rgba(15,23,42,0.7)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-orange-700 dark:text-orange-300">Central de Disparos</p>
            <p className="text-sm font-semibold text-slate-600 dark:text-zinc-300">Escolha uma rotina para enviar ou gerenciar campanhas.</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveSubTab('DISPARO_UNICO')}
            className={`px-4 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-[0.14em] border transition-all ${
              activeSubTab === 'DISPARO_UNICO'
                ? 'border-transparent bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-[0_8px_20px_-12px_rgba(249,115,22,0.9)]'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
            }`}
          >
            Disparo Único
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('DISPARO_MASSA')}
            className={`px-4 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-[0.14em] border transition-all ${
              activeSubTab === 'DISPARO_MASSA'
                ? 'border-transparent bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-[0_8px_20px_-12px_rgba(249,115,22,0.9)]'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
            }`}
          >
            Disparo Recorrente
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('PERFIL_DISPARO')}
            className={`px-4 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-[0.14em] border transition-all ${
              activeSubTab === 'PERFIL_DISPARO'
                ? 'border-transparent bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-[0_8px_20px_-12px_rgba(249,115,22,0.9)]'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
            }`}
          >
            Perfil Disparo
          </button>
        </div>
      </div>

      {activeSubTab === 'DISPARO_UNICO' && <DisparoUnicoForm />}
      {activeSubTab === 'DISPARO_MASSA' && (
        <DisparoEmMassa
          activeEnterprise={activeEnterprise}
          profileToEdit={profileToEdit}
          onProfileLoaded={() => setProfileToEdit(null)}
        />
      )}
      {activeSubTab === 'PERFIL_DISPARO' && (
        <PerfilDisparoTab
          activeEnterprise={activeEnterprise}
          onEditProfile={(profile) => {
            setProfileToEdit(profile);
            setActiveSubTab('DISPARO_MASSA');
          }}
        />
      )}
    </div>
  );
};

export default CentralDisparos;
