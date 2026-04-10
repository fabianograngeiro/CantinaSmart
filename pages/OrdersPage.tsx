import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ClipboardList,
  Plus,
  Search,
  Truck,
  CheckSquare,
  Edit,
  Ban,
  X,
  Minus,
  Plus as PlusIcon,
  Save,
  Eye,
  Building2,
  CheckCircle2,
} from 'lucide-react';
import { ApiService } from '../services/api';
import { Supplier, Order, OrderItem, Role, User, Enterprise } from '../types';

interface OrdersPageProps {
  currentUser: User;
  activeEnterprise: Enterprise;
}

const OrdersPage: React.FC<OrdersPageProps> = ({ currentUser, activeEnterprise }) => {
  const isOwner = currentUser.role === Role.OWNER;
  const canCreateOrder = currentUser.role !== Role.FUNCIONARIO_BASICO;

  const [orders, setOrders] = useState<Order[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [enterprises, setEnterprises] = useState<Enterprise[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [unitFilter, setUnitFilter] = useState<string>(activeEnterprise?.id || 'ALL');

  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [selectedEnterpriseId, setSelectedEnterpriseId] = useState(activeEnterprise?.id || '');
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);

  const [viewOrder, setViewOrder] = useState<Order | null>(null);
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const isSavingOrderRef = useRef(false);

  const formatOrderStatus = (status: Order['status'] | string) => {
    if (String(status || '').trim().toUpperCase() === 'AGUARDANDO_APROVACAO_OWNER') {
      return 'AGUARDANDO OWNER';
    }
    return String(status || '').replaceAll('_', ' ');
  };

  const enterpriseNameById = useMemo(() => {
    const map = new Map<string, string>();
    enterprises.forEach((enterprise) => map.set(enterprise.id, enterprise.name));
    return map;
  }, [enterprises]);

  const loadOrders = async () => {
    const data = await ApiService.getOrders(isOwner ? undefined : activeEnterprise.id);
    setOrders(Array.isArray(data) ? data : []);
  };

  const loadSuppliers = async (enterpriseId?: string) => {
    const data = await ApiService.getSuppliers(enterpriseId || activeEnterprise?.id);
    setSuppliers(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        const [enterpriseData] = await Promise.all([
          ApiService.getEnterprises(),
          loadOrders(),
          loadSuppliers(isOwner ? selectedEnterpriseId || activeEnterprise?.id : activeEnterprise?.id),
        ]);
        setEnterprises(Array.isArray(enterpriseData) ? enterpriseData : []);
      } catch (err) {
        console.error('Erro ao carregar pedidos:', err);
        setOrders([]);
        setSuppliers([]);
      }
    };
    loadData();
  }, [activeEnterprise?.id]);

  useEffect(() => {
    if (!isOwner) return;
    loadSuppliers(selectedEnterpriseId || activeEnterprise?.id).catch((err) => {
      console.error('Erro ao carregar fornecedores por unidade:', err);
      setSuppliers([]);
    });
  }, [isOwner, selectedEnterpriseId, activeEnterprise?.id]);

  const filteredOrders = useMemo(() => {
    return orders
      .filter((order) => {
        const matchesSearch =
          order.id.toLowerCase().includes(searchTerm.toLowerCase())
          || order.supplierName.toLowerCase().includes(searchTerm.toLowerCase());

        if (!matchesSearch) return false;
        if (!isOwner) return String(order.enterpriseId || '') === String(activeEnterprise?.id || '');
        if (unitFilter === 'ALL') return true;
        return String(order.enterpriseId || '') === String(unitFilter);
      })
      .sort((a, b) => {
        const aDate = new Date(String(a.date || '')).getTime();
        const bDate = new Date(String(b.date || '')).getTime();
        return (Number.isFinite(bDate) ? bDate : 0) - (Number.isFinite(aDate) ? aDate : 0);
      });
  }, [orders, searchTerm, isOwner, activeEnterprise?.id, unitFilter]);

  const selectedSupplier = useMemo(
    () => suppliers.find((supplier) => supplier.id === selectedSupplierId),
    [selectedSupplierId, suppliers]
  );

  const orderTotal = useMemo(
    () => orderItems.reduce((acc, item) => acc + (item.quantity * item.cost), 0),
    [orderItems]
  );

  const addItemToOrder = (name: string, cost: number) => {
    if (!name || cost <= 0) return;
    setOrderItems((prev) => {
      const existing = prev.find((item) => item.productName === name);
      if (existing) {
        return prev.map((item) => item.productName === name ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { productName: name, quantity: 1, cost }];
    });
  };

  const updateOrderItemQuantity = (productName: string, quantity: number) => {
    const normalized = Math.max(0, quantity);
    if (normalized === 0) {
      setOrderItems((prev) => prev.filter((item) => item.productName !== productName));
      return;
    }
    setOrderItems((prev) => prev.map((item) => item.productName === productName ? { ...item, quantity: normalized } : item));
  };

  const openNewOrder = () => {
    setEditingOrder(null);
    setSelectedSupplierId('');
    setOrderItems([]);
    setSelectedEnterpriseId(activeEnterprise?.id || enterprises[0]?.id || '');
    setIsOrderModalOpen(true);
  };

  const openEditOrder = (order: Order) => {
    if (!isOwner) return;
    setEditingOrder(order);
    setSelectedSupplierId(order.supplierId);
    setOrderItems(Array.isArray(order.items) ? order.items : []);
    setSelectedEnterpriseId(order.enterpriseId || activeEnterprise?.id || '');
    setIsOrderModalOpen(true);
  };

  const saveOrder = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSavingOrderRef.current) return;
    if (!selectedSupplier || orderItems.length === 0) {
      alert('Selecione fornecedor e adicione itens ao pedido.');
      return;
    }

    const targetEnterpriseId = isOwner
      ? (selectedEnterpriseId || activeEnterprise?.id || '')
      : String(activeEnterprise?.id || '');

    if (!targetEnterpriseId) {
      alert('Selecione uma unidade para o pedido.');
      return;
    }

    const payload = {
      supplierId: selectedSupplier.id,
      supplierName: selectedSupplier.name,
      date: editingOrder?.date || new Date().toISOString().split('T')[0],
      items: orderItems,
      originalItems: editingOrder?.originalItems || orderItems,
      total: orderTotal,
      originalTotal: editingOrder?.originalTotal || orderTotal,
      status: editingOrder?.status || (isOwner ? 'ABERTO' : 'AGUARDANDO_APROVACAO_OWNER'),
      enterpriseId: targetEnterpriseId,
      enterpriseName: enterpriseNameById.get(targetEnterpriseId) || '',
      createdBy: currentUser.name,
      approvedAt: editingOrder?.approvedAt || (isOwner && !editingOrder?.id ? new Date().toISOString() : ''),
      approvedBy: editingOrder?.approvedBy || (isOwner && !editingOrder?.id ? currentUser.name : ''),
      trackingNote: editingOrder?.trackingNote || (isOwner ? '' : 'Aguardando aprovacao do owner.'),
    };

    try {
      isSavingOrderRef.current = true;
      setIsSavingOrder(true);
      if (editingOrder?.id) {
        await ApiService.updateOrder(editingOrder.id, payload);
      } else {
        await ApiService.createOrder(payload);
      }
      await loadOrders();
      setIsOrderModalOpen(false);
    } catch (err) {
      console.error('Erro ao salvar pedido:', err);
      alert(err instanceof Error ? err.message : 'Nao foi possivel salvar o pedido.');
    } finally {
      isSavingOrderRef.current = false;
      setIsSavingOrder(false);
    }
  };

  const markAsReceived = async (order: Order) => {
    if (order.status !== 'ABERTO') return;
    try {
      await ApiService.updateOrder(order.id, {
        status: 'ENTREGUE',
        total: order.total,
      });
      await loadOrders();
    } catch (err) {
      console.error('Erro ao receber pedido:', err);
      alert(err instanceof Error ? err.message : 'Nao foi possivel concluir o recebimento.');
    }
  };

  const approveOrder = async (order: Order) => {
    if (!isOwner || order.status !== 'AGUARDANDO_APROVACAO_OWNER') return;
    try {
      await ApiService.updateOrder(order.id, {
        status: 'ABERTO',
        approvedAt: new Date().toISOString(),
        approvedBy: currentUser.name,
        trackingNote: order.trackingNote || 'Aprovado pelo owner para acompanhamento.',
      });
      await loadOrders();
    } catch (err) {
      console.error('Erro ao aprovar pedido:', err);
      alert(err instanceof Error ? err.message : 'Nao foi possivel aprovar o pedido.');
    }
  };

  const cancelOrder = async (order: Order) => {
    if (!isOwner || (order.status !== 'ABERTO' && order.status !== 'AGUARDANDO_APROVACAO_OWNER')) return;
    if (!window.confirm('Deseja cancelar este pedido de compra?')) return;
    try {
      await ApiService.updateOrder(order.id, { status: 'CANCELADO' });
      await loadOrders();
    } catch (err) {
      console.error('Erro ao cancelar pedido:', err);
      alert(err instanceof Error ? err.message : 'Nao foi possivel cancelar o pedido.');
    }
  };

  if (!activeEnterprise && !isOwner) {
    return (
      <div className="orders-shell flex items-center justify-center h-96 rounded-2xl">
        <div className="text-center space-y-4">
          <div className="animate-spin inline-block w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full" />
          <p className="text-gray-600 dark:text-zinc-300 font-medium">Carregando pedidos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="orders-shell space-y-4 p-3 md:p-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-gray-800 tracking-tight flex items-center gap-2">
            <ClipboardList className="text-indigo-600" size={22} /> Suprimentos Enterprise
          </h1>
          <p className="text-gray-500 text-xs font-medium">
            Lista operacional de pedidos para aprovacao, edicao e acompanhamento.
          </p>
        </div>
        {canCreateOrder && (
          <button
            onClick={openNewOrder}
            className="bg-indigo-600 text-white px-4 py-2.5 rounded-xl font-black uppercase tracking-widest text-[11px] shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center gap-2"
          >
            <Plus size={14} /> Novo Pedido de Compra
          </button>
        )}
      </div>

      <div className="bg-white p-3 rounded-2xl border shadow-sm flex flex-col xl:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            placeholder="Buscar por ID ou fornecedor..."
            className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-100 rounded-lg outline-none focus:ring-2 focus:ring-indigo-50 font-medium text-xs"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {isOwner && (
          <div className="w-full xl:w-72">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 block">Unidade</label>
            <select
              value={unitFilter}
              onChange={(e) => setUnitFilter(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-lg outline-none focus:ring-2 focus:ring-indigo-50 text-xs font-black uppercase"
            >
              <option value="ALL">Todas as unidades</option>
              {enterprises.map((enterprise) => (
                <option key={`order-unit-filter-${enterprise.id}`} value={enterprise.id}>{enterprise.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {filteredOrders.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center text-gray-400 font-black uppercase tracking-widest text-xs">
            Nenhum pedido encontrado
          </div>
        ) : (
          filteredOrders.map((order) => {
            const statusStyle = order.status === 'ENTREGUE'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : order.status === 'CANCELADO'
                ? 'bg-red-50 text-red-700 border-red-200'
                : order.status === 'AGUARDANDO_APROVACAO_OWNER'
                  ? 'bg-cyan-50 text-cyan-700 border-cyan-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200';

            return (
              <div key={order.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Pedido #{order.id}</p>
                      <h3 className="text-sm font-black text-gray-800 flex items-center gap-2">
                        <Truck size={14} className="text-indigo-400" /> {order.supplierName}
                      </h3>
                      <div className="flex flex-wrap items-center gap-2 text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                        <span>Data: {new Date(order.date).toLocaleDateString()}</span>
                        <span className="text-gray-300">|</span>
                        <span className="inline-flex items-center gap-1">
                          <Building2 size={12} /> {order.enterpriseName || enterpriseNameById.get(order.enterpriseId) || order.enterpriseId}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full border ${statusStyle}`}>
                        {formatOrderStatus(order.status)}
                      </span>
                      {order.approvedAt && (
                        <span className="text-[10px] font-black text-emerald-600 uppercase tracking-wider inline-flex items-center gap-1">
                          <CheckCircle2 size={11} /> Aprovado por {order.approvedBy || 'OWNER'}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Itens</p>
                    <div className="space-y-1">
                      {order.items.map((item, index) => (
                        <div key={`${order.id}-item-${index}`} className="flex justify-between text-xs font-bold text-gray-700">
                          <span>{item.quantity}x {item.productName}</span>
                          <span>R$ {(item.quantity * item.cost).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-lg font-black text-indigo-600">R$ {Number(order.total || 0).toFixed(2)}</p>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => setViewOrder(order)} className="px-2.5 py-2 rounded-lg border border-gray-200 text-gray-600 text-[10px] font-black uppercase tracking-wider hover:bg-gray-50 flex items-center gap-1">
                        <Eye size={12} /> Acompanhar
                      </button>
                      <button
                        onClick={() => markAsReceived(order)}
                        disabled={order.status !== 'ABERTO'}
                        className="px-2.5 py-2 rounded-lg bg-emerald-600 text-white text-[10px] font-black uppercase tracking-wider disabled:opacity-40 hover:bg-emerald-700 flex items-center gap-1"
                      >
                        <CheckSquare size={12} /> Receber
                      </button>
                      {isOwner && (
                        <>
                          <button
                            onClick={() => approveOrder(order)}
                            disabled={order.status !== 'AGUARDANDO_APROVACAO_OWNER'}
                            className="px-2.5 py-2 rounded-lg bg-cyan-600 text-white text-[10px] font-black uppercase tracking-wider disabled:opacity-40 hover:bg-cyan-700"
                          >
                            Aprovar
                          </button>
                          <button
                            onClick={() => openEditOrder(order)}
                            disabled={order.status === 'ENTREGUE' || order.status === 'CANCELADO'}
                            className="px-2.5 py-2 rounded-lg bg-indigo-600 text-white text-[10px] font-black uppercase tracking-wider disabled:opacity-40 hover:bg-indigo-700 flex items-center gap-1"
                          >
                            <Edit size={12} /> Editar
                          </button>
                          <button
                            onClick={() => cancelOrder(order)}
                            disabled={order.status !== 'ABERTO'}
                            className="px-2.5 py-2 rounded-lg border border-red-200 text-red-600 text-[10px] font-black uppercase tracking-wider disabled:opacity-40 hover:bg-red-50 flex items-center gap-1"
                          >
                            <Ban size={12} /> Cancelar
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {isOrderModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-indigo-950/50 backdrop-blur-sm" onClick={() => { if (!isSavingOrder) setIsOrderModalOpen(false); }} />
          <form onSubmit={saveOrder} className="relative w-full max-w-5xl bg-white rounded-2xl shadow-2xl overflow-hidden h-[88vh] flex flex-col">
            <div className="bg-indigo-600 text-white px-5 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black">{editingOrder ? `Editar ${editingOrder.id}` : 'Novo Pedido de Compra'}</h2>
                <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-200">Owner aprova, gerente executa e acompanha</p>
              </div>
              <button type="button" disabled={isSavingOrder} onClick={() => setIsOrderModalOpen(false)} className="p-2 hover:bg-white/10 rounded-full disabled:opacity-50">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Fornecedor</label>
                  <select
                    required
                    value={selectedSupplierId}
                    onChange={(e) => {
                      setSelectedSupplierId(e.target.value);
                      setOrderItems([]);
                    }}
                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:border-indigo-500 text-sm font-bold"
                  >
                    <option value="">Selecione um fornecedor</option>
                    {suppliers.map((supplier) => (
                      <option key={`order-supplier-${supplier.id}`} value={supplier.id}>{supplier.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Unidade do Pedido</label>
                  {isOwner ? (
                    <select
                      required
                      value={selectedEnterpriseId}
                      onChange={(e) => setSelectedEnterpriseId(e.target.value)}
                      className="w-full px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:border-indigo-500 text-sm font-bold"
                    >
                      <option value="">Selecione a unidade</option>
                      {enterprises.map((enterprise) => (
                        <option key={`order-modal-ent-${enterprise.id}`} value={enterprise.id}>{enterprise.name}</option>
                      ))}
                    </select>
                  ) : (
                    <div className="w-full px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm font-black text-gray-700 uppercase">
                      {activeEnterprise?.name}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <div className="lg:col-span-5 bg-gray-50 rounded-2xl border border-gray-100 p-3 space-y-2">
                  <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Catalogo do Parceiro</h3>
                  <div className="space-y-2 max-h-[360px] overflow-y-auto">
                    {(selectedSupplier?.suppliedProducts || []).map((product, index) => (
                      <button
                        type="button"
                        key={`order-catalog-item-${index}`}
                        onClick={() => addItemToOrder(product.name, product.cost)}
                        className="w-full p-2.5 rounded-lg bg-white border border-gray-100 hover:border-indigo-400 transition-all text-left flex items-center justify-between"
                      >
                        <div>
                          <p className="text-xs font-black text-gray-800">{product.name}</p>
                          <p className="text-[10px] font-bold text-emerald-600">R$ {Number(product.cost || 0).toFixed(2)}</p>
                        </div>
                        <PlusIcon size={14} className="text-indigo-500" />
                      </button>
                    ))}
                    {!selectedSupplier && (
                      <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 text-center py-10">Selecione um fornecedor</div>
                    )}
                  </div>
                </div>

                <div className="lg:col-span-7 bg-gray-900 rounded-2xl border border-gray-800 p-3 flex flex-col min-h-[360px]">
                  <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Itens do Pedido</h3>
                  <div className="flex-1 overflow-y-auto space-y-2">
                    {orderItems.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-[10px] font-black uppercase tracking-widest text-gray-600">Carrinho de compra vazio</div>
                    ) : (
                      orderItems.map((item, index) => (
                        <div key={`order-item-${index}`} className="bg-white/5 border border-white/10 rounded-xl p-2.5 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-black text-white">{item.productName}</p>
                            <p className="text-[10px] font-bold text-indigo-300">R$ {item.cost.toFixed(2)} / un</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={() => updateOrderItemQuantity(item.productName, item.quantity - 1)} className="w-7 h-7 rounded-lg bg-white/10 text-white flex items-center justify-center">
                              <Minus size={12} />
                            </button>
                            <input
                              type="number"
                              min={0}
                              value={item.quantity}
                              onChange={(e) => updateOrderItemQuantity(item.productName, Number(e.target.value || 0))}
                              className="w-14 text-center rounded-lg bg-black/30 border border-white/20 text-white text-xs font-black py-1.5"
                            />
                            <button type="button" onClick={() => updateOrderItemQuantity(item.productName, item.quantity + 1)} className="w-7 h-7 rounded-lg bg-white/10 text-white flex items-center justify-center">
                              <PlusIcon size={12} />
                            </button>
                          </div>
                          <p className="text-xs font-black text-indigo-300 min-w-[80px] text-right">R$ {(item.quantity * item.cost).toFixed(2)}</p>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="pt-3 border-t border-white/10 flex items-center justify-between mt-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-indigo-300">Total</p>
                    <p className="text-2xl font-black text-white">R$ {orderTotal.toFixed(2)}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-5 py-4 bg-gray-50 border-t flex items-center gap-3">
              <button type="button" disabled={isSavingOrder} onClick={() => setIsOrderModalOpen(false)} className="flex-1 py-3 text-[11px] font-black text-gray-400 uppercase tracking-widest disabled:opacity-50">Cancelar</button>
              <button type="submit" disabled={isSavingOrder} className="flex-[2] py-3 bg-indigo-600 text-white rounded-xl font-black uppercase tracking-widest text-xs hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 disabled:bg-gray-300 disabled:cursor-not-allowed">
                <Save size={14} /> {isSavingOrder ? 'Salvando...' : 'Salvar Pedido'}
              </button>
            </div>
          </form>
        </div>
      )}

      {viewOrder && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-indigo-950/50 backdrop-blur-sm" onClick={() => setViewOrder(null)} />
          <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="bg-gray-900 text-white px-5 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black">Acompanhamento do Pedido {viewOrder.id}</h3>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-300">Status e historico operacional</p>
              </div>
              <button onClick={() => setViewOrder(null)} className="p-2 hover:bg-white/10 rounded-full">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <InfoCard label="Fornecedor" value={viewOrder.supplierName} />
                <InfoCard label="Unidade" value={viewOrder.enterpriseName || enterpriseNameById.get(viewOrder.enterpriseId) || viewOrder.enterpriseId} />
                <InfoCard label="Status" value={formatOrderStatus(viewOrder.status)} />
                <InfoCard label="Aprovacao" value={viewOrder.approvedAt ? `${new Date(viewOrder.approvedAt).toLocaleString()} (${viewOrder.approvedBy || 'OWNER'})` : 'Pendente'} />
              </div>

              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Itens</p>
                <div className="space-y-1">
                  {viewOrder.items.map((item, index) => (
                    <div key={`view-order-item-${index}`} className="flex justify-between text-xs font-bold text-gray-700">
                      <span>{item.quantity}x {item.productName}</span>
                      <span>R$ {(item.quantity * item.cost).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-indigo-50 rounded-xl p-3 border border-indigo-100">
                <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-1">Acompanhamento</p>
                <p className="text-sm font-bold text-indigo-700">
                  {viewOrder.trackingNote || 'Pedido em acompanhamento pelo owner e equipe de suprimentos.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const InfoCard: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="bg-white rounded-xl border border-gray-100 p-3">
    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{label}</p>
    <p className="text-sm font-black text-gray-800 mt-1 leading-snug">{value || '-'}</p>
  </div>
);

export default OrdersPage;
