import React, { useEffect, useMemo, useState } from 'react';
import {
  Search,
  Plus,
  Edit,
  Trash2,
  Power,
  PowerOff,
  Layers,
  ChevronDown,
  ChevronRight,
  FolderTree,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { ApiService } from '../services/api';
import notificationService from '../services/notificationService';
import { Category, Enterprise, Product, SubCategory, User } from '../types';

type ManagedSubCategory = SubCategory & {
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

type ManagedCategory = Category & {
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
  subCategories: ManagedSubCategory[];
};

type StatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';

interface ProductCategoriesPageProps {
  currentUser?: User;
  activeEnterprise: Enterprise | null;
}

const normalizeText = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const defaultSubCategory = (sub: any, index: number): ManagedSubCategory => ({
  id: String(sub?.id || `sub_${Date.now()}_${index}`),
  name: String(sub?.name || '').trim(),
  isActive: sub?.isActive !== false,
  createdAt: sub?.createdAt,
  updatedAt: sub?.updatedAt,
});

const toManagedCategory = (cat: any, index: number): ManagedCategory => ({
  id: String(cat?.id || `cat_${Date.now()}_${index}`),
  name: String(cat?.name || '').trim(),
  enterpriseId: String(cat?.enterpriseId || ''),
  isActive: cat?.isActive !== false,
  createdAt: cat?.createdAt,
  updatedAt: cat?.updatedAt,
  subCategories: Array.isArray(cat?.subCategories)
    ? cat.subCategories
        .map((sub: any, subIndex: number) => defaultSubCategory(sub, subIndex))
        .filter((sub: ManagedSubCategory) => Boolean(sub.name))
    : [],
});

const deriveCategoriesFromProducts = (products: Product[], enterpriseId: string): ManagedCategory[] => {
  const map = new Map<string, ManagedCategory>();

  products.forEach((product, index) => {
    const categoryName = String(product.category || '').trim();
    if (!categoryName) return;

    const categoryKey = normalizeText(categoryName);
    if (!map.has(categoryKey)) {
      map.set(categoryKey, {
        id: `cat_derived_${Date.now()}_${index}`,
        name: categoryName,
        enterpriseId,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        subCategories: [],
      });
    }

    const currentCategory = map.get(categoryKey);
    if (!currentCategory) return;

    const subCategoryName = String(product.subCategory || '').trim();
    if (!subCategoryName) return;

    const subKey = normalizeText(subCategoryName);
    const existsSub = currentCategory.subCategories.some((sub) => normalizeText(sub.name) === subKey);
    if (existsSub) return;

    currentCategory.subCategories.push({
      id: `sub_derived_${Date.now()}_${currentCategory.subCategories.length + 1}`,
      name: subCategoryName,
      isActive: true,
    });
  });

  return Array.from(map.values());
};

const ProductCategoriesPage: React.FC<ProductCategoriesPageProps> = ({ activeEnterprise }) => {
  const enterpriseId = String(activeEnterprise?.id || '').trim();

  const [isLoading, setIsLoading] = useState(false);
  const [categories, setCategories] = useState<ManagedCategory[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(null);

  const [newCategoryName, setNewCategoryName] = useState('');
  const [isCreateCategoryModalOpen, setIsCreateCategoryModalOpen] = useState(false);

  const [editingCategory, setEditingCategory] = useState<ManagedCategory | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [editingCategoryStatus, setEditingCategoryStatus] = useState(true);

  const [subCategoryModalOpen, setSubCategoryModalOpen] = useState(false);
  const [subCategoryModalMode, setSubCategoryModalMode] = useState<'CREATE' | 'EDIT'>('CREATE');
  const [subCategoryTargetCategory, setSubCategoryTargetCategory] = useState<ManagedCategory | null>(null);
  const [subCategoryTarget, setSubCategoryTarget] = useState<ManagedSubCategory | null>(null);
  const [subCategoryName, setSubCategoryName] = useState('');
  const [subCategoryStatus, setSubCategoryStatus] = useState(true);

  const loadData = async () => {
    if (!enterpriseId) {
      setCategories([]);
      setProducts([]);
      return;
    }

    setIsLoading(true);
    try {
      const [categoriesData, productsData] = await Promise.all([
        ApiService.getCategories(enterpriseId),
        ApiService.getProducts(enterpriseId),
      ]);

      const managedFromApi = Array.isArray(categoriesData)
        ? categoriesData.map((cat: any, index: number) => toManagedCategory(cat, index))
        : [];

      const derived = deriveCategoriesFromProducts(Array.isArray(productsData) ? productsData : [], enterpriseId);
      const mergedMap = new Map<string, ManagedCategory>();

      managedFromApi.forEach((cat) => {
        mergedMap.set(normalizeText(cat.name), cat);
      });

      derived.forEach((cat) => {
        const key = normalizeText(cat.name);
        if (!mergedMap.has(key)) {
          mergedMap.set(key, cat);
        }
      });

      setCategories(Array.from(mergedMap.values()));
      setProducts(Array.isArray(productsData) ? productsData : []);
    } catch (err) {
      console.error('Erro ao carregar categorias de produto:', err);
      notificationService.critico('Erro ao carregar categorias', 'Não foi possível buscar as categorias de produto.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [enterpriseId]);

  const categoryUsageMap = useMemo(() => {
    const map = new Map<string, number>();
    products.forEach((product) => {
      const key = normalizeText(String(product.category || ''));
      if (!key) return;
      map.set(key, (map.get(key) || 0) + 1);
    });
    return map;
  }, [products]);

  const subCategoryUsageMap = useMemo(() => {
    const map = new Map<string, number>();
    products.forEach((product) => {
      const categoryKey = normalizeText(String(product.category || ''));
      const subKey = normalizeText(String(product.subCategory || ''));
      if (!categoryKey || !subKey) return;
      const compoundKey = `${categoryKey}::${subKey}`;
      map.set(compoundKey, (map.get(compoundKey) || 0) + 1);
    });
    return map;
  }, [products]);

  const filteredCategories = useMemo(() => {
    const term = normalizeText(searchTerm);

    return categories.filter((category) => {
      const matchesSearch = !term || normalizeText(category.name).includes(term);

      const isActive = category.isActive !== false;
      const matchesStatus =
        statusFilter === 'ALL'
        || (statusFilter === 'ACTIVE' && isActive)
        || (statusFilter === 'INACTIVE' && !isActive);

      return matchesSearch && matchesStatus;
    });
  }, [categories, searchTerm, statusFilter]);

  const stats = useMemo(() => {
    const activeCount = categories.filter((cat) => cat.isActive !== false).length;
    const inactiveCount = categories.length - activeCount;
    const subCount = categories.reduce((acc, cat) => acc + (cat.subCategories?.length || 0), 0);
    return {
      total: categories.length,
      active: activeCount,
      inactive: inactiveCount,
      subCount,
    };
  }, [categories]);

  const resetCategoryModal = () => {
    setNewCategoryName('');
    setIsCreateCategoryModalOpen(false);
  };

  const openEditCategoryModal = (category: ManagedCategory) => {
    setEditingCategory(category);
    setEditingCategoryName(category.name);
    setEditingCategoryStatus(category.isActive !== false);
  };

  const closeEditCategoryModal = () => {
    setEditingCategory(null);
    setEditingCategoryName('');
    setEditingCategoryStatus(true);
  };

  const handleCreateCategory = async () => {
    const name = String(newCategoryName || '').trim();
    if (!name) {
      notificationService.alerta('Nome obrigatório', 'Informe o nome da categoria.');
      return;
    }

    const duplicate = categories.some((cat) => normalizeText(cat.name) === normalizeText(name));
    if (duplicate) {
      notificationService.alerta('Categoria duplicada', 'Já existe uma categoria com esse nome.');
      return;
    }

    try {
      const payload = {
        name,
        enterpriseId,
        isActive: true,
        subCategories: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const created = await ApiService.createCategory(payload);
      setCategories((prev) => [...prev, toManagedCategory(created, prev.length + 1)]);
      notificationService.informativo('Categoria criada', `Categoria "${name}" criada com sucesso.`);
      resetCategoryModal();
    } catch (err) {
      console.error('Erro ao criar categoria:', err);
      notificationService.critico('Erro ao criar categoria', 'Não foi possível criar a categoria.');
    }
  };

  const handleSaveCategoryEdit = async () => {
    if (!editingCategory) return;

    const name = String(editingCategoryName || '').trim();
    if (!name) {
      notificationService.alerta('Nome obrigatório', 'Informe o nome da categoria.');
      return;
    }

    const duplicate = categories.some((cat) => (
      cat.id !== editingCategory.id && normalizeText(cat.name) === normalizeText(name)
    ));
    if (duplicate) {
      notificationService.alerta('Categoria duplicada', 'Já existe outra categoria com esse nome.');
      return;
    }

    try {
      const payload = {
        name,
        isActive: editingCategoryStatus,
        updatedAt: new Date().toISOString(),
      };
      const updated = await ApiService.updateCategory(editingCategory.id, payload);
      const normalizedUpdated = toManagedCategory(updated, 0);

      setCategories((prev) => prev.map((cat) => (
        cat.id === editingCategory.id
          ? { ...cat, ...normalizedUpdated }
          : cat
      )));

      notificationService.informativo('Categoria atualizada', 'As alterações foram salvas com sucesso.');
      closeEditCategoryModal();
    } catch (err) {
      console.error('Erro ao atualizar categoria:', err);
      notificationService.critico('Erro ao atualizar categoria', 'Não foi possível salvar as alterações.');
    }
  };

  const handleToggleCategoryStatus = async (category: ManagedCategory) => {
    const nextStatus = category.isActive === false;
    try {
      await ApiService.updateCategory(category.id, {
        isActive: nextStatus,
        updatedAt: new Date().toISOString(),
      });
      setCategories((prev) => prev.map((cat) => (
        cat.id === category.id
          ? { ...cat, isActive: nextStatus, updatedAt: new Date().toISOString() }
          : cat
      )));
      notificationService.informativo(
        nextStatus ? 'Categoria ativada' : 'Categoria desativada',
        `Categoria "${category.name}" ${nextStatus ? 'ativada' : 'desativada'} com sucesso.`
      );
    } catch (err) {
      console.error('Erro ao alternar status da categoria:', err);
      notificationService.critico('Erro ao alterar status', 'Não foi possível alterar o status da categoria.');
    }
  };

  const handleDeleteCategory = async (category: ManagedCategory) => {
    const usage = categoryUsageMap.get(normalizeText(category.name)) || 0;
    if (usage > 0) {
      notificationService.alerta(
        'Exclusão bloqueada',
        `A categoria "${category.name}" possui ${usage} produto(s) vinculado(s). Reclassifique os produtos antes de excluir.`
      );
      return;
    }

    const confirmed = window.confirm(`Deseja excluir a categoria "${category.name}"? Esta ação não poderá ser desfeita.`);
    if (!confirmed) return;

    try {
      await ApiService.deleteCategory(category.id);
      setCategories((prev) => prev.filter((cat) => cat.id !== category.id));
      notificationService.informativo('Categoria excluída', 'Categoria removida com sucesso.');
      if (expandedCategoryId === category.id) {
        setExpandedCategoryId(null);
      }
    } catch (err) {
      console.error('Erro ao excluir categoria:', err);
      notificationService.critico('Erro ao excluir categoria', 'Não foi possível excluir a categoria.');
    }
  };

  const openCreateSubCategoryModal = (category: ManagedCategory) => {
    setSubCategoryModalMode('CREATE');
    setSubCategoryTargetCategory(category);
    setSubCategoryTarget(null);
    setSubCategoryName('');
    setSubCategoryStatus(true);
    setSubCategoryModalOpen(true);
  };

  const openEditSubCategoryModal = (category: ManagedCategory, subCategory: ManagedSubCategory) => {
    setSubCategoryModalMode('EDIT');
    setSubCategoryTargetCategory(category);
    setSubCategoryTarget(subCategory);
    setSubCategoryName(subCategory.name);
    setSubCategoryStatus(subCategory.isActive !== false);
    setSubCategoryModalOpen(true);
  };

  const closeSubCategoryModal = () => {
    setSubCategoryModalOpen(false);
    setSubCategoryTargetCategory(null);
    setSubCategoryTarget(null);
    setSubCategoryName('');
    setSubCategoryStatus(true);
  };

  const handleSaveSubCategory = async () => {
    const category = subCategoryTargetCategory;
    if (!category) return;

    const name = String(subCategoryName || '').trim();
    if (!name) {
      notificationService.alerta('Nome obrigatório', 'Informe o nome da subcategoria.');
      return;
    }

    let nextSubCategories = [...(category.subCategories || [])];

    if (subCategoryModalMode === 'CREATE') {
      const duplicate = nextSubCategories.some((sub) => normalizeText(sub.name) === normalizeText(name));
      if (duplicate) {
        notificationService.alerta('Subcategoria duplicada', 'Já existe subcategoria com esse nome nesta categoria.');
        return;
      }

      nextSubCategories = [
        ...nextSubCategories,
        {
          id: `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          name,
          isActive: subCategoryStatus,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
    } else {
      if (!subCategoryTarget) return;

      const duplicate = nextSubCategories.some((sub) => (
        sub.id !== subCategoryTarget.id && normalizeText(sub.name) === normalizeText(name)
      ));
      if (duplicate) {
        notificationService.alerta('Subcategoria duplicada', 'Já existe outra subcategoria com esse nome nesta categoria.');
        return;
      }

      nextSubCategories = nextSubCategories.map((sub) => (
        sub.id === subCategoryTarget.id
          ? {
              ...sub,
              name,
              isActive: subCategoryStatus,
              updatedAt: new Date().toISOString(),
            }
          : sub
      ));
    }

    try {
      const updated = await ApiService.updateCategory(category.id, {
        subCategories: nextSubCategories,
        updatedAt: new Date().toISOString(),
      });

      const normalizedUpdated = toManagedCategory(updated, 0);
      setCategories((prev) => prev.map((cat) => (
        cat.id === category.id
          ? {
              ...cat,
              subCategories: normalizedUpdated.subCategories,
              updatedAt: normalizedUpdated.updatedAt || new Date().toISOString(),
            }
          : cat
      )));

      notificationService.informativo(
        subCategoryModalMode === 'CREATE' ? 'Subcategoria criada' : 'Subcategoria atualizada',
        subCategoryModalMode === 'CREATE'
          ? 'Subcategoria criada com sucesso.'
          : 'Subcategoria atualizada com sucesso.'
      );
      closeSubCategoryModal();
    } catch (err) {
      console.error('Erro ao salvar subcategoria:', err);
      notificationService.critico('Erro ao salvar subcategoria', 'Não foi possível salvar a subcategoria.');
    }
  };

  const handleToggleSubCategoryStatus = async (category: ManagedCategory, subCategory: ManagedSubCategory) => {
    const nextStatus = subCategory.isActive === false;
    const nextSubCategories = category.subCategories.map((sub) => (
      sub.id === subCategory.id
        ? {
            ...sub,
            isActive: nextStatus,
            updatedAt: new Date().toISOString(),
          }
        : sub
    ));

    try {
      await ApiService.updateCategory(category.id, {
        subCategories: nextSubCategories,
        updatedAt: new Date().toISOString(),
      });

      setCategories((prev) => prev.map((cat) => (
        cat.id === category.id
          ? { ...cat, subCategories: nextSubCategories, updatedAt: new Date().toISOString() }
          : cat
      )));

      notificationService.informativo(
        nextStatus ? 'Subcategoria ativada' : 'Subcategoria desativada',
        `Subcategoria "${subCategory.name}" ${nextStatus ? 'ativada' : 'desativada'} com sucesso.`
      );
    } catch (err) {
      console.error('Erro ao alternar status da subcategoria:', err);
      notificationService.critico('Erro ao alterar status', 'Não foi possível alterar o status da subcategoria.');
    }
  };

  const handleDeleteSubCategory = async (category: ManagedCategory, subCategory: ManagedSubCategory) => {
    const key = `${normalizeText(category.name)}::${normalizeText(subCategory.name)}`;
    const usage = subCategoryUsageMap.get(key) || 0;

    if (usage > 0) {
      notificationService.alerta(
        'Exclusão bloqueada',
        `A subcategoria "${subCategory.name}" possui ${usage} produto(s) vinculado(s). Reclassifique os produtos antes de excluir.`
      );
      return;
    }

    const confirmed = window.confirm(`Deseja excluir a subcategoria "${subCategory.name}"?`);
    if (!confirmed) return;

    const nextSubCategories = category.subCategories.filter((sub) => sub.id !== subCategory.id);

    try {
      await ApiService.updateCategory(category.id, {
        subCategories: nextSubCategories,
        updatedAt: new Date().toISOString(),
      });
      setCategories((prev) => prev.map((cat) => (
        cat.id === category.id
          ? { ...cat, subCategories: nextSubCategories, updatedAt: new Date().toISOString() }
          : cat
      )));
      notificationService.informativo('Subcategoria excluída', 'Subcategoria removida com sucesso.');
    } catch (err) {
      console.error('Erro ao excluir subcategoria:', err);
      notificationService.critico('Erro ao excluir subcategoria', 'Não foi possível excluir a subcategoria.');
    }
  };

  if (!activeEnterprise) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-8 text-center">
          <p className="text-sm font-semibold text-slate-500 dark:text-zinc-400">Selecione uma unidade para gerenciar categorias.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 animate-in fade-in duration-300">
      <section className="rounded-2xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4 md:p-5">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-indigo-500">CATEGORIA PRODUTO</p>
            <h1 className="text-2xl font-black text-slate-900 dark:text-zinc-100 leading-tight">Gestão de Categorias e Subcategorias</h1>
            <p className="text-sm font-semibold text-slate-500 dark:text-zinc-400 mt-1">
              Crie, edite, desative e exclua categorias com controle seguro de vínculo com produtos.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsCreateCategoryModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-black uppercase tracking-widest"
          >
            <Plus size={14} /> Nova Categoria
          </button>
        </div>
      </section>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <article className="rounded-2xl border border-indigo-100 dark:border-indigo-900/30 bg-indigo-50/70 dark:bg-indigo-950/30 p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500">Total</p>
          <p className="text-xl font-black text-indigo-900 dark:text-indigo-300 mt-1">{stats.total}</p>
        </article>
        <article className="rounded-2xl border border-emerald-100 dark:border-emerald-900/30 bg-emerald-50/70 dark:bg-emerald-950/30 p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Ativas</p>
          <p className="text-xl font-black text-emerald-900 dark:text-emerald-300 mt-1">{stats.active}</p>
        </article>
        <article className="rounded-2xl border border-amber-100 dark:border-amber-900/30 bg-amber-50/70 dark:bg-amber-950/30 p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">Inativas</p>
          <p className="text-xl font-black text-amber-900 dark:text-amber-300 mt-1">{stats.inactive}</p>
        </article>
        <article className="rounded-2xl border border-cyan-100 dark:border-cyan-900/30 bg-cyan-50/70 dark:bg-cyan-950/30 p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-cyan-600">Subcategorias</p>
          <p className="text-xl font-black text-cyan-900 dark:text-cyan-300 mt-1">{stats.subCount}</p>
        </article>
      </section>

      <section className="rounded-2xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="relative md:col-span-2">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar categoria..."
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-sm font-semibold text-slate-700 dark:text-zinc-200 outline-none focus:border-indigo-500"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-sm font-semibold text-slate-700 dark:text-zinc-200 outline-none focus:border-indigo-500"
          >
            <option value="ALL">Todos os status</option>
            <option value="ACTIVE">Somente ativos</option>
            <option value="INACTIVE">Somente inativos</option>
          </select>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-zinc-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead className="bg-slate-50 dark:bg-zinc-800/80 border-b border-slate-200 dark:border-zinc-700">
                <tr className="text-left">
                  <th className="px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400">Categoria</th>
                  <th className="px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400">Status</th>
                  <th className="px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400">Subcategorias</th>
                  <th className="px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400">Produtos</th>
                  <th className="px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400">Atualização</th>
                  <th className="px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-10 text-center text-sm font-semibold text-slate-500 dark:text-zinc-400">
                      Carregando categorias...
                    </td>
                  </tr>
                ) : filteredCategories.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-10 text-center text-sm font-semibold text-slate-500 dark:text-zinc-400">
                      Nenhuma categoria encontrada com os filtros atuais.
                    </td>
                  </tr>
                ) : filteredCategories.map((category) => {
                  const isExpanded = expandedCategoryId === category.id;
                  const linkedProducts = categoryUsageMap.get(normalizeText(category.name)) || 0;
                  const activeSubCount = category.subCategories.filter((sub) => sub.isActive !== false).length;
                  const totalSubCount = category.subCategories.length;

                  return (
                    <React.Fragment key={category.id}>
                      <tr className="border-b border-slate-100 dark:border-zinc-800">
                        <td className="px-3 py-3">
                          <button
                            type="button"
                            onClick={() => setExpandedCategoryId(isExpanded ? null : category.id)}
                            className="inline-flex items-center gap-2 text-left"
                          >
                            {isExpanded ? <ChevronDown size={14} className="text-slate-500" /> : <ChevronRight size={14} className="text-slate-500" />}
                            <span className="font-black text-sm text-slate-800 dark:text-zinc-100">{category.name}</span>
                          </button>
                        </td>
                        <td className="px-3 py-3">
                          {category.isActive !== false ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 text-[10px] font-black uppercase tracking-widest">
                              <CheckCircle2 size={12} /> Ativa
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 text-[10px] font-black uppercase tracking-widest">
                              <XCircle size={12} /> Inativa
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-sm font-semibold text-slate-700 dark:text-zinc-200">
                          {activeSubCount}/{totalSubCount}
                        </td>
                        <td className="px-3 py-3 text-sm font-semibold text-slate-700 dark:text-zinc-200">
                          {linkedProducts}
                        </td>
                        <td className="px-3 py-3 text-xs font-semibold text-slate-500 dark:text-zinc-400">
                          {category.updatedAt ? new Date(category.updatedAt).toLocaleDateString('pt-BR') : '-'}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            <button
                              type="button"
                              onClick={() => openCreateSubCategoryModal(category)}
                              className="px-2 py-1 rounded-lg border border-cyan-200 dark:border-cyan-900/40 text-cyan-700 dark:text-cyan-300 text-[10px] font-black uppercase tracking-widest hover:bg-cyan-50 dark:hover:bg-cyan-950/40"
                            >
                              + Sub
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditCategoryModal(category)}
                              className="p-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800"
                              title="Editar categoria"
                            >
                              <Edit size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleCategoryStatus(category)}
                              className="p-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800"
                              title={category.isActive !== false ? 'Desativar categoria' : 'Ativar categoria'}
                            >
                              {category.isActive !== false ? <PowerOff size={13} /> : <Power size={13} />}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteCategory(category)}
                              className="p-1.5 rounded-lg border border-rose-200 dark:border-rose-900/40 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                              title="Excluir categoria"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="bg-slate-50/70 dark:bg-zinc-900/40 border-b border-slate-100 dark:border-zinc-800">
                          <td colSpan={6} className="px-4 py-3">
                            <div className="rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3 space-y-2">
                              <div className="flex items-center justify-between">
                                <p className="text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400 inline-flex items-center gap-1.5">
                                  <Layers size={13} /> Subcategorias
                                </p>
                                <button
                                  type="button"
                                  onClick={() => openCreateSubCategoryModal(category)}
                                  className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black uppercase tracking-widest"
                                >
                                  Nova Subcategoria
                                </button>
                              </div>

                              {category.subCategories.length === 0 ? (
                                <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400">Nenhuma subcategoria cadastrada.</p>
                              ) : (
                                <div className="overflow-x-auto">
                                  <table className="w-full min-w-[640px]">
                                    <thead>
                                      <tr className="border-b border-slate-100 dark:border-zinc-800">
                                        <th className="py-2 pr-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400">Nome</th>
                                        <th className="py-2 pr-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400">Status</th>
                                        <th className="py-2 pr-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400">Produtos</th>
                                        <th className="py-2 text-right text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400">Ações</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {category.subCategories.map((sub) => {
                                        const subUsage = subCategoryUsageMap.get(`${normalizeText(category.name)}::${normalizeText(sub.name)}`) || 0;
                                        return (
                                          <tr key={sub.id} className="border-b border-slate-50 dark:border-zinc-800/70 last:border-b-0">
                                            <td className="py-2 pr-3 text-sm font-semibold text-slate-700 dark:text-zinc-200">{sub.name}</td>
                                            <td className="py-2 pr-3">
                                              {sub.isActive !== false ? (
                                                <span className="px-2 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 text-[10px] font-black uppercase tracking-widest">Ativa</span>
                                              ) : (
                                                <span className="px-2 py-1 rounded-full bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 text-[10px] font-black uppercase tracking-widest">Inativa</span>
                                              )}
                                            </td>
                                            <td className="py-2 pr-3 text-sm font-semibold text-slate-700 dark:text-zinc-200">{subUsage}</td>
                                            <td className="py-2">
                                              <div className="flex items-center justify-end gap-1.5">
                                                <button
                                                  type="button"
                                                  onClick={() => openEditSubCategoryModal(category, sub)}
                                                  className="p-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800"
                                                >
                                                  <Edit size={12} />
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => handleToggleSubCategoryStatus(category, sub)}
                                                  className="p-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800"
                                                >
                                                  {sub.isActive !== false ? <PowerOff size={12} /> : <Power size={12} />}
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => handleDeleteSubCategory(category, sub)}
                                                  className="p-1.5 rounded-lg border border-rose-200 dark:border-rose-900/40 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                                                >
                                                  <Trash2 size={12} />
                                                </button>
                                              </div>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {isCreateCategoryModalOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
          <button type="button" className="absolute inset-0 bg-black/60" onClick={resetCategoryModal} />
          <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-2xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <FolderTree size={18} className="text-indigo-600" />
              <h3 className="text-lg font-black text-slate-900 dark:text-zinc-100">Nova Categoria</h3>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400">Nome da categoria</label>
              <input
                autoFocus
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Ex.: Bebidas Geladas"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-sm font-semibold text-slate-700 dark:text-zinc-200 outline-none focus:border-indigo-500"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={resetCategoryModal} className="px-3 py-2 rounded-xl text-xs font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800">Cancelar</button>
              <button type="button" onClick={handleCreateCategory} className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-widest">Salvar</button>
            </div>
          </div>
        </div>
      )}

      {editingCategory && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
          <button type="button" className="absolute inset-0 bg-black/60" onClick={closeEditCategoryModal} />
          <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-2xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Edit size={18} className="text-indigo-600" />
              <h3 className="text-lg font-black text-slate-900 dark:text-zinc-100">Editar Categoria</h3>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400">Nome da categoria</label>
              <input
                autoFocus
                value={editingCategoryName}
                onChange={(e) => setEditingCategoryName(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-sm font-semibold text-slate-700 dark:text-zinc-200 outline-none focus:border-indigo-500"
              />
            </div>

            <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-zinc-200">
              <input
                type="checkbox"
                checked={editingCategoryStatus}
                onChange={(e) => setEditingCategoryStatus(e.target.checked)}
              />
              Categoria ativa
            </label>

            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={closeEditCategoryModal} className="px-3 py-2 rounded-xl text-xs font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800">Cancelar</button>
              <button type="button" onClick={handleSaveCategoryEdit} className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-widest">Salvar alterações</button>
            </div>
          </div>
        </div>
      )}

      {subCategoryModalOpen && subCategoryTargetCategory && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
          <button type="button" className="absolute inset-0 bg-black/60" onClick={closeSubCategoryModal} />
          <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-2xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Layers size={18} className="text-indigo-600" />
              <h3 className="text-lg font-black text-slate-900 dark:text-zinc-100">
                {subCategoryModalMode === 'CREATE' ? 'Nova Subcategoria' : 'Editar Subcategoria'}
              </h3>
            </div>
            <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400">
              Categoria: <span className="font-black text-slate-700 dark:text-zinc-200">{subCategoryTargetCategory.name}</span>
            </p>

            <div className="space-y-1.5">
              <label className="text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400">Nome da subcategoria</label>
              <input
                autoFocus
                value={subCategoryName}
                onChange={(e) => setSubCategoryName(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-sm font-semibold text-slate-700 dark:text-zinc-200 outline-none focus:border-indigo-500"
              />
            </div>

            <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-zinc-200">
              <input
                type="checkbox"
                checked={subCategoryStatus}
                onChange={(e) => setSubCategoryStatus(e.target.checked)}
              />
              Subcategoria ativa
            </label>

            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={closeSubCategoryModal} className="px-3 py-2 rounded-xl text-xs font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800">Cancelar</button>
              <button type="button" onClick={handleSaveSubCategory} className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-widest">
                {subCategoryModalMode === 'CREATE' ? 'Criar subcategoria' : 'Salvar alterações'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductCategoriesPage;
