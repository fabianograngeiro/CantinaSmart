
import React, { useState, useMemo, useEffect } from 'react';
import { 
  Truck, Search, Plus, Trash2, Edit2, X, Save, 
  Building, Phone, Mail, FileText, CheckCircle2, XCircle, 
  ChevronRight, Filter, ExternalLink, Package, DollarSign,
  ShoppingCart, Tag, PlusCircle
} from 'lucide-react';
import { ApiService } from '../services/api';
import { Supplier, SupplierCategory, Role, User, Enterprise, SuppliedProduct } from '../types';

interface SuppliersPageProps {
  currentUser: User;
  activeEnterprise: Enterprise;
}

const SuppliersPage: React.FC<SuppliersPageProps> = ({ currentUser, activeEnterprise }) => {
  // Guard clause: se não houver enterprise ativa, retornar carregamento
  if (!activeEnterprise) {
    return (
      <div className="suppliers-shell flex items-center justify-center h-96 rounded-2xl">
        <div className="text-center space-y-4">
          <div className="animate-spin inline-block w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full"></div>
          <p className="text-gray-600 dark:text-zinc-300 font-medium">Carregando fornecedores...</p>
        </div>
      </div>
    );
  }

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  
  // Carregar fornecedores da API
  useEffect(() => {
    const loadSuppliers = async () => {
      try {
        const data = await ApiService.getSuppliers(activeEnterprise.id);
        setSuppliers(data);
      } catch (err) {
        console.error('Erro ao carregar fornecedores:', err);
        setSuppliers([]);
      }
    };
    loadSuppliers();
  }, [activeEnterprise.id]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  // Estados locais para o formulário
  const [formData, setFormData] = useState({
    name: '',
    document: '',
    category: 'ALIMENTOS',
    contactPerson: '',
    email: '',
    phone: ''
  });
  const [suppliedProducts, setSuppliedProducts] = useState<SuppliedProduct[]>([]);
  const [tempProduct, setTempProduct] = useState<SuppliedProduct>({ name: '', cost: 0 });

  const isOwner = currentUser.role === Role.OWNER;

  const filteredSuppliers = useMemo(() => {
    return suppliers.filter(s => {
      const isVisible = isOwner || s.enterpriseId === activeEnterprise.id;
      const matchesSearch = 
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        s.document.includes(searchTerm) ||
        s.category.toLowerCase().includes(searchTerm.toLowerCase());
      
      return isVisible && matchesSearch;
    });
  }, [suppliers, searchTerm, isOwner, activeEnterprise.id]);

  const handleToggleStatus = (id: string) => {
    setSuppliers(prev => prev.map(s => 
      s.id === id ? { ...s, isActive: !s.isActive } : s
    ));
  };

  const handleDelete = (id: string) => {
    if (window.confirm("Deseja remover este fornecedor permanentemente?")) {
      setSuppliers(prev => prev.filter(s => s.id !== id));
    }
  };

  const handleOpenModal = (supplier: Supplier | null = null) => {
    if (supplier) {
      setEditingSupplier(supplier);
      setFormData({
        name: supplier.name,
        document: supplier.document,
        category: supplier.category,
        contactPerson: supplier.contactPerson,
        email: supplier.email,
        phone: supplier.phone
      });
      setSuppliedProducts(supplier.suppliedProducts || []);
    } else {
      setEditingSupplier(null);
      setFormData({
        name: '',
        document: '',
        category: 'ALIMENTOS',
        contactPerson: '',
        email: '',
        phone: ''
      });
      setSuppliedProducts([]);
    }
    setTempProduct({ name: '', cost: 0 });
    setIsModalOpen(true);
  };

  const addProductToCatalog = () => {
    if (!tempProduct.name || tempProduct.cost <= 0) return;
    setSuppliedProducts([...suppliedProducts, { ...tempProduct }]);
    setTempProduct({ name: '', cost: 0 });
  };

  const removeProductFromCatalog = (index: number) => {
    setSuppliedProducts(suppliedProducts.filter((_, i) => i !== index));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    
    const supplierData: Supplier = {
      id: editingSupplier?.id || `s-${Math.random().toString(36).substr(2, 5)}`,
      name: formData.name,
      document: formData.document,
      category: formData.category,
      contactPerson: formData.contactPerson,
      email: formData.email,
      phone: formData.phone,
      isActive: editingSupplier ? editingSupplier.isActive : true,
      enterpriseId: editingSupplier?.enterpriseId || activeEnterprise.id,
      suppliedProducts: suppliedProducts
    };

    if (editingSupplier) {
      setSuppliers(prev => prev.map(s => s.id === editingSupplier.id ? supplierData : s));
      alert('Catálogo do fornecedor atualizado!');
    } else {
      setSuppliers(prev => [supplierData, ...prev]);
      alert('Novo fornecedor cadastrado com sucesso!');
    }
    
    setIsModalOpen(false);
  };

  return (
    <div className="suppliers-shell space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-gray-800 tracking-tight flex items-center gap-2">
            <Truck className="text-indigo-600" size={20} /> Gestão de Fornecedores
          </h1>
          <p className="text-gray-500 text-xs font-medium">
            {isOwner ? 'Visão global da rede de suprimentos' : `Fornecedores ativos em ${activeEnterprise.name}`}
          </p>
        </div>
        <button 
          onClick={() => handleOpenModal()}
          className="bg-indigo-600 text-white px-4 py-2.5 rounded-xl font-black uppercase tracking-widest text-[11px] shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all flex items-center gap-2"
        >
          <Plus size={14} /> Novo Fornecedor
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <SummaryCard label="Total Parceiros" value={filteredSuppliers.length.toString()} icon={<Truck />} color="bg-indigo-50 text-indigo-600" />
        <SummaryCard label="Ativos" value={filteredSuppliers.filter(s => s.isActive).length.toString()} icon={<CheckCircle2 />} color="bg-emerald-50 text-emerald-600" />
        <SummaryCard label="Em Revisão" value={filteredSuppliers.filter(s => !s.isActive).length.toString()} icon={<XCircle />} color="bg-red-50 text-red-600" />
        <SummaryCard label="Categorias" value="6" icon={<Filter />} color="bg-amber-50 text-amber-600" />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-3 border-b flex flex-col md:flex-row gap-3 bg-gray-50/50">
          <div className="relative flex-1">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
             <input 
               type="text" 
               placeholder="Buscar por nome, CNPJ ou categoria..." 
               className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-50 outline-none transition-all text-xs font-medium"
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
             />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-[9px] font-black text-gray-400 uppercase tracking-widest border-b">
              <tr>
                <th className="px-4 py-3">Fornecedor / CNPJ</th>
                <th className="px-4 py-3">Categoria</th>
                <th className="px-4 py-3 text-center">Itens no Catálogo</th>
                <th className="px-4 py-3">Contato</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredSuppliers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-gray-400 font-bold uppercase text-[11px] tracking-widest">Nenhum fornecedor encontrado</td>
                </tr>
              ) : (
                filteredSuppliers.map(s => (
                  <tr key={s.id} className={`hover:bg-indigo-50/30 transition-colors ${!s.isActive && 'opacity-60 grayscale'}`}>
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-xs font-black text-gray-800 leading-tight">{s.name}</p>
                        <p className="text-[10px] text-gray-400 font-bold uppercase mt-0.5 tracking-tighter">{s.document}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100 text-[9px] font-black text-gray-600 uppercase tracking-widest border border-gray-200">
                        {s.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-col items-center">
                         <span className="text-xs font-black text-indigo-600">{(s.suppliedProducts?.length || 0)}</span>
                         <span className="text-[9px] font-bold text-gray-400 uppercase">PRODUTOS</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-0.5">
                        <p className="text-xs font-bold text-gray-700">{s.contactPerson}</p>
                        <p className="text-[10px] text-gray-400 flex items-center gap-1"><Mail size={10} /> {s.email}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button 
                        onClick={() => handleToggleStatus(s.id)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${
                          s.isActive ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-100 text-red-700 hover:bg-red-200'
                        }`}
                      >
                        {s.isActive ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
                        {s.isActive ? 'Ativo' : 'Inativo'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                         <button onClick={() => handleOpenModal(s)} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"><Edit2 size={14} /></button>
                         <button onClick={() => handleDelete(s.id)} className="p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600 rounded-lg transition-all"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Cadastro/Edição de Fornecedor + Catálogo */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-indigo-950/40 backdrop-blur-sm animate-in fade-in" onClick={() => setIsModalOpen(false)}></div>
          <form onSubmit={handleSave} className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col h-[90vh]">
            <div className="bg-indigo-600 p-4 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                 <Truck size={18} />
                 <div>
                    <h2 className="text-lg font-black leading-tight">{editingSupplier ? 'Editar Fornecedor' : 'Novo Cadastro de Parceiro'}</h2>
                    <p className="text-[10px] font-bold text-indigo-200 uppercase tracking-widest">Painel de Suprimentos Enterprise</p>
                 </div>
              </div>
              <button type="button" onClick={() => setIsModalOpen(false)} className="hover:bg-white/10 p-1.5 rounded-full"><X size={18} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-6 scrollbar-hide">
              {/* Seção 1: Dados Cadastrais */}
              <div className="space-y-4">
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2 border-b pb-2">
                   <Building size={16} className="text-indigo-400" /> Informações Jurídicas e Contato
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Razão Social / Nome Fantasia</label>
                    <input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:border-indigo-500 font-bold text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">CNPJ</label>
                    <input required value={formData.document} onChange={e => setFormData({...formData, document: e.target.value})} placeholder="00.000.000/0001-00" className="w-full px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:border-indigo-500 font-bold text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Categoria Predominante</label>
                    <select value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} className="w-full px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:border-indigo-500 font-bold appearance-none text-sm">
                        <option value="ALIMENTOS">ALIMENTOS</option>
                        <option value="BEBIDA">BEBIDAS</option>
                        <option value="LIMPEZA">HIGIENE & LIMPEZA</option>
                        <option value="EQUIPAMENTOS">EQUIPAMENTOS</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Responsável Comercial</label>
                    <input required value={formData.contactPerson} onChange={e => setFormData({...formData, contactPerson: e.target.value})} className="w-full px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:border-indigo-500 font-bold text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Email Corporativo</label>
                    <input type="email" required value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:border-indigo-500 font-bold text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Telefone / WhatsApp</label>
                    <input value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:border-indigo-500 font-bold text-sm" placeholder="(00) 00000-0000" />
                  </div>
                </div>
              </div>

              {/* Seção 2: Catálogo de Produtos Vendidos */}
              <div className="space-y-4">
                 <div className="flex items-center justify-between border-b pb-2">
                   <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                      <ShoppingCart size={16} className="text-indigo-400" /> Catálogo de Produtos e Custos
                   </h3>
                   <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg">{suppliedProducts.length} itens</span>
                 </div>

                 {/* Formulário de Adição Rápida de Produto */}
                 <div className="bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100 grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                    <div className="md:col-span-7 space-y-1">
                       <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1"><Package size={10}/> Nome do Produto</label>
                       <input 
                        value={tempProduct.name}
                        onChange={e => setTempProduct({...tempProduct, name: e.target.value})}
                        className="w-full px-3 py-2 bg-white border rounded-lg outline-none focus:border-indigo-500 font-bold text-xs" 
                        placeholder="Ex: Suco Laranja 300ml"
                       />
                    </div>
                    <div className="md:col-span-3 space-y-1">
                       <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1"><DollarSign size={10}/> Valor de Custo</label>
                       <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-gray-400">R$</span>
                          <input 
                            type="number"
                            step="0.01"
                            value={tempProduct.cost || ''}
                            onChange={e => setTempProduct({...tempProduct, cost: parseFloat(e.target.value) || 0})}
                            className="w-full pl-8 pr-3 py-2 bg-white border rounded-lg outline-none focus:border-indigo-500 font-bold text-xs" 
                            placeholder="0,00"
                          />
                       </div>
                    </div>
                    <div className="md:col-span-2">
                       <button 
                        type="button"
                        onClick={addProductToCatalog}
                        disabled={!tempProduct.name || tempProduct.cost <= 0}
                        className="w-full py-2 bg-indigo-600 text-white rounded-lg font-black text-[9px] uppercase tracking-widest shadow-md shadow-indigo-100 hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                       >
                         <PlusCircle size={12} /> Adicionar
                       </button>
                    </div>
                 </div>

                 {/* Listagem do Catálogo */}
                 <div className="space-y-2">
                    {suppliedProducts.length === 0 ? (
                       <div className="text-center py-8 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                          <Tag size={24} className="mx-auto text-gray-300 mb-2" />
                          <p className="text-[10px] font-black text-gray-400 uppercase">Nenhum produto vinculado ao catálogo deste fornecedor</p>
                       </div>
                    ) : (
                       <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {suppliedProducts.map((prod, idx) => (
                             <div key={idx} className="bg-white p-3 rounded-xl border border-gray-100 flex items-center justify-between hover:border-indigo-200 transition-all group shadow-sm">
                                <div className="flex items-center gap-3">
                                   <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center text-indigo-400"><Package size={14} /></div>
                                   <div>
                                      <p className="text-xs font-black text-gray-800 leading-none">{prod.name}</p>
                                      <p className="text-[10px] font-bold text-emerald-600 mt-1 uppercase">Custo: R$ {prod.cost.toFixed(2)}</p>
                                   </div>
                                </div>
                                <button 
                                  type="button" 
                                  onClick={() => removeProductFromCatalog(idx)}
                                  className="p-2 text-gray-300 hover:text-red-500 transition-colors"
                                >
                                   <Trash2 size={14} />
                                </button>
                             </div>
                          ))}
                       </div>
                    )}
                 </div>
              </div>
            </div>

            <div className="p-5 bg-gray-50 border-t flex gap-3 shrink-0">
              <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-3 text-[11px] font-black text-gray-400 uppercase tracking-widest hover:text-gray-600">Cancelar</button>
              <button type="submit" className="flex-[2] py-3 bg-indigo-600 text-white rounded-xl font-black uppercase tracking-widest text-xs shadow-lg shadow-indigo-100 hover:bg-indigo-700 flex items-center justify-center gap-2 transition-all active:scale-95">
                <Save size={14} /> Finalizar Cadastro do Parceiro
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

const SummaryCard = ({ label, value, icon, color }: any) => (
  <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-3 group hover:shadow-lg transition-all">
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color} shadow-inner group-hover:scale-110 transition-transform`}>
      {React.cloneElement(icon as React.ReactElement, { size: 18 })}
    </div>
    <div>
      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">{label}</p>
      <p className="text-lg font-black text-gray-800 leading-none">{value}</p>
    </div>
  </div>
);

export default SuppliersPage;
