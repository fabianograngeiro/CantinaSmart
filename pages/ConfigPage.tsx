
import React from 'react';
import { Settings, Shield, Bell, Smartphone, Globe, Mail, Save, Clock, History } from 'lucide-react';

const ConfigPage: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-800 tracking-tight">Configurações Gerais</h1>
          <p className="text-gray-500 text-sm">Personalize as regras e integrações do seu sistema.</p>
        </div>
        <button className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg flex items-center gap-2">
          <Save size={20} /> Salvar Alterações
        </button>
      </div>

      <div className="space-y-4">
        {/* Parametros Financeiros */}
        <section className="bg-white rounded-2xl border shadow-sm p-6">
           <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
             <Settings size={20} className="text-indigo-600" /> Parâmetros de Venda
           </h3>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1">
                 <label className="text-xs font-black text-gray-400 uppercase">Limite Diário Padrão</label>
                 <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">R$</span>
                    <input type="number" defaultValue="50.00" className="w-full pl-10 pr-4 py-2 bg-gray-50 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
                 </div>
              </div>
              <div className="space-y-1">
                 <label className="text-xs font-black text-gray-400 uppercase">Aviso de Saldo Baixo</label>
                 <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">R$</span>
                    <input type="number" defaultValue="20.00" className="w-full pl-10 pr-4 py-2 bg-gray-50 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
                 </div>
              </div>
           </div>
        </section>

        {/* Pré-venda e Hold */}
        <section className="bg-white rounded-2xl border shadow-sm p-6">
           <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
             <History size={20} className="text-indigo-600" /> Pré-vendas e Hold
           </h3>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1">
                 <label className="text-xs font-black text-gray-400 uppercase">Tempo para Expiração (Minutos)</label>
                 <div className="relative">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <input type="number" defaultValue="30" className="w-full pl-10 pr-4 py-2 bg-gray-50 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
                 </div>
              </div>
           </div>
        </section>

        {/* Notificações */}
        <section className="bg-white rounded-2xl border shadow-sm p-6">
           <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
             <Bell size={20} className="text-indigo-600" /> Notificações em Tempo Real
           </h3>
           <div className="space-y-4">
              <ToggleRow 
                icon={<Smartphone className="text-gray-400" size={18} />} 
                title="WhatsApp (Webhooks)" 
                desc="Enviar comprovante de consumo instantâneo para responsáveis via WhatsApp."
                active={true}
              />
              <ToggleRow 
                icon={<Mail className="text-gray-400" size={18} />} 
                title="E-mail" 
                desc="Relatório semanal de consumo e avisos de saldo crítico."
                active={true}
              />
           </div>
        </section>

        {/* Auditoria */}
        <section className="bg-white rounded-2xl border shadow-sm p-6">
           <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
             <Shield size={20} className="text-indigo-600" /> Auditoria e Segurança
           </h3>
           <div className="bg-gray-50 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between text-sm">
                 <div className="flex items-center gap-2">
                    <Clock size={16} className="text-gray-400" />
                    <span className="text-gray-600">Backup Automático Diário</span>
                 </div>
                 <span className="text-green-600 font-bold">ATIVO (03:00)</span>
              </div>
              <button className="w-full py-2 bg-white border text-gray-600 rounded-lg text-xs font-bold hover:bg-gray-50 uppercase tracking-widest">
                VER LOGS DE AUDITORIA (LIVRO RAZÃO)
              </button>
           </div>
        </section>
      </div>
    </div>
  );
};

const ToggleRow = ({ icon, title, desc, active }: any) => (
  <div className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
    <div className="flex items-start gap-3">
       <div className="mt-1">{icon}</div>
       <div>
          <p className="text-sm font-bold text-gray-800">{title}</p>
          <p className="text-[11px] text-gray-500 leading-tight">{desc}</p>
       </div>
    </div>
    <div className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${active ? 'bg-indigo-600' : 'bg-gray-300'}`}>
       <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${active ? 'right-0.5' : 'left-0.5'}`}></div>
    </div>
  </div>
);

export default ConfigPage;
