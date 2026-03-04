import React, { useState, useMemo, useEffect } from 'react';
import { 
  Scale, Utensils, ShoppingCart, Trash2, CreditCard, X, 
  CheckCircle2, Plus, Minus, Calculator, User, Building,
  Smartphone, Wallet, Banknote, Receipt, ArrowRight,
  Beef, Apple, Info, Star, Sandwich, Pizza, Wine,
  Beer, Droplets, IceCream, Coffee
} from 'lucide-react';
import { ApiService } from '../services/api';
import { SaleItem, PaymentEntry, User as UserType, Enterprise, Product, TransactionRecord } from '../types';

interface RestaurantPOSPageProps {
  currentUser: UserType;
  activeEnterprise: Enterprise;
  onRegisterTransaction?: (transaction: TransactionRecord) => void;
}

type SubCategory = 'TODOS' | 'CERVEJAS' | 'SUCOS' | 'AGUAS' | 'SOBREMESAS';

const RestaurantPOSPage: React.FC<RestaurantPOSPageProps> = ({ activeEnterprise, onRegisterTransaction }) => {
  // Guard clause: se não houver enterprise ativa, retornar carregamento
  if (!activeEnterprise) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center space-y-4">
          <div className="animate-spin inline-block w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full"></div>
          <p className="text-gray-600 font-medium">Carregando restaurante...</p>
        </div>
      </div>
    );
  }

  const [activeMode, setActiveMode] = useState<'KG' | 'PF' | 'MARMITA' | 'PRODUCTS'>('KG');
  const [activeSubCategory, setActiveSubCategory] = useState<SubCategory>('TODOS');
  const [cart, setCart] = useState<SaleItem[]>([]);
  const [kgWeight, setKgWeight] = useState<string>('');
  const [kgTara, setKgTara] = useState<number>(0.250); // 250g tara padrão do prato
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);

  const pricePerKg = activeEnterprise.pricePerKg || 64.90;

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

  // Filtro de Subcategorias para o modo PRODUCTS
  const filteredProductsBySubCategory = useMemo(() => {
    let list = products.filter(p => p.enterpriseId === activeEnterprise.id);
    
    if (activeSubCategory === 'CERVEJAS') {
      return list.filter(p => p.name.toLowerCase().includes('beer') || p.name.toLowerCase().includes('cerveja') || p.name.toLowerCase().includes('heineken') || p.name.toLowerCase().includes('stella') || p.name.toLowerCase().includes('indica'));
    }
    if (activeSubCategory === 'SUCOS') {
      return list.filter(p => p.name.toLowerCase().includes('suco') || p.name.toLowerCase().includes('limonada'));
    }
    if (activeSubCategory === 'AGUAS') {
      return list.filter(p => p.name.toLowerCase().includes('água') || p.name.toLowerCase().includes('coca') || p.name.toLowerCase().includes('lata'));
    }
    if (activeSubCategory === 'SOBREMESAS') {
      return list.filter(p => p.category === 'DOCE');
    }
    
    return list;
  }, [activeSubCategory, activeEnterprise.id, products]);

  const kgTotal = useMemo(() => {
    const weightGrams = parseFloat(kgWeight) || 0;
    const netWeightKg = Math.max(0, (weightGrams / 1000) - kgTara);
    return netWeightKg * pricePerKg;
  }, [kgWeight, kgTara, pricePerKg]);

  const handleAddKgToCart = () => {
    if (kgTotal <= 0) return;
    const newItem: SaleItem = {
      productId: 'REF_KG',
      name: `Refeição KG (${kgWeight}g)`,
      quantity: 1,
      price: kgTotal,
      mode: 'KG',
      weight: parseFloat(kgWeight)
    };
    setCart([...cart, newItem]);
    setKgWeight('');
  };

  const addToCart = (product: any, mode: 'PF' | 'MARMITA' | 'UN') => {
    setCart(prev => {
      const existing = prev.find(item => item.productId === product.id && item.mode === mode);
      if (existing) {
        return prev.map(item => item.productId === product.id && item.mode === mode 
          ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { 
        productId: product.id, 
        name: product.name, 
        quantity: 1, 
        price: product.price,
        mode: mode
      }];
    });
  };

  const removeFromCart = (index: number) => {
    setCart(prev => prev.filter((_, i) => i !== index));
  };

  const cartTotal = useMemo(() => cart.reduce((sum, item) => sum + (item.price * item.quantity), 0), [cart]);

  const finalizeSale = async (paymentMethod: string) => {
    if (cart.length === 0 || cartTotal <= 0) return;

    const now = new Date();
    const itemDescription = cart.map(i => `${i.quantity}x ${i.name}`).join(', ');

    try {
      await ApiService.createTransaction({
        enterpriseId: activeEnterprise.id,
        type: 'VENDA_BALCAO',
        amount: cartTotal,
        total: cartTotal,
        clientName: 'Consumidor Final',
        description: `Venda restaurante (${cart.length} item(ns))`,
        item: itemDescription,
        paymentMethod,
        method: paymentMethod,
        timestamp: now.toISOString(),
        date: now.toISOString().split('T')[0],
        time: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        status: 'CONCLUIDA',
        items: cart.map(i => ({
          productId: i.productId,
          name: i.name,
          quantity: i.quantity,
          price: i.price,
          mode: i.mode
        }))
      });

      if (onRegisterTransaction) {
        const transactionId = `VR-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
        onRegisterTransaction({
          id: transactionId,
          time: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          date: now.toISOString().split('T')[0],
          client: 'Consumidor Final',
          plan: 'AVULSO',
          item: itemDescription,
          type: 'VENDA_BALCAO',
          method: paymentMethod,
          total: cartTotal,
          status: 'CONCLUIDA'
        });
      }

      alert('Venda de Restaurante Finalizada com Sucesso!');
      setCart([]);
      setIsCheckoutModalOpen(false);
    } catch (error) {
      console.error('Erro ao finalizar venda do restaurante:', error);
      alert('Não foi possível finalizar a venda. Tente novamente.');
    }
  };

  return (
    <div className="flex flex-col lg:flex-row h-full gap-6 p-4 animate-in fade-in duration-500 overflow-hidden">
      
      {/* Lado Esquerdo: Seletor Operacional */}
      <div className="flex-1 flex flex-col space-y-6 overflow-hidden">
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 shrink-0">
          <ModeCard active={activeMode === 'KG'} onClick={() => setActiveMode('KG')} icon={<Scale />} label="Peso (KG)" color="indigo" />
          <ModeCard active={activeMode === 'PF'} onClick={() => setActiveMode('PF')} icon={<Utensils />} label="Prato Feito" color="emerald" />
          <ModeCard active={activeMode === 'MARMITA'} onClick={() => setActiveMode('MARMITA')} icon={<Sandwich />} label="Marmitas" color="amber" />
          <ModeCard active={activeMode === 'PRODUCTS'} onClick={() => setActiveMode('PRODUCTS')} icon={<Wine />} label="Bebidas/Produtos" color="blue" />
        </div>

        <div className="flex-1 bg-white rounded-[40px] border shadow-sm flex flex-col overflow-hidden">
          <div className="p-6 border-b bg-gray-50/50 flex items-center justify-between shrink-0">
            <h2 className="text-lg font-black text-gray-800 uppercase tracking-widest flex items-center gap-2">
              {activeMode === 'KG' && <><Scale className="text-indigo-600" /> Balança Digital</>}
              {activeMode === 'PF' && <><Utensils className="text-emerald-600" /> Cardápio Executivo</>}
              {activeMode === 'MARMITA' && <><Sandwich className="text-amber-600" /> Tamanhos de Marmita</>}
              {activeMode === 'PRODUCTS' && <><Wine className="text-blue-600" /> Bebidas e Sobremesas</>}
            </h2>
            {activeMode === 'KG' && <span className="bg-indigo-600 text-white px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest shadow-lg shadow-indigo-100">R$ {pricePerKg.toFixed(2)} / KG</span>}
          </div>

          {/* BARRA DE SUBCATEGORIAS - VISÍVEL APENAS NO MODO PRODUCTS */}
          {activeMode === 'PRODUCTS' && (
            <div className="px-6 py-4 bg-white border-b flex items-center gap-3 overflow-x-auto scrollbar-hide shrink-0">
              <SubCategoryButton active={activeSubCategory === 'TODOS'} onClick={() => setActiveSubCategory('TODOS')} label="Todos" icon={<ShoppingCart size={14}/>} />
              <SubCategoryButton active={activeSubCategory === 'CERVEJAS'} onClick={() => setActiveSubCategory('CERVEJAS')} label="Cervejas" icon={<Beer size={14}/>} color="amber" />
              <SubCategoryButton active={activeSubCategory === 'SUCOS'} onClick={() => setActiveSubCategory('SUCOS')} label="Sucos Naturais" icon={<Droplets size={14}/>} color="orange" />
              <SubCategoryButton active={activeSubCategory === 'AGUAS'} onClick={() => setActiveSubCategory('AGUAS')} label="Águas / Refris" icon={<Droplets size={14}/>} color="blue" />
              <SubCategoryButton active={activeSubCategory === 'SOBREMESAS'} onClick={() => setActiveSubCategory('SOBREMESAS')} label="Sobremesas" icon={<IceCream size={14}/>} color="rose" />
            </div>
          )}

          <div className="flex-1 p-8 overflow-y-auto scrollbar-hide">
            
            {/* INTERFACE KG */}
            {activeMode === 'KG' && (
              <div className="max-w-md mx-auto space-y-12 animate-in zoom-in-95">
                 <div className="text-center space-y-3">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[4px]">Entrada de Peso (g)</p>
                    <div className="flex items-center justify-center gap-4">
                       <input 
                         autoFocus
                         type="number" 
                         value={kgWeight} 
                         onChange={(e) => setKgWeight(e.target.value)}
                         className="text-8xl font-black text-indigo-600 bg-gray-50 rounded-[48px] w-full py-12 text-center outline-none border-4 border-transparent focus:border-indigo-500 shadow-inner"
                         placeholder="0"
                       />
                       <span className="text-4xl font-black text-gray-200">g</span>
                    </div>
                 </div>

                 <div className="grid grid-cols-2 gap-6">
                    <div className="p-6 bg-gray-50 rounded-[32px] border border-gray-100 flex flex-col items-center">
                       <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Tara do Prato</p>
                       <div className="flex items-center gap-4">
                          <button onClick={() => setKgTara(Math.max(0, kgTara - 0.05))} className="p-3 bg-white rounded-2xl border shadow-sm text-gray-400 hover:text-red-500"><Minus size={20}/></button>
                          <span className="text-2xl font-black text-gray-700">{(kgTara * 1000).toFixed(0)}g</span>
                          <button onClick={() => setKgTara(kgTara + 0.05)} className="p-3 bg-white rounded-2xl border shadow-sm text-gray-400 hover:text-indigo-600"><Plus size={20}/></button>
                       </div>
                    </div>
                    <div className="p-6 bg-indigo-900 rounded-[32px] text-white flex flex-col items-center justify-center shadow-xl">
                       <p className="text-[10px] font-black text-indigo-300 uppercase tracking-widest mb-1">Subtotal Peso</p>
                       <p className="text-4xl font-black tracking-tighter">R$ {kgTotal.toFixed(2)}</p>
                    </div>
                 </div>

                 <button 
                  onClick={handleAddKgToCart}
                  disabled={kgTotal <= 0}
                  className="w-full py-8 bg-indigo-600 text-white rounded-[32px] font-black uppercase text-2xl tracking-widest shadow-2xl shadow-indigo-100 hover:bg-indigo-700 active:scale-95 transition-all flex items-center justify-center gap-4 disabled:opacity-30"
                 >
                   <Plus size={32} /> Lançar na Comanda
                 </button>
              </div>
            )}

            {/* INTERFACE PF */}
            {activeMode === 'PF' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-bottom-4">
                 {[
                   { id: 'PF_1', name: 'Arroz, Feijão e Proteína', price: 19.90 },
                   { id: 'PF_2', name: 'Arroz, Feijão e Legumes', price: 16.90 },
                   { id: 'PF_3', name: 'Prato Vegetariano', price: 14.90 },
                 ].map(pf => (
                   <ProductButton key={pf.id} onClick={() => addToCart(pf, 'PF')} label={pf.name} price={pf.price} category="Opção do Dia" color="emerald" />
                 ))}
                 <ProductButton onClick={() => addToCart({id: 'PF_EXEC', name: 'Executivo Especial', price: 29.90}, 'PF')} label="Executivo Especial" price={29.90} category="A la Carte" color="emerald" />
              </div>
            )}

            {/* INTERFACE MARMITA */}
            {activeMode === 'MARMITA' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in">
                 <MarmitaCard size="P" price={18.90} onClick={() => addToCart({id: 'MARM_P', name: 'Marmita P', price: 18.90}, 'MARMITA')} />
                 <MarmitaCard size="M" price={22.90} onClick={() => addToCart({id: 'MARM_M', name: 'Marmita M', price: 22.90}, 'MARMITA')} />
                 <MarmitaCard size="G" price={28.90} onClick={() => addToCart({id: 'MARM_G', name: 'Marmita G', price: 28.90}, 'MARMITA')} />
              </div>
            )}

            {/* INTERFACE BEBIDAS / PRODUTOS COM FILTRO DE SUBCATEGORIA */}
            {activeMode === 'PRODUCTS' && (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 animate-in fade-in">
                 {filteredProductsBySubCategory.length === 0 ? (
                   <div className="col-span-full py-20 text-center text-gray-400 font-bold uppercase text-[10px] tracking-widest">
                      Nenhum produto encontrado nesta subcategoria
                   </div>
                 ) : filteredProductsBySubCategory.map(p => (
                   <button key={p.id} onClick={() => addToCart(p, 'UN')} className="bg-white p-5 rounded-[32px] border-2 border-gray-50 hover:border-indigo-400 hover:shadow-xl transition-all flex flex-col items-center group relative overflow-hidden">
                      <div className={`w-20 h-20 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform ${
                        p.category === 'DOCE' ? 'bg-rose-50 text-rose-500' : 'bg-blue-50 text-blue-500'
                      }`}>
                        {p.category === 'DOCE' ? <IceCream size={32} /> : <Wine size={32} />}
                      </div>
                      <p className="text-[10px] font-black text-gray-400 uppercase mb-1 tracking-tighter">{p.category}</p>
                      <h4 className="text-xs font-black text-gray-800 leading-tight h-8 flex items-center text-center px-2">{p.name}</h4>
                      <p className="text-sm font-black text-indigo-600 mt-3 bg-indigo-50 px-3 py-1 rounded-full">R$ {p.price.toFixed(2)}</p>
                      {/* Badge de Estoque Baixo opcional */}
                      {p.stock < p.minStock && (
                        <div className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                      )}
                   </button>
                 ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Lado Direito: Comanda */}
      <div className="w-full lg:w-96 flex flex-col space-y-4 shrink-0">
        <div className="bg-white p-6 rounded-[32px] border shadow-sm space-y-4">
           <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2 border-b pb-3">
              <User size={14} /> Atendimento Atual
           </h3>
           <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                 <label className="text-[9px] font-black text-gray-400 uppercase ml-1">Mesa / Ficha</label>
                 <input className="w-full px-4 py-3 bg-gray-50 rounded-2xl outline-none font-black text-indigo-600 border-2 border-transparent focus:border-indigo-500 transition-all text-center" placeholder="00" />
              </div>
              <div className="space-y-1">
                 <label className="text-[9px] font-black text-gray-400 uppercase ml-1">Pessoas</label>
                 <input type="number" defaultValue="1" className="w-full px-4 py-3 bg-gray-50 rounded-2xl outline-none font-black border-2 border-transparent focus:border-indigo-500 transition-all text-center" />
              </div>
           </div>
        </div>

        <div className="flex-1 bg-white rounded-[32px] border shadow-sm flex flex-col overflow-hidden">
           <div className="p-6 border-b bg-gray-50 flex items-center justify-between">
              <h3 className="text-sm font-black text-gray-700 uppercase flex items-center gap-2">
                 <Receipt size={16} className="text-indigo-600" /> Comanda em Aberto
              </h3>
              <span className="bg-indigo-600 text-white px-2.5 py-0.5 rounded-full text-[10px] font-black">{cart.length}</span>
           </div>

           <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-hide">
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center opacity-30 text-indigo-900 gap-3">
                   <Utensils size={48} />
                   <p className="text-[10px] font-black uppercase tracking-[3px]">Aguardando Itens</p>
                </div>
              ) : cart.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between group animate-in slide-in-from-right-4">
                   <div className="flex-1 min-w-0 pr-4">
                      <div className="flex items-center gap-1.5 mb-0.5">
                         <span className={`text-[7px] font-black px-1 py-0.5 rounded-md border uppercase ${item.mode === 'KG' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : item.mode === 'PF' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : item.mode === 'MARMITA' ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>{item.mode || 'UN'}</span>
                         <h4 className="text-xs font-black text-gray-800 leading-tight truncate uppercase">{item.name}</h4>
                      </div>
                      <p className="text-[10px] text-gray-400 font-bold">{item.quantity}x R$ {item.price.toFixed(2)}</p>
                   </div>
                   <div className="flex items-center gap-3">
                      <span className="text-sm font-black text-gray-700">R$ {(item.quantity * item.price).toFixed(2)}</span>
                      <button onClick={() => removeFromCart(idx)} className="p-1.5 text-gray-300 hover:text-red-500"><Trash2 size={16} /></button>
                   </div>
                </div>
              ))}
           </div>

           <div className="p-6 bg-gray-900 text-white rounded-t-[40px] shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                 <div>
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Total a Pagar</p>
                    <p className="text-4xl font-black text-indigo-400 tracking-tighter leading-none">R$ {cartTotal.toFixed(2)}</p>
                 </div>
                 <div className="bg-white/10 p-3 rounded-2xl border border-white/10"><Calculator size={24} className="text-indigo-400" /></div>
              </div>
              <button 
                onClick={() => setIsCheckoutModalOpen(true)}
                disabled={cart.length === 0}
                className="w-full py-5 bg-indigo-600 text-white rounded-[24px] font-black uppercase tracking-[2px] text-xs shadow-xl shadow-indigo-900/50 hover:bg-indigo-700 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-20"
              >
                 Receber Pagamento <ArrowRight size={18} />
              </button>
           </div>
        </div>
      </div>

      {/* MODAL DE PAGAMENTO RESTAURANTE */}
      {isCheckoutModalOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
           <div className="absolute inset-0 bg-indigo-950/80 backdrop-blur-md animate-in fade-in" onClick={() => setIsCheckoutModalOpen(false)}></div>
           <div className="relative w-full max-w-xl bg-white rounded-[48px] shadow-2xl overflow-hidden animate-in zoom-in-95">
              <div className="bg-indigo-600 p-8 text-white flex items-center justify-between">
                 <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center"><CreditCard size={28} /></div>
                    <div>
                       <h2 className="text-xl font-black uppercase tracking-tight">Fechar Atendimento</h2>
                       <p className="text-[10px] font-bold text-indigo-200 uppercase tracking-widest mt-1">Selecione o método de quitação</p>
                    </div>
                 </div>
                 <button onClick={() => setIsCheckoutModalOpen(false)} className="p-3 hover:bg-white/10 rounded-full transition-colors"><X size={28} /></button>
              </div>

              <div className="p-10 space-y-10 text-center">
                 <div className="space-y-1">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Valor da Conta</p>
                    <p className="text-6xl font-black text-gray-900 tracking-tighter">R$ {cartTotal.toFixed(2)}</p>
                 </div>

                 <div className="grid grid-cols-3 gap-4">
                    <PaymentTypeButton icon={<Banknote />} label="Dinheiro" color="amber" onClick={() => finalizeSale('DINHEIRO')} />
                    <PaymentTypeButton icon={<Smartphone />} label="PIX" color="emerald" onClick={() => finalizeSale('PIX')} />
                    <PaymentTypeButton icon={<CreditCard />} label="Cartão" color="blue" onClick={() => finalizeSale('CREDITO')} />
                    <PaymentTypeButton icon={<Star />} label="Ticket Ref." color="rose" onClick={() => finalizeSale('TICKET')} />
                    <PaymentTypeButton icon={<Wallet />} label="Saldo App" color="indigo" onClick={() => finalizeSale('SALDO')} />
                    <PaymentTypeButton icon={<X />} label="Descontar" color="gray" onClick={() => finalizeSale('DESCONTO')} />
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

// Componentes Auxiliares
const ModeCard = ({ active, onClick, icon, label, color }: any) => {
  const themes: any = {
    indigo: active ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-100' : 'bg-white text-indigo-600 hover:bg-indigo-50 border-indigo-100',
    emerald: active ? 'bg-emerald-600 text-white shadow-xl shadow-emerald-100' : 'bg-white text-emerald-600 hover:bg-emerald-50 border-emerald-100',
    amber: active ? 'bg-amber-600 text-white shadow-xl shadow-amber-100' : 'bg-white text-amber-600 hover:bg-amber-50 border-amber-100',
    blue: active ? 'bg-blue-600 text-white shadow-xl shadow-blue-100' : 'bg-white text-blue-600 hover:bg-blue-50 border-blue-100',
  };
  return (
    <button onClick={onClick} className={`p-6 rounded-[32px] border-2 transition-all flex flex-col items-center gap-3 active:scale-95 ${themes[color]}`}>
       <div className="p-3 bg-white/20 rounded-2xl">{React.cloneElement(icon, { size: 28 })}</div>
       <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
    </button>
  );
};

const SubCategoryButton = ({ active, onClick, label, icon, color }: any) => {
  const themes: any = {
    amber: active ? 'bg-amber-500 text-white' : 'text-amber-600 bg-amber-50 hover:bg-amber-100',
    orange: active ? 'bg-orange-500 text-white' : 'text-orange-600 bg-orange-50 hover:bg-orange-100',
    blue: active ? 'bg-blue-500 text-white' : 'text-blue-600 bg-blue-50 hover:bg-blue-100',
    rose: active ? 'bg-rose-500 text-white' : 'text-rose-600 bg-rose-50 hover:bg-rose-100',
    default: active ? 'bg-indigo-600 text-white' : 'text-gray-500 bg-gray-100 hover:bg-gray-200',
  };

  return (
    <button 
      onClick={onClick}
      className={`px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 whitespace-nowrap active:scale-95 ${themes[color || 'default']}`}
    >
      {icon} {label}
    </button>
  );
};

const ProductButton = ({ onClick, label, price, category, color }: any) => (
  <button onClick={onClick} className="bg-white p-6 rounded-[32px] border-2 border-gray-100 hover:border-emerald-500 hover:shadow-xl transition-all text-left flex gap-6 group">
     <div className={`w-20 h-20 bg-${color}-50 rounded-2xl flex items-center justify-center text-${color}-600 group-hover:bg-${color}-600 group-hover:text-white transition-all shadow-inner`}>
        <Utensils size={32} />
     </div>
     <div className="flex-1">
        <div className="flex justify-between items-start">
           <span className={`text-[9px] font-black bg-${color}-50 text-${color}-600 px-2 py-0.5 rounded uppercase tracking-widest`}>{category}</span>
           <span className="text-lg font-black text-gray-800">R$ {price.toFixed(2)}</span>
        </div>
        <h3 className="text-base font-black text-gray-900 mt-2 uppercase tracking-tight">{label}</h3>
     </div>
  </button>
);

const MarmitaCard = ({ size, price, onClick }: any) => (
  <button onClick={onClick} className="bg-white p-8 rounded-[40px] border-2 border-gray-100 hover:border-amber-500 hover:shadow-2xl transition-all text-center group">
     <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4 text-amber-600 group-hover:bg-amber-600 group-hover:text-white transition-all shadow-inner font-black text-2xl">{size}</div>
     <h3 className="text-lg font-black text-gray-800 uppercase">Marmita {size}</h3>
     <p className="text-2xl font-black text-amber-600 mt-4">R$ {price.toFixed(2)}</p>
  </button>
);

const PaymentTypeButton = ({ icon, label, color, onClick }: any) => {
  const colors: any = {
    amber: 'text-amber-600 bg-amber-50 border-amber-100 hover:bg-amber-600 hover:text-white',
    emerald: 'text-emerald-600 bg-emerald-50 border-emerald-100 hover:bg-emerald-600 hover:text-white',
    blue: 'text-blue-600 bg-blue-50 border-blue-100 hover:bg-blue-600 hover:text-white',
    rose: 'text-rose-600 bg-rose-50 border-rose-100 hover:bg-rose-600 hover:text-white',
    indigo: 'text-indigo-600 bg-indigo-50 border-indigo-100 hover:bg-indigo-600 hover:text-white',
    gray: 'text-gray-400 bg-gray-50 border-gray-100 hover:bg-gray-400 hover:text-white',
  };
  return (
    <button onClick={onClick} className={`p-6 rounded-3xl border-2 transition-all flex flex-col items-center gap-2 group ${colors[color]} active:scale-95`}>
       {React.cloneElement(icon as React.ReactElement, { size: 24 })}
       <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
    </button>
  );
};

export default RestaurantPOSPage;
