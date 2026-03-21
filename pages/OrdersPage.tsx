
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  ClipboardList, Plus, Search, Filter, Calendar, 
  Truck, Package, DollarSign, X, CheckCircle2, 
  Trash2, ChevronRight, FileText, ArrowRight, 
  Save, AlertCircle, ShoppingCart, PlusCircle, MinusCircle, 
  FileSpreadsheet, TrendingUp, BarChart3, Clock, 
  Eye, Ban, Edit, CheckSquare, Printer, PrinterCheck,
  ArrowDownToLine, Scale, History, Minus, Plus as PlusIcon
} from 'lucide-react';
import { ApiService } from '../services/api';
import { Supplier, Order, OrderItem, Role, User, Enterprise, Product } from '../types';

interface OrdersPageProps {
  currentUser: User;
  activeEnterprise: Enterprise;
}

const OrdersPage: React.FC<OrdersPageProps> = ({ currentUser, activeEnterprise }) => {
  // Guard clause: se não houver enterprise ativa, retornar carregamento
  if (!activeEnterprise) {
    return (
      <div className="orders-shell flex items-center justify-center h-96 rounded-2xl">
        <div className="text-center space-y-4">
          <div className="animate-spin inline-block w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full"></div>
          <p className="text-gray-600 dark:text-zinc-300 font-medium">Carregando pedidos...</p>
        </div>
      </div>
    );
  }

  const [orders, setOrders] = useState<Order[]>([
    {
      id: 'ORD-1020',
      supplierId: 's1',
      supplierName: 'Distribuidora Alimentos S.A.',
      date: '2025-05-15',
      items: [
        { productName: 'Coxinha de Frango', quantity: 100, cost: 3.50 },
        { productName: 'Suco Laranja 300ml', quantity: 50, cost: 4.20 }
      ],
      originalItems: [
        { productName: 'Coxinha de Frango', quantity: 100, cost: 3.50 },
        { productName: 'Suco Laranja 300ml', quantity: 50, cost: 4.20 }
      ],
      total: 560.00,
      originalTotal: 560.00,
      status: 'ABERTO',
      enterpriseId: activeEnterprise.id
    }
  ]);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isOriginalModalOpen, setIsOriginalModalOpen] = useState(false);
  const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);
  const [selectedOrderForView, setSelectedOrderForView] = useState<Order | null>(null);
  const [orderToReceive, setOrderToReceive] = useState<Order | null>(null);
  const [receiveQuantities, setReceiveQuantities] = useState<Record<string, number>>({});
  const [printFormat, setPrintFormat] = useState<'A4' | '80mm' | '58mm'>('A4');
  
  const [activeTab, setActiveTab] = useState<'LIST' | 'REPORTS'>('LIST');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);

  const isOwner = currentUser.role === Role.OWNER;
  const isAdmin = currentUser.role === Role.ADMIN;

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

  const selectedSupplier = useMemo(() => 
    suppliers.find(s => s.id === selectedSupplierId), 
  [selectedSupplierId, suppliers]);

  const sortedAndFilteredOrders = useMemo(() => {
    return orders
      .filter(o => 
        o.supplierName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.id.toLowerCase().includes(searchTerm.toLowerCase())
      )
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [orders, searchTerm]);

  const orderSubtotal = useMemo(() => 
    orderItems.reduce((acc, curr) => acc + (curr.quantity * curr.cost), 0), 
  [orderItems]);

  const totalReceivedAmount = useMemo(() => {
    if (!orderToReceive) return 0;
    return orderToReceive.items.reduce((acc, item) => {
      const qty = receiveQuantities[item.productName] || 0;
      return acc + (qty * item.cost);
    }, 0);
  }, [orderToReceive, receiveQuantities]);

  const handleUpdateItemQuantity = (productName: string, newQty: number) => {
    const qty = Math.max(0, newQty);
    if (qty === 0) {
      setOrderItems(prev => prev.filter(i => i.productName !== productName));
    } else {
      setOrderItems(prev => prev.map(i => i.productName === productName ? { ...i, quantity: qty } : i));
    }
  };

  const addItemToOrder = (productName: string, cost: number) => {
    setOrderItems(prev => {
      const existing = prev.find(i => i.productName === productName);
      if (existing) {
        return prev.map(i => i.productName === productName ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { productName, quantity: 1, cost }];
    });
  };

  const confirmReceipt = () => {
    if (!orderToReceive) return;
    const hasDivergence = orderToReceive.items.some(item => receiveQuantities[item.productName] !== item.quantity);
    if (hasDivergence && !window.confirm('Divergências detectadas. Finalizar mesmo assim?')) return;

    setOrders(prev => prev.map(o => o.id === orderToReceive.id ? { 
      ...o, status: 'ENTREGUE', total: totalReceivedAmount,
      items: o.items.map(it => ({ ...it, quantity: receiveQuantities[it.productName] }))
    } : o));
    setIsReceiveModalOpen(false);
  };

  const handleOpenNewOrder = () => {
    setEditingOrderId(null);
    setSelectedSupplierId('');
    setOrderItems([]);
    setIsModalOpen(true);
  };

  const handleEditOrder = (order: Order) => {
    if (!isOwner) return;
    if (order.status !== 'ABERTO') return alert('Apenas pedidos ABERTOS podem ser editados.');
    setEditingOrderId(order.id);
    setSelectedSupplierId(order.supplierId);
    setOrderItems(order.items);
    setIsModalOpen(true);
  };

  const handleCancelOrder = (id: string) => {
    if (!isOwner) return;
    if (window.confirm('Deseja realmente CANCELAR este pedido?')) {
      setOrders(prev => prev.map(o => o.id === id ? { ...o, status: 'CANCELADO' } : o));
    }
  };

  const handleCreateOrUpdateOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplier || orderItems.length === 0) return;

    if (editingOrderId) {
      setOrders(prev => prev.map(o => o.id === editingOrderId ? {
        ...o, supplierId: selectedSupplier.id, supplierName: selectedSupplier.name,
        items: orderItems, total: orderSubtotal, originalItems: [...orderItems], originalTotal: orderSubtotal
      } : o));
    } else {
      const newOrder: Order = {
        id: `ORD-${Math.floor(1000 + Math.random() * 9000)}`,
        supplierId: selectedSupplier.id, supplierName: selectedSupplier.name,
        date: new Date().toISOString().split('T')[0],
        items: orderItems, originalItems: [...orderItems], total: orderSubtotal, originalTotal: orderSubtotal,
        status: 'ABERTO', enterpriseId: activeEnterprise.id
      };
      setOrders([...orders, newOrder]);
    }
    setIsModalOpen(false);
  };

  return (
    <div className="orders-shell space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-xl font-black text-gray-800 tracking-tight flex items-center gap-2">
            <ClipboardList className="text-indigo-600" size={22} /> Suprimentos Enterprise
          </h1>
          <p className="text-gray-500 text-xs font-medium">Gestão de pedidos de compra e auditoria de custos.</p>
        </div>
        {isOwner && (
          <button 
            onClick={handleOpenNewOrder}
            className="bg-indigo-600 text-white px-4 py-2.5 rounded-xl font-black uppercase tracking-widest text-[11px] shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center gap-2"
          >
            <Plus size={14} /> Novo Pedido de Compra
          </button>
        )}
      </div>

      <div className="flex gap-3 border-b print:hidden">
         <button onClick={() => setActiveTab('LIST')} className={`pb-3 px-2 text-[11px] font-black uppercase tracking-widest border-b-2 transition-all ${activeTab === 'LIST' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
           Lista de Pedidos
         </button>
         {isOwner && (
           <button onClick={() => setActiveTab('REPORTS')} className={`pb-3 px-2 text-[11px] font-black uppercase tracking-widest border-b-2 transition-all ${activeTab === 'REPORTS' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
             Relatórios Analíticos
           </button>
         )}
      </div>

      {activeTab === 'LIST' ? (
        <div className="space-y-4 animate-in fade-in duration-300 print:hidden">
           <div className="bg-white p-3 rounded-2xl border shadow-sm flex flex-col md:flex-row gap-3">
              <div className="relative flex-1">
                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                 <input 
                   type="text" 
                   placeholder="Filtrar por ID ou Fornecedor..." 
                   className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-100 rounded-lg outline-none focus:ring-2 focus:ring-indigo-50 font-medium text-xs"
                   value={searchTerm}
                   onChange={e => setSearchTerm(e.target.value)}
                 />
              </div>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4">
              {sortedAndFilteredOrders.map(order => (
                <div key={order.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-lg transition-all group flex flex-col">
                  <div className="p-4 flex-1 space-y-3">
                      <div className="flex justify-between items-start">
                        <span className="text-[10px] font-black bg-indigo-50 text-indigo-600 px-2.5 py-1 rounded-lg tracking-widest">#{order.id}</span>
                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${
                          order.status === 'ABERTO' ? 'bg-amber-50 text-amber-600 border-amber-100' : 
                          order.status === 'ENTREGUE' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                          'bg-red-50 text-red-600 border-red-100'
                        }`}>
                          {order.status}
                        </span>
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-gray-800 leading-tight flex items-center gap-2">
                            <Truck size={14} className="text-indigo-400" /> {order.supplierName}
                        </h3>
                        <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase tracking-tighter">Data: {new Date(order.date).toLocaleDateString()}</p>
                      </div>
                      <div className="bg-gray-50 p-3 rounded-xl space-y-1.5">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Resumo Atual</p>
                        <div className="space-y-1">
                            {order.items.slice(0, 2).map((i, idx) => (
                              <div key={idx} className="flex justify-between text-[11px] font-bold text-gray-600">
                                <span>{i.quantity}x {i.productName}</span>
                                <span className="text-gray-400">R$ {(i.quantity * i.cost).toFixed(2)}</span>
                              </div>
                            ))}
                        </div>
                      </div>
                  </div>
                  
                  <div className="px-4 py-3.5 bg-gray-50 border-t border-gray-100">
                    <div className="flex flex-col gap-2 mb-4">
                        <div className="flex justify-between items-center">
                           <p className="text-base font-black text-indigo-600 leading-none">R$ {order.total.toFixed(2)}</p>
                           <button onClick={() => { setSelectedOrderForView(order); setIsViewModalOpen(true); }} className="flex items-center gap-1 text-[9px] font-black text-indigo-400 uppercase tracking-widest hover:text-indigo-600 transition-colors">
                              <Eye size={12} /> Ver Faturado
                           </button>
                        </div>
                        <button onClick={() => { setSelectedOrderForView(order); setIsOriginalModalOpen(true); }} className="flex items-center gap-1 text-[9px] font-black text-gray-400 uppercase tracking-widest hover:text-indigo-600 transition-colors">
                           <History size={12} /> Ver Pedido Original
                        </button>
                    </div>
	                    <div className={`grid ${isOwner ? 'grid-cols-3' : 'grid-cols-1'} gap-1.5`}>
                       <button 
                        onClick={() => {
                          setOrderToReceive(order);
                          const initialQtys: Record<string, number> = {};
                          order.items.forEach(item => { initialQtys[item.productName] = item.quantity; });
                          setReceiveQuantities(initialQtys);
                          setIsReceiveModalOpen(true);
                        }}
                        disabled={order.status !== 'ABERTO'}
	                        className={`py-2 bg-emerald-600 text-white rounded-lg font-black text-[9px] uppercase tracking-widest shadow-md shadow-emerald-100 hover:bg-emerald-700 disabled:opacity-30 flex items-center justify-center gap-1 transition-all ${!isOwner ? 'h-10 text-[11px]' : ''}`}
                       >
                         <CheckSquare size={isOwner ? 12 : 16} /> Receber
                       </button>
                       {isOwner && (
                         <>
                           <button onClick={() => handleEditOrder(order)} disabled={order.status !== 'ABERTO'} className="py-2 bg-indigo-600 text-white rounded-lg font-black text-[9px] uppercase tracking-widest shadow-md shadow-indigo-100 hover:bg-indigo-700 disabled:opacity-30 flex items-center justify-center gap-1">
                             <Edit size={12} /> Editar
                           </button>
                           <button onClick={() => handleCancelOrder(order.id)} disabled={order.status !== 'ABERTO'} className="py-2 bg-white border border-red-200 text-red-500 rounded-lg font-black text-[9px] uppercase tracking-widest hover:bg-red-50 disabled:opacity-30 flex items-center justify-center gap-1">
                             <Ban size={12} /> Cancelar
                           </button>
                         </>
                       )}
                    </div>
                  </div>
                </div>
              ))}
           </div>
        </div>
      ) : (
        <div className="space-y-6 animate-in fade-in duration-300 print:hidden text-center py-20 text-gray-400 font-bold uppercase tracking-widest text-xs">
          Módulo de Relatórios Analíticos em Processamento...
        </div>
      )}

      {/* MODAL DE CONFERÊNCIA DE RECEBIMENTO */}
      {isReceiveModalOpen && orderToReceive && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 print:hidden">
          <div className="absolute inset-0 bg-indigo-950/60 backdrop-blur-md animate-in fade-in" onClick={() => setIsReceiveModalOpen(false)}></div>
          <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[90vh]">
             <div className="bg-emerald-600 p-5 text-white flex items-center justify-between shrink-0 shadow-lg shadow-emerald-900/20">
                <div className="flex items-center gap-3">
                   <div className="bg-white/20 p-2 rounded-xl backdrop-blur-md">
                      <Scale size={22} />
                   </div>
                   <div>
                      <h2 className="text-xl font-black leading-none">Conferência e Giro de Estoque</h2>
                      <p className="text-[10px] font-bold text-emerald-100 uppercase tracking-widest mt-1">Pedido #{orderToReceive.id} • Auditoria de Entrada Física</p>
                   </div>
                </div>
                <button onClick={() => setIsReceiveModalOpen(false)}><X size={22} /></button>
             </div>
             
             <div className="flex-1 overflow-y-auto p-5 space-y-4 scrollbar-hide">
                <div className="bg-amber-50 border-l-4 border-amber-400 p-4 rounded-xl flex items-start gap-3 shadow-sm">
                   <div className="p-1.5 bg-amber-100 rounded-lg text-amber-600"><AlertCircle size={18} /></div>
                   <div>
                      <p className="text-sm font-black text-amber-900 uppercase leading-none">Instruções de Movimentação</p>
                      <p className="text-[11px] text-amber-700 mt-1 font-medium leading-relaxed">As quantidades recebidas serão somadas ao saldo atual do estoque.</p>
                   </div>
                </div>

                <div className="space-y-3">
                   <div className="grid grid-cols-12 gap-3 px-4 text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
                      <div className="col-span-4">Descrição do Produto</div>
                      <div className="col-span-2 text-center">Pedida</div>
                      <div className="col-span-3 text-center">Recebida</div>
                      <div className="col-span-3 text-right">Subtotal Recebido</div>
                   </div>
                   {orderToReceive.items.map((item, idx) => {
                     const isDivergent = receiveQuantities[item.productName] !== item.quantity;
                     const subtotal = (receiveQuantities[item.productName] || 0) * item.cost;
                     return (
                       <div key={idx} className={`grid grid-cols-12 gap-3 items-center p-3.5 rounded-xl border transition-all ${isDivergent ? 'border-amber-200 bg-amber-50/20' : 'border-gray-50 bg-white shadow-sm'}`}>
                          <div className="col-span-4 flex items-center gap-2.5">
                             <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isDivergent ? 'bg-amber-100 text-amber-600' : 'bg-indigo-50 text-indigo-500'}`}><Package size={16} /></div>
                             <div>
                                <p className="text-xs font-black text-gray-800 leading-none">{item.productName}</p>
                                <p className="text-[10px] text-gray-400 font-bold uppercase mt-1">Custo: R$ {item.cost.toFixed(2)}</p>
                             </div>
                          </div>
                          <div className="col-span-2 text-center"><span className="text-xs font-black text-gray-400">{item.quantity}</span></div>
                          <div className="col-span-3 flex items-center justify-center gap-2">
                             <button type="button" onClick={() => setReceiveQuantities(prev => ({...prev, [item.productName]: Math.max(0, prev[item.productName]-1)}))} className="p-1 bg-white border rounded-lg text-gray-400 hover:text-indigo-600 transition-all shadow-sm"><MinusCircle size={16} /></button>
                             <input type="number" value={receiveQuantities[item.productName]} onChange={(e) => setReceiveQuantities(prev => ({...prev, [item.productName]: parseInt(e.target.value) || 0}))} className="w-14 text-center bg-white border rounded-lg font-black text-gray-800 py-1.5 outline-none focus:border-emerald-500" />
                             <button type="button" onClick={() => setReceiveQuantities(prev => ({...prev, [item.productName]: prev[item.productName]+1}))} className="p-1 bg-white border rounded-lg text-gray-400 hover:text-indigo-600 transition-all shadow-sm"><PlusCircle size={16} /></button>
                          </div>
                          <div className="col-span-3 text-right"><p className={`text-xs font-black ${isDivergent ? 'text-amber-600' : 'text-gray-800'}`}>R$ {subtotal.toFixed(2)}</p></div>
                       </div>
                     );
                   })}
                </div>
             </div>

             <div className="p-5 bg-gray-50 border-t flex flex-col md:flex-row items-center justify-between gap-4 shrink-0">
                <div className="text-left">
                  <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1 animate-pulse">Total à Receber (Estoque)</p>
                  <p className="text-2xl font-black text-emerald-600">R$ {totalReceivedAmount.toFixed(2)}</p>
                </div>
                <div className="flex gap-3 w-full md:w-auto">
                   <button onClick={() => setIsReceiveModalOpen(false)} className="flex-1 md:px-6 py-3 text-[11px] font-black text-gray-400 uppercase tracking-widest">Descartar</button>
                   <button onClick={confirmReceipt} className="flex-[2] md:px-8 py-3 bg-emerald-600 text-white rounded-xl font-black uppercase tracking-widest text-xs shadow-lg shadow-emerald-200 hover:bg-emerald-700 flex items-center justify-center gap-2 transition-all"><ArrowDownToLine size={16} /> Finalizar e Atualizar Estoque</button>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* MODAL DE VISUALIZAÇÃO DE PEDIDO (REUSADO) */}
      {(isViewModalOpen || isOriginalModalOpen) && selectedOrderForView && (
        <OrderPrintView 
          order={{
            ...selectedOrderForView,
            items: isOriginalModalOpen ? (selectedOrderForView.originalItems || selectedOrderForView.items) : selectedOrderForView.items,
            total: isOriginalModalOpen ? (selectedOrderForView.originalTotal || selectedOrderForView.total) : selectedOrderForView.total
          }} 
          enterprise={activeEnterprise} format={printFormat} setFormat={setPrintFormat}
          onClose={() => { setIsViewModalOpen(false); setIsOriginalModalOpen(false); }}
          onPrint={() => window.print()} isOriginal={isOriginalModalOpen}
          title={isOriginalModalOpen ? "Visualização de Pedido Original" : "Visualização de Pedido"}
          subTitle={isOriginalModalOpen ? "Snapshot de Requisição de Compra" : "Documento de Faturamento/Entrega"}
        />
      )}

      {/* MODAL DE CRIAÇÃO/EDIÇÃO DE PEDIDO DE COMPRA (DESIGN COMPACTO) */}
      {isModalOpen && isOwner && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-indigo-950/40 backdrop-blur-sm animate-in fade-in" onClick={() => setIsModalOpen(false)}></div>
          <form onSubmit={handleCreateOrUpdateOrder} className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col h-[85vh]">
            <div className="bg-indigo-600 p-5 text-white flex items-center justify-between shrink-0">
               <div className="flex items-center gap-3">
                  <div className="bg-white/20 p-2 rounded-xl backdrop-blur-md">
                    <ShoppingCart size={24} />
                  </div>
                  <div>
                    <h2 className="text-lg font-black leading-none">{editingOrderId ? `Editando ${editingOrderId}` : 'Novo Pedido de Compra'}</h2>
                    <p className="text-[9px] font-bold text-indigo-200 uppercase tracking-[2px] mt-1">Geração de documento logístico B2B</p>
                  </div>
               </div>
               <button type="button" onClick={() => setIsModalOpen(false)} className="hover:bg-white/10 p-1.5 rounded-full transition-colors"><X size={22} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-6 scrollbar-hide">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                  <div className="space-y-1.5">
                     <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1">
                        <Truck size={10} className="text-indigo-400" /> 1. Escolha o Fornecedor Parceiro
                     </label>
                     <select 
                      required value={selectedSupplierId} onChange={e => { setSelectedSupplierId(e.target.value); setOrderItems([]); }}
                      className="w-full px-4 py-2.5 bg-gray-50 border-2 border-gray-100 rounded-xl outline-none focus:border-indigo-500 font-black text-gray-800 text-sm appearance-none transition-all cursor-pointer"
                     >
                        <option value="">-- Selecione um Parceiro --</option>
                        {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                     </select>
                  </div>
                  <div className="p-3.5 bg-indigo-50 rounded-2xl border border-indigo-100">
                     <p className="text-[8px] font-black text-indigo-400 uppercase tracking-widest leading-tight">Unidade Destinatária</p>
                     <p className="text-xs font-black text-gray-800 uppercase tracking-tight">{activeEnterprise.name}</p>
                  </div>
               </div>

               <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 h-full min-h-0">
                  {/* Catálogo à Esquerda */}
                  <div className="lg:col-span-5 flex flex-col gap-3 overflow-hidden">
                     <div className="flex items-center justify-between border-b pb-1.5">
                        <h3 className="text-[9px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                            <Package size={14} className="text-indigo-400" /> Catálogo de Produtos
                        </h3>
                     </div>
                     {selectedSupplier && (
                        <div className="space-y-1.5 overflow-y-auto pr-1 scrollbar-hide flex-1">
                           {selectedSupplier.suppliedProducts?.map((prod, idx) => (
                              <button key={idx} type="button" onClick={() => addItemToOrder(prod.name, prod.cost)}
                                className="w-full bg-white p-2.5 rounded-xl border border-gray-100 flex items-center justify-between hover:border-indigo-500 hover:shadow transition-all group active:scale-95"
                              >
                                 <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                       <PlusIcon size={16} />
                                    </div>
                                    <div className="text-left">
                                       <p className="text-xs font-black text-gray-800 leading-none">{prod.name}</p>
                                       <p className="text-[9px] font-bold text-emerald-600 mt-0.5 uppercase tracking-tighter">Custo: R$ {prod.cost.toFixed(2)}</p>
                                    </div>
                                 </div>
                              </button>
                           ))}
                        </div>
                     )}
                  </div>

                  {/* Carrinho à Direita (Com Controles de Qtd) */}
                  <div className="lg:col-span-7 flex flex-col gap-3 overflow-hidden">
                     <div className="bg-gray-900 rounded-2xl overflow-hidden shadow-xl flex flex-col h-full">
                        <div className="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-hide">
                           {orderItems.length === 0 ? (
                             <div className="h-full flex flex-col items-center justify-center opacity-30 text-white gap-2">
                                <ShoppingCart size={32} />
                                <p className="text-[10px] font-black uppercase tracking-[3px]">Lista de Compra Vazia</p>
                             </div>
                           ) : orderItems.map((item, idx) => (
                             <div key={idx} className="flex items-center justify-between bg-white/5 p-2.5 rounded-xl border border-white/5 animate-in slide-in-from-right-2">
                                <div className="flex-1 pr-3">
                                   <p className="text-xs font-black text-white leading-tight">{item.productName}</p>
                                   <p className="text-[9px] text-gray-500 font-bold uppercase mt-0.5">R$ {item.cost.toFixed(2)} / un</p>
                                </div>
                                <div className="flex items-center gap-4">
                                   <div className="flex items-center gap-1.5 bg-black/40 rounded-xl p-1 border border-white/10">
                                      <button type="button" onClick={() => handleUpdateItemQuantity(item.productName, item.quantity - 1)} className="w-6 h-6 rounded-lg bg-white/5 text-gray-400 hover:text-white flex items-center justify-center"><Minus size={14}/></button>
                                      <input 
                                        type="number" value={item.quantity} 
                                        onChange={(e) => handleUpdateItemQuantity(item.productName, parseInt(e.target.value) || 0)}
                                        className="w-10 bg-transparent text-center text-xs font-black text-white outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" 
                                      />
                                      <button type="button" onClick={() => handleUpdateItemQuantity(item.productName, item.quantity + 1)} className="w-6 h-6 rounded-lg bg-white/5 text-gray-400 hover:text-white flex items-center justify-center"><PlusIcon size={14}/></button>
                                   </div>
                                   <div className="min-w-[70px] text-right">
                                      <p className="text-xs font-black text-indigo-400">R$ {(item.quantity * item.cost).toFixed(2)}</p>
                                   </div>
                                   <button type="button" onClick={() => handleUpdateItemQuantity(item.productName, 0)} className="text-gray-600 hover:text-red-400 ml-1 transition-colors"><Trash2 size={14}/></button>
                                </div>
                             </div>
                           ))}
                        </div>
                        <div className="p-5 bg-black/40 border-t border-white/5 flex items-center justify-between">
                           <div>
                              <span className="text-[8px] font-black text-indigo-400 uppercase tracking-widest">Total Geral do Pedido</span>
                              <p className="text-2xl font-black text-white tracking-tighter">R$ {orderSubtotal.toFixed(2)}</p>
                           </div>
                           <div className="text-right">
                              <span className="text-[8px] font-black text-gray-500 uppercase tracking-widest block">Volume Total</span>
                              <span className="text-sm font-black text-gray-400">{orderItems.reduce((s,i)=>s+i.quantity, 0)} un</span>
                           </div>
                        </div>
                     </div>
                  </div>
               </div>
            </div>

            <div className="p-5 bg-gray-50 border-t flex gap-3 shrink-0">
               <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Descartar</button>
               <button type="submit" className="flex-[2] py-3 bg-indigo-600 text-white rounded-xl font-black uppercase tracking-[2px] text-xs shadow-lg hover:bg-indigo-700 transition-all flex items-center justify-center gap-2">
                 <PrinterCheck size={16} /> {editingOrderId ? 'Salvar e Imprimir' : 'Faturar e Gerar Ordem'}
               </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

/* COMPONENTE DE VISUALIZAÇÃO PARA REUSO */
const OrderPrintView = ({ order, enterprise, format, setFormat, onClose, onPrint, isOriginal, title, subTitle }: any) => (
  <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 print:p-0 print:block print:relative print:z-0">
    <div className="absolute inset-0 bg-indigo-950/60 backdrop-blur-md animate-in fade-in print:hidden" onClick={onClose}></div>
    <div className={`relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[90vh] print:max-h-none print:shadow-none print:rounded-none print:w-full`}>
       <div className={`${isOriginal ? 'bg-slate-700' : 'bg-gray-900'} p-5 text-white flex items-center justify-between shrink-0 print:hidden`}>
          <div className="flex items-center gap-3">
             <div className="bg-white/20 p-2 rounded-xl backdrop-blur-md">{isOriginal ? <History size={22} /> : <FileText size={22} />}</div>
             <div>
                <h2 className="text-xl font-black">{title}</h2>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">{subTitle}</p>
             </div>
          </div>
          <div className="flex items-center gap-2">
             <select value={format} onChange={(e) => setFormat(e.target.value as any)} className="bg-white/10 text-white border-none rounded-xl text-[10px] font-black uppercase tracking-widest px-4 py-2 outline-none">
               <option value="A4" className="text-gray-800">Formato A4</option>
               <option value="80mm" className="text-gray-800">Formato 80mm</option>
               <option value="58mm" className="text-gray-800">Formato 58mm</option>
             </select>
             <button onClick={onPrint} className="bg-indigo-600 text-white p-2 rounded-lg hover:bg-indigo-700 transition-all"><Printer size={16} /></button>
             <button onClick={onClose} className="p-2 text-gray-400 hover:text-white transition-all"><X size={18} /></button>
          </div>
       </div>
       <div className={`flex-1 overflow-y-auto p-8 bg-white scrollbar-hide print:p-0 print:overflow-visible ${format === '80mm' ? 'max-w-[80mm] mx-auto' : format === '58mm' ? 'max-w-[58mm] mx-auto' : ''}`}>
          <style>{`@media print { body { margin: 0; padding: 0; background: white; } .print-content { width: ${format === 'A4' ? '100%' : format}; margin: 0 auto; font-family: 'Courier New', Courier, monospace; font-size: ${format === 'A4' ? '12pt' : '8pt'}; } @page { margin: 0.5cm; } }`}</style>
          <div className="print-content space-y-8 relative">
             {isOriginal && <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-45 pointer-events-none opacity-[0.03] select-none"><p className="text-[120px] font-black leading-none">ORIGINAL</p></div>}
             <div className="flex flex-col md:flex-row justify-between gap-8 border-b-2 border-gray-100 pb-8">
                <div className="space-y-2">
                   <h1 className="text-3xl font-black text-gray-900 leading-none">{enterprise.name}</h1>
                   <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Unidade Compradora</p>
                   <div className="text-xs font-medium text-gray-600 space-y-0.5"><p>CNPJ: {enterprise.document}</p><p>{enterprise.address}</p></div>
                </div>
                <div className="text-right space-y-2">
                   <div className={`inline-block px-4 py-2 ${isOriginal ? 'bg-slate-700' : 'bg-gray-900'} text-white rounded-2xl font-black text-xl`}>#{order.id}</div>
                   <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Emissão Original: {new Date(order.date).toLocaleDateString()}</p>
                </div>
             </div>
             <div className="bg-gray-50 p-6 rounded-3xl border border-gray-100 flex flex-col md:flex-row justify-between gap-6">
                <div className="space-y-1"><p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Fornecedor / Parceiro</p><p className="text-lg font-black text-gray-800">{order.supplierName}</p></div>
                <div className="md:text-right space-y-1"><p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Estado do Documento</p><p className={`text-sm font-black uppercase ${isOriginal ? 'text-slate-500' : 'text-indigo-600'}`}>{isOriginal ? 'SNAPSHOT ORIGINAL' : order.status}</p></div>
             </div>
             <div className="space-y-4">
                <div className="grid grid-cols-12 gap-4 border-b-2 border-gray-900 pb-2 text-[10px] font-black uppercase tracking-widest"><div className="col-span-1">#</div><div className="col-span-6">Descrição do Item</div><div className="col-span-2 text-center">Qtd</div><div className="col-span-3 text-right">Subtotal</div></div>
                <div className="divide-y divide-gray-100">{order.items.map((item: any, idx: number) => (<div key={idx} className="grid grid-cols-12 gap-4 py-3 text-sm"><div className="col-span-1 text-gray-400 font-mono">{(idx + 1).toString().padStart(2, '0')}</div><div className="col-span-6 font-black text-gray-800 uppercase tracking-tight">{item.productName}</div><div className="col-span-2 text-center font-bold">{item.quantity}</div><div className="col-span-3 text-right font-black">R$ {(item.quantity * item.cost).toFixed(2)}</div></div>))}</div>
             </div>
             <div className="pt-8 flex flex-col items-end space-y-4"><div className="w-full md:w-1/2 space-y-2 border-t-2 border-gray-900 pt-4"><div className="flex justify-between items-center text-xs font-bold text-gray-400 uppercase tracking-widest"><span>Total de Itens</span><span>{order.items.length}</span></div><div className="flex justify-between items-center pt-2"><span className="text-xl font-black text-gray-900 uppercase">Valor do Pedido</span><span className={`text-3xl font-black ${isOriginal ? 'text-slate-600' : 'text-indigo-600'} tracking-tighter`}>R$ {order.total.toFixed(2)}</span></div></div></div>
          </div>
       </div>
       <div className="p-5 bg-gray-50 flex justify-end gap-3 shrink-0 print:hidden">
          <button onClick={onClose} className="px-6 py-3 bg-white border text-gray-600 rounded-xl font-black uppercase text-[11px] tracking-widest shadow-sm hover:bg-gray-100 transition-all">Fechar</button>
          <button onClick={onPrint} className={`px-6 py-3 ${isOriginal ? 'bg-slate-700' : 'bg-indigo-600'} text-white rounded-xl font-black uppercase text-[11px] tracking-widest shadow-lg hover:opacity-90 transition-all flex items-center gap-2`}><Printer size={14} /> Imprimir {isOriginal ? 'Original' : 'Documento'}</button>
       </div>
    </div>
  </div>
);

const SummaryCard = ({ label, value, icon, color }: any) => (
  <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-3 group hover:shadow-lg transition-all">
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color} shadow-inner group-hover:scale-110 transition-transform`}>{React.cloneElement(icon as React.ReactElement, { size: 18 })}</div>
    <div>
      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">{label}</p>
      <p className="text-lg font-black text-gray-800 leading-none">{value}</p>
    </div>
  </div>
);

export default OrdersPage;
