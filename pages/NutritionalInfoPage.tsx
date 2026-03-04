
import React, { useState, useMemo, useEffect } from 'react';
import { 
  Beef, Search, Plus, Trash2, Edit, Save, X, 
  Flame, Zap, Droplets, Apple, Info, ChevronRight,
  Filter, Scale, ArrowUpRight, CheckCircle2, ChevronDown,
  AlertCircle, Tag, LayoutGrid, PlusCircle
} from 'lucide-react';
import { ApiService } from '../services/api';
import { Ingredient, IngredientUnit } from '../types';

const NutritionalInfoPage: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('TODOS');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState<Ingredient | null>(null);

  const [nutritionalCategories, setNutritionalCategories] = useState<string[]>(['Proteínas', 'Carboidratos', 'Vegetais', 'Bebidas', 'Lanches Prontos']);

  const [ingredients, setIngredients] = useState<Ingredient[]>([]);

  // Carregar ingredientes da API
  useEffect(() => {
    const loadIngredients = async () => {
      try {
        const data = await ApiService.getIngredients();
        setIngredients(data);
      } catch (err) {
        console.error('Erro ao carregar ingredientes:', err);
        setIngredients([]);
      }
    };
    loadIngredients();
  }, []);

  const [formData, setFormData] = useState({
    name: '',
    category: 'Proteínas',
    unit: 'g' as IngredientUnit,
    calories: 0,
    proteins: 0,
    carbs: 0,
    fats: 0
  });

  const filteredIngredients = useMemo(() => {
    return ingredients.filter(i => {
      const matchesSearch = i.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategory === 'TODOS' || i.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [ingredients, searchTerm, selectedCategory]);

  const handleOpenModal = (ing: Ingredient | null = null) => {
    if (ing) {
      setEditingIngredient(ing);
      setFormData({
        name: ing.name,
        category: ing.category,
        unit: ing.unit,
        calories: ing.calories,
        proteins: ing.proteins,
        carbs: ing.carbs,
        fats: ing.fats
      });
    } else {
      setEditingIngredient(null);
      setFormData({ 
        name: '', 
        category: nutritionalCategories[0] || '', 
        unit: 'g', 
        calories: 0, 
        proteins: 0, 
        carbs: 0, 
        fats: 0 
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Ingredient = {
      id: editingIngredient?.id || Math.random().toString(36).substr(2, 9),
      name: formData.name,
      category: formData.category,
      unit: formData.unit,
      calories: Number(formData.calories),
      proteins: Number(formData.proteins),
      carbs: Number(formData.carbs),
      fats: Number(formData.fats)
    };

    if (editingIngredient) {
      setIngredients(prev => prev.map(i => i.id === editingIngredient.id ? payload : i));
    } else {
      setIngredients(prev => [payload, ...prev]);
    }
    setIsModalOpen(false);
  };

  const handleAddCategory = (name: string) => {
    if (!name || nutritionalCategories.includes(name)) return;
    setNutritionalCategories([...nutritionalCategories, name]);
    setIsCategoryModalOpen(false);
  };

  const handleDelete = (id: string) => {
    if (window.confirm("Deseja remover este item da base?")) {
      setIngredients(prev => prev.filter(i => i.id !== id));
    }
  };

  const getUnitLabel = (unit: IngredientUnit) => {
    switch(unit) {
      case 'g': return '100 gramas';
      case 'ml': return '100 mililitros';
      case 'un': return '100 unidades';
      default: return '100g';
    }
  };

  const getShortUnitLabel = (unit: IngredientUnit) => {
    switch(unit) {
      case 'g': return '100g';
      case 'ml': return '100ml';
      case 'un': return '100 un';
      default: return '100g';
    }
  };

  return (
    <div className="p-6 space-y-8 max-w-[1400px] mx-auto min-h-screen pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-black text-gray-800 tracking-tight flex items-center gap-3 leading-none uppercase">
            <Beef className="text-indigo-600" size={32} /> ITENS COMIDA / BASE NUTRICIONAL
          </h1>
          <p className="text-gray-500 text-[10px] font-black uppercase tracking-widest mt-1">
            Gestão de insumos e produtos para montagem de cardápios
          </p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => setIsCategoryModalOpen(true)}
            className="bg-white text-indigo-600 border-2 border-indigo-100 px-6 py-3 rounded-2xl font-black uppercase tracking-widest text-xs shadow-sm hover:bg-indigo-50 transition-all flex items-center gap-2"
          >
            <Tag size={18} /> Nova Categoria
          </button>
          <button 
            onClick={() => handleOpenModal()}
            className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center gap-2 active:scale-95"
          >
            <Plus size={20} /> Cadastrar Item Comida
          </button>
        </div>
      </header>

      {/* Barra de Filtros Integrada */}
      <div className="bg-white p-6 rounded-[40px] border shadow-sm flex flex-col gap-6">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
           <div className="md:col-span-5 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
              <input 
                type="text" 
                placeholder="Pesquisar por nome do item..." 
                className="w-full pl-12 pr-4 py-4 bg-gray-50 border-transparent border-2 focus:border-indigo-500 rounded-3xl outline-none font-bold text-sm transition-all shadow-inner focus:bg-white"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
           </div>
           
           <div className="md:col-span-7 flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 mr-2">
                 <Filter size={14} className="text-gray-400" />
                 <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Filtrar por:</span>
              </div>
              <button 
                onClick={() => setSelectedCategory('TODOS')}
                className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border-2 ${selectedCategory === 'TODOS' ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'bg-white border-gray-100 text-gray-400 hover:border-indigo-200'}`}
              >
                Todos
              </button>
              {nutritionalCategories.map(cat => (
                <button 
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border-2 ${selectedCategory === cat ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'bg-white border-gray-100 text-gray-400 hover:border-indigo-200'}`}
                >
                  {cat}
                </button>
              ))}
           </div>
        </div>
      </div>

      {/* Grid de Itens Comida */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 animate-in fade-in duration-500">
        {filteredIngredients.length === 0 ? (
          <div className="col-span-full py-32 text-center space-y-4 opacity-30">
            <Search size={64} className="mx-auto text-gray-400" />
            <p className="text-xl font-black uppercase tracking-[4px]">Nenhum item encontrado</p>
          </div>
        ) : (
          filteredIngredients.map(ing => (
            <div key={ing.id} className="bg-white rounded-[40px] border border-gray-100 shadow-sm hover:shadow-2xl transition-all group overflow-hidden flex flex-col">
              <div className="p-6 flex-1 space-y-5">
                <div className="flex justify-between items-start">
                  <div className={`w-14 h-14 rounded-[20px] flex items-center justify-center transition-all shadow-inner ${
                    ing.unit === 'ml' ? 'bg-blue-50 text-blue-600' : 
                    ing.unit === 'un' ? 'bg-amber-50 text-amber-600' : 
                    'bg-indigo-50 text-indigo-600'
                  } group-hover:rotate-6`}>
                    <Beef size={28} />
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                    <button onClick={() => handleOpenModal(ing)} className="p-2.5 text-indigo-600 bg-white border rounded-xl shadow-sm hover:bg-indigo-50 transition-colors" title="Editar"><Edit size={16}/></button>
                    <button onClick={() => handleDelete(ing.id)} className="p-2.5 text-red-500 bg-white border rounded-xl shadow-sm hover:bg-red-50 transition-colors" title="Apagar"><Trash2 size={16}/></button>
                  </div>
                </div>
                
                <div>
                  <span className="text-[8px] font-black text-indigo-400 uppercase tracking-widest bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-100 mb-1.5 inline-block">{ing.category}</span>
                  <h3 className="font-black text-gray-800 text-lg leading-tight uppercase tracking-tight">{ing.name}</h3>
                  <div className="flex items-center gap-1.5 mt-1">
                     <p className="text-[9px] font-black text-gray-400 uppercase tracking-[1px]">Base: {getShortUnitLabel(ing.unit)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-50 mt-4">
                  <NutrientBadge icon={<Flame size={10}/>} label="KCAL" value={ing.calories} color="amber" />
                  <NutrientBadge icon={<Zap size={10}/>} label="PROT" value={ing.proteins} color="blue" />
                  <NutrientBadge icon={<Droplets size={10}/>} label="CARB" value={ing.carbs} color="indigo" />
                  <NutrientBadge icon={<Apple size={10}/>} label="GORD" value={ing.fats} color="rose" />
                </div>
              </div>
              <div className="px-6 py-4 bg-gray-50/50 border-t border-gray-100 flex items-center justify-between">
                <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">ID: #{ing.id.toUpperCase().substring(0,6)}</span>
                <div className="flex items-center gap-1 text-[9px] font-black text-emerald-600 uppercase">
                  <CheckCircle2 size={12} /> Validado
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal de Cadastro/Edição de Item Comida */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 animate-in fade-in">
          <div className="absolute inset-0 bg-indigo-950/70 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}></div>
          <form onSubmit={handleSave} className="relative w-full max-w-xl bg-white rounded-[48px] shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col h-[90vh]">
            <div className="bg-indigo-900 p-8 text-white flex items-center justify-between shrink-0 shadow-lg">
              <div className="flex items-center gap-4">
                <div className="bg-white/10 p-3 rounded-2xl backdrop-blur-md border border-white/20"><Beef size={32} /></div>
                <div>
                  <h2 className="text-2xl font-black uppercase tracking-tight leading-none">{editingIngredient ? 'Editar Item Comida' : 'Novo Item Comida'}</h2>
                  <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest mt-2">Valores para cálculo de composição nutricional</p>
                </div>
              </div>
              <button type="button" onClick={() => setIsModalOpen(false)} className="p-3 hover:bg-white/10 rounded-full transition-colors"><X size={32} /></button>
            </div>

            <div className="p-10 space-y-8 flex-1 overflow-y-auto scrollbar-hide">
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Nome do Item / Insumo *</label>
                  <input 
                    required
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-2xl outline-none font-black text-gray-800 text-lg shadow-inner transition-all"
                    placeholder="Ex: Peito de Frango Desfiado"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Categoria *</label>
                    <div className="relative">
                       <select 
                        required
                        value={formData.category}
                        onChange={e => setFormData({...formData, category: e.target.value})}
                        className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-2xl outline-none font-black text-xs uppercase tracking-widest appearance-none cursor-pointer shadow-inner"
                       >
                         {nutritionalCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                       </select>
                       <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={18} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Unidade Base *</label>
                    <div className="relative">
                       <select 
                        value={formData.unit}
                        onChange={e => setFormData({...formData, unit: e.target.value as IngredientUnit})}
                        className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-2xl outline-none font-black text-xs uppercase tracking-widest appearance-none cursor-pointer shadow-inner"
                       >
                         <option value="g">Gramas (G)</option>
                         <option value="ml">Mililitros (ML)</option>
                         <option value="un">Unidade (UN)</option>
                       </select>
                       <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={18} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-indigo-50/50 p-8 rounded-[40px] border-2 border-indigo-100 space-y-6 shadow-sm">
                <div className="flex items-center justify-between border-b border-indigo-100 pb-4 mb-2">
                  <h4 className="text-[11px] font-black text-indigo-900 uppercase tracking-[3px] flex items-center gap-2">
                    <Info size={16} className="text-indigo-600" /> Valores por {getUnitLabel(formData.unit)}
                  </h4>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <NutrientInput icon={<Flame size={18}/>} label="Calorias" value={formData.calories} unit="kcal" color="amber" onChange={v => setFormData({...formData, calories: v})} />
                  <NutrientInput icon={<Zap size={18}/>} label="Proteínas" value={formData.proteins} unit="g" color="blue" onChange={v => setFormData({...formData, proteins: v})} />
                  <NutrientInput icon={<Droplets size={18}/>} label="Carboidratos" value={formData.carbs} unit="g" color="indigo" onChange={v => setFormData({...formData, carbs: v})} />
                  <NutrientInput icon={<Apple size={18}/>} label="Gorduras" value={formData.fats} unit="g" color="rose" onChange={v => setFormData({...formData, fats: v})} />
                </div>
              </div>

              <div className="bg-amber-50 p-6 rounded-[32px] border-2 border-amber-100 flex gap-4">
                <div className="p-2 bg-amber-100 rounded-xl text-amber-600 h-fit"><AlertCircle size={24} /></div>
                <p className="text-[11px] font-bold text-amber-800 uppercase leading-relaxed">
                  Os valores inseridos são a referência nutricional para <span className="underline font-black">{getUnitLabel(formData.unit)}</span> deste insumo. O sistema calculará o total do prato automaticamente.
                </p>
              </div>
            </div>

            <div className="p-10 bg-gray-50 border-t flex gap-4 shrink-0 shadow-[0_-15px_45px_rgba(0,0,0,0.05)]">
              <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-5 text-xs font-black text-gray-400 uppercase tracking-widest hover:text-gray-600 transition-colors">Cancelar</button>
              <button type="submit" className="flex-[2] py-5 bg-indigo-600 text-white rounded-[24px] font-black uppercase tracking-[2px] text-xs shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center justify-center gap-3 active:scale-95">
                <Save size={22} /> {editingIngredient ? 'Salvar Alterações' : 'Concluir Cadastro'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal de Criação de Categoria */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4 animate-in fade-in">
           <div className="absolute inset-0 bg-gray-900/80 backdrop-blur-md" onClick={() => setIsCategoryModalOpen(false)}></div>
           <div className="relative w-full max-w-md bg-white rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95">
              <div className="bg-indigo-600 p-8 text-white flex items-center justify-between">
                 <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center"><Tag size={28} /></div>
                    <h3 className="text-xl font-black uppercase tracking-tight">Nova Categoria</h3>
              </div>
                 <button onClick={() => setIsCategoryModalOpen(false)}><X size={32} /></button>
              </div>
              <div className="p-10 space-y-8">
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Nome da Categoria</label>
                    <input autoFocus id="newCatName" className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-2xl outline-none font-black text-gray-800 text-lg shadow-inner" placeholder="Ex: Grãos" />
                 </div>
                 <button 
                  onClick={() => {
                    const input = document.getElementById('newCatName') as HTMLInputElement;
                    if(input.value) handleAddCategory(input.value);
                  }}
                  className="w-full py-5 bg-indigo-600 text-white rounded-[24px] font-black uppercase tracking-widest text-xs shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all"
                 >
                    Criar Categoria
                 </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

const NutrientBadge = ({ icon, label, value, color }: any) => {
  const colors: any = {
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    rose: 'bg-rose-50 text-rose-600 border-rose-100',
  };
  return (
    <div className={`p-2.5 rounded-xl border flex items-center gap-2 transition-all ${colors[color]} hover:shadow-inner group-hover:scale-[1.02]`}>
      <div className="bg-white/50 p-1 rounded-lg">{icon}</div>
      <div className="flex flex-col">
        <span className="text-[7px] font-black uppercase leading-none mb-0.5">{label}</span>
        <p className="text-[11px] font-black leading-none">{value}</p>
      </div>
    </div>
  );
};

const NutrientInput = ({ icon, label, value, unit, color, onChange }: any) => {
  const colors: any = {
    amber: 'focus-within:border-amber-500 text-amber-600',
    blue: 'focus-within:border-blue-500 text-blue-600',
    indigo: 'focus-within:border-indigo-500 text-indigo-600',
    rose: 'focus-within:border-rose-500 text-rose-600',
  };
  return (
    <div className={`bg-white border-2 border-gray-100 rounded-2xl p-5 transition-all shadow-sm ${colors[color]}`}>
      <div className="flex items-center gap-2 mb-2 opacity-60">
        {icon} <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
      </div>
      <div className="flex items-center gap-1">
        <input 
          type="number" 
          step="0.1"
          value={value || ''}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          className="bg-transparent w-full font-black text-3xl outline-none"
          placeholder="0.0"
        />
        <span className="text-xs font-black uppercase opacity-40">{unit}</span>
      </div>
    </div>
  );
};

export default NutritionalInfoPage;
