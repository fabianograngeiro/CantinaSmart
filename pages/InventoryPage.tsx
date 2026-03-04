
import React, { useState, useMemo, useEffect } from 'react';
import { 
  Package, ArrowUpCircle, ArrowDownCircle, Search, 
  Filter, AlertTriangle, Download, X, Clock,
  ChevronDown, ArrowRight, ClipboardCheck, Save,
  CheckCircle2, Plus, DollarSign
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { ApiService } from '../services/api';
import { Product, ProductCategory, User, Enterprise, Role } from '../types';

interface InventoryPageProps {
  currentUser: User;
  activeEnterprise: Enterprise;
}

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3001/api').replace(/\/api\/?$/, '');
const toAbsoluteProductImageUrl = (imageUrl?: string, productName?: string) => {
  if (imageUrl && /^https?:\/\//i.test(imageUrl)) return imageUrl;
  if (imageUrl && imageUrl.startsWith('/products_photos/')) return `${API_BASE_URL}${imageUrl}`;
  if (imageUrl) return imageUrl;
  return `https://picsum.photos/seed/${encodeURIComponent(productName || 'produto')}/200`;
};

const InventoryPage: React.FC<InventoryPageProps> = ({ currentUser, activeEnterprise }) => {
  // Guard clause: se não houver enterprise ativa, retornar carregamento
  if (!activeEnterprise) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center space-y-4">
          <div className="animate-spin inline-block w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full"></div>
          <p className="text-gray-600 font-medium">Carregando estoque...</p>
        </div>
      </div>
    );
  }

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory | 'TODOS' | string>('TODOS');
  const [filterStatus, setFilterStatus] = useState<'TODOS' | 'SALDO_BAIXO' | 'VENCENDO_LOGA'>('TODOS');
  
  const [isInventoryMode, setIsInventoryMode] = useState(false);
  const [inventoryCounts, setInventoryCounts] = useState<Record<string, number>>({});
  const [inventoryStep, setInventoryStep] = useState<'COUNTING' | 'SUMMARY'>('COUNTING');
  const [lastBalanceDate, setLastBalanceDate] = useState<string>('10/05/2025');

  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
  const [entryData, setEntryData] = useState({
    productId: '',
    supplierId: '',
    quantity: 0,
    cost: 0,
    expiryDate: ''
  });

  const [products, setProducts] = useState<Product[]>([]);

  const isUnitAdmin = currentUser.role === Role.ADMIN || currentUser.role === Role.ADMIN_RESTAURANTE;
  const today = new Date();

  // Carregar produtos da API
  useEffect(() => {
    const loadProducts = async () => {
      try {
        const data = await ApiService.getProducts(activeEnterprise.id);
        setProducts(data);
      } catch (err) {
        console.error('Erro ao carregar produtos:', err);
        setProducts([]);
      }
    };
    loadProducts();
  }, [activeEnterprise.id]);

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      // Regra de Ouro: Admin só vê o estoque da própria unidade ativa
      let matchesUnit = true;
      if (isUnitAdmin) {
        matchesUnit = p.enterpriseId === activeEnterprise.id;
      } else {
        // Owner vê tudo ou pode filtrar por unidade (aqui simplificado para unidade ativa)
        matchesUnit = p.enterpriseId === activeEnterprise.id;
      }

      if (!matchesUnit) return false;

      const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategory === 'TODOS' || p.category === selectedCategory;
      
      let matchesStatus = true;
      if (filterStatus === 'SALDO_BAIXO') {
        matchesStatus = p.stock < p.minStock;
      } else if (filterStatus === 'VENCENDO_LOGA') {
        if (!p.expiryDate) return false;
        const expiry = new Date(p.expiryDate);
        const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        matchesStatus = diffDays <= 7;
      }

      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [searchTerm, selectedCategory, filterStatus, activeEnterprise.id, isUnitAdmin, products]);

  const stats = useMemo(() => {
    const totalCost = filteredProducts.reduce((s, p) => s + (p.cost * p.stock), 0);
    const lowStockCount = filteredProducts.filter(p => p.stock < p.minStock).length;
    const expiringSoonCount = filteredProducts.filter(p => {
      if (!p.expiryDate) return false;
      const expiry = new Date(p.expiryDate);
      return Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) <= 7;
    }).length;

    return { totalCost, lowStockCount, expiringSoonCount };
  }, [filteredProducts]);

  const startInventory = () => {
    const initialCounts: Record<string, number> = {};
    filteredProducts.forEach(p => initialCounts[p.id] = p.stock);
    setInventoryCounts(initialCounts);
    setInventoryStep('COUNTING');
    setIsInventoryMode(true);
  };

  const finalizeInventory = () => {
    if (!window.confirm('Deseja finalizar o balanço e ajustar os saldos no sistema?')) return;
    const now = new Date().toLocaleDateString('pt-BR');
    setLastBalanceDate(now);
    alert(`Balanço finalizado com sucesso em ${now}!`);
    setIsInventoryMode(false);
  };

  const handleEntrySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!entryData.productId || entryData.quantity <= 0) return;
    alert(`Entrada registrada com sucesso na unidade ${activeEnterprise.name}!`);
    setIsEntryModalOpen(false);
  };

  const generatePDF = () => {
    const doc = new jsPDF() as any;
    const tableData = filteredProducts.map(p => [
      p.name, p.category, `R$ ${p.cost.toFixed(2)}`, `${p.stock} UN`, 
      `${p.minStock} UN`, p.expiryDate ? new Date(p.expiryDate).toLocaleDateString() : 'N/A'
    ]);
    doc.autoTable({
      startY: 50,
      head: [['PRODUTO', 'CATEGORIA', 'CUSTO', 'SALDO', 'MÍNIMO', 'VALIDADE']],
      body: tableData,
      headStyles: { fillColor: [79, 70, 229] },
      styles: { fontSize: 8 }
    });
    doc.save(`estoque-${activeEnterprise.name}.pdf`);
  };

  return (
    <div className="space-y-6 p-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-800 tracking-tight flex items-center gap-2 uppercase">
            <Package className="text-indigo-600" size={28} /> Gestão de Estoque
          </h1>
          <div className="flex items-center gap-2 text-gray-500 text-[10px] font-black uppercase tracking-widest mt-1">
             <span className="opacity-60">Unidade:</span> <span className="text-indigo-600">{activeEnterprise.name}</span>
             <span className="mx-2 opacity-20">|</span>
             <span className="opacity-60">Último Balanço:</span> <span className="text-amber-600">{lastBalanceDate}</span>
          </div>
        </div>
        <div className="flex gap-2">
           <button onClick={startInventory} className="bg-amber-500 text-white px-5 py-3 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-amber-100 hover:bg-amber-600 flex items-center gap-2 transition-all">
             <ClipboardCheck size={18} /> Balanço Físico
           </button>
           <button onClick={() => setIsEntryModalOpen(true)} className="bg-indigo-600 text-white px-5 py-3 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-indigo-100 hover:bg-indigo-700 flex items-center gap-2 transition-all">
             <Plus size={18} /> Lançar Entrada
           </button>
           <button onClick={generatePDF} className="bg-white border-2 border-gray-100 text-gray-500 px-4 py-3 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-gray-50 flex items-center gap-2 shadow-sm transition-all">
             <Download size={16} /> Exportar
           </button>
        </div>
      </div>

      {!isInventoryMode && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 animate-in zoom-in-95">
            <InventorySummaryCard label="Investimento" value={`R$ ${stats.totalCost.toFixed(2)}`} color="bg-indigo-50 text-indigo-600" icon={<DollarSign />} />
            <InventorySummaryCard label="Críticos" value={stats.lowStockCount.toString()} color="bg-amber-50 text-amber-600" icon={<AlertTriangle />} />
            <InventorySummaryCard label="Vencimentos" value={stats.expiringSoonCount.toString()} color="bg-red-50 text-red-600" icon={<Clock />} />
          </div>

          <div className="bg-white p-6 rounded-[40px] border shadow-sm flex flex-col md:flex-row gap-6 items-end">
            <div className="flex-1 space-y-1 w-full">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-4">Localizar Produto</label>
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input 
                    type="text" 
                    placeholder="Nome do item ou código interno..." 
                    className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-3xl outline-none font-bold text-sm transition-all shadow-inner"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                  />
                </div>
            </div>

            <div className="space-y-1 w-full md:w-56">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-4">Categoria</label>
                <div className="relative">
                  <select 
                    value={selectedCategory}
                    onChange={e => setSelectedCategory(e.target.value)}
                    className="w-full pl-5 pr-10 py-3.5 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-3xl outline-none text-[10px] font-black uppercase tracking-widest appearance-none cursor-pointer shadow-inner"
                  >
                      <option value="TODOS">Todas</option>
                      <option value="LANCHE">Lanches</option>
                      <option value="BEBIDA">Bebidas</option>
                      <option value="ALMOCO">Almoço</option>
                      <option value="DOCE">Sobremesas</option>
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
                </div>
            </div>
          </div>

          <div className="bg-white rounded-[40px] border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-[2px] border-b">
                      <tr>
                        <th className="px-8 py-6">Produto / SKU</th>
                        <th className="px-8 py-6">Categoria</th>
                        <th className="px-8 py-6 text-center">Custo Médio</th>
                        <th className="px-8 py-6 text-center">Saldo Atual</th>
                        <th className="px-8 py-6 text-center">Mínimo</th>
                        <th className="px-8 py-6">Validade</th>
                        <th className="px-8 py-6 text-right">Giro</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 text-[11px]">
                      {filteredProducts.map(product => {
                        const isLowStock = product.stock < product.minStock;
                        return (
                          <tr key={product.id} className="hover:bg-indigo-50/20 transition-colors group">
                            <td className="px-8 py-4">
                              <div className="flex items-center gap-4">
                                  <img src={toAbsoluteProductImageUrl(product.image, product.name)} className="w-10 h-10 rounded-xl object-cover border" />
                                  <div>
                                    <p className="font-black text-gray-800 text-sm leading-tight uppercase">{product.name}</p>
                                    <p className="text-[9px] text-gray-400 uppercase font-bold mt-1">#{product.id}</p>
                                  </div>
                              </div>
                            </td>
                            <td className="px-8 py-4">
                              <span className="bg-indigo-50 text-indigo-400 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-tighter border border-indigo-100">{product.category}</span>
                            </td>
                            <td className="px-8 py-4 text-center font-bold text-gray-400">R$ {product.cost.toFixed(2)}</td>
                            <td className="px-8 py-4 text-center">
                              <p className={`text-base font-black ${isLowStock ? 'text-red-500' : 'text-indigo-600'}`}>{product.stock} un</p>
                            </td>
                            <td className="px-8 py-4 text-center text-gray-300 font-bold">{product.minStock} un</td>
                            <td className="px-8 py-4">
                              <span className="font-bold text-gray-500 uppercase">{product.expiryDate ? new Date(product.expiryDate).toLocaleDateString() : 'Não definido'}</span>
                            </td>
                            <td className="px-8 py-4 text-right">
                               <button className="p-2 bg-white border rounded-xl text-gray-300 hover:text-indigo-600 shadow-sm transition-all"><ArrowUpCircle size={18}/></button>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
            </div>
          </div>
        </>
      )}

      {/* Interface de Balanço (Modo Auditoria) */}
      {isInventoryMode && (
        <div className="fixed inset-0 z-[500] bg-gray-50 flex flex-col animate-in slide-in-from-bottom-10">
           <div className="bg-indigo-900 p-8 text-white flex items-center justify-between shrink-0 shadow-2xl">
              <div className="flex items-center gap-5">
                 <div className="bg-white/20 p-4 rounded-3xl backdrop-blur-md border border-white/10 shadow-inner"><ClipboardCheck size={32} /></div>
                 <div>
                    <h2 className="text-2xl font-black uppercase tracking-tight leading-none">Auditoria de Estoque Físico</h2>
                    <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-[3px] mt-1.5">Unidade: {activeEnterprise.name} • Lançamento em Lote</p>
                 </div>
              </div>
              <button onClick={() => setIsInventoryMode(false)} className="p-4 hover:bg-red-500 rounded-2xl transition-all"><X size={32} /></button>
           </div>

           <div className="flex-1 overflow-y-auto p-10 scrollbar-hide">
              <div className="max-w-4xl mx-auto space-y-6">
                 {filteredProducts.map(p => (
                    <div key={p.id} className="bg-white p-6 rounded-[32px] border-2 border-transparent hover:border-indigo-200 transition-all flex items-center justify-between shadow-sm group">
                       <div className="flex items-center gap-5 flex-1">
                          <img src={toAbsoluteProductImageUrl(p.image, p.name)} className="w-14 h-14 rounded-2xl object-cover shadow-sm" />
                          <div>
                             <p className="text-base font-black text-gray-800 uppercase tracking-tight leading-tight">{p.name}</p>
                             <p className="text-[10px] font-bold text-gray-400 uppercase mt-1">Saldo em Sistema: <span className="text-indigo-600">{p.stock} UN</span></p>
                          </div>
                       </div>
                       <div className="text-right space-y-2">
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">Contagem Real</p>
                          <input 
                            type="number" 
                            className="w-28 text-center py-4 bg-gray-50 border-4 border-transparent focus:border-indigo-500 rounded-2xl font-black text-xl outline-none transition-all shadow-inner"
                            defaultValue={p.stock}
                          />
                       </div>
                    </div>
                 ))}
              </div>
           </div>

           <div className="bg-white p-8 border-t flex justify-end gap-6 shadow-[0_-15px_50px_rgba(0,0,0,0.05)]">
              <button onClick={() => setIsInventoryMode(false)} className="px-12 py-5 text-xs font-black text-gray-400 uppercase tracking-[3px]">Cancelar auditoria</button>
              <button 
                onClick={finalizeInventory}
                className="bg-indigo-600 text-white px-16 py-5 rounded-[24px] font-black text-xs uppercase tracking-[3px] shadow-2xl shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center gap-3 active:scale-95"
              >
                <Save size={20} /> Salvar e Atualizar Sistema
              </button>
           </div>
        </div>
      )}
    </div>
  );
};

const InventorySummaryCard = ({ label, value, color, icon }: any) => (
  <div className={`${color} p-6 rounded-[32px] flex items-center gap-4 border shadow-sm transition-all hover:scale-[1.02]`}>
     <div className="p-4 bg-white/50 rounded-2xl shadow-inner">{React.cloneElement(icon, { size: 24, strokeWidth: 3 })}</div>
     <div>
        <p className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-1">{label}</p>
        <p className="text-3xl font-black leading-none tracking-tighter">{value}</p>
     </div>
  </div>
);

export default InventoryPage;
