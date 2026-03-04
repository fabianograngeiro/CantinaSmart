import React, { useState, useMemo, useEffect } from 'react';
import { 
  Calendar, 
  FileText, 
  ChevronDown, 
  BarChart3, 
  Filter,
  FileSpreadsheet,
  TrendingUp,
  ArrowDownCircle,
  Users,
  Search,
  DollarSign,
  CalendarDays,
  ArrowUpRight,
  Clock,
  Printer,
  CheckCircle2,
  AlertCircle,
  FileDown,
  Percent,
  ChevronRight,
  Sparkles,
  FileBarChart,
  Building2,
  LayoutGrid,
  History
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area, Cell, PieChart, Pie
} from 'recharts';
import { ApiService } from '../services/api';
import { Role, User, Enterprise } from '../types';

type QuickFilter = 'TODAY' | 'WEEK' | 'MONTH' | 'CUSTOM';

interface ReportsPageProps {
  currentUser: User;
}

const ReportsPage: React.FC<ReportsPageProps> = ({ currentUser }) => {
  const isSuperAdmin = currentUser.role === Role.SUPERADMIN;
  
  // Estados
  const [enterprises, setEnterprises] = useState<Enterprise[]>([]);
  
  // Estados de Filtro
  const [activeFilter, setActiveFilter] = useState<QuickFilter>('MONTH');
  const [selectedUnitId, setSelectedUnitId] = useState<string>('ALL');
  const [startDate, setStartDate] = useState('2025-05-01');
  const [endDate, setEndDate] = useState('2025-05-31');

  // Carregar empresas da API
  useEffect(() => {
    const loadEnterprises = async () => {
      try {
        const data = await ApiService.getEnterprises();
        setEnterprises(data);
      } catch (err) {
        console.error('Erro ao carregar empresas:', err);
        setEnterprises([]);
      }
    };
    loadEnterprises();
  }, []);

  // Dados Mockados de Vendas com identificação de Unidade
  const salesLog = [
    { id: 'V89201', unit: 'Colégio Alpha', timestamp: '25/05/2025 10:15', client: 'Bernardo Silva', class: '5º Ano A', totalBruto: 35.00, descontoPlano: 10.50, totalLíquido: 24.50, method: 'SALDO', planName: 'PF FIXO' },
    { id: 'V89202', unit: 'Bistro Jardins', timestamp: '25/05/2025 10:20', client: 'Consumidor Final', class: '-', totalBruto: 12.00, descontoPlano: 0, totalLíquido: 12.00, method: 'PIX', planName: null },
    { id: 'V89203', unit: 'Colégio Alpha', timestamp: '25/05/2025 10:25', client: 'Maria Helena', class: 'Docente', totalBruto: 45.90, descontoPlano: 0, totalLíquido: 45.90, method: 'DÉBITO', planName: null },
    { id: 'V89204', unit: 'Colégio Alpha', timestamp: '24/05/2025 10:45', client: 'João Gabriel', class: '8º Ano C', totalBruto: 110.00, descontoPlano: 15.00, totalLíquido: 95.00, method: 'SALDO', planName: 'PREMIUM' },
    { id: 'V89205', unit: 'Bistro Jardins', timestamp: '24/05/2025 11:15', client: 'Beatriz Costa', class: '3º Ano B', totalBruto: 22.00, descontoPlano: 22.00, totalLíquido: 0, method: 'PLANO', planName: 'LANCHE TOTAL' },
  ];

  // Dados de Faturamento SaaS (Mensalidades dos Owners)
  const saasBillingLog = enterprises.map(ent => ({
    id: `INV-${ent.id.toUpperCase()}`,
    client: ent.ownerName || 'Proprietário',
    enterprise: ent.name,
    amount: ent.monthlyFee || 450.00,
    status: ent.lastPaymentStatus || 'PAID',
    dueDate: '10/06/2025',
    plan: ent.planType || 'PRO'
  }));

  // Filtro lógico por unidade
  const filteredSales = useMemo(() => {
    if (selectedUnitId === 'ALL') return salesLog;
    const unitName = enterprises.find(e => e.id === selectedUnitId)?.name || '';
    return salesLog.filter(s => s.unit.includes(unitName.split(' ')[0]));
  }, [selectedUnitId, enterprises]);

  const chartData = [
    { name: 'Seg', bruto: 2400, desconto: 400, liquido: 2000, saas: 15000 },
    { name: 'Ter', bruto: 1800, desconto: 300, liquido: 1500, saas: 18000 },
    { name: 'Qua', bruto: 3200, desconto: 600, liquido: 2600, saas: 12000 },
    { name: 'Qui', bruto: 2100, desconto: 200, liquido: 1900, saas: 22000 },
    { name: 'Sex', bruto: 4500, desconto: 800, liquido: 3700, saas: 25000 },
  ];

  const handleExport = (format: 'PDF' | 'CSV') => {
    const reportType = isSuperAdmin ? 'FATURAMENTO SAAS' : 'VENDAS UNIDADE';
    const unitName = selectedUnitId === 'ALL' ? 'REDE CONSOLIDADA' : enterprises.find(e => e.id === selectedUnitId)?.name;
    alert(`Exportando Relatório ${reportType} em ${format}\nUnidade: ${unitName}\nPeríodo: ${activeFilter}`);
  };

  if (isSuperAdmin) {
    return (
      <div className="p-6 space-y-8 max-w-[1600px] mx-auto pb-20 animate-in fade-in duration-500">
        <header className="flex flex-col xl:flex-row xl:items-end justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-3 bg-indigo-600 rounded-2xl text-white shadow-lg shadow-indigo-200">
                <FileBarChart size={32} />
              </div>
              <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight leading-none uppercase">Faturamento SaaS</h1>
                <p className="text-gray-500 text-sm font-bold uppercase tracking-[2px] mt-1 opacity-60">Console de Receita e Assinaturas da Plataforma</p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
             <button onClick={() => handleExport('CSV')} className="flex items-center gap-2 px-5 py-3.5 bg-white border-2 border-gray-100 text-gray-700 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-gray-50 transition-all shadow-sm">
               <FileSpreadsheet size={18} className="text-emerald-500" /> Exportar Financeiro
             </button>
             <button onClick={() => handleExport('PDF')} className="flex items-center gap-2 px-5 py-3.5 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100">
               <Printer size={18} /> Imprimir Balanço
             </button>
          </div>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
           <ReportStatCard title="MRR (Recorrência)" value="R$ 189.400,00" change="+12%" isPositive icon={<DollarSign />} color="bg-indigo-50 text-indigo-600" />
           <ReportStatCard title="Inadimplência" value="R$ 12.450,00" change="-2%" isPositive={true} icon={<AlertCircle />} color="bg-red-50 text-red-600" />
           <ReportStatCard title="Novas Assinaturas" value="14" change="+5" isPositive icon={<TrendingUp />} color="bg-emerald-50 text-emerald-600" />
           <ReportStatCard title="LTV Médio" value="R$ 4.200,00" change="+R$ 150" isPositive icon={<Users />} color="bg-blue-50 text-blue-600" />
        </div>

        <div className="bg-white p-8 rounded-[48px] border border-gray-100 shadow-sm">
           <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-4">
              <div>
                 <h3 className="text-xl font-black text-gray-800 uppercase tracking-tight">Crescimento de Receita SaaS</h3>
                 <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Evolução mensal de faturamento da plataforma</p>
              </div>
           </div>
           <div className="h-[400px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                 <AreaChart data={chartData}>
                    <defs>
                       <linearGradient id="colorSaas" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.1}/>
                          <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                       </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 11, fontWeight: 'bold'}} />
                    <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10}} tickFormatter={(v) => `R$ ${v}`} />
                    <Tooltip 
                       contentStyle={{ borderRadius: '24px', border: 'none', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.15)', padding: '20px' }}
                       itemStyle={{ fontWeight: 'black', textTransform: 'uppercase', fontSize: '10px' }}
                    />
                    <Area type="monotone" dataKey="saas" stroke="#4f46e5" strokeWidth={5} fillOpacity={1} fill="url(#colorSaas)" />
                 </AreaChart>
              </ResponsiveContainer>
           </div>
        </div>

        <div className="bg-white rounded-[48px] border border-gray-100 shadow-2xl overflow-hidden">
          <div className="p-8 border-b bg-gray-50/50">
            <h3 className="text-2xl font-black text-gray-800 flex items-center gap-2 uppercase tracking-tight">
              <History size={24} className="text-indigo-600" /> Controle de Cobranças SaaS
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-[2px] border-b">
                <tr>
                  <th className="px-8 py-6">Fatura ID</th>
                  <th className="px-8 py-6">Cliente (Owner)</th>
                  <th className="px-8 py-6">Empresa/Rede</th>
                  <th className="px-8 py-6">Plano</th>
                  <th className="px-8 py-6 text-right">Valor Mensal</th>
                  <th className="px-8 py-6 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {saasBillingLog.map((row) => (
                  <tr key={row.id} className="hover:bg-indigo-50/20 transition-colors group">
                    <td className="px-8 py-6 font-bold text-indigo-600">{row.id}</td>
                    <td className="px-8 py-6 font-black text-gray-800 uppercase tracking-tight">{row.client}</td>
                    <td className="px-8 py-6 font-bold text-gray-500">{row.enterprise}</td>
                    <td className="px-8 py-6">
                      <span className="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-[9px] font-black uppercase border border-amber-200">
                        {row.plan}
                      </span>
                    </td>
                    <td className="px-8 py-6 text-right font-black text-gray-900">R$ {row.amount.toFixed(2)}</td>
                    <td className="px-8 py-6 text-center">
                      <span className={`px-3 py-1 rounded-xl text-[9px] font-black uppercase border ${row.status === 'PAID' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
                        {row.status === 'PAID' ? 'Liquidado' : 'Pendente'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8 max-w-[1600px] mx-auto pb-20 animate-in fade-in duration-500">
      
      {/* Header Executivo */}
      <header className="flex flex-col xl:flex-row xl:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-3 bg-indigo-600 rounded-2xl text-white shadow-lg shadow-indigo-200">
              <FileBarChart size={32} />
            </div>
            <div>
              <h1 className="text-3xl font-black text-gray-900 tracking-tight leading-none uppercase">Relatório de Vendas</h1>
              <p className="text-gray-500 text-sm font-bold uppercase tracking-[2px] mt-1 opacity-60">Consolidação e Auditoria Financeira (OWNER)</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
           <button onClick={() => handleExport('CSV')} className="flex items-center gap-2 px-5 py-3.5 bg-white border-2 border-gray-100 text-gray-700 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-gray-50 transition-all shadow-sm">
             <FileSpreadsheet size={18} className="text-emerald-500" /> Planilha CSV
           </button>
           <button onClick={() => handleExport('PDF')} className="flex items-center gap-2 px-5 py-3.5 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100">
             <Printer size={18} /> Imprimir Relatório
           </button>
        </div>
      </header>

      {/* MOTOR DE FILTRAGEM MULTIDIMENSIONAL */}
      <div className="bg-white p-3 rounded-[40px] border border-gray-100 shadow-xl flex flex-col xl:flex-row items-center gap-6">
         
         {/* FILTRO DE FILIAIS (NOVO) */}
         <div className="flex flex-col gap-1.5 w-full xl:w-72">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-4">Unidade / Filial</label>
            <div className="relative group">
               <Building2 size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-400 group-hover:text-indigo-600 transition-colors" />
               <select 
                 value={selectedUnitId}
                 onChange={(e) => setSelectedUnitId(e.target.value)}
                 className="w-full pl-12 pr-10 py-3 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-3xl outline-none font-black text-[11px] uppercase tracking-widest appearance-none cursor-pointer transition-all"
               >
                  <option value="ALL">Visão Geral da Rede</option>
                  {enterprises.map(ent => (
                    <option key={ent.id} value={ent.id}>{ent.name}</option>
                  ))}
               </select>
               <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
         </div>

         <div className="h-10 w-px bg-gray-100 hidden xl:block"></div>

         {/* FILTRO TEMPORAL */}
         <div className="flex flex-col gap-1.5 flex-1 w-full">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-4">Período de Referência</label>
            <div className="flex items-center gap-4 flex-wrap">
               <div className="flex bg-gray-100 p-1 rounded-full">
                  <FilterButton active={activeFilter === 'TODAY'} onClick={() => setActiveFilter('TODAY')} label="Hoje" icon={<Clock size={14}/>} />
                  <FilterButton active={activeFilter === 'WEEK'} onClick={() => setActiveFilter('WEEK')} label="Semanal" icon={<Calendar size={14}/>} />
                  <FilterButton active={activeFilter === 'MONTH'} onClick={() => setActiveFilter('MONTH')} label="Mensal" icon={<CalendarDays size={14}/>} />
                  <FilterButton active={activeFilter === 'CUSTOM'} onClick={() => setActiveFilter('CUSTOM')} label="Por Data" icon={<Filter size={14}/>} />
               </div>

               {activeFilter === 'CUSTOM' && (
                 <div className="flex items-center gap-2 px-2 animate-in slide-in-from-left-4">
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-gray-50 px-4 py-2.5 rounded-xl text-xs font-black uppercase outline-none border border-transparent focus:border-indigo-500 shadow-inner" />
                    <span className="text-gray-300 font-black">❯</span>
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-gray-50 px-4 py-2.5 rounded-xl text-xs font-black uppercase outline-none border border-transparent focus:border-indigo-500 shadow-inner" />
                 </div>
               )}
            </div>
         </div>
         
         <div className="hidden xl:flex items-center gap-2 text-indigo-600 font-black text-[10px] uppercase tracking-widest pr-6">
            <AlertCircle size={14} className="animate-pulse" /> Dados em Tempo Real
         </div>
      </div>

      {/* KPIS FINANCEIROS DINÂMICOS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
         <ReportStatCard title="Faturamento Bruto" value={selectedUnitId === 'ALL' ? "R$ 54.380,00" : "R$ 28.210,00"} change="+12%" isPositive icon={<DollarSign />} color="bg-indigo-50 text-indigo-600" />
         <ReportStatCard title="Descontos de Planos" value={selectedUnitId === 'ALL' ? "R$ 8.120,50" : "R$ 4.050,00"} change="+4%" isPositive={false} icon={<Percent />} color="bg-amber-50 text-amber-600" />
         <ReportStatCard title="Receita Líquida" value={selectedUnitId === 'ALL' ? "R$ 46.259,50" : "R$ 24.160,00"} change="+15%" isPositive icon={<TrendingUp />} color="bg-emerald-50 text-emerald-600" />
         <ReportStatCard title="Ticket Médio" value={selectedUnitId === 'ALL' ? "R$ 38,87" : "R$ 41,20"} change="+R$ 2,10" isPositive icon={<Users />} color="bg-blue-50 text-blue-600" />
      </div>

      {/* GRÁFICO DE TENDÊNCIA DE PERFORMANCE */}
      <div className="bg-white p-8 rounded-[48px] border border-gray-100 shadow-sm">
         <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-4">
            <div>
               <h3 className="text-xl font-black text-gray-800 uppercase tracking-tight">Performance Analítica</h3>
               <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">
                  {selectedUnitId === 'ALL' ? 'Resultado Consolidado de todas as Unidades' : `Analítico Individual: ${enterprises.find(e => e.id === selectedUnitId)?.name}`}
               </p>
            </div>
            <div className="flex gap-6">
               <LegendItem dotColor="#4f46e5" label="Faturamento" />
               <LegendItem dotColor="#10b981" label="Liquidez" />
            </div>
         </div>
         <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
               <AreaChart data={chartData}>
                  <defs>
                     <linearGradient id="colorBruto" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                     </linearGradient>
                     <linearGradient id="colorLiquido" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                     </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 11, fontWeight: 'bold'}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10}} tickFormatter={(v) => `R$ ${v}`} />
                  <Tooltip 
                     contentStyle={{ borderRadius: '24px', border: 'none', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.15)', padding: '20px' }}
                     itemStyle={{ fontWeight: 'black', textTransform: 'uppercase', fontSize: '10px' }}
                  />
                  <Area type="monotone" dataKey="bruto" stroke="#4f46e5" strokeWidth={5} fillOpacity={1} fill="url(#colorBruto)" />
                  <Area type="monotone" dataKey="liquido" stroke="#10b981" strokeWidth={5} fillOpacity={1} fill="url(#colorLiquido)" />
               </AreaChart>
            </ResponsiveContainer>
         </div>
      </div>

      {/* REGISTRO ANALÍTICO DE TRANSAÇÕES */}
      <div className="bg-white rounded-[48px] border border-gray-100 shadow-2xl overflow-hidden">
        <div className="p-8 border-b bg-gray-50/50 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h3 className="text-2xl font-black text-gray-800 flex items-center gap-2 uppercase tracking-tight">
              <History size={24} className="text-indigo-600" /> Histórico de Tickets
            </h3>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Auditória granular dos faturamentos efetuados</p>
          </div>
          <div className="relative w-full md:w-96">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input 
              type="text" 
              placeholder="Buscar por ID, Cliente ou Filial..." 
              className="w-full pl-12 pr-6 py-4 bg-white border-2 border-gray-100 rounded-2xl text-sm font-bold outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 transition-all" 
            />
          </div>
        </div>

        <div className="overflow-x-auto scrollbar-hide">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-[2px] border-b">
              <tr>
                <th className="px-8 py-6">Timestamp</th>
                <th className="px-8 py-6">Unidade Origem</th>
                <th className="px-8 py-6">Cliente / Turma</th>
                <th className="px-8 py-6 text-center">Plano</th>
                <th className="px-8 py-6 text-right">Vlr. Bruto</th>
                <th className="px-8 py-6 text-right">Liquido Pago</th>
                <th className="px-8 py-6 text-center">Método</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 text-sm">
              {filteredSales.map((row) => (
                <tr key={row.id} className="hover:bg-indigo-50/20 transition-colors group">
                  <td className="px-8 py-6">
                    <div className="flex flex-col">
                       <p className="font-bold text-gray-800">{row.timestamp.split(' ')[0]}</p>
                       <p className="text-[10px] text-gray-400 font-bold flex items-center gap-1 uppercase"><Clock size={10}/> {row.timestamp.split(' ')[1]}</p>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-gray-200 text-[10px] font-black text-indigo-600 uppercase tracking-tighter shadow-sm">
                       <Building2 size={12} /> {row.unit}
                    </span>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex flex-col">
                       <p className="font-black text-indigo-900 uppercase tracking-tight">{row.client}</p>
                       <p className="text-[10px] text-gray-400 font-bold uppercase">{row.class}</p>
                    </div>
                  </td>
                  <td className="px-8 py-6 text-center">
                    {row.planName ? (
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[9px] font-black bg-amber-100 text-amber-700 uppercase border border-amber-200 shadow-sm">
                        <Sparkles size={10} /> {row.planName}
                      </span>
                    ) : (
                      <span className="text-[9px] font-black text-gray-300 uppercase">AVULSO</span>
                    )}
                  </td>
                  <td className="px-8 py-6 text-right font-bold text-gray-400">R$ {row.totalBruto.toFixed(2)}</td>
                  <td className="px-8 py-6 text-right font-black text-indigo-600 text-base">R$ {row.totalLíquido.toFixed(2)}</td>
                  <td className="px-8 py-6 text-center">
                    <span className="bg-indigo-50 text-indigo-600 px-3 py-1 rounded-xl text-[9px] font-black uppercase border border-indigo-100">
                      {row.method}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-8 bg-gray-50/50 flex items-center justify-between border-t border-gray-100">
           <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Página 1 de 12 • Auditória consolidada de transações</div>
           <div className="flex gap-2">
              <button className="px-5 py-2.5 bg-white border-2 border-gray-100 rounded-xl text-[10px] font-black uppercase text-gray-400 hover:text-gray-600 transition-all">Anterior</button>
              <button className="px-5 py-2.5 bg-white border-2 border-gray-100 rounded-xl text-[10px] font-black uppercase text-indigo-600 hover:bg-indigo-50 transition-all shadow-sm">Próxima</button>
           </div>
        </div>
      </div>
    </div>
  );
};

// Componentes Auxiliares
const FilterButton = ({ active, onClick, label, icon }: any) => (
  <button 
    onClick={onClick}
    className={`px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
      active ? 'bg-indigo-600 text-white shadow-lg scale-[1.05]' : 'text-gray-400 hover:text-indigo-600'
    }`}
  >
    {icon} {label}
  </button>
);

const ReportStatCard = ({ title, value, change, isPositive, icon, color }: any) => (
  <div className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-sm hover:shadow-2xl transition-all group relative overflow-hidden">
    <div className="flex items-center justify-between mb-4">
      <div className={`p-4 rounded-3xl ${color} shadow-inner group-hover:scale-110 transition-transform`}>
        {React.cloneElement(icon as React.ReactElement, { size: 24, strokeWidth: 3 })}
      </div>
      <div className={`flex items-center gap-1 text-[10px] font-black px-3 py-1 rounded-full border-2 ${isPositive ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
        {isPositive ? <ArrowUpRight size={10} /> : <ArrowDownCircle size={10} />}
        {change}
      </div>
    </div>
    <p className="text-gray-400 text-[10px] font-black uppercase tracking-[3px] mb-1">{title}</p>
    <p className="text-3xl font-black text-gray-900 tracking-tighter leading-none">{value}</p>
  </div>
);

const LegendItem = ({ dotColor, label }: any) => (
  <div className="flex items-center gap-2">
     <div className="w-3 h-3 rounded-full" style={{backgroundColor: dotColor}}></div>
     <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{label}</span>
  </div>
);

export default ReportsPage;