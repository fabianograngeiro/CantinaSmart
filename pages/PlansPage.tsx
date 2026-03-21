
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, Trash2, Edit3, X, Save, Sparkles, 
  DollarSign, CheckCircle2, Star, CreditCard,
  Package, Beef, Info, AlertCircle, Eye,
  Search, Power, PowerOff, ArrowLeft, PlusCircle,
  Tag, Filter, ChevronDown, UtensilsCrossed,
  ArrowUpRight, ArrowDown
} from 'lucide-react';
import { Plan, Enterprise, Product, MenuItem, PlanItem, Ingredient } from '../types';
import { ApiService } from '../services/api';
import { useNavigate } from 'react-router-dom';

interface PlansPageProps {
  activeEnterprise: Enterprise;
}

const PlansPage: React.FC<PlansPageProps> = ({ activeEnterprise }) => {
  // Guard clause: se não houver enterprise ativa, retornar carregamento
  if (!activeEnterprise) {
    return (
      <div className="dash-shell plans-shell min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin inline-block w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full"></div>
          <p className="text-gray-600 dark:text-zinc-300 font-medium">Carregando planos...</p>
        </div>
      </div>
    );
  }

  const navigate = useNavigate();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [weeklyMenu, setWeeklyMenu] = useState<MenuItem[]>([]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Controle de exibição inline da lista de seleção
  const [inlineSelectionType, setInlineSelectionType] = useState<'PRODUCT' | 'RECIPE' | null>(null);
  
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  
  // Filtros da listagem inline
  const [pickerSearchTerm, setPickerSearchTerm] = useState('');
  const [pickerCategory, setPickerCategory] = useState<string>('ALL');

  // Estados de formulário
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: 0,
    items: [] as PlanItem[]
  });

  // Carregar dados da API
  useEffect(() => {
    const loadData = async () => {
      try {
        const [plansData, productsData, ingredientsData] = await Promise.all([
          ApiService.getPlans(activeEnterprise.id),
          ApiService.getProducts(activeEnterprise.id),
          ApiService.getIngredients()
        ]);
        setPlans(plansData);
        setProducts(productsData);
        setIngredients(ingredientsData);
        // Para weeklyMenu, usar um array vazio se não tem API disponível
        setWeeklyMenu([]);
      } catch (err) {
        console.error('Erro ao carregar dados:', err);
        setPlans([]);
        setProducts([]);
        setIngredients([]);
        setWeeklyMenu([]);
      }
    };
    loadData();
  }, [activeEnterprise.id]);

  // Dados brutos
  const allProducts = useMemo(() => products.filter(p => p.enterpriseId === activeEnterprise.id), [products, activeEnterprise.id]);
  const allRecipes = useMemo(() => {
    // Busca todos os itens definidos como cardápio/ficha técnica no sistema
    // E também os itens da BASE NUTRICIONAL (Ingredients)
    const list: (MenuItem | Ingredient)[] = [];
    
    // Adiciona itens do cardápio semanal
    weeklyMenu.forEach(item => {
      if (!list.find(i => i.id === item.id)) list.push(item);
    });

    // Adiciona itens da Base Nutricional (Ingredients)
    ingredients.forEach(ing => {
      if (!list.find(i => i.id === ing.id)) {
        list.push(ing);
      }
    });

    return list;
  }, [weeklyMenu, ingredients]);

  // Categorias para o filtro inline
  const categories = useMemo(() => {
    if (inlineSelectionType === 'PRODUCT') {
      return ['ALL', ...Array.from(new Set(allProducts.map(p => p.category as string)))];
    }
    const recipeCategories = Array.from(new Set(allRecipes.map(r => (r as any).category || ((r as MenuItem).name.toLowerCase().includes('lanche') ? 'LANCHE' : 'ALMOCO'))));
    return ['ALL', ...recipeCategories];
  }, [inlineSelectionType, allProducts, allRecipes]);

  const handleOpenModal = (plan: Plan | null = null) => {
    setInlineSelectionType(null);
    setPickerSearchTerm('');
    setPickerCategory('ALL');
    
    if (plan) {
      setEditingPlan(plan);
      setFormData({
        name: plan.name,
        description: plan.description || '',
        price: plan.price,
        items: plan.items || []
      });
    } else {
      setEditingPlan(null);
      setFormData({ name: '', description: '', price: 0, items: [] });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const planPayload = {
      name: formData.name,
      description: formData.description,
      price: Number(formData.price),
      items: formData.items,
      enterpriseId: activeEnterprise.id,
      isActive: editingPlan ? editingPlan.isActive : true
    };

    try {
      if (editingPlan) {
        const updatedPlan = await ApiService.updatePlan(editingPlan.id, planPayload);
        setPlans(prev => prev.map(p => p.id === editingPlan.id ? updatedPlan : p));
      } else {
        const createdPlan = await ApiService.createPlan(planPayload);
        setPlans(prev => [createdPlan, ...prev]);
      }
      setIsModalOpen(false);
      setEditingPlan(null);
    } catch (err) {
      console.error('Erro ao salvar plano:', err);
      alert('Erro ao salvar plano. Verifique sua conexão e tente novamente.');
    }
  };

  const togglePlanStatus = async (id: string) => {
    const target = plans.find(p => p.id === id);
    if (!target) return;

    try {
      const updatedPlan = await ApiService.updatePlan(id, { isActive: !target.isActive });
      setPlans(prev => prev.map(p => p.id === id ? updatedPlan : p));
    } catch (err) {
      console.error('Erro ao atualizar status do plano:', err);
      alert('Erro ao atualizar status do plano.');
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("Deseja remover este plano permanentemente?")) {
      try {
        await ApiService.deletePlan(id);
        setPlans(prev => prev.filter(p => p.id !== id));
      } catch (err) {
        console.error('Erro ao deletar plano:', err);
        alert('Erro ao deletar plano.');
      }
    }
  };

  const addItemToPlan = (item: Product | MenuItem | Ingredient, type: 'PRODUCT' | 'RECIPE') => {
    const newItem: PlanItem = {
      id: item.id,
      name: item.name,
      type: type,
      price: (item as any).price || 0
    };
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, newItem]
    }));
  };

  const removeItemFromPlan = (id: string) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter(i => i.id !== id)
    }));
  };

  // Itens disponíveis filtrados (excluindo os já selecionados)
  const filteredAvailableItems = useMemo(() => {
    if (!inlineSelectionType) return [];
    
    let baseList = inlineSelectionType === 'PRODUCT' ? allProducts : allRecipes;
    
    // 1. Filtrar itens que já estão no plano
    const selectedIds = new Set(formData.items.map(i => i.id));
    let available = baseList.filter(item => !selectedIds.has(item.id));

    // 2. Aplicar filtros de busca e categoria
    return available.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(pickerSearchTerm.toLowerCase());
      
      let matchesCategory = true;
      if (pickerCategory !== 'ALL') {
        if (inlineSelectionType === 'PRODUCT') {
          matchesCategory = (item as Product).category === pickerCategory;
        } else {
          // Para itens de comida, verifica se é MenuItem ou Ingredient
          const category = (item as any).category || ((item as MenuItem).name.toLowerCase().includes('lanche') ? 'LANCHE' : 'ALMOCO');
          matchesCategory = category.toUpperCase() === pickerCategory.toUpperCase() || 
                           (pickerCategory === 'ALMOCO' && category === 'Proteínas') ||
                           (pickerCategory === 'ALMOCO' && category === 'Carboidratos') ||
                           (pickerCategory === 'ALMOCO' && category === 'Vegetais');
        }
      }
      
      return matchesSearch && matchesCategory;
    });
  }, [inlineSelectionType, allProducts, allRecipes, formData.items, pickerSearchTerm, pickerCategory]);

  return (
    <div className="dash-shell plans-shell space-y-3 min-h-screen">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="space-y-1">
          <button onClick={() => navigate('/enterprises')} className="flex items-center gap-1.5 text-[10px] font-black text-indigo-600 uppercase tracking-[0.12em] mb-1 hover:translate-x-[-4px] transition-transform">
            <ArrowLeft size={14} /> Voltar para Unidades
          </button>
          <h1 className="text-xl sm:text-2xl font-black text-gray-800 tracking-tight flex items-center gap-2 leading-none uppercase">
            <Sparkles className="text-indigo-600" size={20} /> Planos de Alimentação
          </h1>
          <p className="text-gray-500 text-[8px] sm:text-[9px] font-black uppercase tracking-[0.12em] mt-1">
            Gestão de pacotes e combos para a unidade: <span className="text-indigo-600">{activeEnterprise.name}</span>
          </p>
        </div>
        <button 
          onClick={() => handleOpenModal()}
          className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-black uppercase tracking-[0.12em] text-[9px] shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center gap-1.5 active:scale-95"
        >
          <Plus size={13} /> Criar Novo Plano
        </button>
      </header>

      {/* Listagem de Planos */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
         {plans.length === 0 ? (
           <div className="col-span-full py-32 bg-white rounded-[48px] border-2 border-dashed border-gray-100 flex flex-col items-center justify-center text-center">
              <div className="w-24 h-24 bg-indigo-50 text-indigo-300 rounded-3xl flex items-center justify-center mb-6">
                 <CreditCard size={48} />
              </div>
              <h3 className="text-xl font-black text-gray-400 uppercase tracking-widest">Nenhum plano cadastrado</h3>
              <p className="text-xs font-bold text-gray-300 uppercase tracking-widest mt-2">Clique no botão acima para definir seu primeiro pacote alimentar.</p>
           </div>
         ) : plans.map(plan => (
           <div key={plan.id} className={`bg-white rounded-[22px] border shadow-sm hover:shadow-xl transition-all group overflow-hidden flex flex-col border-b-4 ${plan.isActive ? 'border-b-indigo-500/10' : 'border-b-red-500/10 opacity-75'}`}>
              <div className="p-4 flex-1 space-y-3">
                 <div className="flex justify-between items-start">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center shadow-inner group-hover:scale-105 transition-transform ${plan.isActive ? 'bg-indigo-50 text-indigo-600' : 'bg-gray-100 text-gray-400'}`}>
                       <Star size={18} />
                    </div>
                    <div className="flex gap-2">
                       <button onClick={() => togglePlanStatus(plan.id)} className={`p-1.5 rounded-lg transition-all shadow-sm bg-white border ${plan.isActive ? 'text-emerald-500 hover:bg-emerald-50' : 'text-red-400 hover:bg-red-50'}`} title={plan.isActive ? 'Desativar' : 'Ativar'}>
                          {plan.isActive ? <Power size={13} /> : <PowerOff size={13} />}
                       </button>
                       <button onClick={() => handleOpenModal(plan)} className="p-1.5 text-indigo-600 bg-white border rounded-lg shadow-sm hover:bg-indigo-50 transition-colors" title="Editar"><Edit3 size={13}/></button>
                       <button onClick={() => handleDelete(plan.id)} className="p-1.5 text-red-500 bg-white border rounded-lg shadow-sm hover:bg-red-50 transition-colors" title="Apagar"><Trash2 size={13}/></button>
                    </div>
                 </div>
                 
                 <div>
                    <h3 className="font-black text-gray-800 text-lg uppercase tracking-tight leading-tight">{plan.name}</h3>
                    <p className="text-[11px] font-medium text-gray-400 mt-1.5 line-clamp-2">{plan.description}</p>
                    <div className="flex items-center gap-2 mt-3">
                       <span className="text-2xl font-black text-indigo-600 tracking-tight leading-none">R$ {plan.price.toFixed(2)}</span>
                       <span className="text-[8px] font-black text-gray-400 uppercase tracking-[0.12em] leading-none">/ Unidade</span>
                    </div>
                 </div>

                 <div className="pt-3 border-t border-gray-50 space-y-2">
                    <p className="text-[8px] font-black text-gray-300 uppercase tracking-[0.12em]">Composição do Plano ({plan.items.length})</p>
                    <div className="flex flex-wrap gap-2">
                       {plan.items.length === 0 ? (
                         <span className="text-[10px] font-bold text-gray-300 uppercase">Sem itens vinculados</span>
                       ) : plan.items.slice(0, 4).map(item => (
                         <span key={item.id} className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase border flex items-center gap-1 ${item.type === 'PRODUCT' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                           {item.type === 'PRODUCT' ? <Package size={10}/> : <Beef size={10}/>}
                           {item.name}
                         </span>
                       ))}
                       {plan.items.length > 4 && <span className="px-2 py-0.5 rounded-lg bg-gray-50 text-gray-400 text-[8px] font-black uppercase">+{plan.items.length - 4}</span>}
                    </div>
                 </div>
              </div>
              <div className="px-4 py-2.5 bg-gray-50/50 border-t border-gray-100 flex items-center justify-between">
                 <div className={`flex items-center gap-1 text-[8px] font-black uppercase tracking-[0.12em] ${plan.isActive ? 'text-emerald-600' : 'text-red-500'}`}>
                    {plan.isActive ? <><CheckCircle2 size={14} /> Ativo</> : <><AlertCircle size={14} /> Desativado</>}
                 </div>
                 <span className="text-[8px] font-bold text-gray-300 uppercase tracking-tight">#{plan.id.toUpperCase()}</span>
              </div>
           </div>
         ))}
      </div>

      {/* Modal de Criação / Edição */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 animate-in fade-in">
           <div className="absolute inset-0 bg-indigo-950/70 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}></div>
           <form onSubmit={handleSave} className="relative w-full max-w-6xl bg-white rounded-[48px] shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col h-[90vh]">
              
              <div className="bg-indigo-900 p-8 text-white flex items-center justify-between shrink-0 shadow-lg shadow-indigo-950/20">
                 <div className="flex items-center gap-4">
                    <div className="w-16 h-16 bg-white/10 rounded-3xl flex items-center justify-center border border-white/20 shadow-inner">
                       <CreditCard size={32} className="text-indigo-300" />
                    </div>
                    <div>
                       <h2 className="text-2xl font-black uppercase tracking-tight leading-none">{editingPlan ? 'Editar Plano Alimentar' : 'Novo Plano Alimentar'}</h2>
                       <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest mt-2">Configuração de pacotes e composição de itens</p>
                    </div>
                 </div>
                 <button type="button" onClick={() => setIsModalOpen(false)} className="p-3 hover:bg-white/10 rounded-full transition-colors"><X size={32} /></button>
              </div>

              <div className="flex-1 overflow-y-auto p-10 space-y-10 scrollbar-hide pb-20">
                 
                 <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                    {/* LADO ESQUERDO: DADOS BÁSICOS */}
                    <div className="lg:col-span-4 space-y-8">
                       <div className="space-y-6">
                          <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-[4px] border-b pb-2 flex items-center gap-2"><Info size={14}/> Detalhes do Plano</h3>
                          <div className="space-y-4">
                             <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Nome do Plano *</label>
                                <input 
                                  required
                                  value={formData.name}
                                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                                  className="w-full text-lg font-black text-gray-800 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-2xl px-6 py-4 outline-none transition-all shadow-inner"
                                  placeholder="Ex: Almoço Executivo Premium"
                                />
                             </div>
                             <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Descrição Comercial</label>
                                <textarea 
                                  value={formData.description}
                                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                                  className="w-full h-32 text-sm font-bold text-gray-600 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-3xl px-6 py-4 outline-none transition-all shadow-inner resize-none"
                                  placeholder="Explique o que o plano cobre (ex: 22 refeições/mês, suco incluso...)"
                                />
                             </div>
                             <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Valor unidade Plano (R$)</label>
                                <div className="relative">
                                   <DollarSign className="absolute left-6 top-1/2 -translate-y-1/2 text-emerald-500" size={24} />
                                   <input 
                                     required
                                     type="number" step="0.01"
                                     value={formData.price || ''}
                                     onChange={(e) => setFormData({...formData, price: parseFloat(e.target.value) || 0})}
                                     className="w-full pl-16 pr-6 py-5 bg-emerald-50 border-2 border-transparent focus:border-emerald-500 rounded-[32px] font-black text-emerald-700 text-3xl outline-none transition-all"
                                     placeholder="0,00"
                                   />
                                </div>
                             </div>
                          </div>
                       </div>
                    </div>

                    {/* LADO DIREITO: COMPOSIÇÃO E SELEÇÃO INLINE */}
                    <div className="lg:col-span-8 space-y-8">
                       {/* Seção de Itens Já Vinculados */}
                       <div className="space-y-6">
                          <div className="flex items-center justify-between border-b pb-2">
                             <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-[4px] flex items-center gap-2"><CheckCircle2 size={14}/> Itens no Plano ({formData.items.length})</h3>
                             <div className="flex gap-2">
                                <button 
                                  type="button" 
                                  onClick={() => { 
                                    setInlineSelectionType(inlineSelectionType === 'PRODUCT' ? null : 'PRODUCT'); 
                                    setPickerCategory('ALL');
                                  }} 
                                  className={`text-[9px] font-black px-4 py-2 rounded-xl border transition-all flex items-center gap-1.5 uppercase ${
                                    inlineSelectionType === 'PRODUCT' ? 'bg-blue-600 text-white border-blue-600 shadow-lg' : 'bg-blue-50 text-blue-600 border-blue-100 hover:bg-blue-100'
                                  }`}
                                >
                                   <Package size={12} /> {inlineSelectionType === 'PRODUCT' ? 'Ocultar Produtos' : '+ Produtos'}
                                </button>
                                <button 
                                  type="button" 
                                  onClick={() => { 
                                    setInlineSelectionType(inlineSelectionType === 'RECIPE' ? null : 'RECIPE'); 
                                    setPickerCategory('ALL');
                                  }} 
                                  className={`text-[9px] font-black px-4 py-2 rounded-xl border transition-all flex items-center gap-1.5 uppercase ${
                                    inlineSelectionType === 'RECIPE' ? 'bg-amber-600 text-white border-amber-600 shadow-lg' : 'bg-amber-50 text-amber-600 border-amber-100 hover:bg-amber-100'
                                  }`}
                                >
                                   <Beef size={12} /> {inlineSelectionType === 'RECIPE' ? 'Ocultar Itens Comida' : '+ ITENS COMIDA'}
                                </button>
                             </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-2 scrollbar-hide">
                             {formData.items.length === 0 && !inlineSelectionType ? (
                               <div className="col-span-full py-12 bg-gray-50 rounded-[40px] border-2 border-dashed border-gray-100 flex flex-col items-center justify-center text-center opacity-40">
                                  <PlusCircle size={32} className="mb-2" />
                                  <p className="text-[9px] font-black uppercase tracking-[2px]">Nenhum item selecionado. Use os botões acima.</p>
                               </div>
                             ) : (
                               formData.items.map((item, idx) => (
                                 <div key={`${item.id}-${idx}`} className="bg-white p-4 rounded-[28px] border-2 border-gray-50 flex items-center justify-between group hover:border-indigo-200 transition-all shadow-sm">
                                    <div className="flex items-center gap-4">
                                       <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${item.type === 'PRODUCT' ? 'bg-blue-50 text-blue-500' : 'bg-amber-50 text-amber-500'}`}>
                                          {item.type === 'PRODUCT' ? <Package size={20} /> : <Beef size={20} />}
                                       </div>
                                       <div>
                                          <p className="text-xs font-black text-gray-800 uppercase leading-none mb-1">{item.name}</p>
                                          <div className="flex items-center gap-2">
                                             <span className={`text-[8px] font-black uppercase tracking-tighter px-1.5 py-0.5 rounded border ${item.type === 'PRODUCT' ? 'bg-blue-50 text-blue-400 border-blue-100' : 'bg-amber-50 text-amber-400 border-amber-100'}`}>
                                                {item.type === 'PRODUCT' ? 'Produto' : 'Item Comida'}
                                             </span>
                                             <span className="text-[10px] font-bold text-gray-400">R$ {(item.price || 0).toFixed(2)}</span>
                                          </div>
                                       </div>
                                    </div>
                                    <button type="button" onClick={() => removeItemFromPlan(item.id)} className="p-2.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100">
                                       <Trash2 size={18} />
                                    </button>
                                 </div>
                               ))
                             )}
                          </div>
                       </div>

                       {/* LISTAGEM INLINE DE SELEÇÃO */}
                       {inlineSelectionType && (
                         <div className="bg-gray-50 rounded-[40px] border-2 border-indigo-100 p-8 space-y-6 animate-in slide-in-from-top-4">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                               <div className="flex items-center gap-3">
                                  <div className={`p-2 rounded-xl text-white ${inlineSelectionType === 'PRODUCT' ? 'bg-blue-600' : 'bg-amber-600'}`}>
                                     {inlineSelectionType === 'PRODUCT' ? <Package size={18}/> : <Beef size={18}/>}
                                  </div>
                                  <div>
                                     <h4 className="text-sm font-black text-gray-800 uppercase tracking-tight">Adicionar {inlineSelectionType === 'PRODUCT' ? 'Produtos' : 'Itens Comida'}</h4>
                                     <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Selecione para incluir no pacote</p>
                                  </div>
                               </div>
                               <button type="button" onClick={() => setInlineSelectionType(null)} className="p-2 hover:bg-white rounded-xl text-gray-400"><X size={20}/></button>
                            </div>

                            <div className="space-y-4">
                               <div className="relative">
                                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                  <input 
                                    autoFocus
                                    type="text" 
                                    placeholder={`Pesquisar por nome...`} 
                                    value={pickerSearchTerm}
                                    onChange={e => setPickerSearchTerm(e.target.value)}
                                    className="w-full pl-12 pr-4 py-4 bg-white border-2 border-transparent focus:border-indigo-500 rounded-2xl outline-none font-bold text-sm shadow-sm transition-all"
                                  />
                               </div>
                               
                               <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1">
                                  <div className="flex items-center gap-2 pr-4 border-r border-gray-200 shrink-0">
                                     <Filter size={14} className="text-gray-400" />
                                     <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Filtrar:</span>
                                  </div>
                                  {categories.map(cat => (
                                    <button 
                                      key={cat}
                                      type="button"
                                      onClick={() => setPickerCategory(cat)}
                                      className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all border-2 ${
                                        pickerCategory === cat 
                                          ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' 
                                          : 'bg-white border-gray-100 text-gray-400 hover:border-indigo-200'
                                      }`}
                                    >
                                      {cat === 'ALL' ? 'Tudo' : cat}
                                    </button>
                                  ))}
                               </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[400px] overflow-y-auto pr-2 scrollbar-hide">
                               {filteredAvailableItems.length === 0 ? (
                                 <div className="col-span-full py-16 text-center space-y-4 opacity-30">
                                    <Search size={48} className="mx-auto" />
                                    <p className="text-[10px] font-black uppercase tracking-[2px]">Nenhum item disponível com esses filtros</p>
                                 </div>
                               ) : filteredAvailableItems.map(item => (
                                   <button 
                                     key={item.id} 
                                     type="button"
                                     onClick={() => addItemToPlan(item as any, inlineSelectionType)}
                                     className="w-full p-4 bg-white border-2 border-gray-100 rounded-3xl flex items-center justify-between hover:border-indigo-600 hover:shadow-xl transition-all group text-left"
                                   >
                                      <div className="flex items-center gap-3">
                                         <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black transition-transform group-hover:rotate-6 ${inlineSelectionType === 'PRODUCT' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}`}>
                                            {item.name.charAt(0).toUpperCase()}
                                         </div>
                                         <div>
                                            <p className="text-[11px] font-black text-gray-800 uppercase tracking-tight leading-none mb-1">{item.name}</p>
                                            <div className="flex items-center gap-2">
                                               <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-tighter">
                                                  R$ {((item as any).price || 0).toFixed(2)}
                                               </p>
                                               <div className="w-1 h-1 bg-gray-200 rounded-full"></div>
                                               <span className="text-[8px] font-black text-gray-300 uppercase tracking-widest">
                                                  {inlineSelectionType === 'PRODUCT' 
                                                    ? (item as Product).category 
                                                    : ((item as any).category || ((item as MenuItem).name.toLowerCase().includes('lanche') ? 'LANCHE' : 'ALMOÇO'))}
                                               </span>
                                            </div>
                                         </div>
                                      </div>
                                      <div className="p-2 bg-gray-50 text-gray-400 group-hover:bg-indigo-600 group-hover:text-white rounded-xl transition-all shadow-inner">
                                         <Plus size={16} />
                                      </div>
                                   </button>
                                 ))
                               }
                            </div>
                         </div>
                       )}

                       {/* Resumo Financeiro do Plano */}
                       {formData.items.length > 0 && (
                         <div className="p-8 bg-gray-900 rounded-[40px] text-white shadow-2xl flex items-center justify-between relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform">
                               <Sparkles size={120} />
                            </div>
                            <div className="relative z-10">
                               <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Valor Unitário Somado</p>
                               <p className="text-4xl font-black tracking-tighter">R$ {formData.items.reduce((s,i) => s + i.price, 0).toFixed(2)}</p>
                            </div>
                            <div className="relative z-10 text-right space-y-1">
                               <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Custo para o Cliente</p>
                               <div className="flex items-center gap-3 justify-end">
                                  <p className="text-xl font-bold text-emerald-400">R$ {(formData.price || 0).toFixed(2)}</p>
                                  {formData.price > 0 && formData.items.reduce((s,i) => s + i.price, 0) > 0 && (
                                    <div className="bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full text-[10px] font-black">
                                       {(100 - (formData.price / formData.items.reduce((s,i) => s + i.price, 0) * 100)).toFixed(0)}% OFF
                                    </div>
                                  )}
                               </div>
                            </div>
                         </div>
                       )}
                    </div>
                 </div>
              </div>

              <div className="p-8 bg-gray-50 border-t flex flex-col sm:flex-row gap-6 shrink-0 shadow-[0_-15px_45px_rgba(0,0,0,0.05)]">
                 <div className="flex-1 flex flex-col justify-center">
                    <p className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-2 ${formData.name && formData.price > 0 ? 'text-emerald-600' : 'text-amber-500'}`}>
                       {formData.name && formData.price > 0 ? <><CheckCircle2 size={12}/> Tudo pronto para salvar</> : <><AlertCircle size={12}/> Campos obrigatórios pendentes</>}
                    </p>
                    <p className="text-[8px] font-bold text-gray-400 uppercase mt-1 leading-relaxed">O plano ficará disponível para venda imediata após salvar.</p>
                 </div>
                 <div className="flex gap-4">
                    <button type="button" onClick={() => setIsModalOpen(false)} className="px-10 py-5 text-xs font-black text-gray-400 uppercase tracking-widest hover:text-gray-600 transition-colors">Descartar</button>
                    <button 
                      type="submit" 
                      disabled={!formData.name || formData.price <= 0}
                      className={`px-16 py-5 rounded-[24px] font-black text-xs uppercase tracking-[2px] shadow-2xl transition-all flex items-center justify-center gap-3 ${
                        (formData.name && formData.price > 0)
                          ? 'bg-indigo-600 text-white shadow-indigo-100 hover:bg-indigo-700 active:scale-95' 
                          : 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'
                      }`}
                    >
                       <Save size={22} /> {editingPlan ? 'Salvar Alterações' : 'Criar Plano Alimentar'}
                    </button>
                 </div>
              </div>
           </form>
        </div>
      )}
    </div>
  );
};

export default PlansPage;
