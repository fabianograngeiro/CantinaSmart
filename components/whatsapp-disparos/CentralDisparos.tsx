import React, { useState } from 'react';
import { Enterprise } from '../../types';
import DisparoUnicoForm from './DisparoUnicoForm';
import DisparoEmMassa from './DisparoEmMassa';

type CentralDisparosProps = {
  activeEnterprise: Enterprise | null;
};

type DisparosTab = 'DISPARO_UNICO' | 'DISPARO_MASSA';

const CentralDisparos: React.FC<CentralDisparosProps> = ({ activeEnterprise }) => {
  const [activeSubTab, setActiveSubTab] = useState<DisparosTab>('DISPARO_UNICO');

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-cyan-100 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveSubTab('DISPARO_UNICO')}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest ${
              activeSubTab === 'DISPARO_UNICO'
                ? 'bg-gradient-to-r from-cyan-500 to-teal-500 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Disparo Único
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('DISPARO_MASSA')}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest ${
              activeSubTab === 'DISPARO_MASSA'
                ? 'bg-gradient-to-r from-cyan-500 to-teal-500 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Disparo em Massa
          </button>
        </div>
      </div>

      {activeSubTab === 'DISPARO_UNICO' && <DisparoUnicoForm />}
      {activeSubTab === 'DISPARO_MASSA' && <DisparoEmMassa activeEnterprise={activeEnterprise} />}
    </div>
  );
};

export default CentralDisparos;
