export type NutritionalSeedIngredient = {
  id: string;
  name: string;
  category: string;
  unit: 'g' | 'ml' | 'un';
  calories: number;
  proteins: number;
  carbs: number;
  fats: number;
  fiber: number;
  calciumMg: number;
  ironMg: number;
  isActive: boolean;
  source: 'NATIVE';
};

export const NUTRITIONAL_BASE_SEED: NutritionalSeedIngredient[] = [
  { id: 'seed_ovo', name: 'Ovo', category: 'Proteínas', unit: 'g', calories: 143, proteins: 12.6, carbs: 1.1, fats: 9.5, fiber: 0, calciumMg: 50, ironMg: 1.8, isActive: true, source: 'NATIVE' },
  { id: 'seed_peito_frango', name: 'Peito de Frango', category: 'Proteínas', unit: 'g', calories: 165, proteins: 31, carbs: 0, fats: 3.6, fiber: 0, calciumMg: 15, ironMg: 0.9, isActive: true, source: 'NATIVE' },
  { id: 'seed_tilapia', name: 'Tilápia', category: 'Proteínas', unit: 'g', calories: 128, proteins: 26, carbs: 0, fats: 2.7, fiber: 0, calciumMg: 10, ironMg: 0.6, isActive: true, source: 'NATIVE' },
  { id: 'seed_sardinha', name: 'Sardinha', category: 'Proteínas', unit: 'g', calories: 208, proteins: 24.6, carbs: 0, fats: 11.5, fiber: 0, calciumMg: 382, ironMg: 2.9, isActive: true, source: 'NATIVE' },
  { id: 'seed_carne_bovina_magra', name: 'Carne Bovina Magra', category: 'Proteínas', unit: 'g', calories: 170, proteins: 26, carbs: 0, fats: 7, fiber: 0, calciumMg: 12, ironMg: 2.6, isActive: true, source: 'NATIVE' },
  { id: 'seed_iogurte_natural', name: 'Iogurte Natural', category: 'Proteínas', unit: 'g', calories: 61, proteins: 3.5, carbs: 4.7, fats: 3.3, fiber: 0, calciumMg: 121, ironMg: 0.1, isActive: true, source: 'NATIVE' },
  { id: 'seed_lentilha', name: 'Lentilha', category: 'Proteínas', unit: 'g', calories: 116, proteins: 9, carbs: 20.1, fats: 0.4, fiber: 7.9, calciumMg: 19, ironMg: 3.3, isActive: true, source: 'NATIVE' },
  { id: 'seed_arroz_integral', name: 'Arroz Integral', category: 'Carboidratos', unit: 'g', calories: 123, proteins: 2.7, carbs: 25.6, fats: 1, fiber: 1.6, calciumMg: 10, ironMg: 0.4, isActive: true, source: 'NATIVE' },
  { id: 'seed_batata_doce', name: 'Batata-Doce', category: 'Carboidratos', unit: 'g', calories: 86, proteins: 1.6, carbs: 20.1, fats: 0.1, fiber: 3, calciumMg: 30, ironMg: 0.6, isActive: true, source: 'NATIVE' },
  { id: 'seed_aveia_flocos', name: 'Aveia em Flocos', category: 'Carboidratos', unit: 'g', calories: 389, proteins: 16.9, carbs: 66.3, fats: 6.9, fiber: 10.6, calciumMg: 54, ironMg: 4.7, isActive: true, source: 'NATIVE' },
  { id: 'seed_milho', name: 'Milho', category: 'Carboidratos', unit: 'g', calories: 96, proteins: 3.4, carbs: 21, fats: 1.5, fiber: 2.4, calciumMg: 2, ironMg: 0.5, isActive: true, source: 'NATIVE' },
  { id: 'seed_banana', name: 'Banana', category: 'Carboidratos', unit: 'g', calories: 89, proteins: 1.1, carbs: 22.8, fats: 0.3, fiber: 2.6, calciumMg: 5, ironMg: 0.3, isActive: true, source: 'NATIVE' },
  { id: 'seed_mandioca', name: 'Mandioca', category: 'Carboidratos', unit: 'g', calories: 125, proteins: 0.6, carbs: 30.1, fats: 0.3, fiber: 1.8, calciumMg: 17, ironMg: 0.3, isActive: true, source: 'NATIVE' },
  { id: 'seed_couve_flor', name: 'Couve-Flor', category: 'Fibras', unit: 'g', calories: 25, proteins: 1.9, carbs: 5, fats: 0.3, fiber: 2, calciumMg: 22, ironMg: 0.4, isActive: true, source: 'NATIVE' },
  { id: 'seed_brocolis', name: 'Brócolis', category: 'Fibras', unit: 'g', calories: 34, proteins: 2.8, carbs: 6.6, fats: 0.4, fiber: 2.6, calciumMg: 47, ironMg: 0.7, isActive: true, source: 'NATIVE' },
  { id: 'seed_feijao_preto', name: 'Feijão Preto', category: 'Fibras', unit: 'g', calories: 132, proteins: 8.9, carbs: 23.7, fats: 0.5, fiber: 8.7, calciumMg: 27, ironMg: 2.1, isActive: true, source: 'NATIVE' },
  { id: 'seed_maca_casca', name: 'Maçã com Casca', category: 'Fibras', unit: 'g', calories: 52, proteins: 0.3, carbs: 13.8, fats: 0.2, fiber: 2.4, calciumMg: 6, ironMg: 0.1, isActive: true, source: 'NATIVE' },
  { id: 'seed_chia', name: 'Chia', category: 'Fibras', unit: 'g', calories: 486, proteins: 16.5, carbs: 42.1, fats: 30.7, fiber: 34.4, calciumMg: 631, ironMg: 7.7, isActive: true, source: 'NATIVE' },
  { id: 'seed_linhaca', name: 'Linhaça', category: 'Fibras', unit: 'g', calories: 534, proteins: 18.3, carbs: 28.9, fats: 42.2, fiber: 27.3, calciumMg: 255, ironMg: 5.7, isActive: true, source: 'NATIVE' },
  { id: 'seed_farelo_trigo', name: 'Farelo de Trigo', category: 'Fibras', unit: 'g', calories: 216, proteins: 15.6, carbs: 64.5, fats: 4.3, fiber: 42.8, calciumMg: 73, ironMg: 10.6, isActive: true, source: 'NATIVE' },
  { id: 'seed_leite_vaca', name: 'Leite de Vaca', category: 'Cálcio', unit: 'g', calories: 61, proteins: 3.2, carbs: 4.8, fats: 3.3, fiber: 0, calciumMg: 113, ironMg: 0, isActive: true, source: 'NATIVE' },
  { id: 'seed_queijo_minas', name: 'Queijo Branco (Minas)', category: 'Cálcio', unit: 'g', calories: 264, proteins: 17.4, carbs: 3.2, fats: 20.2, fiber: 0, calciumMg: 579, ironMg: 0.2, isActive: true, source: 'NATIVE' },
  { id: 'seed_gergelim', name: 'Gergelim', category: 'Cálcio', unit: 'g', calories: 573, proteins: 17.7, carbs: 23.5, fats: 49.7, fiber: 11.8, calciumMg: 975, ironMg: 14.6, isActive: true, source: 'NATIVE' },
  { id: 'seed_espinafre', name: 'Espinafre', category: 'Cálcio', unit: 'g', calories: 23, proteins: 2.9, carbs: 3.6, fats: 0.4, fiber: 2.2, calciumMg: 99, ironMg: 2.7, isActive: true, source: 'NATIVE' },
  { id: 'seed_tofu', name: 'Tofu', category: 'Cálcio', unit: 'g', calories: 76, proteins: 8, carbs: 1.9, fats: 4.8, fiber: 0.3, calciumMg: 350, ironMg: 5.4, isActive: true, source: 'NATIVE' },
  { id: 'seed_sardinha_cozida', name: 'Sardinha Cozida', category: 'Cálcio', unit: 'g', calories: 208, proteins: 24.6, carbs: 0, fats: 11.5, fiber: 0, calciumMg: 382, ironMg: 2.9, isActive: true, source: 'NATIVE' },
  { id: 'seed_figado_boi', name: 'Fígado de Boi', category: 'Ferro', unit: 'g', calories: 135, proteins: 20.4, carbs: 3.9, fats: 3.6, fiber: 0, calciumMg: 5, ironMg: 6.5, isActive: true, source: 'NATIVE' },
  { id: 'seed_feijao_carioca', name: 'Feijão Carioca', category: 'Ferro', unit: 'g', calories: 127, proteins: 8.7, carbs: 22.8, fats: 0.5, fiber: 8.5, calciumMg: 28, ironMg: 1.9, isActive: true, source: 'NATIVE' },
  { id: 'seed_gema_ovo', name: 'Gema de Ovo', category: 'Ferro', unit: 'g', calories: 322, proteins: 15.9, carbs: 3.6, fats: 26.5, fiber: 0, calciumMg: 129, ironMg: 2.7, isActive: true, source: 'NATIVE' },
  { id: 'seed_beterraba', name: 'Beterraba', category: 'Ferro', unit: 'g', calories: 43, proteins: 1.6, carbs: 9.6, fats: 0.2, fiber: 2.8, calciumMg: 16, ironMg: 0.8, isActive: true, source: 'NATIVE' },
  { id: 'seed_couve_manteiga', name: 'Couve-Manteiga', category: 'Ferro', unit: 'g', calories: 32, proteins: 2.9, carbs: 5.4, fats: 0.6, fiber: 4.1, calciumMg: 177, ironMg: 0.5, isActive: true, source: 'NATIVE' },
  { id: 'seed_grao_bico', name: 'Grão-de-Bico', category: 'Ferro', unit: 'g', calories: 164, proteins: 8.9, carbs: 27.4, fats: 2.6, fiber: 7.6, calciumMg: 49, ironMg: 2.9, isActive: true, source: 'NATIVE' },
  { id: 'seed_laranja', name: 'Laranja', category: 'Vitaminas', unit: 'g', calories: 47, proteins: 0.9, carbs: 11.8, fats: 0.1, fiber: 2.4, calciumMg: 40, ironMg: 0.1, isActive: true, source: 'NATIVE' },
  { id: 'seed_cenoura', name: 'Cenoura', category: 'Vitaminas', unit: 'g', calories: 41, proteins: 0.9, carbs: 9.6, fats: 0.2, fiber: 2.8, calciumMg: 33, ironMg: 0.3, isActive: true, source: 'NATIVE' },
  { id: 'seed_acerola', name: 'Acerola', category: 'Vitaminas', unit: 'g', calories: 32, proteins: 0.4, carbs: 7.7, fats: 0.3, fiber: 1.1, calciumMg: 12, ironMg: 0.2, isActive: true, source: 'NATIVE' },
  { id: 'seed_abobora', name: 'Abóbora', category: 'Vitaminas', unit: 'g', calories: 26, proteins: 1, carbs: 6.5, fats: 0.1, fiber: 0.5, calciumMg: 21, ironMg: 0.8, isActive: true, source: 'NATIVE' },
  { id: 'seed_mamao', name: 'Mamão', category: 'Vitaminas', unit: 'g', calories: 43, proteins: 0.5, carbs: 10.8, fats: 0.3, fiber: 1.7, calciumMg: 20, ironMg: 0.3, isActive: true, source: 'NATIVE' },
  { id: 'seed_pimentao_amarelo', name: 'Pimentão Amarelo', category: 'Vitaminas', unit: 'g', calories: 27, proteins: 1, carbs: 6.3, fats: 0.2, fiber: 0.9, calciumMg: 11, ironMg: 0.5, isActive: true, source: 'NATIVE' },
];
