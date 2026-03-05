import React, { useState, useEffect, useMemo } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  Plus, Trash2, Save, ChevronRight, Apple, 
  Flame, Droplets, Zap, Info, Calendar,
  UtensilsCrossed, X, GripVertical, CheckCircle2,
  Building, ChevronDown, RefreshCw, Utensils,
  DollarSign, Edit3, Clock, Eye, Star, Sandwich,
  Search, LayoutGrid, Check, AlertCircle, Sparkles
} from 'lucide-react';
import { MenuDay, MenuItem, Ingredient, User, Enterprise, Role, Plan } from '../types';
import ApiService from '../services/api';

const DAYS_OF_WEEK: ('SEGUNDA' | 'TERCA' | 'QUARTA' | 'QUINTA' | 'SEXTA' | 'SABADO')[] = [
  'SEGUNDA', 'TERCA', 'QUARTA', 'QUINTA', 'SEXTA', 'SABADO'
];

interface MenuManagementPageProps {
  type: 'ALMOCO' | 'LANCHE';
  currentUser: User;
  activeEnterprise: Enterprise;
}

const MenuManagementPage: React.FC<MenuManagementPageProps> = ({ type, currentUser, activeEnterprise }) => {
  // Guard clause: se não houver enterprise ativa, retornar carregamento
  if (!activeEnterprise) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center space-y-4">
          <div className="animate-spin inline-block w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full"></div>
          <p className="text-gray-600 font-medium">Carregando menu...</p>
        </div>
      </div>
    );
  }

  const [selectedUnitId, setSelectedUnitId] = useState<string>(activeEnterprise.id);
  const [isLoading, setIsLoading] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [ingredientsCatalog, setIngredientsCatalog] = useState<Ingredient[]>([]);
  const [enterprises, setEnterprises] = useState<Enterprise[]>([]);
  
  // Carregar planos da API
  useEffect(() => {
    const loadPlans = async () => {
      try {
        const data = await ApiService.getPlans(selectedUnitId);
        setPlans(data);
      } catch (err) {
        console.error('Erro ao carregar planos:', err);
        setPlans([]);
      }
    };
    loadPlans();
  }, [selectedUnitId]);
  
  // Carregar enterprises da API (para OWNER selecionar unidade)
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

  // Carregar catálogo de insumos para autocomplete no editor
  useEffect(() => {
    const loadIngredients = async () => {
      try {
        const data = await ApiService.getIngredients();
        setIngredientsCatalog(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Erro ao carregar insumos:', err);
        setIngredientsCatalog([]);
      }
    };
    loadIngredients();
  }, []);
  
  // Lista todos os planos cadastrados na seção OWNER > PLANOS para esta unidade
  const availablePlans = useMemo(() => plans.filter(p => p.enterpriseId === selectedUnitId), [selectedUnitId, plans]);

  // Função para gerar o estado inicial com os 2 planos obrigatórios por dia
  const generateInitialMenu = () => {
    return DAYS_OF_WEEK.map(day => ({ 
      id: Math.random().toString(36).substr(2, 9), 
      dayOfWeek: day, 
      items: [
        {
          id: Math.random().toString(36).substr(2, 9),
          name: 'PF FIXO',
          price: 25.00,
          ingredients: [],
          planId: 'p_1'
        },
        {
          id: Math.random().toString(36).substr(2, 9),
          name: 'COMBO LANCHE',
          price: 15.00,
          ingredients: [],
          planId: 'p_2'
        }
      ] 
    }));
  };

  const [weeklyMenu, setWeeklyMenu] = useState<MenuDay[]>(generateInitialMenu());

  const isOwner = currentUser.role === Role.OWNER;

  useEffect(() => {
    setIsLoading(true);
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 500);
    return () => clearTimeout(timer);
  }, [selectedUnitId, type]);

  const [editingItem, setEditingItem] = useState<{ dayId: string, item: MenuItem } | null>(null);
  const [searchIngredientId, setSearchIngredientId] = useState<string | null>(null);

  const addItemToDay = (dayId: string) => {
    const newItem: MenuItem = {
      id: Math.random().toString(36).substr(2, 9),
      name: 'Nova Opção',
      price: 0,
      ingredients: [],
      planId: undefined
    };
    setWeeklyMenu(prev => prev.map(d => d.id === dayId ? { ...d, items: [...d.items, newItem] } : d));
    setEditingItem({ dayId, item: newItem });
  };

  const removeItemFromDay = (dayId: string, itemId: string) => {
    if (window.confirm("Deseja remover este cardápio permanentemente?")) {
      setWeeklyMenu(prev => prev.map(d => d.id === dayId ? { ...d, items: d.items.filter(i => i.id !== itemId) } : d));
    }
  };

  const addIngredientToItem = () => {
    if (!editingItem) return;
    // Fixed: added required category property to new ingredient
    const newIng: Ingredient = {
      id: Math.random().toString(36).substr(2, 9),
      name: '',
      category: '',
      unit: 'g',
      calories: 0,
      proteins: 0,
      carbs: 0,
      fats: 0
    };
    setEditingItem({
      ...editingItem,
      item: { ...editingItem.item, ingredients: [newIng, ...editingItem.item.ingredients] }
    });
  };

  const updateIngredient = (ingId: string, field: keyof Ingredient, value: string | number) => {
    if (!editingItem) return;
    setEditingItem({
      ...editingItem,
      item: {
        ...editingItem.item,
        ingredients: editingItem.item.ingredients.map(ing => 
          ing.id === ingId ? { ...ing, [field]: value } : ing
        )
      }
    });
  };

  const autofillIngredient = (ingId: string, mockIng: Ingredient) => {
    if (!editingItem) return;
    setEditingItem({
      ...editingItem,
      item: {
        ...editingItem.item,
        ingredients: editingItem.item.ingredients.map(ing => 
          ing.id === ingId ? { 
            ...ing, 
            name: mockIng.name, 
            unit: mockIng.unit,
            calories: mockIng.calories,
            proteins: mockIng.proteins,
            carbs: mockIng.carbs,
            fats: mockIng.fats
          } : ing
        )
      }
    });
    setSearchIngredientId(null);
  };

  const removeIngredient = (ingId: string) => {
    if (!editingItem) return;
    setEditingItem({
      ...editingItem,
      item: {
        ...editingItem.item,
        ingredients: editingItem.item.ingredients.filter(ing => ing.id !== ingId)
      }
    });
  };

  const saveEditingItem = () => {
    if (!editingItem) return;
    setWeeklyMenu(prev => prev.map(d => 
      d.id === editingItem.dayId 
        ? { ...d, items: d.items.map(i => i.id === editingItem.item.id ? editingItem.item : i) } 
        : d
    ));
    setEditingItem(null);
  };

  const calculateTotalNutrients = (ingredients: Ingredient[]) => {
    return ingredients.reduce((acc, curr) => ({
      calories: acc.calories + Number(curr.calories),
      proteins: acc.proteins + Number(curr.proteins),
      carbs: acc.carbs + Number(curr.carbs),
      fats: acc.fats + Number(curr.fats)
    }), { calories: 0, proteins: 0, carbs: 0, fats: 0 });
  };

  const canSaveFicha = useMemo(() => {
    if (!editingItem) return false;
    return !!editingItem.item.planId && editingItem.item.ingredients.length > 0;
  }, [editingItem]);

  const getPlanName = (id: string) => availablePlans.find(p => p.id === id)?.name || 'PLANOS';
  const selectedEnterpriseName = enterprises.find(ent => ent.id === selectedUnitId)?.name || activeEnterprise.name;

  const exportWeeklyCalendarPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const generatedAt = new Date();
    const days = weeklyMenu.map((day) => day.dayOfWeek);
    const maxItems = Math.max(1, ...weeklyMenu.map((day) => day.items.length));

    const tableRows = Array.from({ length: maxItems }).map((_, rowIndex) => {
      const row: string[] = [`Opção ${rowIndex + 1}`];
      weeklyMenu.forEach((day) => {
        const item = day.items[rowIndex];
        if (!item) {
          row.push('-');
          return;
        }

        const planName = item.planId ? getPlanName(item.planId) : 'Sem plano';
        const ingredientsText = item.ingredients.length
          ? item.ingredients.map((ing) => ing.name).join(', ')
          : 'Composição não definida';
        row.push(
          `${item.name}\nPlano: ${planName}\nValor: R$ ${item.price.toFixed(2)}\n${ingredientsText}`
        );
      });
      return row;
    });

    doc.setFontSize(16);
    doc.text('Calendario de Cardapio Local', 14, 14);
    doc.setFontSize(10);
    doc.text(`Unidade: ${selectedEnterpriseName}`, 14, 20);
    doc.text(`Tipo: ${type === 'ALMOCO' ? 'Almoco' : 'Lanche'}`, 14, 25);
    doc.text(
      `Gerado em: ${generatedAt.toLocaleDateString('pt-BR')} ${generatedAt.toLocaleTimeString('pt-BR')}`,
      14,
      30
    );

    autoTable(doc, {
      startY: 36,
      head: [['Linha', ...days]],
      body: tableRows,
      styles: {
        fontSize: 8,
        cellPadding: 2,
        valign: 'top',
        lineColor: [220, 220, 220],
        lineWidth: 0.1,
      },
      headStyles: {
        fillColor: [79, 70, 229],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: 16, fontStyle: 'bold' },
      },
      theme: 'grid',
      margin: { left: 10, right: 10, top: 36, bottom: 10 },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index > 0 && data.cell.raw === '-') {
          data.cell.styles.textColor = [140, 140, 140];
        }
      },
    });

    const fileName = `cardapio_local_${selectedEnterpriseName
      .toLowerCase()
      .replace(/\s+/g, '_')}_${type.toLowerCase()}_${generatedAt.toISOString().slice(0, 10)}.pdf`;
    doc.save(fileName);
  };

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto min-h-screen pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-black text-gray-800 tracking-tight flex items-center gap-3 leading-none">
            <UtensilsCrossed className="text-indigo-600" />
            Grade Semanal: Cardápio da Semana
          </h1>
          <p className="text-gray-500 text-[10px] font-black uppercase tracking-widest">
            Defina o cardápio com base nos planos contratados
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <button
            onClick={exportWeeklyCalendarPdf}
            className="px-6 py-3 bg-white border-2 border-indigo-100 text-indigo-700 rounded-2xl font-black text-xs uppercase tracking-widest shadow-sm hover:bg-indigo-50 transition-all flex items-center justify-center gap-2"
          >
            <Calendar size={16} /> Baixar Calendario PDF
          </button>
          {isOwner && (
            <div className="relative group min-w-[240px]">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-400 group-hover:text-indigo-600 transition-colors">
                <Building size={18} />
              </div>
              <select 
                value={selectedUnitId}
                onChange={(e) => setSelectedUnitId(e.target.value)}
                className="w-full pl-12 pr-10 py-3 bg-white border-2 border-transparent focus:border-indigo-500 rounded-2xl shadow-sm outline-none font-black text-xs uppercase tracking-widest appearance-none cursor-pointer transition-all hover:shadow-md"
              >
                {enterprises.map(ent => (
                  <option key={ent.id} value={ent.id}>{ent.name}</option>
                ))}
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                <ChevronDown size={16} />
              </div>
            </div>
          )}
          
          <button className="px-8 py-3 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2">
            <Save size={18} /> Publicar Grade
          </button>
        </div>
      </header>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-32 space-y-4 animate-pulse">
           <RefreshCw size={48} className="text-indigo-400 animate-spin" />
           <p className="text-[10px] font-black text-gray-400 uppercase tracking-[4px]">Sincronizando com Base de Planos...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 animate-in fade-in duration-500">
          {weeklyMenu.map(day => (
            <div key={day.id} className="flex flex-col gap-4">
              <div className="bg-white p-4 rounded-2xl border-b-4 border-indigo-500 shadow-sm flex items-center justify-between">
                <div>
                   <h3 className="text-xs font-black text-gray-800 uppercase tracking-widest">{day.dayOfWeek}</h3>
                   <p className="text-[9px] font-bold text-gray-400 uppercase">{day.items.length} Opções</p>
                </div>
                <button 
                  onClick={() => addItemToDay(day.id)}
                  className="w-8 h-8 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center hover:bg-indigo-600 hover:text-white transition-all shadow-inner"
                >
                  <Plus size={18} />
                </button>
              </div>

              <div className="space-y-4 min-h-[300px]">
                {day.items.length === 0 ? (
                  <div className="h-full border-2 border-dashed border-gray-200 rounded-3xl flex flex-col items-center justify-center p-6 text-center opacity-40">
                     <Clock size={24} className="mb-2" />
                     <p className="text-[9px] font-black uppercase">Sem Itens</p>
                  </div>
                ) : (
                  day.items.map(item => (
                    <div 
                      key={item.id}
                      className="bg-white rounded-3xl border border-gray-100 shadow-sm hover:shadow-xl transition-all group overflow-hidden flex flex-col"
                    >
                      <div className="p-4 flex-1">
                        <div className="flex justify-between items-start mb-3">
                           <div className="flex flex-wrap gap-1">
                              <span className={`text-[8px] font-black px-1.5 py-0.5 rounded border uppercase tracking-tighter flex items-center gap-1 ${
                                item.planId ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-gray-50 text-gray-400 border-gray-100'
                              }`}>
                                 <Star size={8} /> {item.planId ? getPlanName(item.planId) : 'SEM PLANO'}
                              </span>
                           </div>
                           <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                              <button onClick={() => setEditingItem({ dayId: day.id, item })} className="p-1.5 bg-gray-50 text-gray-400 hover:text-indigo-600 rounded-lg"><Edit3 size={14} /></button>
                              <button onClick={() => removeItemFromDay(day.id, item.id)} className="p-1.5 bg-gray-50 text-gray-400 hover:text-red-500 rounded-lg"><Trash2 size={14} /></button>
                           </div>
                        </div>

                        <h4 className="font-black text-gray-800 text-sm leading-tight mb-1 uppercase tracking-tight">{item.name}</h4>
                        <p className="text-[10px] text-gray-500 leading-tight line-clamp-2 min-h-[2.5em] lowercase">
                           {item.ingredients.length > 0 ? item.ingredients.map(ing => ing.name).join(', ') : 'Composição não definida...'}
                        </p>

                        <div className="flex items-center gap-2 my-3">
                           <div className="bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100 flex items-center gap-1">
                              <DollarSign size={10} className="text-emerald-600" />
                              <span className="text-xs font-black text-emerald-700">R$ {item.price.toFixed(2)}</span>
                           </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-50 mt-4">
                           <div className="flex items-center gap-1">
                              <Flame size={10} className="text-amber-500" />
                              <span className="text-[10px] font-bold text-gray-400">{calculateTotalNutrients(item.ingredients).calories} kcal</span>
                           </div>
                           <div className="flex items-center gap-1">
                              <Info size={10} className="text-indigo-400" />
                              <span className="text-[10px] font-bold text-gray-400">{item.ingredients.length} componentes</span>
                           </div>
                        </div>
                      </div>
                      <button 
                        onClick={() => setEditingItem({ dayId: day.id, item })}
                        className="w-full py-2 bg-gray-50 text-[9px] font-black text-indigo-600 uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all border-t flex items-center justify-center gap-2"
                      >
                        <Eye size={12} /> Editar Ficha
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {editingItem && (
        <div className="fixed inset-0 z-[600] flex justify-end animate-in fade-in duration-300">
           <div className="absolute inset-0 bg-indigo-950/60 backdrop-blur-sm" onClick={() => setEditingItem(null)}></div>
           <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right-10 duration-500">
              
              <div className="bg-indigo-900 p-8 text-white flex items-center justify-between shrink-0">
                 <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center shadow-lg backdrop-blur-md border border-white/10">
                       <UtensilsCrossed size={28} className="text-indigo-300" />
                    </div>
                    <div>
                       <h2 className="text-xl font-black uppercase tracking-tight">Montagem do Cardápio</h2>
                       <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest mt-1">Configuração de planos e componentes nutricionais</p>
                    </div>
                 </div>
                 <button onClick={() => setEditingItem(null)} className="p-3 hover:bg-white/10 rounded-full transition-colors"><X size={28} /></button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-10 scrollbar-hide pb-32">
                 {/* Nome da Opção e Preço Base */}
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="md:col-span-2 space-y-2">
                       <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Descrição para o Cardápio</label>
                       <input 
                         value={editingItem.item.name}
                         onChange={(e) => setEditingItem({...editingItem, item: { ...editingItem.item, name: e.target.value }})}
                         className="w-full text-xl font-black text-gray-800 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-2xl px-6 py-4 outline-none transition-all"
                         placeholder="Ex: Arroz com Brócolis e Peixe Grelhado"
                       />
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Preço Venda (R$)</label>
                       <div className="relative">
                          <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-400" size={18} />
                          <input 
                            type="number" step="0.01"
                            value={editingItem.item.price}
                            onChange={(e) => setEditingItem({...editingItem, item: { ...editingItem.item, price: parseFloat(e.target.value) || 0 }})}
                            className="w-full pl-12 pr-4 py-4 bg-emerald-50 border-2 border-transparent focus:border-emerald-500 rounded-2xl font-black text-emerald-700 outline-none transition-all"
                          />
                       </div>
                    </div>
                 </div>

                 {/* SELEÇÃO DE PLANOS DO OWNER (ESTILO CHECKBOX) */}
                 <div className="space-y-6">
                    <div className="flex items-center gap-2 border-b pb-4">
                       <LayoutGrid size={18} className="text-indigo-600" />
                       <h3 className="text-xs font-black text-gray-800 uppercase tracking-widest">Selecione o Plano de Alimentação</h3>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                       {availablePlans.length === 0 ? (
                         <div className="col-span-2 p-8 bg-red-50 border-2 border-dashed border-red-100 rounded-[32px] text-center space-y-3">
                            <AlertCircle size={40} className="mx-auto text-red-400" />
                            <div>
                               <p className="text-sm font-black text-red-600 uppercase">Nenhum plano cadastrado ainda.</p>
                               <p className="text-[10px] font-bold text-red-400 uppercase leading-relaxed mt-1">Crie planos em OWNER {'->'} PLANOS para que apareçam aqui.</p>
                            </div>
                         </div>
                       ) : availablePlans.map(plan => (
                         <label key={plan.id} className={`relative p-5 rounded-[28px] border-2 transition-all cursor-pointer group flex items-center justify-between overflow-hidden shadow-sm hover:shadow-md ${editingItem.item.planId === plan.id ? 'border-indigo-600 bg-indigo-50 ring-4 ring-indigo-500/10' : 'border-gray-100 bg-white hover:border-indigo-200'}`}>
                            <div className="flex items-center gap-4 relative z-10">
                               <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-xs transition-all shadow-inner ${editingItem.item.planId === plan.id ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
                                  {plan.name.substring(0, 2).toUpperCase()}
                               </div>
                               <div>
                                  <p className="text-[11px] font-black text-gray-800 uppercase tracking-tight leading-none mb-1.5">{plan.name}</p>
                                  <p className="text-[10px] font-bold text-emerald-600 flex items-center gap-0.5">
                                     <DollarSign size={10} /> {plan.price.toFixed(2)} <span className="opacity-40 text-[8px] font-black ml-1 uppercase">Vlr. Base</span>
                                  </p>
                               </div>
                            </div>
                            
                            <div className="flex items-center relative z-10">
                               <input 
                                 type="radio" 
                                 name="plan_selection" 
                                 className="hidden"
                                 checked={editingItem.item.planId === plan.id}
                                 onChange={() => setEditingItem({...editingItem, item: { ...editingItem.item, planId: plan.id, price: plan.price }})}
                               />
                               <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${editingItem.item.planId === plan.id ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg rotate-0' : 'bg-white border-gray-200 text-transparent -rotate-45'}`}>
                                  <Check size={16} strokeWidth={4} />
                               </div>
                            </div>

                            {/* Detalhe de fundo decorativo para plano selecionado */}
                            {editingItem.item.planId === plan.id && (
                               <div className="absolute top-0 right-0 p-2 opacity-5">
                                  <Sparkles size={40} className="text-indigo-600" />
                               </div>
                            )}
                         </label>
                       ))}
                    </div>
                 </div>

                 {/* COMPONENTES NUTRICIONAIS */}
                 <div className="space-y-6">
                    <div className="flex items-center justify-between border-b pb-4">
                       <h3 className="text-xs font-black text-gray-800 uppercase tracking-[2px] flex items-center gap-2">
                          <Utensils size={18} className="text-indigo-600" /> Componentes e Insumos
                       </h3>
                       <button 
                         onClick={addIngredientToItem}
                         className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-5 py-2.5 rounded-xl hover:bg-indigo-600 hover:text-white transition-all uppercase tracking-widest border border-indigo-100 flex items-center gap-2"
                       >
                         <Plus size={16} /> Adicionar Insumo
                       </button>
                    </div>

                    <div className="space-y-4">
                       {editingItem.item.ingredients.length === 0 ? (
                         <div className="text-center py-16 bg-gray-50 rounded-[40px] border-2 border-dashed border-gray-200">
                            <Info size={40} className="mx-auto text-gray-300 mb-3" />
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Nenhum componente vinculado a esta opção</p>
                         </div>
                       ) : (
                         editingItem.item.ingredients.map((ing) => (
                           <div key={ing.id} className="bg-white p-6 rounded-[32px] border-2 border-gray-100 shadow-sm animate-in fade-in slide-in-from-right-2 group">
                              <div className="flex items-center gap-4 mb-4 relative">
                                 <div className="text-gray-300 group-hover:text-indigo-400 cursor-grab active:cursor-grabbing transition-colors"><GripVertical size={20} /></div>
                                 <div className="flex-1 relative">
                                    <div className="relative">
                                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" size={16} />
                                      <input 
                                        value={ing.name}
                                        onFocus={() => setSearchIngredientId(ing.id)}
                                        onChange={(e) => updateIngredient(ing.id, 'name', e.target.value)}
                                        className="w-full bg-gray-50 border-2 border-transparent rounded-2xl pl-10 pr-4 py-3 text-sm font-black text-gray-700 outline-none focus:border-indigo-400 transition-all focus:bg-white"
                                        placeholder="Pesquisar insumo nutricional..."
                                      />
                                    </div>
                                    
                                    {searchIngredientId === ing.id && ing.name.length > 1 && (
                                       <div className="absolute top-full left-0 w-full bg-white mt-2 border border-indigo-100 rounded-[24px] shadow-2xl z-[700] overflow-hidden max-h-60 overflow-y-auto animate-in zoom-in-95">
                                          {ingredientsCatalog.filter(mi => mi.name.toLowerCase().includes(ing.name.toLowerCase())).map(mockIng => (
                                             <button 
                                                key={mockIng.id}
                                                type="button"
                                                onClick={() => autofillIngredient(ing.id, mockIng)}
                                                className="w-full flex items-center justify-between p-4 hover:bg-indigo-50 border-b last:border-0 text-left transition-colors group/item"
                                             >
                                                <div className="flex items-center gap-3">
                                                   <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600 group-hover/item:bg-indigo-600 group-hover/item:text-white transition-colors"><Check size={14}/></div>
                                                   <div>
                                                      <p className="text-xs font-black text-gray-800 uppercase">{mockIng.name}</p>
                                                      <p className="text-[8px] text-gray-400 font-bold uppercase tracking-tighter">Referência base 100{mockIng.unit}</p>
                                                   </div>
                                                </div>
                                                <span className="text-[10px] font-black text-indigo-600">{mockIng.calories} kcal</span>
                                             </button>
                                          ))}
                                          {ingredientsCatalog.filter(mi => mi.name.toLowerCase().includes(ing.name.toLowerCase())).length === 0 && (
                                            <div className="p-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                              Nenhum insumo encontrado
                                            </div>
                                          )}
                                       </div>
                                    )}
                                 </div>
                                 <button onClick={() => removeIngredient(ing.id)} className="p-3 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all"><Trash2 size={20} /></button>
                              </div>

                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                 <NutrientInput icon={<Flame size={12}/>} label="Calorias" value={ing.calories} onChange={(v: any) => updateIngredient(ing.id, 'calories', v)} unit="kcal" color="amber" />
                                 <NutrientInput icon={<Zap size={12}/>} label="Proteínas" value={ing.proteins} onChange={(v: any) => updateIngredient(ing.id, 'proteins', v)} unit="g" color="blue" />
                                 <NutrientInput icon={<Droplets size={12}/>} label="Carboidratos" value={ing.carbs} onChange={(v: any) => updateIngredient(ing.id, 'carbs', v)} unit="g" color="indigo" />
                                 <NutrientInput icon={<Apple size={12}/>} label="Gorduras" value={ing.fats} onChange={(v: any) => updateIngredient(ing.id, 'fats', v)} unit="g" color="rose" />
                              </div>
                           </div>
                         ))
                       )}
                    </div>
                 </div>

                 {/* Totais do Prato */}
                 <div className="bg-indigo-900 rounded-[40px] p-10 text-white flex flex-wrap items-center justify-around gap-10 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-indigo-300 to-indigo-500 opacity-20"></div>
                    <TotalNutrient color="text-amber-400" label="Energia" value={calculateTotalNutrients(editingItem.item.ingredients).calories} unit="kcal" />
                    <div className="w-px h-12 bg-white/10 hidden md:block"></div>
                    <TotalNutrient color="text-blue-400" label="Proteínas" value={calculateTotalNutrients(editingItem.item.ingredients).proteins} unit="g" />
                    <div className="w-px h-12 bg-white/10 hidden md:block"></div>
                    <TotalNutrient color="text-indigo-300" label="Carbos" value={calculateTotalNutrients(editingItem.item.ingredients).carbs} unit="g" />
                    <div className="w-px h-12 bg-white/10 hidden md:block"></div>
                    <TotalNutrient color="text-rose-400" label="Gorduras" value={calculateTotalNutrients(editingItem.item.ingredients).fats} unit="g" />
                 </div>
              </div>

              {/* Botões de Ação Fixos no Rodapé */}
              <div className="absolute bottom-0 left-0 right-0 p-8 bg-white/90 backdrop-blur-md border-t border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-6 shadow-[0_-15px_40px_rgba(0,0,0,0.05)] z-[600]">
                 <div className="flex flex-col">
                    <p className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-2 ${canSaveFicha ? 'text-emerald-600' : 'text-amber-500'}`}>
                       {canSaveFicha ? <CheckCircle2 size={12}/> : <AlertCircle size={12}/>} 
                       {canSaveFicha ? 'Pronto para salvar' : 'Ação Necessária'}
                    </p>
                    <p className="text-[8px] font-bold text-gray-400 uppercase mt-1 leading-relaxed">
                       {!editingItem?.item.planId ? '• Vincule a um plano de alimentação. ' : ''}
                       {editingItem?.item.ingredients.length === 0 ? '• Adicione pelo menos 1 componente.' : ''}
                    </p>
                 </div>
                 <div className="flex gap-4 w-full sm:w-auto">
                    <button onClick={() => setEditingItem(null)} className="px-10 py-5 text-xs font-black text-gray-400 uppercase tracking-widest hover:text-gray-600 transition-colors">Cancelar</button>
                    <button 
                      onClick={saveEditingItem} 
                      disabled={!canSaveFicha}
                      className={`flex-1 sm:flex-none px-14 py-5 rounded-[24px] font-black text-xs uppercase tracking-widest shadow-2xl transition-all flex items-center justify-center gap-3 ${
                        canSaveFicha 
                          ? 'bg-indigo-600 text-white shadow-indigo-100 hover:bg-indigo-700 active:scale-95' 
                          : 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'
                      }`}
                    >
                      <Save size={20} /> Salvar Ficha
                    </button>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

const NutrientInput = ({ icon, label, value, onChange, unit, color }: any) => {
  const colorMap: any = {
    amber: 'text-amber-600 bg-amber-50 focus-within:ring-2 focus-within:ring-amber-200 focus-within:border-amber-400 border-amber-100/50',
    blue: 'text-blue-600 bg-blue-50 focus-within:ring-2 focus-within:ring-blue-200 focus-within:border-blue-400 border-blue-100/50',
    indigo: 'text-indigo-600 bg-indigo-50 focus-within:ring-2 focus-within:ring-indigo-200 focus-within:border-indigo-400 border-indigo-100/50',
    rose: 'text-rose-600 bg-rose-50 focus-within:ring-2 focus-within:ring-rose-200 focus-within:border-rose-400 border-rose-100/50',
  };
  return (
    <div className={`p-3 rounded-2xl border-2 transition-all flex flex-col shadow-sm ${colorMap[color]}`}>
       <div className="flex items-center gap-1 mb-1 opacity-70">
          {icon} <span className="text-[7px] font-black uppercase tracking-tighter">{label}</span>
       </div>
       <div className="flex items-center gap-1">
          <input 
            type="number"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            className="w-full bg-transparent text-sm font-black outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            placeholder="0"
          />
          <span className="text-[8px] font-black opacity-40 uppercase">{unit}</span>
       </div>
    </div>
  );
};

const TotalNutrient = ({ label, value, unit, color }: any) => (
  <div className="text-center group flex flex-col items-center">
     <p className="text-[9px] font-black text-white/50 uppercase tracking-[3px] mb-3 group-hover:text-white transition-colors">{label}</p>
     <p className={`text-4xl font-black leading-none ${color} tracking-tighter group-hover:scale-110 transition-transform`}>
       {value}<span className="text-xs font-black ml-1.5 opacity-50">{unit}</span>
     </p>
  </div>
);

export default MenuManagementPage;
