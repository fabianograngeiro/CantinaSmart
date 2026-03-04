
import React, { useState } from 'react';
import { 
  ReceiptText, 
  Search, 
  Calendar, 
  ArrowUpRight, 
  ArrowDownRight, 
  Smartphone, 
  CreditCard, 
  Wallet, 
  DollarSign, 
  MoreVertical,
  Undo2,
  Eye,
  ChevronRight,
  User as UserIcon,
  UserMinus,
  Banknote
} from 'lucide-react';

const TodaySalesPage: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');

  const mockTodaySales = [
    { id: 'V89201', time: '10:45', client: 'Pedro Silva', total: 24.50, method: 'SALDO', status: 'CONCLUÍDA', items: 3 },
    { id: 'V89202', time: '10:42', client: 'Consumidor Final', total: 12.00, method: 'PIX', status: 'CONCLUÍDA', items: 1 },
    { id: 'V89203', time: '10:38', client: 'Ana Souza', total: 45.90, method: 'DINHEIRO', status: 'CONCLUÍDA', items: 2 },
    { id: 'V89204', time: '10:30', client: 'Consumidor Final', total: 8.50, method: 'DEBITO', status: 'CONCLUÍDA', items: 1 },
    { id: 'V89205', time: '10:15', client: 'Marcos (Docente)', total: 110.00, method: 'CREDITO', status: 'CONCLUÍDA', items: 4 },
    { id: 'V89206', time: '09:50', client: 'Pedro Silva', total: 7.50, method: 'SALDO', status: 'ESTORNADA', items: 1 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-800 tracking-tight flex items-center gap-2">
            <ReceiptText className="text-indigo-600" size={28} /> Vendas do Dia
          </h1>
          <p className="text-gray-500 text-sm">Resumo operacional de hoje, {new Date().toLocaleDateString('pt-BR')}</p>
        </div>
        <div className="flex items-center gap-2 bg-white p-1 rounded-xl shadow-sm border">
           <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold shadow-md">Hoje</button>
           <button className="px-4 py-2 text-gray-500 hover:bg-gray-50 rounded-lg text-xs font-bold transition-all">Exportar Log</button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryTile label="Total Bruto" value="R$ 248,40" color="text-indigo-600" icon={<DollarSign size={20}/>} />
        <SummaryTile label="Transações" value="42" color="text-emerald-600" icon={<ArrowUpRight size={20}/>} />
        <SummaryTile label="Faturamento Médio" value="R$ 38,91" color="text-blue-600" icon={<ArrowUpRight size={20}/>} />
        <SummaryTile label="Estornos" value="1" color="text-red-600" icon={<ArrowDownRight size={20}/>} />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b flex flex-col md:flex-row gap-4 bg-gray-50/50">
          <div className="relative flex-1">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
             <input 
               type="text" 
               placeholder="Pesquisar venda por ID ou cliente..." 
               className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-4 focus:ring-indigo-50 focus:border-indigo-400 outline-none transition-all text-sm font-bold"
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
             />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-gray-400 uppercase text-[10px] font-black tracking-widest border-b">
              <tr>
                <th className="px-6 py-4">ID / Hora</th>
                <th className="px-6 py-4">Cliente</th>
                <th className="px-6 py-4">Pagamento</th>
                <th className="px-6 py-4">Valor Total</th>
                <th className="px-6 py-4 text-center">Itens</th>
                <th className="px-6 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {mockTodaySales.map(sale => (
                <tr key={sale.id} className={`hover:bg-indigo-50/30 transition-colors ${sale.status === 'ESTORNADA' ? 'opacity-50 grayscale bg-red-50/20' : ''}`}>
                  <td className="px-6 py-4">
                    <p className="font-mono text-[11px] font-black text-indigo-600">{sale.id}</p>
                    <p className="text-[10px] text-gray-400 font-bold">{sale.time}</p>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {sale.client === 'Consumidor Final' ? (
                        <div className="p-1.5 bg-gray-100 rounded-lg text-gray-400"><UserMinus size={14} /></div>
                      ) : (
                        <div className="p-1.5 bg-indigo-50 rounded-lg text-indigo-500"><UserIcon size={14} /></div>
                      )}
                      <span className={`text-sm font-bold ${sale.client === 'Consumidor Final' ? 'text-gray-500 italic' : 'text-gray-800'}`}>
                        {sale.client}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                       {sale.method === 'SALDO' && <Wallet size={14} className="text-indigo-600" />}
                       {sale.method === 'PIX' && <Smartphone size={14} className="text-emerald-600" />}
                       {sale.method === 'DINHEIRO' && <Banknote size={14} className="text-amber-600" />}
                       {(sale.method === 'DEBITO' || sale.method === 'CREDITO') && <CreditCard size={14} className="text-blue-600" />}
                       <span className="text-[10px] font-black uppercase tracking-widest text-gray-600">{sale.method}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className={`text-sm font-black ${sale.status === 'ESTORNADA' ? 'text-red-600 line-through' : 'text-gray-900'}`}>
                      R$ {sale.total.toFixed(2)}
                    </p>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="px-2 py-0.5 bg-gray-100 rounded-full text-[10px] font-black text-gray-500">
                      {sale.items} UN
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button className="p-2 text-gray-400 hover:bg-white rounded-lg transition-all" title="Ver Detalhes">
                        <Eye size={18} />
                      </button>
                      {sale.status !== 'ESTORNADA' && (
                        <button className="p-2 text-red-400 hover:bg-red-50 hover:text-red-600 rounded-lg transition-all" title="Estornar Venda">
                          <Undo2 size={18} />
                        </button>
                      )}
                      <button className="p-2 text-gray-400 hover:bg-white rounded-lg transition-all">
                        <MoreVertical size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-4 bg-indigo-900 text-white flex items-center justify-between">
           <div className="flex items-center gap-6">
              <div className="flex flex-col">
                 <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">Saldo do Caixa</span>
                 <span className="text-xl font-black">R$ 1.450,20</span>
              </div>
              <div className="h-8 w-px bg-white/10"></div>
              <div className="flex items-center gap-4">
                 <PaymentQuickStat icon={<Wallet size={12}/>} label="Saldo" val="120,40" />
                 <PaymentQuickStat icon={<Smartphone size={12}/>} label="Pix" val="85,00" />
                 <PaymentQuickStat icon={<Banknote size={12}/>} label="Money" val="43,00" />
              </div>
           </div>
           <button className="bg-white/10 hover:bg-white/20 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all">
              Fechar Caixa
           </button>
        </div>
      </div>
    </div>
  );
};

const SummaryTile = ({ label, value, color, icon }: any) => (
  <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all group">
    <div className="flex items-center justify-between mb-2">
      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{label}</span>
      <div className={`p-2 rounded-lg bg-gray-50 ${color}`}>{icon}</div>
    </div>
    <p className={`text-2xl font-black ${color}`}>{value}</p>
  </div>
);

const PaymentQuickStat = ({ icon, label, val }: any) => (
  <div className="flex flex-col">
     <span className="text-[8px] font-black text-indigo-300 uppercase flex items-center gap-1">
        {icon} {label}
     </span>
     <span className="text-xs font-bold">R$ {val}</span>
  </div>
);

export default TodaySalesPage;
