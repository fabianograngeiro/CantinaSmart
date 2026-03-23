
import React, { useState, useMemo, useEffect } from 'react';
import { 
  Beef, Search, Plus, Trash2, Edit, Save, X, 
  Flame, Zap, Droplets, Apple, Info, ChevronRight,
  Filter, Scale, ArrowUpRight, CheckCircle2,
  AlertCircle, Tag, LayoutGrid, PlusCircle, Sparkles
} from 'lucide-react';
import { ApiService } from '../services/api';
import notificationService from '../services/notificationService';
import { Ingredient, IngredientUnit } from '../types';

type NutrientReferenceRow = {
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

const FOOD_NUTRIENT_REFERENCE: NutrientReferenceRow[] = [
  { group: 'Proteínas', focus: 'Crescimento muscular e renovação das células', food: 'Ovo', kcal: 143, protein: 12.6, carbs: 1.1, fats: 9.5, fiber: 0, calciumMg: 50, ironMg: 1.8, vitaminNote: 'Vit. B12, colina' },
  { group: 'Proteínas', focus: 'Crescimento muscular e renovação das células', food: 'Peito de Frango', kcal: 165, protein: 31, carbs: 0, fats: 3.6, fiber: 0, calciumMg: 15, ironMg: 0.9, vitaminNote: 'Niacina, B6' },
  { group: 'Proteínas', focus: 'Crescimento muscular e renovação das células', food: 'Tilápia', kcal: 128, protein: 26, carbs: 0, fats: 2.7, fiber: 0, calciumMg: 10, ironMg: 0.6, vitaminNote: 'B12, selênio' },
  { group: 'Proteínas', focus: 'Crescimento muscular e renovação das células', food: 'Sardinha', kcal: 208, protein: 24.6, carbs: 0, fats: 11.5, fiber: 0, calciumMg: 382, ironMg: 2.9, vitaminNote: 'Vit. D, ômega-3' },
  { group: 'Proteínas', focus: 'Crescimento muscular e renovação das células', food: 'Carne Bovina Magra', kcal: 170, protein: 26, carbs: 0, fats: 7, fiber: 0, calciumMg: 12, ironMg: 2.6, vitaminNote: 'B12, zinco' },
  { group: 'Proteínas', focus: 'Crescimento muscular e renovação das células', food: 'Iogurte Natural', kcal: 61, protein: 3.5, carbs: 4.7, fats: 3.3, fiber: 0, calciumMg: 121, ironMg: 0.1, vitaminNote: 'Cálcio, B2' },
  { group: 'Proteínas', focus: 'Crescimento muscular e renovação das células', food: 'Lentilha', kcal: 116, protein: 9, carbs: 20.1, fats: 0.4, fiber: 7.9, calciumMg: 19, ironMg: 3.3, vitaminNote: 'Folato' },
  { group: 'Carboidratos', focus: 'Energia para estudar e brincar', food: 'Arroz Integral', kcal: 123, protein: 2.7, carbs: 25.6, fats: 1, fiber: 1.6, calciumMg: 10, ironMg: 0.4 },
  { group: 'Carboidratos', focus: 'Energia para estudar e brincar', food: 'Batata-Doce', kcal: 86, protein: 1.6, carbs: 20.1, fats: 0.1, fiber: 3, calciumMg: 30, ironMg: 0.6, vitaminNote: 'Betacaroteno' },
  { group: 'Carboidratos', focus: 'Energia para estudar e brincar', food: 'Aveia em Flocos', kcal: 389, protein: 16.9, carbs: 66.3, fats: 6.9, fiber: 10.6, calciumMg: 54, ironMg: 4.7 },
  { group: 'Carboidratos', focus: 'Energia para estudar e brincar', food: 'Milho', kcal: 96, protein: 3.4, carbs: 21, fats: 1.5, fiber: 2.4, calciumMg: 2, ironMg: 0.5, vitaminNote: 'Luteína' },
  { group: 'Carboidratos', focus: 'Energia para estudar e brincar', food: 'Banana', kcal: 89, protein: 1.1, carbs: 22.8, fats: 0.3, fiber: 2.6, calciumMg: 5, ironMg: 0.3, vitaminNote: 'Potássio, B6' },
  { group: 'Carboidratos', focus: 'Energia para estudar e brincar', food: 'Mandioca', kcal: 125, protein: 0.6, carbs: 30.1, fats: 0.3, fiber: 1.8, calciumMg: 17, ironMg: 0.3 },
  { group: 'Fibras', focus: 'Digestão e saúde do intestino', food: 'Couve-Flor', kcal: 25, protein: 1.9, carbs: 5, fats: 0.3, fiber: 2, calciumMg: 22, ironMg: 0.4, vitaminNote: 'Vit. C, K' },
  { group: 'Fibras', focus: 'Digestão e saúde do intestino', food: 'Brócolis', kcal: 34, protein: 2.8, carbs: 6.6, fats: 0.4, fiber: 2.6, calciumMg: 47, ironMg: 0.7, vitaminNote: 'Vit. C, K' },
  { group: 'Fibras', focus: 'Digestão e saúde do intestino', food: 'Feijão Preto', kcal: 132, protein: 8.9, carbs: 23.7, fats: 0.5, fiber: 8.7, calciumMg: 27, ironMg: 2.1 },
  { group: 'Fibras', focus: 'Digestão e saúde do intestino', food: 'Maçã com Casca', kcal: 52, protein: 0.3, carbs: 13.8, fats: 0.2, fiber: 2.4, calciumMg: 6, ironMg: 0.1, vitaminNote: 'Vit. C' },
  { group: 'Fibras', focus: 'Digestão e saúde do intestino', food: 'Chia', kcal: 486, protein: 16.5, carbs: 42.1, fats: 30.7, fiber: 34.4, calciumMg: 631, ironMg: 7.7, vitaminNote: 'Ômega-3' },
  { group: 'Fibras', focus: 'Digestão e saúde do intestino', food: 'Linhaça', kcal: 534, protein: 18.3, carbs: 28.9, fats: 42.2, fiber: 27.3, calciumMg: 255, ironMg: 5.7, vitaminNote: 'Ômega-3' },
  { group: 'Fibras', focus: 'Digestão e saúde do intestino', food: 'Farelo de Trigo', kcal: 216, protein: 15.6, carbs: 64.5, fats: 4.3, fiber: 42.8, calciumMg: 73, ironMg: 10.6 },
  { group: 'Cálcio', focus: 'Ossos e dentes fortes', food: 'Leite de Vaca', kcal: 61, protein: 3.2, carbs: 4.8, fats: 3.3, fiber: 0, calciumMg: 113, ironMg: 0, vitaminNote: 'B12' },
  { group: 'Cálcio', focus: 'Ossos e dentes fortes', food: 'Queijo Branco (Minas)', kcal: 264, protein: 17.4, carbs: 3.2, fats: 20.2, fiber: 0, calciumMg: 579, ironMg: 0.2 },
  { group: 'Cálcio', focus: 'Ossos e dentes fortes', food: 'Gergelim', kcal: 573, protein: 17.7, carbs: 23.5, fats: 49.7, fiber: 11.8, calciumMg: 975, ironMg: 14.6 },
  { group: 'Cálcio', focus: 'Ossos e dentes fortes', food: 'Espinafre', kcal: 23, protein: 2.9, carbs: 3.6, fats: 0.4, fiber: 2.2, calciumMg: 99, ironMg: 2.7, vitaminNote: 'Folato, K' },
  { group: 'Cálcio', focus: 'Ossos e dentes fortes', food: 'Tofu', kcal: 76, protein: 8, carbs: 1.9, fats: 4.8, fiber: 0.3, calciumMg: 350, ironMg: 5.4 },
  { group: 'Cálcio', focus: 'Ossos e dentes fortes', food: 'Sardinha Cozida', kcal: 208, protein: 24.6, carbs: 0, fats: 11.5, fiber: 0, calciumMg: 382, ironMg: 2.9, vitaminNote: 'Vit. D' },
  { group: 'Ferro', focus: 'Prevenção da anemia e foco mental', food: 'Fígado de Boi', kcal: 135, protein: 20.4, carbs: 3.9, fats: 3.6, fiber: 0, calciumMg: 5, ironMg: 6.5, vitaminNote: 'Vit. A, B12' },
  { group: 'Ferro', focus: 'Prevenção da anemia e foco mental', food: 'Feijão Carioca', kcal: 127, protein: 8.7, carbs: 22.8, fats: 0.5, fiber: 8.5, calciumMg: 28, ironMg: 1.9 },
  { group: 'Ferro', focus: 'Prevenção da anemia e foco mental', food: 'Gema de Ovo', kcal: 322, protein: 15.9, carbs: 3.6, fats: 26.5, fiber: 0, calciumMg: 129, ironMg: 2.7, vitaminNote: 'Colina' },
  { group: 'Ferro', focus: 'Prevenção da anemia e foco mental', food: 'Beterraba', kcal: 43, protein: 1.6, carbs: 9.6, fats: 0.2, fiber: 2.8, calciumMg: 16, ironMg: 0.8, vitaminNote: 'Folato' },
  { group: 'Ferro', focus: 'Prevenção da anemia e foco mental', food: 'Couve-Manteiga', kcal: 32, protein: 2.9, carbs: 5.4, fats: 0.6, fiber: 4.1, calciumMg: 177, ironMg: 0.5, vitaminNote: 'A, C, K' },
  { group: 'Ferro', focus: 'Prevenção da anemia e foco mental', food: 'Grão-de-Bico', kcal: 164, protein: 8.9, carbs: 27.4, fats: 2.6, fiber: 7.6, calciumMg: 49, ironMg: 2.9 },
  { group: 'Vitaminas', focus: 'Imunidade e saúde da visão/pele', food: 'Laranja', kcal: 47, protein: 0.9, carbs: 11.8, fats: 0.1, fiber: 2.4, calciumMg: 40, ironMg: 0.1, vitaminNote: 'Vit. C' },
  { group: 'Vitaminas', focus: 'Imunidade e saúde da visão/pele', food: 'Cenoura', kcal: 41, protein: 0.9, carbs: 9.6, fats: 0.2, fiber: 2.8, calciumMg: 33, ironMg: 0.3, vitaminNote: 'Vit. A' },
  { group: 'Vitaminas', focus: 'Imunidade e saúde da visão/pele', food: 'Acerola', kcal: 32, protein: 0.4, carbs: 7.7, fats: 0.3, fiber: 1.1, calciumMg: 12, ironMg: 0.2, vitaminNote: 'Vit. C elevada' },
  { group: 'Vitaminas', focus: 'Imunidade e saúde da visão/pele', food: 'Abóbora', kcal: 26, protein: 1, carbs: 6.5, fats: 0.1, fiber: 0.5, calciumMg: 21, ironMg: 0.8, vitaminNote: 'Betacaroteno' },
  { group: 'Vitaminas', focus: 'Imunidade e saúde da visão/pele', food: 'Mamão', kcal: 43, protein: 0.5, carbs: 10.8, fats: 0.3, fiber: 1.7, calciumMg: 20, ironMg: 0.3, vitaminNote: 'Vit. A e C' },
  { group: 'Vitaminas', focus: 'Imunidade e saúde da visão/pele', food: 'Pimentão Amarelo', kcal: 27, protein: 1, carbs: 6.3, fats: 0.2, fiber: 0.9, calciumMg: 11, ironMg: 0.5, vitaminNote: 'Vit. C elevada' },
];

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

const NutritionalInfoPage: React.FC = () => {
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
    category: 'Proteínas',
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
      group: normalizeCategoryLabel(ing.category) || 'Outros',
      focus: 'Cadastro local da unidade',
      food: String(ing.name || '').trim(),
      kcal: Number(ing.calories || 0),
      protein: Number(ing.proteins || 0),
      carbs: Number(ing.carbs || 0),
      fats: Number(ing.fats || 0),
      fiber: Number(ing.fiber || 0),
      calciumMg: Number(ing.calciumMg || 0),
      ironMg: Number(ing.ironMg || 0),
      vitaminNote: 'Item cadastrado localmente',
    })).filter((row) => row.food);

    const map = new Map<string, NutrientReferenceRow>();
    FOOD_NUTRIENT_REFERENCE.forEach((row) => {
      map.set(normalizeFoodKey(row.food), row);
    });
    // Cadastro local sobrescreve referência base com mesmo nome
    dynamicRows.forEach((row) => {
      map.set(normalizeFoodKey(row.food), row);
    });
    return Array.from(map.values());
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

  const groupedReferenceRows = useMemo(() => {
    return mergedReferenceRows.reduce<Record<string, NutrientReferenceRow[]>>((acc, row) => {
      if (!acc[row.group]) acc[row.group] = [];
      acc[row.group].push(row);
      return acc;
    }, {});
  }, [mergedReferenceRows]);

  const filteredGroupedReferenceRows = useMemo<Record<string, NutrientReferenceRow[]>>(() => {
    const search = String(searchTerm || '').trim().toLowerCase();
    const rows = mergedReferenceRows.filter((row) => {
      const matchesSearch =
        !search
        || String(row.food || '').toLowerCase().includes(search)
        || String(row.group || '').toLowerCase().includes(search);
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

  const filteredIngredients = useMemo(() => {
    const search = String(searchTerm || '').trim().toLowerCase();
    return ingredients.filter(i => {
      const normalizedIngredientCategory = normalizeCategoryLabel(i.category);
      const categoryLabel = String(normalizedIngredientCategory || '').toLowerCase();
      const itemName = String(i.name || '').toLowerCase();
      const matchesSearch =
        !search
        || itemName.includes(search)
        || categoryLabel.includes(search);
      const matchesCategory = selectedCategory === 'TODOS' || normalizedIngredientCategory === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [ingredients, searchTerm, selectedCategory]);

  const handleOpenModal = (ing: Ingredient | null = null) => {
    if (ing) {
      setEditingIngredient(ing);
      setAiSuggestedValues(false);
      setAiConversation([]);
      setAiReplyInput('');
      setAiPendingQuestion(false);
      setFormData({
        name: ing.name,
        category: normalizeCategoryLabel(ing.category) || ing.category,
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
        category: availableCategories[0] || 'Proteínas',
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
      name: formData.name,
      category: normalizeCategoryLabel(formData.category) || formData.category,
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
          category: availableCategories[0] || 'Proteínas',
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
        category: aiCategory || prev.category,
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
      category: normalizeCategoryLabel(row.group) || prev.category,
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
            onClick={() => setIsCategoryModalOpen(true)}
            className="bg-white text-indigo-600 border border-indigo-200 px-3 py-2 rounded-lg font-black uppercase tracking-[0.12em] text-[9px] shadow-sm hover:bg-indigo-50 transition-all flex items-center gap-1.5"
          >
            <Tag size={12} /> Nova Categoria
          </button>
          <button 
            onClick={() => handleOpenModal()}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-black uppercase tracking-[0.12em] text-[9px] shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center gap-1.5 active:scale-95"
          >
            <Plus size={13} /> Cadastrar Item Comida
          </button>
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
                className={`px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-[0.12em] transition-all border ${selectedCategory === 'TODOS' ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'bg-white border-gray-100 text-gray-400 hover:border-indigo-200'}`}
              >
                Todos
              </button>
              {availableCategories.map(cat => (
                <button 
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-[0.12em] transition-all border ${selectedCategory === cat ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'bg-white border-gray-100 text-gray-400 hover:border-indigo-200'}`}
                >
                  {cat}
                </button>
              ))}
           </div>
        </div>
      </div>

      <section className="bg-white p-3 rounded-[22px] border shadow-sm">
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div>
            <h3 className="text-[11px] font-black uppercase tracking-[0.14em] text-gray-700">
              Tabela Nutricional de Referência (100g)
            </h3>
            <p className="text-[9px] font-semibold text-gray-500">
              Base usada para sugestão da IA por tipo de alimento.
            </p>
          </div>
        </div>
        <div className="space-y-3">
          {Object.keys(filteredGroupedReferenceRows).length === 0 && (
            <div className="rounded-xl border border-dashed border-gray-200 p-4 text-center text-[10px] font-semibold text-gray-500">
              Nenhum item da tabela corresponde ao termo pesquisado.
            </div>
          )}
          {Object.entries(filteredGroupedReferenceRows as Record<string, NutrientReferenceRow[]>).map(([group, rows]) => (
            <div key={group} className="border border-gray-100 rounded-xl overflow-hidden">
              <div className="px-3 py-2 bg-indigo-50 border-b border-indigo-100">
                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-700">{highlightMatch(group)}</p>
                <p className="text-[9px] font-semibold text-indigo-500">{rows[0]?.focus}</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[840px]">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-2.5 py-2 text-[9px] font-black uppercase tracking-widest text-gray-500">Alimento</th>
                      <th className="text-left px-2.5 py-2 text-[9px] font-black uppercase tracking-widest text-gray-500">Kcal</th>
                      <th className="text-left px-2.5 py-2 text-[9px] font-black uppercase tracking-widest text-gray-500">Prot (g)</th>
                      <th className="text-left px-2.5 py-2 text-[9px] font-black uppercase tracking-widest text-gray-500">Carb (g)</th>
                      <th className="text-left px-2.5 py-2 text-[9px] font-black uppercase tracking-widest text-gray-500">Gord (g)</th>
                      <th className="text-left px-2.5 py-2 text-[9px] font-black uppercase tracking-widest text-gray-500">Fibra (g)</th>
                      <th className="text-left px-2.5 py-2 text-[9px] font-black uppercase tracking-widest text-gray-500">Cálcio (mg)</th>
                      <th className="text-left px-2.5 py-2 text-[9px] font-black uppercase tracking-widest text-gray-500">Ferro (mg)</th>
                      <th className="text-left px-2.5 py-2 text-[9px] font-black uppercase tracking-widest text-gray-500">Observação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => (
                      <tr
                        key={`${group}-${row.food}`}
                        className={`border-t border-gray-100 ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}
                      >
                        <td className="px-2.5 py-2 text-[10px] font-black text-gray-700 uppercase">{highlightMatch(row.food)}</td>
                        <td className="px-2.5 py-2 text-[10px] font-semibold text-gray-700">{row.kcal}</td>
                        <td className="px-2.5 py-2 text-[10px] font-semibold text-gray-700">{row.protein}</td>
                        <td className="px-2.5 py-2 text-[10px] font-semibold text-gray-700">{row.carbs}</td>
                        <td className="px-2.5 py-2 text-[10px] font-semibold text-gray-700">{row.fats}</td>
                        <td className="px-2.5 py-2 text-[10px] font-semibold text-gray-700">{row.fiber}</td>
                        <td className="px-2.5 py-2 text-[10px] font-semibold text-gray-700">{row.calciumMg}</td>
                        <td className="px-2.5 py-2 text-[10px] font-semibold text-gray-700">{row.ironMg}</td>
                        <td className="px-2.5 py-2 text-[10px] font-semibold text-gray-500">{row.vitaminNote || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Grid de Itens Comida */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 animate-in fade-in duration-500">
        {filteredIngredients.length === 0 ? (
          <div className="col-span-full py-32 text-center space-y-4 opacity-30">
            <Search size={64} className="mx-auto text-gray-400" />
            <p className="text-xl font-black uppercase tracking-[4px]">Nenhum item encontrado</p>
          </div>
        ) : (
          filteredIngredients.map(ing => (
            <div key={ing.id} className="bg-white rounded-[20px] border border-gray-100 shadow-sm hover:shadow-xl transition-all group overflow-hidden flex flex-col">
              <div className="p-3 flex-1 space-y-3">
                <div className="flex justify-between items-start">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all shadow-inner ${
                    ing.unit === 'ml' ? 'bg-blue-50 text-blue-600' : 
                    ing.unit === 'un' ? 'bg-amber-50 text-amber-600' : 
                    'bg-indigo-50 text-indigo-600'
                  } group-hover:rotate-6`}>
                    <Beef size={16} />
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                    <button onClick={() => handleOpenModal(ing)} className="p-1.5 text-indigo-600 bg-white border rounded-lg shadow-sm hover:bg-indigo-50 transition-colors" title="Editar"><Edit size={12}/></button>
                    <button onClick={() => handleDelete(ing.id)} className="p-1.5 text-red-500 bg-white border rounded-lg shadow-sm hover:bg-red-50 transition-colors" title="Apagar"><Trash2 size={12}/></button>
                  </div>
                </div>
                
                <div>
                  <span className="text-[8px] font-black text-indigo-400 uppercase tracking-[0.12em] bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-100 mb-1 inline-block">{normalizeCategoryLabel(ing.category)}</span>
                  <h3 className="font-black text-gray-800 text-sm leading-tight uppercase tracking-tight">{ing.name}</h3>
                  <div className="flex items-center gap-1.5 mt-1">
                     <p className="text-[9px] font-black text-gray-400 uppercase tracking-[1px]">Base: {getShortUnitLabel(ing.unit)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-gray-50 mt-2">
                  <NutrientBadge icon={<Flame size={10}/>} label="KCAL" value={ing.calories} color="amber" />
                  <NutrientBadge icon={<Zap size={10}/>} label="PROT" value={ing.proteins} color="blue" />
                  <NutrientBadge icon={<Droplets size={10}/>} label="CARB" value={ing.carbs} color="indigo" />
                  <NutrientBadge icon={<Apple size={10}/>} label="GORD" value={ing.fats} color="rose" />
                </div>
              </div>
              <div className="px-3 py-2 bg-gray-50/50 border-t border-gray-100 flex items-center justify-between">
                <span className="text-[8px] font-black text-gray-400 uppercase tracking-[0.12em]">ID: #{ing.id.toUpperCase().substring(0,6)}</span>
                <div className="flex items-center gap-1 text-[8px] font-black text-emerald-600 uppercase">
                  <CheckCircle2 size={12} /> Validado
                </div>
              </div>
            </div>
          ))
        )}
      </div>

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
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    className="w-full px-3 py-2 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-xl outline-none font-black text-gray-800 text-sm shadow-inner transition-all"
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
              <button type="submit" className="flex-[2] py-2 bg-indigo-600 text-white rounded-[12px] font-black uppercase tracking-[0.12em] text-[9px] shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center justify-center gap-1.5 active:scale-95">
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
