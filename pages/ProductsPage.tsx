
import React, { useState, useMemo, useEffect } from 'react';
import { 
  Search, Plus, Filter, Package, Trash2, Edit, Save, X, 
  Building, DollarSign, LayoutGrid, ChevronRight, Tags,
  Layers, AlertCircle, MoreVertical, PlusCircle, CheckCircle2,
  TrendingUp, Scale, Archive, Barcode, Calendar, Upload
} from 'lucide-react';
import { ApiService } from '../services/api';
import notificationService from '../services/notificationService';
import { Product, User, Enterprise, Role, Category, SubCategory, ProductUnit } from '../types';

interface ProductsPageProps {
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

const normalizeSearchText = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : '';
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const ProductsPage: React.FC<ProductsPageProps> = ({ currentUser, activeEnterprise }) => {
  // Guard clause: se não houver enterprise ativa, retornar carregamento
  if (!activeEnterprise) {
    return (
      <div className="products-shell flex items-center justify-center h-96 rounded-2xl">
        <div className="text-center space-y-4">
          <div className="animate-spin inline-block w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full"></div>
          <p className="text-gray-600 dark:text-zinc-300 font-medium">Carregando produtos...</p>
        </div>
      </div>
    );
  }

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  
  // Carregar produtos e categorias da API
  useEffect(() => {
    const loadData = async () => {
      try {
        const [productsData, categoriesData] = await Promise.all([
          ApiService.getProducts(activeEnterprise.id),
          ApiService.getCategories(activeEnterprise.id)
        ]);

        setProducts(productsData);

        if (categoriesData.length > 0) {
          setCategories(categoriesData);
        } else {
          const mapByName = new Map<string, Category>();

          productsData.forEach((product, index) => {
            if (!mapByName.has(product.category)) {
              mapByName.set(product.category, {
                id: `cat_local_${index}`,
                name: product.category,
                enterpriseId: activeEnterprise.id,
                subCategories: []
              });
            }

            if (product.subCategory) {
              const category = mapByName.get(product.category)!;
              if (!category.subCategories.some(sub => sub.name === product.subCategory)) {
                category.subCategories.push({
                  id: `sub_local_${category.subCategories.length + 1}`,
                  name: product.subCategory
                });
              }
            }
          });

          setCategories(Array.from(mapByName.values()));
        }
      } catch (err) {
        console.error('Erro ao carregar dados de produtos/categorias:', err);
        setProducts([]);
        setCategories([]);
      }
    };

    loadData();
  }, [activeEnterprise.id]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | 'ALL'>('ALL');
  
  // Modais
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isSubCategoryModalOpen, setIsSubCategoryModalOpen] = useState(false);
  
  const [activeCategoryForSub, setActiveCategoryForSub] = useState<Category | null>(null);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [productImageFile, setProductImageFile] = useState<File | null>(null);
  const [productImagePreview, setProductImagePreview] = useState('');

  // Form de Produto
  const [productForm, setProductForm] = useState({
    name: '',
    ean: '',
    categoryId: '',
    subCategoryId: '',
    unit: 'UN' as ProductUnit,
    controlsStock: true,
    price: 0,
    cost: 0,
    stock: 0,
    minStock: 5,
    expiryDate: '',
    image: '',
    enterpriseId: activeEnterprise.id
  });

  const isOwner = currentUser.role === Role.OWNER;

  // Filtragem de Produtos
  const filteredProducts = useMemo(() => {
    const normalizedSearchTerm = normalizeSearchText(searchTerm);

    return products.filter(p => {
      const matchesUnit = isOwner || p.enterpriseId === activeEnterprise.id;
      const normalizedProductName = normalizeSearchText(p.name);
      const eanValue = String(p.ean || '');
      const searchDigits = String(searchTerm || '').replace(/\D/g, '');
      const matchesSearch =
        !normalizedSearchTerm
        || normalizedProductName.includes(normalizedSearchTerm)
        || (searchDigits.length > 0 && eanValue.includes(searchDigits));
      
      const categoryObj = categories.find(c => c.id === selectedCategoryId);
      const normalizedSelected = String(categoryObj?.name || '').trim().toUpperCase();
      const normalizedProductCategory = String(p.category || '').trim().toUpperCase();
      const matchesCategory =
        selectedCategoryId === 'ALL' ||
        normalizedSelected === 'GERAL' ||
        normalizedProductCategory === normalizedSelected;
      
      return matchesUnit && matchesSearch && matchesCategory;
    });
  }, [products, searchTerm, selectedCategoryId, categories, isOwner, activeEnterprise.id]);

  const handleOpenNewProduct = () => {
    setEditingProductId(null);
    setProductForm({
      name: '',
      ean: '',
      categoryId: '',
      subCategoryId: '',
      unit: 'UN',
      controlsStock: true,
      price: 0,
      cost: 0,
      stock: 0,
      minStock: 5,
      expiryDate: '',
      image: '',
      enterpriseId: activeEnterprise.id
    });
    setProductImageFile(null);
    setProductImagePreview('');
    setIsProductModalOpen(true);
  };

  const handleOpenEditProduct = (product: Product) => {
    setEditingProductId(product.id);
    
    const cat = categories.find(c => c.name === product.category);
    const subCat = cat?.subCategories.find(s => s.name === product.subCategory);

    setProductForm({
      name: product.name,
      ean: product.ean || '',
      categoryId: cat?.id || '',
      subCategoryId: subCat?.id || '',
      unit: product.unit || 'UN',
      controlsStock: product.controlsStock !== false,
      price: product.price,
      cost: product.cost,
      stock: product.stock,
      minStock: product.minStock,
      expiryDate: product.expiryDate || '',
      image: product.image || '',
      enterpriseId: product.enterpriseId
    });
    setProductImageFile(null);
    setProductImagePreview(toAbsoluteProductImageUrl(product.image, product.name));
    setIsProductModalOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    let uploadedImageUrl = productForm.image || '';

    if (productImageFile) {
      try {
        const dataBase64 = await fileToBase64(productImageFile);
        const uploadResponse = await ApiService.uploadProductPhoto({
          fileName: productImageFile.name,
          mimeType: productImageFile.type,
          dataBase64,
        });
        uploadedImageUrl = String(uploadResponse?.imageUrl || uploadedImageUrl);
      } catch (err) {
        console.error('Erro ao enviar imagem do produto:', err);
        notificationService.critico('Erro ao enviar imagem', 'Não foi possível enviar a imagem do produto. Tente novamente.');
        return;
      }
    }
    
    const categoryName = categories.find(c => c.id === productForm.categoryId)?.name || 'GERAL';
    const subCategoryName = categories
      .find(c => c.id === productForm.categoryId)
      ?.subCategories.find(s => s.id === productForm.subCategoryId)?.name || '';

    const productPayload = {
      name: productForm.name,
      ean: productForm.ean,
      category: categoryName,
      subCategory: subCategoryName,
      unit: productForm.unit,
      controlsStock: productForm.controlsStock,
      price: Number(productForm.price),
      cost: Number(productForm.cost),
      stock: productForm.controlsStock ? Number(productForm.stock) : 0,
      minStock: productForm.controlsStock ? Number(productForm.minStock) : 0,
      expiryDate: productForm.expiryDate,
      isActive: true,
      image: uploadedImageUrl,
      enterpriseId: productForm.enterpriseId,
    };

    try {
      if (editingProductId) {
        // Atualizar Produto Existente via API
        await ApiService.updateProduct(editingProductId, productPayload);
        setProducts(prev => prev.map(p => p.id === editingProductId ? {...p, ...productPayload} : p));
        notificationService.informativo('Produto atualizado', 'As alterações foram salvas com sucesso.');
      } else {
        // Criar Novo Produto via API
        const createdProduct = await ApiService.createProduct(productPayload);
        setProducts(prev => [createdProduct, ...prev]);
        notificationService.informativo('Produto cadastrado', 'Novo produto salvo com sucesso.');
      }
      setProductImageFile(null);
      setProductImagePreview('');
      setIsProductModalOpen(false);
    } catch (err) {
      console.error('Erro ao salvar produto:', err);
      notificationService.critico('Erro ao salvar produto', 'Tente novamente em instantes.');
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    try {
      await ApiService.deleteProduct(productId);
      setProducts(prev => prev.filter(p => p.id !== productId));
      notificationService.informativo('Produto removido', 'Produto excluído com sucesso.');
    } catch (err) {
      console.error('Erro ao deletar produto:', err);
      notificationService.critico('Erro ao remover produto', 'Tente novamente em instantes.');
    }
  };

  const handleCreateCategory = async (name: string) => {
    const normalizedName = name.trim();
    if (!normalizedName) return;

    const exists = categories.some(c => c.name.toLowerCase() === normalizedName.toLowerCase());
    if (exists) {
      notificationService.alerta('Categoria duplicada', 'Esta categoria já existe.');
      return;
    }

    try {
      const createdCategory = await ApiService.createCategory({
        name: normalizedName,
        enterpriseId: activeEnterprise.id,
        subCategories: []
      });
      setCategories(prev => [...prev, createdCategory]);
      setIsCategoryModalOpen(false);
    } catch (err) {
      console.error('Erro ao criar categoria:', err);
      notificationService.critico('Erro ao salvar categoria', 'Tente novamente em instantes.');
    }
  };

  const handleCreateSubCategory = async (categoryId: string, name: string) => {
    const normalizedName = name.trim();
    if (!normalizedName) return;

    const targetCategory = categories.find(cat => cat.id === categoryId);
    if (!targetCategory) return;

    if (targetCategory.subCategories.length >= 3) {
      notificationService.alerta('Limite atingido', 'Esta categoria já possui 3 subcategorias.');
      return;
    }

    if (targetCategory.subCategories.some(sub => sub.name.toLowerCase() === normalizedName.toLowerCase())) {
      notificationService.alerta('Subcategoria duplicada', 'Esta subcategoria já existe.');
      return;
    }

    const updatedSubCategories = [
      ...targetCategory.subCategories,
      { id: `sub_${Math.random().toString(36).substr(2, 5)}`, name: normalizedName }
    ];

    try {
      const updatedCategory = await ApiService.updateCategory(categoryId, {
        subCategories: updatedSubCategories
      });

      setCategories(prev => prev.map(cat => cat.id === categoryId ? updatedCategory : cat));
      setIsSubCategoryModalOpen(false);
    } catch (err) {
      console.error('Erro ao criar subcategoria:', err);
      notificationService.critico('Erro ao salvar subcategoria', 'Tente novamente em instantes.');
    }
  };

  const availableSubCategories = useMemo(() => {
    if (!productForm.categoryId) return [];
    return categories.find(c => c.id === productForm.categoryId)?.subCategories || [];
  }, [productForm.categoryId, categories]);

  return (
    <div className="products-shell flex flex-col lg:flex-row h-full gap-4 p-4 animate-in fade-in duration-500 overflow-hidden">
      
      {/* SIDEBAR INTERNA: CATEGORIA DE PRODUTOS */}
      <aside className="w-full lg:w-72 bg-white rounded-2xl border shadow-sm flex flex-col overflow-hidden shrink-0">
        <div className="p-4 border-b bg-gray-50/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Tags className="text-indigo-600" size={20} />
            <h2 className="text-sm font-black text-gray-800 uppercase tracking-widest">Categorias</h2>
          </div>
          <button 
            onClick={() => setIsCategoryModalOpen(true)}
            className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
            title="Nova Categoria"
          >
            <Plus size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1.5 scrollbar-hide">
          <button 
            onClick={() => setSelectedCategoryId('ALL')}
            className={`w-full flex items-center justify-between p-3 rounded-xl transition-all border ${selectedCategoryId === 'ALL' ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' : 'bg-white border-transparent text-gray-500 hover:bg-indigo-50'}`}
          >
            <span className="text-[11px] font-black uppercase tracking-tight">Todos os Produtos</span>
            <LayoutGrid size={16} />
          </button>

          {categories.filter(c => isOwner || c.enterpriseId === activeEnterprise.id).map(cat => (
            <div key={cat.id} className="space-y-1">
              <button 
                onClick={() => setSelectedCategoryId(cat.id)}
                className={`w-full flex items-center justify-between p-3 rounded-xl transition-all border ${selectedCategoryId === cat.id ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' : 'bg-white border-transparent text-gray-600 hover:bg-gray-50'}`}
              >
                <span className="text-[11px] font-black uppercase tracking-tight">{cat.name}</span>
                <ChevronRight size={14} className={selectedCategoryId === cat.id ? 'rotate-90 transition-transform' : ''} />
              </button>
              
              <div className="ml-3 space-y-1 border-l border-indigo-100 pl-3 py-1">
                {cat.subCategories.map(sub => (
                  <div key={sub.id} className="flex items-center justify-between py-1.5 group">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">{sub.name}</span>
                    <button className="opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:text-red-600 transition-all">
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
                
                {cat.subCategories.length < 3 ? (
                  <button 
                    onClick={() => { setActiveCategoryForSub(cat); setIsSubCategoryModalOpen(true); }}
                    className="flex items-center gap-2 text-[9px] font-black text-indigo-400 uppercase tracking-widest mt-2 hover:text-indigo-600 transition-colors"
                  >
                    <PlusCircle size={12} /> Adicionar Sub
                  </button>
                ) : (
                  <span className="text-[8px] font-bold text-gray-300 uppercase block mt-2">Limite atingido</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* ÁREA PRINCIPAL: LISTAGEM DE PRODUTOS */}
      <div className="flex-1 flex flex-col space-y-4 overflow-hidden">
        
        <header className="bg-white p-4 rounded-2xl border shadow-sm flex flex-col md:flex-row items-center justify-between gap-3 shrink-0">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input 
              type="text" 
              placeholder="Pesquisar por nome ou Código EAN..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-transparent focus:border-indigo-500 rounded-xl outline-none font-bold text-xs transition-all"
            />
          </div>

          <div className="flex items-center gap-3">
             <div className="hidden xl:flex items-center gap-2 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100">
                <Package size={14} className="text-indigo-600" />
                <span className="text-[10px] font-black text-indigo-900 uppercase">{filteredProducts.length} Itens</span>
             </div>
             <button 
               onClick={handleOpenNewProduct}
               className="bg-indigo-600 text-white px-4 py-2.5 rounded-xl font-black uppercase tracking-widest text-[11px] shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center gap-2 active:scale-95"
             >
               <Plus size={14} /> Novo Produto
             </button>
          </div>
        </header>

        <div className="flex-1 bg-white rounded-2xl border shadow-sm overflow-hidden flex flex-col">
          <div className="overflow-x-auto scrollbar-hide">
            <table className="w-full text-left">
              <thead className="bg-gray-50/50 text-[9px] font-black text-gray-400 uppercase tracking-[0.12em] border-b">
                <tr>
                  <th className="px-4 py-3">Produto</th>
                  <th className="px-4 py-3">Categoria</th>
                  <th className="px-4 py-3 text-center">Preço</th>
                  <th className="px-4 py-3 text-center">Estoque</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-14 text-center text-gray-400 font-bold uppercase text-[11px] tracking-widest">Nenhum produto encontrado</td>
                  </tr>
                ) : filteredProducts.map(product => (
                  <tr key={product.id} className="hover:bg-indigo-50/20 transition-all group">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <img src={toAbsoluteProductImageUrl(product.image, product.name)} className="w-9 h-9 rounded-lg object-cover border border-white shadow-sm" />
                        <div>
                          <p className="font-black text-gray-800 text-xs leading-tight">{product.name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                             <p className="text-[9px] text-gray-400 font-bold uppercase">ID: #{product.id}</p>
                             {product.ean && (
                               <span className="flex items-center gap-1 text-[8px] font-black text-indigo-400 bg-indigo-50 px-1.5 rounded uppercase">
                                 <Barcode size={10} /> {product.ean}
                               </span>
                             )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-col">
                        <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-md text-[9px] font-black uppercase w-fit border border-indigo-100">
                          {product.category}
                        </span>
                        {product.subCategory && (
                          <span className="text-[8px] font-bold text-gray-400 uppercase mt-1 ml-1 tracking-tighter">
                            ↳ {product.subCategory}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <p className="font-black text-indigo-600 text-xs">R$ {product.price.toFixed(2)}</p>
                      <p className="text-[9px] font-bold text-gray-400 uppercase mt-1">{product.unit || 'UN'}</p>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      {product.controlsStock === false ? (
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Não controlado</span>
                      ) : (
                        <div className="flex flex-col items-center">
                          <span className={`text-xs font-black ${product.stock < product.minStock ? 'text-red-500' : 'text-gray-700'}`}>{product.stock} {String(product.unit || 'UN').toLowerCase()}</span>
                          {product.stock < product.minStock && <span className="text-[7px] font-black text-red-400 uppercase tracking-widest mt-0.5 animate-pulse">Crítico</span>}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                       <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                          <button onClick={() => handleOpenEditProduct(product)} className="p-1.5 text-indigo-600 bg-white border rounded-lg shadow-sm hover:bg-indigo-50 transition-colors"><Edit size={14}/></button>
                          <button onClick={() => handleDeleteProduct(product.id)} className="p-1.5 text-red-500 bg-white border rounded-lg shadow-sm hover:bg-red-50 transition-colors"><Trash2 size={14}/></button>
                       </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* MODAL: PRODUTO (CREATE/UPDATE ATIVADO) */}
      {isProductModalOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
           <div className="absolute inset-0 bg-indigo-950/60 backdrop-blur-sm animate-in fade-in" onClick={() => setIsProductModalOpen(false)}></div>
           <form onSubmit={handleSaveProduct} className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[90vh]">
              <div className="bg-indigo-600 p-5 text-white flex items-center justify-between shrink-0">
                 <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center"><Package size={20} /></div>
                    <div>
                       <h2 className="text-lg font-black uppercase tracking-tight">{editingProductId ? 'Editar Produto' : 'Novo Produto'}</h2>
                       <p className="text-[10px] font-bold text-indigo-100 uppercase tracking-widest mt-1">Gestão de inventário para {activeEnterprise.name}</p>
                    </div>
                 </div>
                 <button type="button" onClick={() => setIsProductModalOpen(false)}><X size={22} /></button>
              </div>

              <div className="p-5 space-y-5 flex-1 overflow-y-auto scrollbar-hide pb-14">
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1.5 md:col-span-1">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Nome do Produto *</label>
                        <input required value={productForm.name} onChange={e => setProductForm({...productForm, name: e.target.value})} className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-2xl outline-none font-bold text-gray-800" placeholder="Ex: Refrigerante Lata 350ml" />
                    </div>
                    <div className="space-y-1.5 md:col-span-1">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Código EAN / Barras</label>
                        <div className="relative">
                           <Barcode className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={20} />
                           <input value={productForm.ean} onChange={e => setProductForm({...productForm, ean: e.target.value})} className="w-full pl-12 pr-6 py-4 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-2xl outline-none font-bold text-gray-800" placeholder="7890000000000" />
                        </div>
                    </div>
                 </div>

                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Foto do Produto (Opcional)</label>
                    <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl p-4 flex flex-col md:flex-row md:items-center gap-4">
                      <img
                        src={productImagePreview || toAbsoluteProductImageUrl(productForm.image, productForm.name)}
                        className="w-20 h-20 rounded-xl object-cover border border-white shadow-sm"
                      />
                      <div className="flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <label className="inline-flex items-center gap-2 px-4 py-2 bg-white border rounded-xl text-[10px] font-black uppercase tracking-widest text-indigo-600 cursor-pointer hover:bg-indigo-50 transition-all">
                            <Upload size={14} />
                            Enviar Imagem
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0] || null;
                                if (!file) return;
                                if (file.size > 5 * 1024 * 1024) {
                                  notificationService.alerta('Imagem inválida', 'A imagem deve ter no máximo 5MB.');
                                  return;
                                }
                                setProductImageFile(file);
                                setProductImagePreview(URL.createObjectURL(file));
                              }}
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              setProductImageFile(null);
                              setProductImagePreview('');
                              setProductForm(prev => ({ ...prev, image: '' }));
                            }}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-100 rounded-xl text-[10px] font-black uppercase tracking-widest text-red-600 hover:bg-red-100 transition-all"
                          >
                            <Trash2 size={14} />
                            Remover Imagem
                          </button>
                        </div>
                        {productImageFile && (
                          <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">
                            Arquivo: {productImageFile.name}
                          </p>
                        )}
                      </div>
                    </div>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                       <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Categoria *</label>
                       <select required value={productForm.categoryId} onChange={e => setProductForm({...productForm, categoryId: e.target.value, subCategoryId: ''})} className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-2xl outline-none font-bold text-gray-800 appearance-none">
                          <option value="">Selecione...</option>
                          {categories.filter(c => isOwner || c.enterpriseId === activeEnterprise.id).map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                       </select>
                    </div>
                    <div className="space-y-1.5">
                       <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Subcategoria</label>
                       <select disabled={!productForm.categoryId} value={productForm.subCategoryId} onChange={e => setProductForm({...productForm, subCategoryId: e.target.value})} className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-2xl outline-none font-bold text-gray-800 appearance-none disabled:opacity-50">
                          <option value="">Nenhuma</option>
                          {availableSubCategories.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                       </select>
                    </div>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                       <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Unidade *</label>
                       <select
                         required
                         value={productForm.unit}
                         onChange={e => setProductForm({...productForm, unit: e.target.value as ProductUnit})}
                         className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-2xl outline-none font-bold text-gray-800 appearance-none"
                       >
                         <option value="KG">KG</option>
                         <option value="UN">UN</option>
                         <option value="PCT">PCT</option>
                       </select>
                    </div>
                    <div className="space-y-1.5">
                       <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Preço de Venda (R$)</label>
                       <div className="relative">
                          <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                          <input type="number" step="0.01" required value={productForm.price || ''} onChange={e => setProductForm({...productForm, price: parseFloat(e.target.value) || 0})} className="w-full pl-12 pr-6 py-4 bg-emerald-50 border-2 border-transparent focus:border-emerald-500 rounded-2xl outline-none font-black text-emerald-600" placeholder="0,00" />
                       </div>
                    </div>
                    <div className="space-y-1.5">
                       <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Custo de Compra (R$)</label>
                       <div className="relative">
                          <TrendingUp className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                         <input type="number" step="0.01" value={productForm.cost || ''} onChange={e => setProductForm({...productForm, cost: parseFloat(e.target.value) || 0})} className="w-full pl-12 pr-6 py-4 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-2xl outline-none font-bold text-gray-600" placeholder="0,00" />
                       </div>
                    </div>
                 </div>

                 <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4">
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={productForm.controlsStock}
                        onChange={e => setProductForm({...productForm, controlsStock: e.target.checked})}
                        className="w-5 h-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-[10px] font-black text-gray-700 uppercase tracking-widest">Controlar estoque deste produto</span>
                    </label>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                       <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Estoque Inicial</label>
                       <div className="relative">
                          <Archive className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                          <input type="number" required={productForm.controlsStock} disabled={!productForm.controlsStock} value={productForm.stock || ''} onChange={e => setProductForm({...productForm, stock: parseInt(e.target.value) || 0})} className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-2xl outline-none font-bold text-gray-800 disabled:opacity-50" placeholder="0" />
                       </div>
                    </div>
                    <div className="space-y-1.5">
                       <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Estoque Mínimo</label>
                       <div className="relative">
                          <AlertCircle className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                          <input type="number" required={productForm.controlsStock} disabled={!productForm.controlsStock} value={productForm.minStock || ''} onChange={e => setProductForm({...productForm, minStock: parseInt(e.target.value) || 0})} className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-2xl outline-none font-bold text-gray-800 disabled:opacity-50" placeholder="5" />
                       </div>
                    </div>
                    <div className="space-y-1.5">
                       <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Data de Vencimento</label>
                       <div className="relative">
                          <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                          <input type="date" value={productForm.expiryDate} onChange={e => setProductForm({...productForm, expiryDate: e.target.value})} className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-2xl outline-none font-bold text-gray-800" />
                       </div>
                    </div>
                 </div>
              </div>

              <div className="p-5 bg-gray-50 border-t flex gap-3 shrink-0">
                 <button type="button" onClick={() => setIsProductModalOpen(false)} className="flex-1 py-3 text-[11px] font-black text-gray-400 uppercase tracking-widest hover:text-gray-600">Cancelar</button>
                 <button type="submit" className="flex-[2] py-3 bg-indigo-600 text-white rounded-xl font-black uppercase tracking-widest text-xs shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center justify-center gap-2">
                    <CheckCircle2 size={16} /> {editingProductId ? 'Salvar Alterações' : 'Salvar Produto'}
                 </button>
              </div>
           </form>
        </div>
      )}

      {/* MODAL: CATEGORIA */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
           <div className="absolute inset-0 bg-indigo-950/60 backdrop-blur-sm animate-in fade-in" onClick={() => setIsCategoryModalOpen(false)}></div>
           <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95">
              <div className="bg-indigo-600 p-5 text-white flex items-center justify-between">
                 <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center"><Tags size={20} /></div>
                    <h2 className="text-lg font-black uppercase tracking-tight">Nova Categoria</h2>
                 </div>
                 <button onClick={() => setIsCategoryModalOpen(false)}><X size={22} /></button>
              </div>
              <div className="p-5 space-y-5">
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Nome da Categoria</label>
                    <input autoFocus id="catName" className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-2xl outline-none font-bold text-gray-800" placeholder="Ex: Bebidas Importadas" />
                 </div>
                 <button 
                  onClick={() => {
                    const input = document.getElementById('catName') as HTMLInputElement;
                    if(input.value) handleCreateCategory(input.value);
                  }}
                  className="w-full py-3 bg-indigo-600 text-white rounded-xl font-black uppercase text-xs tracking-widest shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all"
                 >
                    Salvar Categoria
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* MODAL: SUBCATEGORIA */}
      {isSubCategoryModalOpen && activeCategoryForSub && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
           <div className="absolute inset-0 bg-indigo-950/60 backdrop-blur-sm animate-in fade-in" onClick={() => setIsSubCategoryModalOpen(false)}></div>
           <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95">
              <div className="bg-amber-500 p-5 text-white flex items-center justify-between">
                 <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center"><Layers size={20} /></div>
                    <div>
                       <h2 className="text-lg font-black uppercase tracking-tight">Nova Subcategoria</h2>
                       <p className="text-[10px] font-bold text-amber-100 uppercase tracking-widest mt-1">Vinculada a: {activeCategoryForSub.name}</p>
                    </div>
                 </div>
                 <button onClick={() => setIsSubCategoryModalOpen(false)}><X size={22} /></button>
              </div>
              <div className="p-5 space-y-5">
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Nome da Subcategoria</label>
                    <input autoFocus id="subCatName" className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent focus:border-amber-500 rounded-2xl outline-none font-bold text-gray-800" placeholder="Ex: Cervejas Artesanais" />
                 </div>
                 <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 flex gap-3 items-center">
                    <AlertCircle size={18} className="text-amber-600 shrink-0" />
                    <p className="text-[10px] font-bold text-amber-800 uppercase leading-tight">Você pode criar até 3 subcategorias por categoria principal.</p>
                 </div>
                 <button 
                  onClick={() => {
                    const input = document.getElementById('subCatName') as HTMLInputElement;
                    if(input.value) handleCreateSubCategory(activeCategoryForSub.id, input.value);
                  }}
                  className="w-full py-3 bg-amber-600 text-white rounded-xl font-black uppercase text-xs tracking-widest shadow-lg shadow-amber-100 hover:bg-amber-700 transition-all"
                 >
                    Confirmar Criação
                 </button>
              </div>
           </div>
        </div>
      )}

    </div>
  );
};

export default ProductsPage;
