import { Router, Request, Response } from 'express';
import { whatsappSession } from '../utils/whatsappSession.js';

const router = Router();

type AiProvider = 'openai' | 'gemini' | 'groq';

const parseJsonFromText = (raw: string) => {
  const text = String(raw || '').trim();
  if (!text) throw new Error('Resposta vazia da IA.');

  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      const sliced = text.slice(start, end + 1);
      return JSON.parse(sliced);
    }
    throw new Error('A IA retornou conteúdo fora do formato JSON esperado.');
  }
};

const normalizeResult = (payload: any) => ({
  energia_kcal: Number(payload?.energia_kcal ?? payload?.calorias ?? payload?.calories ?? 0) || 0,
  carboidratos_g: Number(payload?.carboidratos_g ?? payload?.carboidratos ?? payload?.carbs ?? 0) || 0,
  proteinas_g: Number(payload?.proteinas_g ?? payload?.proteinas ?? payload?.proteins ?? 0) || 0,
  gorduras_g: Number(payload?.gorduras_g ?? payload?.gorduras ?? payload?.fats ?? 0) || 0,
  fonte_referencia: String(payload?.fonte_referencia || payload?.fonte || payload?.source || 'TACO/USDA').trim() || 'TACO/USDA',
});

const buildNutritionPrompt = (foodName: string) => ({
  system: [
    'Você é um Nutricionista Técnico.',
    `Receberá um alimento base: "${foodName}".`,
    'Regra principal: Se o nome do alimento for vago (ex: "macarrão", "carne", "arroz"), NÃO gere valores ainda. Faça uma pergunta curta pedindo estado/preparo (ex: "É cozido ou cru?", "É frito ou grelhado?").',
    'Se o nome já for específico, gere os dados para 100g.',
    'Regra de preparo: se for frito, considere absorção média de óleo por imersão ao estimar gorduras e calorias.',
    'Use referência TACO e USDA; se houver incerteza, use média da variedade comum no Brasil.',
    "Calcule energia_kcal com base nos macros (4 kcal/g carb + 4 kcal/g proteína + 9 kcal/g gordura).",
    'Retorne ESTRITAMENTE JSON puro em um dos formatos abaixo:',
    '{"mode":"question","question":"..."}',
    '{"mode":"data","energia_kcal":0,"carboidratos_g":0,"proteinas_g":0,"gorduras_g":0,"fonte_referencia":"TACO/USDA"}',
    'Sem markdown, sem explicações fora do JSON.',
  ].join('\n'),
  user: `Alimento base: ${foodName}. Considere o histórico da conversa do usuário para decidir se pergunta ou se já responde com dados.`,
});

const enforceNutritionRules = (foodName: string, rawResult: ReturnType<typeof normalizeResult>) => {
  let carbs = Number(rawResult.carboidratos_g || 0);
  let proteins = Number(rawResult.proteinas_g || 0);
  let fats = Number(rawResult.gorduras_g || 0);

  if (!Number.isFinite(carbs) || carbs < 0) carbs = 0;
  if (!Number.isFinite(proteins) || proteins < 0) proteins = 0;
  if (!Number.isFinite(fats) || fats < 0) fats = 0;

  const normalizedName = String(foodName || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  let kcal = Math.round((carbs * 4) + (proteins * 4) + (fats * 9));

  // Regra específica para banana
  if (normalizedName.includes('banana') && kcal < 80) {
    const targetKcal = 89;
    const delta = targetKcal - kcal;
    carbs = Number((carbs + (delta / 4)).toFixed(2));
    kcal = Math.round((carbs * 4) + (proteins * 4) + (fats * 9));
  }

  return {
    energia_kcal: kcal,
    carboidratos_g: Number(carbs.toFixed(2)),
    proteinas_g: Number(proteins.toFixed(2)),
    gorduras_g: Number(fats.toFixed(2)),
    fonte_referencia: rawResult.fonte_referencia || 'TACO/USDA',
  };
};

const callOpenAi = async (
  token: string,
  model: string,
  foodName: string,
  history: Array<{ role: 'user' | 'assistant'; text: string }> = []
) => {
  const prompt = buildNutritionPrompt(foodName);
  const mappedHistory = history.slice(-10).map((msg) => ({
    role: msg.role === 'assistant' ? 'assistant' : 'user',
    content: String(msg.text || '').trim(),
  })).filter((m) => m.content);
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: prompt.system,
        },
        ...mappedHistory,
        {
          role: 'user',
          content: prompt.user,
        },
      ],
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || 'Falha na consulta com OpenAI.');
  }
  const content = data?.choices?.[0]?.message?.content || '';
  const parsed = parseJsonFromText(content);
  if (String(parsed?.mode || '').toLowerCase() === 'question') {
    return {
      mode: 'question' as const,
      question: String(parsed?.question || 'Você pode detalhar o preparo do alimento?').trim(),
    };
  }
  return {
    mode: 'data' as const,
    ...enforceNutritionRules(foodName, normalizeResult(parsed)),
  };
};

const callGemini = async (token: string, model: string, foodName: string, history: Array<{ role: 'user' | 'assistant'; text: string }> = []) => {
  const prompt = buildNutritionPrompt(foodName);
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(token)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
        contents: [
          ...history.slice(-10).map((msg) => ({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: String(msg.text || '').trim() }],
          })).filter((msg) => String(msg.parts?.[0]?.text || '').trim().length > 0),
          {
            role: 'user',
            parts: [{ text: `${prompt.system}\n\n${prompt.user}` }],
          },
        ],
      }),
    }
  );
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || 'Falha na consulta com Gemini.');
  }
  const content = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const parsed = parseJsonFromText(content);
  if (String(parsed?.mode || '').toLowerCase() === 'question') {
    return {
      mode: 'question' as const,
      question: String(parsed?.question || 'Você pode detalhar o preparo do alimento?').trim(),
    };
  }
  return {
    mode: 'data' as const,
    ...enforceNutritionRules(foodName, normalizeResult(parsed)),
  };
};

const callGroq = async (token: string, model: string, foodName: string, history: Array<{ role: 'user' | 'assistant'; text: string }> = []) => {
  const prompt = buildNutritionPrompt(foodName);
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: prompt.system,
        },
        ...history.slice(-10).map((msg) => ({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: String(msg.text || '').trim(),
        })).filter((msg) => String(msg.content || '').trim().length > 0),
        {
          role: 'user',
          content: prompt.user,
        },
      ],
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || 'Falha na consulta com Groq.');
  }
  const content = data?.choices?.[0]?.message?.content || '';
  const parsed = parseJsonFromText(content);
  if (String(parsed?.mode || '').toLowerCase() === 'question') {
    return {
      mode: 'question' as const,
      question: String(parsed?.question || 'Você pode detalhar o preparo do alimento?').trim(),
    };
  }
  return {
    mode: 'data' as const,
    ...enforceNutritionRules(foodName, normalizeResult(parsed)),
  };
};

router.post('/nutritional-data', async (req: Request, res: Response) => {
  try {
    const foodName = String(req.body?.foodName || '').trim();
    const conversation = Array.isArray(req.body?.conversation)
      ? req.body.conversation
          .map((msg: any) => ({
            role: msg?.role === 'assistant' ? 'assistant' : 'user',
            text: String(msg?.text || '').trim(),
          }))
          .filter((msg: any) => msg.text.length > 0)
      : [];
    if (!foodName) {
      return res.status(400).json({
        success: false,
        message: 'Informe o nome do alimento.',
      });
    }

    const aiConfig: any = whatsappSession.getAiConfig?.() || {};
    const provider: AiProvider = aiConfig?.provider === 'gemini'
      ? 'gemini'
      : aiConfig?.provider === 'groq'
        ? 'groq'
        : 'openai';

    const tokenOpenAi = String(aiConfig?.openAiToken || process.env.OPENAI_API_KEY || '').trim();
    const tokenGemini = String(aiConfig?.geminiToken || process.env.GEMINI_API_KEY || '').trim();
    const tokenGroq = String(aiConfig?.groqToken || process.env.GROQ_API_KEY || '').trim();
    const hasAnyToken = Boolean(tokenOpenAi || tokenGemini || tokenGroq);

    if (!hasAnyToken) {
      return res.status(400).json({
        success: false,
        message: 'IA não configurada. Verifique as configurações do Assistente de IA.',
      });
    }

    let result:
      | { mode: 'question'; question: string }
      | ({ mode: 'data' } & ReturnType<typeof normalizeResult>);
    if (provider === 'gemini' && tokenGemini) {
      result = await callGemini(tokenGemini, String(aiConfig?.model || 'gemini-2.0-flash'), foodName, conversation);
    } else if (provider === 'groq' && tokenGroq) {
      result = await callGroq(tokenGroq, String(aiConfig?.model || 'llama-3.1-8b-instant'), foodName, conversation);
    } else {
      result = await callOpenAi(tokenOpenAi, String(aiConfig?.model || 'gpt-4.1-mini'), foodName, conversation);
    }

    if (result.mode === 'question') {
      return res.json({
        success: true,
        foodName,
        mode: 'question',
        question: result.question,
      });
    }

    return res.json({
      success: true,
      foodName,
      mode: 'data',
      data: {
        energia_kcal: result.energia_kcal,
        carboidratos_g: result.carboidratos_g,
        proteinas_g: result.proteinas_g,
        gorduras_g: result.gorduras_g,
        fonte_referencia: result.fonte_referencia,
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err instanceof Error ? err.message : 'Falha ao gerar dados nutricionais com IA.',
    });
  }
});

export default router;
