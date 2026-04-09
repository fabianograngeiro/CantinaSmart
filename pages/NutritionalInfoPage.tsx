
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Beef, Search, Plus, Trash2, Edit, Save, X, 
  Flame, Zap, Droplets, Apple, Info, ChevronRight,
  Filter, Scale, ArrowUpRight, CheckCircle2,
  AlertCircle, Tag, LayoutGrid, PlusCircle, Sparkles, Download, Upload
} from 'lucide-react';
import { ApiService } from '../services/api';
import notificationService from '../services/notificationService';
import { Ingredient, IngredientUnit } from '../types';

type NutrientReferenceRow = {
  ingredientId?: string;
  isActive?: boolean;
  group: string;
  focus: string;
  food: string;
  kcal: number;
  protein: number;
  carbs: number;
  fats: number;
  fiber: number;
  calciumMg: number;
  ironMg: number;
  vitaminNote?: string;
};

const normalizeFoodKey = (value?: string) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
const normalizeSearchText = (value?: string) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();


const normalizeCategoryLabel = (value?: string) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const key = normalizeFoodKey(raw);
  const aliases: Record<string, string> = {
    proteina: 'Proteínas',
    proteinas: 'Proteínas',
    carboidrato: 'Carboidratos',
    carboidratos: 'Carboidratos',
    vegetais: 'Fibras',
    bebida: 'Vitaminas',
    bebidas: 'Vitaminas',
    lanchesprontos: 'Carboidratos',
    lanchepronto: 'Carboidratos',
    fibras: 'Fibras',
    calcio: 'Cálcio',
    ferro: 'Ferro',
    vitaminas: 'Vitaminas',
  };
  return aliases[key] || raw;
};
const toUpperText = (value?: string) => String(value || '').toLocaleUpperCase('pt-BR');

const AUTH_USER_STORAGE_KEY = 'canteen_auth_user';
const ACTIVE_ENTERPRISE_STORAGE_KEY = 'canteen_active_enterprise';

const NutritionalInfoPage: React.FC = () => {
  const restoreFileInputRef = useRef<HTMLInputElement | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('TODOS');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState<Ingredient | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isAiConfigured, setIsAiConfigured] = useState(false);
  const [aiSuggestedValues, setAiSuggestedValues] = useState(false);
  const [aiConversation, setAiConversation] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([]);
  const [aiReplyInput, setAiReplyInput] = useState('');
  const [aiPendingQuestion, setAiPendingQuestion] = useState(false);

  const [customCategories, setCustomCategories] = useState<string[]>([]);

  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [isRestoringBackup, setIsRestoringBackup] = useState(false);

  // Carregar ingredientes da API
  useEffect(() => {
    const loadIngredients = async () => {
      try {
        const data = await ApiService.getIngredients(true);
        setIngredients(data);
      } catch (err) {
        console.error('Erro ao carregar ingredientes:', err);
        setIngredients([]);
      }
    };
    loadIngredients();
  }, []);

  useEffect(() => {
    const loadAiConfigStatus = async () => {
      try {
        const payload = await ApiService.getWhatsAppAiConfig();
        const cfg = payload?.config || {};
        const provider = String(cfg?.provider || 'openai').toLowerCase();
        const hasOpenAi = Boolean(String(cfg?.openAiToken || '').trim());
        const hasGemini = Boolean(String(cfg?.geminiToken || '').trim());
        const hasGroq = Boolean(String(cfg?.groqToken || '').trim());
        const systemAiEnabled = Boolean(cfg?.systemAiEnabled);
        const hasSystemOpenAi = Boolean(String(cfg?.systemOpenAiToken || '').trim());
        const hasSystemGemini = Boolean(String(cfg?.systemGeminiToken || '').trim());
        const hasSystemGroq = Boolean(String(cfg?.systemGroqToken || '').trim());
        if (systemAiEnabled) {
          setIsAiConfigured(hasSystemOpenAi || hasSystemGemini || hasSystemGroq || hasOpenAi || hasGemini || hasGroq);
          return;
        }
        const isConfigured =
          (provider === 'openai' && hasOpenAi)
          || (provider === 'gemini' && hasGemini)
          || (provider === 'groq' && hasGroq);
        setIsAiConfigured(isConfigured);
      } catch {
        setIsAiConfigured(false);
      }
    };
    loadAiConfigStatus();
  }, []);

  const [formData, setFormData] = useState({
    name: '',
    category: 'PROTEÍNAS',
    unit: 'g' as IngredientUnit,
    calories: 0,
    proteins: 0,
    carbs: 0,
    fats: 0,
    fiber: 0,
    calciumMg: 0,
    ironMg: 0,
  });

  const mergedReferenceRows = useMemo(() => {
    const dynamicRows: NutrientReferenceRow[] = ingredients.map((ing) => ({
      ingredientId: ing.id,
      isActive: ing.isActive !== false,
      group: normalizeCategoryLabel(ing.category) || 'Outros',
      focus: ing.source === 'NATIVE' ? 'Base nativa do sistema' : 'Cadastro local da unidade',
      food: String(ing.name || '').trim(),
      kcal: Number(ing.calories || 0),
      protein: Number(ing.proteins || 0),
      carbs: Number(ing.carbs || 0),
      fats: Number(ing.fats || 0),
      fiber: Number(ing.fiber || 0),
      calciumMg: Number(ing.calciumMg || 0),
      ironMg: Number(ing.ironMg || 0),
      vitaminNote: ing.isActive === false
        ? 'Item desativado'
        : (ing.source === 'NATIVE' ? 'Base nativa do sistema' : 'Item cadastrado localmente'),
    })).filter((row) => row.food);

    return dynamicRows;
  }, [ingredients]);

  const nutrientReferenceMap = useMemo(() => {
    const map: Record<string, NutrientReferenceRow> = {};
    mergedReferenceRows.forEach((row) => {
      map[normalizeFoodKey(row.food)] = row;
    });
    map[normalizeFoodKey('Aipim')] = map[normalizeFoodKey('Mandioca')] || map[normalizeFoodKey('Aipim')];
    map[normalizeFoodKey('Macaxeira')] = map[normalizeFoodKey('Mandioca')] || map[normalizeFoodKey('Macaxeira')];
    map[normalizeFoodKey('Couve Flor')] = map[normalizeFoodKey('Couve-Flor')] || map[normalizeFoodKey('Couve Flor')];
    map[normalizeFoodKey('Pimentao Amarelo')] = map[normalizeFoodKey('Pimentão Amarelo')] || map[normalizeFoodKey('Pimentao Amarelo')];
    return map;
  }, [mergedReferenceRows]);

  const ingredientsById = useMemo(
    () => new Map(ingredients.map((ingredient) => [ingredient.id, ingredient] as const)),
    [ingredients]
  );

  const groupedReferenceRows = useMemo(() => {
    return mergedReferenceRows.reduce<Record<string, NutrientReferenceRow[]>>((acc, row) => {
      if (!acc[row.group]) acc[row.group] = [];
      acc[row.group].push(row);
      return acc;
    }, {});
  }, [mergedReferenceRows]);

  const filteredGroupedReferenceRows = useMemo<Record<string, NutrientReferenceRow[]>>(() => {
    const search = normalizeSearchText(searchTerm);
    const rows = mergedReferenceRows.filter((row) => {
      const matchesSearch =
        !search
        || normalizeSearchText(row.food).includes(search)
        || normalizeSearchText(row.group).includes(search);
      const matchesCategory = selectedCategory === 'TODOS' || String(row.group || '') === selectedCategory;
      return matchesSearch && matchesCategory;
    });
    return rows.reduce<Record<string, NutrientReferenceRow[]>>((acc, row) => {
      if (!acc[row.group]) acc[row.group] = [];
      acc[row.group].push(row);
      return acc;
    }, {});
  }, [mergedReferenceRows, searchTerm, selectedCategory]);

  const availableCategories = useMemo(() => {
    const fromTable = Object.keys(groupedReferenceRows).filter(Boolean);
    return Array.from(new Set([...fromTable, ...customCategories].filter(Boolean)));
  }, [groupedReferenceRows, customCategories]);

  const getReferenceForFood = (name: string) => {
    const normalized = normalizeFoodKey(name);
    if (!normalized) return undefined;
    if (nutrientReferenceMap[normalized]) return nutrientReferenceMap[normalized];
    return mergedReferenceRows.find((row) => {
      const key = normalizeFoodKey(row.food);
      return normalized.includes(key) || key.includes(normalized);
    });
  };

  const selectedReference = useMemo(
    () => getReferenceForFood(formData.name),
    [formData.name, nutrientReferenceMap]
  );

  const handleToggleIngredientActive = async (ingredient: Ingredient) => {
    const nextActive = ingredient.isActive === false;
    try {
      const updated = await ApiService.updateIngredient(ingredient.id, { isActive: nextActive });
      setIngredients((prev) => prev.map((item) => (item.id === ingredient.id ? updated : item)));
      notificationService.informativo(
        nextActive ? 'Item ativado' : 'Item desativado',
        nextActive
          ? 'O item voltou a ficar disponível na base nutricional.'
          : 'O item foi desativado e não aparece nas telas operacionais.'
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao atualizar status do item.';
      notificationService.alerta('Erro ao atualizar status', message);
    }
  };

  const handleOpenModal = (ing: Ingredient | null = null) => {
    if (ing) {
      setEditingIngredient(ing);
      setAiSuggestedValues(false);
      setAiConversation([]);
      setAiReplyInput('');
      setAiPendingQuestion(false);
      setFormData({
        name: toUpperText(ing.name),
        category: toUpperText(normalizeCategoryLabel(ing.category) || ing.category),
        unit: ing.unit,
        calories: ing.calories,
        proteins: ing.proteins,
        carbs: ing.carbs,
        fats: ing.fats,
        fiber: Number(ing.fiber || 0),
        calciumMg: Number(ing.calciumMg || 0),
        ironMg: Number(ing.ironMg || 0),
      });
    } else {
      setEditingIngredient(null);
      setAiSuggestedValues(false);
      setAiConversation([]);
      setAiReplyInput('');
      setAiPendingQuestion(false);
      setFormData({ 
        name: '', 
        category: toUpperText(availableCategories[0] || 'Proteínas'),
        unit: 'g', 
        calories: 0, 
        proteins: 0, 
        carbs: 0, 
        fats: 0,
        fiber: 0,
        calciumMg: 0,
        ironMg: 0,
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Ingredient = {
      id: editingIngredient?.id || Math.random().toString(36).substr(2, 9),
      name: toUpperText(formData.name),
      category: toUpperText(normalizeCategoryLabel(formData.category) || formData.category),
      unit: formData.unit,
      calories: Number(formData.calories),
      proteins: Number(formData.proteins),
      carbs: Number(formData.carbs),
      fats: Number(formData.fats),
      fiber: Number(formData.fiber),
      calciumMg: Number(formData.calciumMg),
      ironMg: Number(formData.ironMg),
    };

    try {
      if (editingIngredient) {
        const updated = await ApiService.updateIngredient(editingIngredient.id, payload);
        setIngredients(prev => prev.map(i => i.id === editingIngredient.id ? updated : i));
        notificationService.informativo('Item atualizado', 'Alterações salvas na base nutricional.');
        setIsModalOpen(false);
      } else {
        const created = await ApiService.createIngredient(payload);
        setIngredients(prev => [created, ...prev]);
        notificationService.informativo('Item cadastrado', 'Novo insumo salvo na base nutricional.');
        setAiSuggestedValues(false);
        setAiConversation([]);
        setAiReplyInput('');
        setAiPendingQuestion(false);
        setFormData({
          name: '',
          category: toUpperText(availableCategories[0] || 'Proteínas'),
          unit: 'g',
          calories: 0,
          proteins: 0,
          carbs: 0,
          fats: 0,
          fiber: 0,
          calciumMg: 0,
          ironMg: 0,
        });
      }
      const savedCategory = normalizeCategoryLabel(formData.category) || String(formData.category || '').trim();
      if (savedCategory) {
        setCustomCategories((prev) => Array.from(new Set([...prev, savedCategory])));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao salvar item na base nutricional.';
      notificationService.alerta('Erro ao salvar', message);
    }
  };

  const handleConsultAi = async (options?: { userText?: string; isReply?: boolean }) => {
    const foodName = String(formData.name || '').trim();
    if (!foodName || isAiLoading) return;
    const userText = String(options?.userText || '').trim();

    setIsAiLoading(true);
    try {
      const nextConversation = [...aiConversation];
      if (options?.isReply && userText) {
        nextConversation.push({ role: 'user', text: userText });
        setAiConversation(nextConversation);
      }

      const referenceSeed = selectedReference
        ? [{
            role: 'user' as const,
            text: `Referência interna encontrada para "${selectedReference.food}" por 100g: energia_kcal ${selectedReference.kcal}, carboidratos_g ${selectedReference.carbs}, proteinas_g ${selectedReference.protein}, gorduras_g ${selectedReference.fats}, fibra_g ${selectedReference.fiber}, calcio_mg ${selectedReference.calciumMg}, ferro_mg ${selectedReference.ironMg}.`,
          }]
        : [];
      const hasTableSeed = nextConversation.some((msg) => msg.text.includes('[TABELA_CATEGORIAS_BASE]'));
      const tableSeed = hasTableSeed
        ? []
        : [{
            role: 'user' as const,
            text: `[TABELA_CATEGORIAS_BASE]\nCategorias disponíveis: ${availableCategories.join(', ')}.\nTabela atual (alimento=>categoria): ${mergedReferenceRows.slice(0, 80).map((row) => `${row.food}=>${row.group}`).join(' | ')}`,
          }];
      const conversationWithPrompt = [...tableSeed, ...referenceSeed, ...nextConversation];
      const result = await ApiService.getAiNutritionalData(foodName, conversationWithPrompt);

      if (String(result?.mode || '').toLowerCase() === 'question') {
        const question = String(result?.question || 'Pode detalhar o estado/preparo do alimento?').trim();
        setAiConversation((prev) => [...prev, { role: 'assistant', text: question }]);
        setAiPendingQuestion(true);
        return;
      }

      const aiData = result?.data || {};
      const aiCategory = normalizeCategoryLabel(String(aiData.categoria_sugerida || selectedReference?.group || '').trim());
      const calories = Number(aiData.energia_kcal || 0);
      const carbs = Number(aiData.carboidratos_g || 0);
      const proteins = Number(aiData.proteinas_g || 0);
      const fats = Number(aiData.gorduras_g || 0);
      const fiber = Number(aiData.fibra_g || aiData.fiber_g || aiData.fibra || 0);
      const calciumMg = Number(aiData.calcio_mg || aiData.calcium_mg || aiData.calcio || 0);
      const ironMg = Number(aiData.ferro_mg || aiData.iron_mg || aiData.ferro || 0);
      setFormData((prev) => ({
        ...prev,
        category: toUpperText(aiCategory || prev.category),
        calories,
        carbs,
        proteins,
        fats,
        fiber,
        calciumMg,
        ironMg,
      }));
      if (aiCategory) {
        setCustomCategories((prev) => Array.from(new Set([...prev, aiCategory].filter(Boolean))));
      }
      setAiPendingQuestion(false);
      setAiSuggestedValues(true);
      setAiConversation((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: `Categoria inserida: ${aiCategory || 'Não definida'}. Nutrientes preenchidos automaticamente (${String(aiData.fonte_referencia || 'TACO/USDA')}).`,
        },
      ]);
    } catch (err) {
      const message = err instanceof Error
        ? err.message
        : 'Não foi possível preencher automaticamente os valores nutricionais.';
      notificationService.alerta('Falha ao consultar IA', message);
    } finally {
      setIsAiLoading(false);
    }
  };

  const applyReferenceValues = (row: NutrientReferenceRow) => {
    setFormData((prev) => ({
      ...prev,
      category: toUpperText(normalizeCategoryLabel(row.group) || prev.category),
      calories: Number(row.kcal || 0),
      carbs: Number(row.carbs || 0),
      proteins: Number(row.protein || 0),
      fats: Number(row.fats || 0),
      fiber: Number(row.fiber || 0),
      calciumMg: Number(row.calciumMg || 0),
      ironMg: Number(row.ironMg || 0),
    }));
    if (row.group) {
      setCustomCategories((prev) => Array.from(new Set([...prev, normalizeCategoryLabel(row.group)].filter(Boolean))));
    }
    setAiSuggestedValues(true);
    notificationService.informativo('Valores aplicados', `Tabela de referência usada: ${row.food} (por 100g).`);
  };

  const handleAiReplySubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const reply = String(aiReplyInput || '').trim();
    if (!reply || isAiLoading) return;
    setAiReplyInput('');
    await handleConsultAi({ userText: reply, isReply: true });
  };

  const handleAddCategory = (name: string) => {
    const normalized = normalizeCategoryLabel(name);
    if (!normalized || availableCategories.includes(normalized)) return;
    setCustomCategories((prev) => [...prev, normalized]);
    setIsCategoryModalOpen(false);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("Deseja remover este item da base?")) {
      try {
        await ApiService.deleteIngredient(id);
        setIngredients(prev => prev.filter(i => i.id !== id));
        notificationService.informativo('Item removido', 'Insumo removido da base nutricional.');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Falha ao remover item da base nutricional.';
        notificationService.alerta('Erro ao remover', message);
      }
    }
  };

  const closeMobileActionMenu = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return;
    const details = target.closest('details') as HTMLDetailsElement | null;
    if (details) {
      details.open = false;
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

  const highlightMatch = (text: string) => {
    const raw = String(text || '');
    const search = String(searchTerm || '').trim();
    if (!search) return raw;
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'ig');
    const parts = raw.split(regex);
    const searchLower = search.toLowerCase();
    return parts.map((part, idx) => (
      part.toLowerCase() === searchLower
        ? <mark key={`${part}-${idx}`} className="bg-amber-200/80 text-gray-900 rounded px-0.5">{part}</mark>
        : <React.Fragment key={`${part}-${idx}`}>{part}</React.Fragment>
    ));
  };

  const backupTableData = useMemo(() => {
    return ingredients.map((ingredient) => ({
      id: String(ingredient.id || ''),
      name: String(ingredient.name || ''),
      category: String(ingredient.category || ''),
      unit: ingredient.unit,
      calories: Number(ingredient.calories || 0),
      proteins: Number(ingredient.proteins || 0),
      carbs: Number(ingredient.carbs || 0),
      fats: Number(ingredient.fats || 0),
      fiber: Number(ingredient.fiber || 0),
      calciumMg: Number(ingredient.calciumMg || 0),
      ironMg: Number(ingredient.ironMg || 0),
      isActive: ingredient.isActive !== false,
      source: ingredient.source || 'CUSTOM',
    }));
  }, [ingredients]);

  const handleBackupFullTable = () => {
    const now = new Date();
    let exportedBy = 'Não informado';
    let enterpriseName = 'Não informada';

    try {
      const rawUser = localStorage.getItem(AUTH_USER_STORAGE_KEY);
      const rawEnterprise = localStorage.getItem(ACTIVE_ENTERPRISE_STORAGE_KEY);
      if (rawUser) {
        const parsedUser = JSON.parse(rawUser);
        exportedBy = String(parsedUser?.name || parsedUser?.email || '').trim() || 'Não informado';
      }
      if (rawEnterprise) {
        const parsedEnterprise = JSON.parse(rawEnterprise);
        enterpriseName = String(parsedEnterprise?.name || '').trim() || 'Não informada';
      }
    } catch {
      exportedBy = 'Não informado';
      enterpriseName = 'Não informada';
    }

    const payload = {
      kind: 'NUTRITIONAL_TABLE_BACKUP',
      version: 1,
      generatedAt: now.toISOString(),
      generatedAtReadable: now.toLocaleString('pt-BR'),
      audit: {
        exportedBy,
        enterpriseName,
      },
      totalItems: backupTableData.length,
      items: backupTableData,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const dateKey = new Date().toISOString().slice(0, 10);
    anchor.href = url;
    anchor.download = `backup-base-nutricional-${dateKey}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);

    notificationService.informativo('Backup gerado', `${backupTableData.length} item(ns) exportado(s) da base nutricional.`);
  };

  const parseBackupItems = (payload: any): Ingredient[] => {
    const itemsRaw = Array.isArray(payload)
      ? payload
      : (Array.isArray(payload?.items) ? payload.items : []);

    return itemsRaw
      .map((item: any): Ingredient => ({
        id: String(item?.id || Math.random().toString(36).slice(2)),
        name: String(item?.name || '').trim(),
        category: String(item?.category || 'Outros').trim() || 'Outros',
        unit: String(item?.unit || 'g') as IngredientUnit,
        calories: Number(item?.calories || 0),
        proteins: Number(item?.proteins || 0),
        carbs: Number(item?.carbs || 0),
        fats: Number(item?.fats || 0),
        fiber: Number(item?.fiber || 0),
        calciumMg: Number(item?.calciumMg || 0),
        ironMg: Number(item?.ironMg || 0),
        isActive: item?.isActive !== false,
        source: String(item?.source || 'CUSTOM').toUpperCase() === 'NATIVE' ? 'NATIVE' : 'CUSTOM',
      }))
      .filter((item) => String(item.name || '').trim().length > 0);
  };

  const buildIngredientNameKey = (value?: string) => normalizeFoodKey(value);

  const dedupeIngredientsByName = (items: Ingredient[]) => {
    const byName = new Map<string, Ingredient>();
    items.forEach((item) => {
      const key = buildIngredientNameKey(item?.name);
      if (!key) return;
      byName.set(key, item);
    });
    return Array.from(byName.values());
  };

  const handleRestoreBackupFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setIsRestoringBackup(true);
      const text = await file.text();
      const parsed = JSON.parse(text);
      const items = parseBackupItems(parsed);

      if (items.length === 0) {
        notificationService.alerta('Backup inválido', 'Nenhum item válido encontrado no arquivo de backup.');
        return;
      }

      const backupUniqueItems = dedupeIngredientsByName(items);
      const duplicatedInBackupCount = items.length - backupUniqueItems.length;
      if (duplicatedInBackupCount > 0) {
        notificationService.informativo(
          'Itens repetidos no backup',
          `${duplicatedInBackupCount} item(ns) com nome repetido no arquivo foram consolidados automaticamente (mantido o último).`
        );
      }

      const currentByNameKey = (Array.isArray(ingredients) ? ingredients : []).reduce((acc, item) => {
        const key = buildIngredientNameKey(item?.name);
        if (!key) return acc;
        const list = acc.get(key) || [];
        list.push(item);
        acc.set(key, list);
        return acc;
      }, new Map<string, Ingredient[]>());

      const backupByNameKey = backupUniqueItems.reduce((acc, item) => {
        const key = buildIngredientNameKey(item?.name);
        if (!key) return acc;
        acc.set(key, item);
        return acc;
      }, new Map<string, Ingredient>());

      const duplicateKeys = Array.from(backupByNameKey.keys()).filter((key) => currentByNameKey.has(key));
      const duplicateKeySet = new Set(duplicateKeys);

      let finalRestoreItems = backupUniqueItems;
      if (duplicateKeys.length > 0) {
        const overwriteAllDuplicates = window.confirm(
          `Foram encontrados ${duplicateKeys.length} item(ns) com o mesmo nome da base atual.\n\n` +
          'Clique OK para sobrescrever todos os duplicados.\n' +
          'Clique Cancelar para analisar item por item.'
        );

        const overwriteKeys = new Set<string>();
        if (overwriteAllDuplicates) {
          duplicateKeys.forEach((key) => overwriteKeys.add(key));
        } else {
          duplicateKeys.forEach((key) => {
            const currentNames = (currentByNameKey.get(key) || []).map((item) => String(item?.name || '').trim()).filter(Boolean);
            const backupName = String(backupByNameKey.get(key)?.name || '').trim() || 'ITEM';
            const shouldOverwrite = window.confirm(
              `Duplicado encontrado: ${backupName}\n` +
              `Atual: ${currentNames.join(' | ') || 'N/A'}\n` +
              `Backup: ${backupName}\n\n` +
              'Deseja sobrescrever este item?'
            );
            if (shouldOverwrite) overwriteKeys.add(key);
          });
        }

        const keptCurrentItems = (Array.isArray(ingredients) ? ingredients : []).filter((item) => {
          const key = buildIngredientNameKey(item?.name);
          if (!key) return true;
          if (!duplicateKeySet.has(key)) return true;
          return !overwriteKeys.has(key);
        });
        const selectedBackupItems = backupUniqueItems.filter((item) => {
          const key = buildIngredientNameKey(item?.name);
          if (!key) return false;
          if (!duplicateKeySet.has(key)) return true;
          return overwriteKeys.has(key);
        });
        finalRestoreItems = [...keptCurrentItems, ...selectedBackupItems];
      }

      if (!window.confirm(`Restaurar backup com ${finalRestoreItems.length} item(ns)? Esta ação substituirá toda a tabela atual.`)) {
        return;
      }

      const result = await ApiService.restoreIngredientsTable(finalRestoreItems);
      const restoredItems = Array.isArray(result?.items) ? result.items : finalRestoreItems;
      setIngredients(restoredItems);
      setSelectedCategory('TODOS');
      setCustomCategories((prev) => {
        const fromRestored = restoredItems
          .map((item: Ingredient) => normalizeCategoryLabel(item.category))
          .filter(Boolean);
        return Array.from(new Set([...prev, ...fromRestored]));
      });
      notificationService.informativo('Base restaurada', `${restoredItems.length} item(ns) restaurado(s) com sucesso.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao restaurar backup da base nutricional.';
      notificationService.alerta('Erro na restauração', message);
    } finally {
      setIsRestoringBackup(false);
      if (restoreFileInputRef.current) {
        restoreFileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="dash-shell nutrition-shell space-y-3 min-h-screen">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl sm:text-2xl font-black text-gray-800 tracking-tight flex items-center gap-2 leading-none uppercase">
            <Beef className="text-indigo-600" size={20} /> ITENS COMIDA / BASE NUTRICIONAL
          </h1>
          <p className="text-gray-500 text-[8px] sm:text-[9px] font-black uppercase tracking-[0.12em] mt-1">
            Gestão de insumos e produtos para montagem de cardápios
          </p>
        </div>
        <div className="flex gap-1.5 sm:gap-2 flex-wrap">
          <button
            onClick={handleBackupFullTable}
            className="bg-white text-emerald-700 border border-emerald-200 px-3 py-2 rounded-lg font-black uppercase tracking-[0.12em] text-[9px] shadow-sm dark:shadow-none hover:bg-emerald-50 transition-all flex items-center gap-1.5"
          >
            <Download size={12} /> Backup Completo
          </button>
          <button
            onClick={() => restoreFileInputRef.current?.click()}
            disabled={isRestoringBackup}
            className="bg-white text-amber-700 border border-amber-200 px-3 py-2 rounded-lg font-black uppercase tracking-[0.12em] text-[9px] shadow-sm dark:shadow-none hover:bg-amber-50 transition-all flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Upload size={12} /> {isRestoringBackup ? 'Restaurando...' : 'Restaurar Backup'}
          </button>
          <button 
            onClick={() => setIsCategoryModalOpen(true)}
            className="bg-white text-indigo-600 border border-indigo-200 px-3 py-2 rounded-lg font-black uppercase tracking-[0.12em] text-[9px] shadow-sm dark:shadow-none hover:bg-indigo-50 transition-all flex items-center gap-1.5"
          >
            <Tag size={12} /> Nova Categoria
          </button>
          <button 
            onClick={() => handleOpenModal()}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-black uppercase tracking-[0.12em] text-[9px] shadow-lg shadow-indigo-100 dark:shadow-none hover:bg-indigo-700 transition-all flex items-center gap-1.5 active:scale-95"
          >
            <Plus size={13} /> Cadastrar Item Comida
          </button>
          <input
            ref={restoreFileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleRestoreBackupFile}
            className="hidden"
          />
        </div>
      </header>

      {/* Barra de Filtros Integrada */}
      <div className="bg-white p-3 rounded-[22px] border shadow-sm flex flex-col gap-2.5">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-center">
           <div className="md:col-span-5 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
              <input 
                type="text" 
                placeholder="Pesquisar por nome do item..." 
                className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border-transparent border focus:border-indigo-500 rounded-xl outline-none font-semibold text-xs transition-all shadow-inner focus:bg-white"
                value={searchTerm}
                onChange={e => {
                  const value = e.target.value;
                  setSearchTerm(value);
                  if (String(value || '').trim().length > 0 && selectedCategory !== 'TODOS') {
                    setSelectedCategory('TODOS');
                  }
                }}
              />
           </div>
           
           <div className="md:col-span-7 flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 mr-2">
                 <Filter size={14} className="text-gray-400" />
                 <span className="text-[8px] font-black text-gray-400 uppercase tracking-[0.12em]">Filtrar por:</span>
              </div>
              <button 
                onClick={() => setSelectedCategory('TODOS')}
                className={`px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-[0.12em] transition-all border ${selectedCategory === 'TODOS' ? 'bg-indigo-600 border-indigo-600 text-white shadow-md dark:shadow-none' : 'bg-white border-gray-100 text-gray-400 hover:border-indigo-200'}`}
              >
                Todos
              </button>
              {availableCategories.map(cat => (
                <button 
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-[0.12em] transition-all border ${selectedCategory === cat ? 'bg-indigo-600 border-indigo-600 text-white shadow-md dark:shadow-none' : 'bg-white border-gray-100 text-gray-400 hover:border-indigo-200'}`}
                >
                  {cat}
                </button>
              ))}
           </div>
        </div>
      </div>

      <section className="bg-white dark:bg-zinc-900 p-3 rounded-[22px] border border-gray-200 dark:border-zinc-700 shadow-sm">
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div>
            <h3 className="text-[11px] font-black uppercase tracking-[0.14em] text-gray-700 dark:text-zinc-100">
              Tabela Nutricional de Referência (100g)
            </h3>
            <p className="text-[9px] font-semibold text-gray-500 dark:text-zinc-400">
              Base usada para sugestão da IA por tipo de alimento.
            </p>
          </div>
        </div>
        <div className="space-y-3">
          {Object.keys(filteredGroupedReferenceRows).length === 0 && (
            <div className="rounded-xl border border-dashed border-gray-200 dark:border-zinc-700 p-4 text-center text-[10px] font-semibold text-gray-500 dark:text-zinc-400">
              Nenhum item da tabela corresponde ao termo pesquisado.
            </div>
          )}
          {Object.entries(filteredGroupedReferenceRows as Record<string, NutrientReferenceRow[]>).map(([group, rows]) => (
            <div key={group} className="border border-gray-100 dark:border-zinc-700 rounded-xl overflow-hidden">
              <div className="px-3 py-2 bg-indigo-50 dark:bg-indigo-950/35 border-b border-indigo-100 dark:border-indigo-800">
                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-700 dark:text-indigo-300">{highlightMatch(group)}</p>
                <p className="text-[9px] font-semibold text-indigo-500 dark:text-indigo-400">{rows[0]?.focus}</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[840px]">
                  <thead className="bg-gray-50 dark:bg-zinc-900">
                    <tr>
                      <th className="text-left px-2.5 py-2 text-[9px] font-black uppercase tracking-widest text-gray-500 dark:text-zinc-400">Alimento</th>
                      <th className="text-left px-2.5 py-2 text-[9px] font-black uppercase tracking-widest text-gray-500 dark:text-zinc-400">Kcal</th>
                      <th className="text-left px-2.5 py-2 text-[9px] font-black uppercase tracking-widest text-gray-500 dark:text-zinc-400">Prot (g)</th>
                      <th className="text-left px-2.5 py-2 text-[9px] font-black uppercase tracking-widest text-gray-500 dark:text-zinc-400">Carb (g)</th>
                      <th className="text-left px-2.5 py-2 text-[9px] font-black uppercase tracking-widest text-gray-500 dark:text-zinc-400">Gord (g)</th>
                      <th className="text-left px-2.5 py-2 text-[9px] font-black uppercase tracking-widest text-gray-500 dark:text-zinc-400">Fibra (g)</th>
                      <th className="text-left px-2.5 py-2 text-[9px] font-black uppercase tracking-widest text-gray-500 dark:text-zinc-400">Cálcio (mg)</th>
                      <th className="text-left px-2.5 py-2 text-[9px] font-black uppercase tracking-widest text-gray-500 dark:text-zinc-400">Ferro (mg)</th>
                      <th className="text-left px-2.5 py-2 text-[9px] font-black uppercase tracking-widest text-gray-500 dark:text-zinc-400">Observação</th>
                      <th className="text-right px-2.5 py-2 text-[9px] font-black uppercase tracking-widest text-gray-500 dark:text-zinc-400">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => {
                      const rowIngredient = row.ingredientId ? ingredientsById.get(row.ingredientId) : null;
                      return (
                        <tr
                          key={`${group}-${row.ingredientId || row.food}-${index}`}
                          className={`border-t border-gray-100 dark:border-zinc-700 ${index % 2 === 0 ? 'bg-white dark:bg-zinc-900' : 'bg-slate-50 dark:bg-zinc-800/80'} ${row.isActive === false ? 'opacity-70' : ''}`}
                        >
                          <td className="px-2.5 py-2 text-[10px] font-black text-gray-700 dark:text-zinc-100 uppercase">{highlightMatch(row.food)}</td>
                          <td className="px-2.5 py-2 text-[10px] font-semibold text-gray-700 dark:text-zinc-200">{row.kcal}</td>
                          <td className="px-2.5 py-2 text-[10px] font-semibold text-gray-700 dark:text-zinc-200">{row.protein}</td>
                          <td className="px-2.5 py-2 text-[10px] font-semibold text-gray-700 dark:text-zinc-200">{row.carbs}</td>
                          <td className="px-2.5 py-2 text-[10px] font-semibold text-gray-700 dark:text-zinc-200">{row.fats}</td>
                          <td className="px-2.5 py-2 text-[10px] font-semibold text-gray-700 dark:text-zinc-200">{row.fiber}</td>
                          <td className="px-2.5 py-2 text-[10px] font-semibold text-gray-700 dark:text-zinc-200">{row.calciumMg}</td>
                          <td className="px-2.5 py-2 text-[10px] font-semibold text-gray-700 dark:text-zinc-200">{row.ironMg}</td>
                          <td className="px-2.5 py-2 text-[10px] font-semibold text-gray-500 dark:text-zinc-300">{row.vitaminNote || '-'}</td>
                          <td className="px-2.5 py-2 text-right">
                            {rowIngredient ? (
                              <>
                                <div className="hidden md:inline-flex items-center gap-1.5">
                                  <button
                                    onClick={() => handleOpenModal(rowIngredient)}
                                    className="p-1.5 text-indigo-600 bg-white border rounded-lg hover:bg-indigo-50 transition-colors"
                                    title="Editar"
                                  >
                                    <Edit size={12} />
                                  </button>
                                  <button
                                    onClick={() => handleDelete(rowIngredient.id)}
                                    className="p-1.5 text-red-500 bg-white border rounded-lg hover:bg-red-50 transition-colors"
                                    title="Apagar"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                  <button
                                    onClick={() => handleToggleIngredientActive(rowIngredient)}
                                    className={`p-1.5 bg-white border rounded-lg transition-colors ${rowIngredient.isActive === false ? 'text-emerald-600 hover:bg-emerald-50' : 'text-amber-600 hover:bg-amber-50'}`}
                                    title={rowIngredient.isActive === false ? 'Ativar' : 'Desativar'}
                                  >
                                    {rowIngredient.isActive === false ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                                  </button>
                                </div>
                                <details data-actions-menu="true" className="md:hidden inline-block text-left">
                                  <summary className="list-none cursor-pointer px-2 py-1 text-[9px] font-black uppercase tracking-[0.1em] text-gray-600 dark:text-zinc-300 border border-gray-200 dark:border-zinc-700 rounded-lg select-none">
                                    Ações
                                  </summary>
                                  <div className="absolute right-2 mt-1 z-20 min-w-[120px] bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg shadow-lg p-1.5 space-y-1">
                                    <button
                                      onClick={(e) => {
                                        handleOpenModal(rowIngredient);
                                        closeMobileActionMenu(e.currentTarget);
                                      }}
                                      className="w-full text-left px-2 py-1.5 rounded-md text-[9px] font-black uppercase tracking-[0.08em] text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/30"
                                    >
                                      Editar
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        closeMobileActionMenu(e.currentTarget);
                                        handleDelete(rowIngredient.id);
                                      }}
                                      className="w-full text-left px-2 py-1.5 rounded-md text-[9px] font-black uppercase tracking-[0.08em] text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                                    >
                                      Apagar
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        handleToggleIngredientActive(rowIngredient);
                                        closeMobileActionMenu(e.currentTarget);
                                      }}
                                      className={`w-full text-left px-2 py-1.5 rounded-md text-[9px] font-black uppercase tracking-[0.08em] ${rowIngredient.isActive === false ? 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30' : 'text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30'}`}
                                    >
                                      {rowIngredient.isActive === false ? 'Ativar' : 'Desativar'}
                                    </button>
                                  </div>
                                </details>
                              </>
                            ) : (
                              <span className="text-[9px] font-semibold text-gray-400 dark:text-zinc-500">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Modal de Cadastro/Edição de Item Comida */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-2 animate-in fade-in">
          <div className="absolute inset-0 bg-indigo-950/70 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}></div>
          <form onSubmit={handleSave} className="relative w-full max-w-md bg-white rounded-[22px] shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col h-[84vh]">
            <div className="bg-indigo-900 p-3 text-white flex items-center justify-between shrink-0 shadow-lg">
              <div className="flex items-center gap-2">
                <div className="bg-white/10 p-1.5 rounded-xl backdrop-blur-md border border-white/20"><Beef size={16} /></div>
                <div>
                  <h2 className="text-sm font-black uppercase tracking-tight leading-none">{editingIngredient ? 'Editar Item Comida' : 'Novo Item Comida'}</h2>
                  <p className="text-[7px] font-bold text-indigo-300 uppercase tracking-[0.12em] mt-1">Valores para cálculo de composição nutricional</p>
                </div>
              </div>
              <button type="button" onClick={() => setIsModalOpen(false)} className="p-1.5 hover:bg-white/10 rounded-full transition-colors"><X size={18} /></button>
            </div>

            <div className="p-3 space-y-3 flex-1 overflow-y-auto scrollbar-hide">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-[8px] font-black text-gray-400 uppercase tracking-[0.12em] ml-0.5">Nome do Item / Insumo *</label>
                  <input 
                    required
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: toUpperText(e.target.value)})}
                    className="w-full px-3 py-2 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-xl outline-none font-black text-gray-800 text-sm shadow-inner transition-all uppercase"
                    placeholder="Ex: Peito de Frango Desfiado"
                  />
                  <div className="mt-1.5 space-y-1.5">
                    <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[8px] font-black uppercase tracking-[0.12em] ${
                      isAiConfigured
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                        : 'bg-amber-50 border-amber-200 text-amber-700'
                    }`}>
                      <Sparkles size={10} />
                      {isAiConfigured ? 'IA ativa para sugestão' : 'IA visível (configure token em WhatsApp > IA)'}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleConsultAi()}
                      disabled={!String(formData.name || '').trim() || isAiLoading}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-[0.12em] border transition-all ${
                        !String(formData.name || '').trim() || isAiLoading
                          ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                          : 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100'
                      }`}
                      title="Consultar IA"
                    >
                      <Sparkles size={10} className={isAiLoading ? 'animate-pulse' : ''} />
                      {isAiLoading ? 'Consultando IA...' : 'Consultar IA'}
                    </button>
                    {selectedReference && (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-2 space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-[8px] font-black uppercase tracking-[0.12em] text-emerald-700">
                              Tabela de Referência Encontrada
                            </p>
                            <p className="text-[9px] font-black text-emerald-900 uppercase">
                              {selectedReference.food}
                            </p>
                            <p className="text-[8px] font-semibold text-emerald-700">
                              {selectedReference.group} • {selectedReference.focus}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => applyReferenceValues(selectedReference)}
                            className="h-6 px-2 rounded-md bg-emerald-600 text-white text-[8px] font-black uppercase tracking-[0.12em] hover:bg-emerald-700"
                          >
                            Usar Valores
                          </button>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-1">
                          <div className="rounded-md border border-emerald-100 bg-white p-1">
                            <p className="text-[8px] font-black text-emerald-500 uppercase">Kcal</p>
                            <p className="text-[9px] font-black text-emerald-900">{selectedReference.kcal}</p>
                          </div>
                          <div className="rounded-md border border-emerald-100 bg-white p-1">
                            <p className="text-[8px] font-black text-emerald-500 uppercase">Prot</p>
                            <p className="text-[9px] font-black text-emerald-900">{selectedReference.protein}g</p>
                          </div>
                          <div className="rounded-md border border-emerald-100 bg-white p-1">
                            <p className="text-[8px] font-black text-emerald-500 uppercase">Carb</p>
                            <p className="text-[9px] font-black text-emerald-900">{selectedReference.carbs}g</p>
                          </div>
                          <div className="rounded-md border border-emerald-100 bg-white p-1">
                            <p className="text-[8px] font-black text-emerald-500 uppercase">Gord</p>
                            <p className="text-[9px] font-black text-emerald-900">{selectedReference.fats}g</p>
                          </div>
                          <div className="rounded-md border border-emerald-100 bg-white p-1">
                            <p className="text-[8px] font-black text-emerald-500 uppercase">Fibra</p>
                            <p className="text-[9px] font-black text-emerald-900">{selectedReference.fiber}g</p>
                          </div>
                          <div className="rounded-md border border-emerald-100 bg-white p-1">
                            <p className="text-[8px] font-black text-emerald-500 uppercase">Cálcio</p>
                            <p className="text-[9px] font-black text-emerald-900">{selectedReference.calciumMg}mg</p>
                          </div>
                          <div className="rounded-md border border-emerald-100 bg-white p-1">
                            <p className="text-[8px] font-black text-emerald-500 uppercase">Ferro</p>
                            <p className="text-[9px] font-black text-emerald-900">{selectedReference.ironMg}mg</p>
                          </div>
                        </div>
                      </div>
                    )}
                    {(aiConversation.length > 0 || aiPendingQuestion) && (
                      <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-2 space-y-1.5">
                        <p className="text-[8px] font-black uppercase tracking-[0.12em] text-indigo-700">
                          Conversa com Assistente
                        </p>
                        <div className="max-h-24 overflow-y-auto space-y-1.5 pr-1">
                          {aiConversation.map((msg, idx) => (
                            <div
                              key={`${msg.role}-${idx}`}
                              className={`px-2 py-1.5 rounded-lg text-[9px] font-semibold leading-relaxed ${
                                msg.role === 'assistant'
                                  ? 'bg-white border border-indigo-100 text-gray-700'
                                  : 'bg-indigo-600 text-white ml-8'
                              }`}
                            >
                              {msg.text}
                            </div>
                          ))}
                        </div>
                        {aiPendingQuestion && (
                          <div className="flex items-center gap-2">
                            <input
                              value={aiReplyInput}
                              onChange={(event) => setAiReplyInput(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault();
                                  handleAiReplySubmit();
                                }
                              }}
                              placeholder="Responder ao assistente..."
                              className="flex-1 px-2 py-1.5 rounded-lg border border-indigo-200 bg-white text-[9px] font-semibold outline-none focus:border-indigo-400"
                            />
                            <button
                              type="button"
                              onClick={() => handleAiReplySubmit()}
                              disabled={!String(aiReplyInput || '').trim() || isAiLoading}
                              className={`h-7 px-2 rounded-lg text-[8px] font-black uppercase tracking-[0.12em] ${
                                !String(aiReplyInput || '').trim() || isAiLoading
                                  ? 'bg-gray-200 text-gray-400'
                                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
                              }`}
                            >
                              Enviar
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

              </div>

              <div className="bg-indigo-50/50 p-3 rounded-[16px] border border-indigo-100 space-y-2 shadow-sm">
                <div className="flex items-center justify-between border-b border-indigo-100 pb-1.5 mb-1">
                  <h4 className="text-[8px] font-black text-indigo-900 uppercase tracking-[0.12em] flex items-center gap-1.5">
                    <Info size={12} className="text-indigo-600" /> Valores por {getUnitLabel(formData.unit)}
                  </h4>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <NutrientInput icon={<Flame size={12}/>} label="Calorias" value={formData.calories} unit="kcal" color="amber" onChange={v => { setAiSuggestedValues(false); setFormData({...formData, calories: v}); }} />
                  <NutrientInput icon={<Zap size={12}/>} label="Proteínas" value={formData.proteins} unit="g" color="blue" onChange={v => { setAiSuggestedValues(false); setFormData({...formData, proteins: v}); }} />
                  <NutrientInput icon={<Droplets size={12}/>} label="Carboidratos" value={formData.carbs} unit="g" color="indigo" onChange={v => { setAiSuggestedValues(false); setFormData({...formData, carbs: v}); }} />
                  <NutrientInput icon={<Apple size={12}/>} label="Gorduras" value={formData.fats} unit="g" color="rose" onChange={v => { setAiSuggestedValues(false); setFormData({...formData, fats: v}); }} />
                  <NutrientInput icon={<Scale size={12}/>} label="Fibras" value={formData.fiber} unit="g" color="emerald" onChange={v => { setAiSuggestedValues(false); setFormData({...formData, fiber: v}); }} />
                  <NutrientInput icon={<PlusCircle size={12}/>} label="Cálcio" value={formData.calciumMg} unit="mg" color="violet" onChange={v => { setAiSuggestedValues(false); setFormData({...formData, calciumMg: v}); }} />
                  <NutrientInput icon={<ArrowUpRight size={12}/>} label="Ferro" value={formData.ironMg} unit="mg" color="slate" onChange={v => { setAiSuggestedValues(false); setFormData({...formData, ironMg: v}); }} />
                </div>
                {aiSuggestedValues && (
                  <div className="mt-2 px-2.5 py-1 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-[8px] font-black uppercase tracking-[0.12em] inline-flex items-center gap-1">
                    <AlertCircle size={10} />
                    Valores sugeridos por IA - Revise antes de salvar
                  </div>
                )}
              </div>

              <div className="bg-amber-50 p-2.5 rounded-[14px] border border-amber-100 flex gap-2">
                <div className="p-1.5 bg-amber-100 rounded-lg text-amber-600 h-fit"><AlertCircle size={14} /></div>
                <p className="text-[8px] font-bold text-amber-800 uppercase leading-relaxed">
                  Os valores inseridos são a referência nutricional para <span className="underline font-black">{getUnitLabel(formData.unit)}</span> deste insumo. O sistema calculará o total do prato automaticamente.
                </p>
              </div>
              <p className="text-[8px] font-semibold text-gray-500 leading-relaxed">
                Os dados preenchidos por IA são estimativas para 100g e devem ser conferidos pelo responsável.
              </p>
            </div>

            <div className="p-3 bg-gray-50 border-t flex gap-2 shrink-0 shadow-[0_-8px_20px_rgba(0,0,0,0.05)]">
              <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-2 text-[9px] font-black text-gray-400 uppercase tracking-[0.12em] hover:text-gray-600 transition-colors">Cancelar</button>
              <button type="submit" className="flex-[2] py-2 bg-indigo-600 text-white rounded-[12px] font-black uppercase tracking-[0.12em] text-[9px] shadow-lg shadow-indigo-100 dark:shadow-none hover:bg-indigo-700 transition-all flex items-center justify-center gap-1.5 active:scale-95">
                <Save size={12} /> {editingIngredient ? 'Salvar Alterações' : 'Concluir Cadastro'}
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
                  className="w-full py-5 bg-indigo-600 text-white rounded-[24px] font-black uppercase tracking-widest text-xs shadow-xl shadow-indigo-100 dark:shadow-none hover:bg-indigo-700 transition-all"
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

const NutrientInput = ({ icon, label, value, unit, color, onChange }: any) => {
  const colors: any = {
    amber: 'focus-within:border-amber-500 text-amber-600',
    blue: 'focus-within:border-blue-500 text-blue-600',
    indigo: 'focus-within:border-indigo-500 text-indigo-600',
    rose: 'focus-within:border-rose-500 text-rose-600',
    emerald: 'focus-within:border-emerald-500 text-emerald-600',
    violet: 'focus-within:border-violet-500 text-violet-600',
    slate: 'focus-within:border-slate-500 text-slate-600',
  };
  return (
    <div className={`bg-white border border-gray-100 rounded-xl p-2 transition-all shadow-sm ${colors[color]}`}>
      <div className="flex items-center gap-1.5 mb-1 opacity-60">
        {icon} <span className="text-[8px] font-black uppercase tracking-[0.12em]">{label}</span>
      </div>
      <div className="flex items-center gap-1">
        <input 
          type="number" 
          step="0.1"
          value={value || ''}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          className="bg-transparent w-full font-black text-base outline-none"
          placeholder="0.0"
        />
        <span className="text-[8px] font-black uppercase opacity-40">{unit}</span>
      </div>
    </div>
  );
};

export default NutritionalInfoPage;
