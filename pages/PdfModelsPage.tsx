import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText, Truck, Calendar, CalendarDays, Beef,
  ReceiptText, DollarSign, Package, ExternalLink
} from 'lucide-react';
import { Enterprise } from '../types';

interface PdfModelsPageProps {
  activeEnterprise: Enterprise | null;
}

const models = [
  {
    id: 'entrega-dia',
    title: 'Entrega do Dia',
    description: 'Relatório de entrega/consumo diário dos alunos com status de servidos e pendentes.',
    icon: Truck,
    color: 'indigo',
    route: '/daily-delivery',
    bgGradient: 'from-indigo-500 to-indigo-700',
    lightBg: 'bg-indigo-50 dark:bg-indigo-950/30',
    iconBg: 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400',
    border: 'border-indigo-200 dark:border-indigo-800/40',
  },
  {
    id: 'cardapio-dia',
    title: 'Cardápio do Dia',
    description: 'Grade mensal do cardápio com refeições planejadas, ingredientes e calendário colorido.',
    icon: Calendar,
    color: 'emerald',
    route: '/menu-lunch',
    bgGradient: 'from-emerald-500 to-emerald-700',
    lightBg: 'bg-emerald-50 dark:bg-emerald-950/30',
    iconBg: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400',
    border: 'border-emerald-200 dark:border-emerald-800/40',
  },
  {
    id: 'calendario-escolar',
    title: 'Calendário Escolar',
    description: 'Calendário anual com feriados, eventos escolares, dias letivos e legendas por cores.',
    icon: CalendarDays,
    color: 'violet',
    route: '/school-calendar',
    bgGradient: 'from-violet-500 to-violet-700',
    lightBg: 'bg-violet-50 dark:bg-violet-950/30',
    iconBg: 'bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-400',
    border: 'border-violet-200 dark:border-violet-800/40',
  },
  {
    id: 'base-nutricional',
    title: 'Base Nutricional',
    description: 'Informações nutricionais dos ingredientes utilizados nas refeições.',
    icon: Beef,
    color: 'amber',
    route: '/nutritional-info',
    bgGradient: 'from-amber-500 to-amber-700',
    lightBg: 'bg-amber-50 dark:bg-amber-950/30',
    iconBg: 'bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400',
    border: 'border-amber-200 dark:border-amber-800/40',
  },
  {
    id: 'transacoes',
    title: 'Transações',
    description: 'Relatório detalhado de vendas e transações por plano, aluno e período.',
    icon: ReceiptText,
    color: 'cyan',
    route: '/unit-sales',
    bgGradient: 'from-cyan-500 to-cyan-700',
    lightBg: 'bg-cyan-50 dark:bg-cyan-950/30',
    iconBg: 'bg-cyan-100 dark:bg-cyan-900/50 text-cyan-600 dark:text-cyan-400',
    border: 'border-cyan-200 dark:border-cyan-800/40',
  },
  {
    id: 'financeiro',
    title: 'Financeiro',
    description: 'Relatório financeiro com receitas, despesas, lucro líquido e pendências.',
    icon: DollarSign,
    color: 'rose',
    route: '/financial',
    bgGradient: 'from-rose-500 to-rose-700',
    lightBg: 'bg-rose-50 dark:bg-rose-950/30',
    iconBg: 'bg-rose-100 dark:bg-rose-900/50 text-rose-600 dark:text-rose-400',
    border: 'border-rose-200 dark:border-rose-800/40',
  },
  {
    id: 'estoque',
    title: 'Estoque',
    description: 'Relatório de produtos em estoque com saldo, custo, validade e alertas.',
    icon: Package,
    color: 'slate',
    route: '/inventory',
    bgGradient: 'from-slate-500 to-slate-700',
    lightBg: 'bg-slate-50 dark:bg-slate-950/30',
    iconBg: 'bg-slate-200 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400',
    border: 'border-slate-200 dark:border-slate-700/40',
  },
];

const PdfModelsPage: React.FC<PdfModelsPageProps> = ({ activeEnterprise }) => {
  const navigate = useNavigate();

  if (!activeEnterprise) {
    return (
      <div className="p-8">
        <div className="bg-white dark:bg-[#121214] rounded-2xl border border-slate-200 dark:border-white/10 ring-1 ring-transparent dark:ring-white/5 p-8 text-center text-gray-500 dark:text-zinc-300 font-bold">
          Selecione uma unidade para acessar os Modelos PDF.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-gray-800 dark:text-slate-100 tracking-tight flex items-center gap-2 uppercase">
            <FileText className="text-indigo-600" size={22} /> Modelos PDF
          </h1>
          <div className="flex items-center gap-2 text-gray-500 dark:text-zinc-400 text-[9px] font-black uppercase tracking-[0.12em] mt-1">
            <span className="opacity-60">Unidade:</span>
            <span className="text-indigo-600">{activeEnterprise.name}</span>
            <span className="mx-1 opacity-20">|</span>
            <span className="opacity-60">{models.length} modelos disponíveis</span>
          </div>
        </div>
      </div>

      {/* Info banner */}
      <div className="bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800/30 rounded-xl p-4 flex items-start gap-3">
        <FileText size={18} className="text-indigo-600 dark:text-indigo-400 mt-0.5 shrink-0" />
        <p className="text-[12px] text-indigo-800 dark:text-indigo-300 font-medium leading-relaxed">
          Central de modelos PDF. Clique em qualquer modelo para ir à página correspondente e gerar o relatório com os dados atualizados.
        </p>
      </div>

      {/* Models Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {models.map((model) => {
          const Icon = model.icon;
          return (
            <button
              key={model.id}
              onClick={() => navigate(model.route)}
              className={`group relative text-left rounded-2xl border ${model.border} bg-white dark:bg-[#121214] overflow-hidden transition-all duration-300 hover:shadow-xl hover:scale-[1.02] hover:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-zinc-900`}
            >
              {/* Color bar top */}
              <div className={`h-1.5 bg-gradient-to-r ${model.bgGradient}`} />

              <div className="p-5 space-y-4">
                {/* Icon + Title */}
                <div className="flex items-start gap-3">
                  <div className={`w-11 h-11 rounded-xl ${model.iconBg} flex items-center justify-center shrink-0`}>
                    <Icon size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-black text-[13px] text-gray-800 dark:text-slate-100 uppercase tracking-tight leading-tight">
                      {model.title}
                    </h3>
                    <span className="text-[9px] font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-widest">
                      PDF
                    </span>
                  </div>
                </div>

                {/* Description */}
                <p className="text-[11px] text-gray-500 dark:text-zinc-400 leading-relaxed font-medium">
                  {model.description}
                </p>

                {/* Action hint */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-white/5">
                  <span className="text-[10px] font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-wider">
                    Gerar relatório
                  </span>
                  <ExternalLink
                    size={14}
                    className="text-gray-300 dark:text-zinc-600 group-hover:text-indigo-500 dark:group-hover:text-indigo-400 transition-colors"
                  />
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default PdfModelsPage;
