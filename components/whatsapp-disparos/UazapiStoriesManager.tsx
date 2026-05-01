import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ApiService from '../../services/api';

type StoryType = 'text' | 'image' | 'video';
type StoryDeliveryService = 'AUTO' | 'NATIVE' | 'EXTERNAL';
type StoryMediaSourceMode = 'URL' | 'FILE';

type StoryItem = {
  id: string;
  scheduleAt: number;
  status: 'pending' | 'sent' | 'failed';
  deliveryService?: StoryDeliveryService;
  payload: {
    type: StoryType;
    text?: string;
    file?: string;
    mimetype?: string;
    background_color?: number;
    font?: number;
  };
  createdAt: string;
  updatedAt: string;
  sentAt?: string;
  error?: string;
};

type ProviderSummary = {
  mode: 'NATIVE' | 'EXTERNAL';
  externalEnabled: boolean;
  externalProviderCode: string;
};

const STORY_BACKGROUND_COLOR_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0, label: 'Preto' },
  { value: 1, label: 'Cinza Chumbo' },
  { value: 2, label: 'Azul Marinho' },
  { value: 3, label: 'Azul Royal' },
  { value: 4, label: 'Azul Claro' },
  { value: 5, label: 'Ciano' },
  { value: 6, label: 'Verde Escuro' },
  { value: 7, label: 'Verde' },
  { value: 8, label: 'Verde Limão' },
  { value: 9, label: 'Amarelo' },
  { value: 10, label: 'Laranja' },
  { value: 11, label: 'Vermelho' },
  { value: 12, label: 'Rosa' },
  { value: 13, label: 'Magenta' },
  { value: 14, label: 'Roxo' },
  { value: 15, label: 'Branco' },
];

const STORY_FONT_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0, label: 'Padrão' },
  { value: 1, label: 'Serifada' },
  { value: 2, label: 'Limpa' },
  { value: 3, label: 'Moderna' },
  { value: 4, label: 'Monoespaçada' },
  { value: 5, label: 'Negrito' },
  { value: 6, label: 'Título' },
  { value: 7, label: 'Suave' },
  { value: 8, label: 'Destaque' },
  { value: 9, label: 'Clássica' },
  { value: 10, label: 'Alternativa' },
];

const toDatetimeLocal = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '';
  const dt = new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = dt.getFullYear();
  const mm = pad(dt.getMonth() + 1);
  const dd = pad(dt.getDate());
  const hh = pad(dt.getHours());
  const mi = pad(dt.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
};

const fromDatetimeLocal = (value: string) => {
  const parsed = Date.parse(String(value || '').trim());
  return Number.isFinite(parsed) ? parsed : Date.now();
};

const UazapiStoriesManager: React.FC = () => {
  const [stories, setStories] = useState<StoryItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'pending' | 'sent' | 'failed'>('ALL');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [providerSummary, setProviderSummary] = useState<ProviderSummary>({
    mode: 'NATIVE',
    externalEnabled: false,
    externalProviderCode: 'UAZAPI',
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [formType, setFormType] = useState<StoryType>('text');
  const [formText, setFormText] = useState('');
  const [formFile, setFormFile] = useState('');
  const [mediaSourceMode, setMediaSourceMode] = useState<StoryMediaSourceMode>('URL');
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [isConvertingFile, setIsConvertingFile] = useState(false);
  const [formMimeType, setFormMimeType] = useState('');
  const [formBackgroundColor, setFormBackgroundColor] = useState('0');
  const [formFont, setFormFont] = useState('1');
  const [formScheduleAt, setFormScheduleAt] = useState(() => toDatetimeLocal(Date.now() + 10 * 60 * 1000));
  const [sendNow, setSendNow] = useState(false);
  const [deliveryService, setDeliveryService] = useState<StoryDeliveryService>('AUTO');

  const resetForm = useCallback(() => {
    setEditingId(null);
    setFormType('text');
    setFormText('');
    setFormFile('');
    setMediaSourceMode('URL');
    setUploadedFileName('');
    setIsConvertingFile(false);
    setFormMimeType('');
    setFormBackgroundColor('0');
    setFormFont('1');
    setFormScheduleAt(toDatetimeLocal(Date.now() + 10 * 60 * 1000));
    setSendNow(false);
    setDeliveryService('AUTO');
  }, []);

  const loadProviderSummary = useCallback(async () => {
    try {
      const providerResult = await ApiService.getWhatsAppProviderConfig();
      const config = providerResult?.config && typeof providerResult.config === 'object' ? providerResult.config : {};
      const mode = String((config as any)?.mode || 'NATIVE').toUpperCase() === 'EXTERNAL' ? 'EXTERNAL' : 'NATIVE';
      setProviderSummary({
        mode,
        externalEnabled: Boolean((config as any)?.external?.enabled),
        externalProviderCode: String((config as any)?.external?.providerCode || 'UAZAPI').trim().toUpperCase() || 'UAZAPI',
      });
    } catch {
      setProviderSummary({
        mode: 'NATIVE',
        externalEnabled: false,
        externalProviderCode: 'UAZAPI',
      });
    }
  }, []);

  const loadStories = useCallback(async () => {
    setLoading(true);
    try {
      const result = await ApiService.listWhatsAppStories({
        status: statusFilter === 'ALL' ? '' : statusFilter,
        limit: 200,
      });
      setStories(Array.isArray(result?.stories) ? result.stories : []);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Falha ao carregar stories.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadProviderSummary().catch(() => undefined);
    loadStories().catch(() => undefined);
  }, [loadStories, loadProviderSummary]);

  const resolvedService = useMemo<'NATIVE' | 'EXTERNAL'>(() => {
    if (deliveryService === 'NATIVE') return 'NATIVE';
    if (deliveryService === 'EXTERNAL') return 'EXTERNAL';
    return providerSummary.mode === 'EXTERNAL' && providerSummary.externalEnabled ? 'EXTERNAL' : 'NATIVE';
  }, [deliveryService, providerSummary.externalEnabled, providerSummary.mode]);

  const isResolvedNative = resolvedService === 'NATIVE';
  const previewFile = String(formFile || '').trim();
  const isPreviewDataUrl = previewFile.startsWith('data:');
  const isPreviewHttpUrl = /^https?:\/\//i.test(previewFile);
  const canRenderPreviewSource = isPreviewDataUrl || isPreviewHttpUrl;

  const canSave = useMemo(() => {
    if (formType === 'text') {
      return Boolean(formText.trim());
    }
    return Boolean(formFile.trim()) && !isConvertingFile;
  }, [formFile, formText, formType, isConvertingFile]);

  const handleFileToBase64 = async (file: File | null) => {
    if (!file) {
      setFormFile('');
      setUploadedFileName('');
      return;
    }

    setIsConvertingFile(true);
    setFeedback('');
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Não foi possível converter o arquivo para base64.'));
        reader.readAsDataURL(file);
      });

      if (!String(dataUrl).startsWith('data:')) {
        throw new Error('Arquivo inválido para conversão base64.');
      }

      setFormFile(dataUrl);
      setUploadedFileName(file.name || 'arquivo');
      if (!formMimeType.trim()) {
        setFormMimeType(String(file.type || '').trim());
      }
    } catch (err) {
      setFormFile('');
      setUploadedFileName('');
      setFeedback(err instanceof Error ? err.message : 'Falha ao converter arquivo para base64.');
    } finally {
      setIsConvertingFile(false);
    }
  };

  const handleSave = async () => {
    if (!canSave) {
      setFeedback('Preencha os campos obrigatórios do story.');
      return;
    }
    setSaving(true);
    setFeedback('');
    try {
      const payload = {
        story: {
          type: formType,
          text: formText.trim() || undefined,
          file: formFile.trim() || undefined,
          mimetype: formMimeType.trim() || undefined,
          background_color: Number(formBackgroundColor || 0),
          font: Number(formFont || 1),
        },
        scheduleAt: fromDatetimeLocal(formScheduleAt),
        sendNow,
        deliveryService,
      };

      if (editingId) {
        await ApiService.updateWhatsAppStory(editingId, payload);
        setFeedback('Story atualizado com sucesso.');
      } else {
        await ApiService.createWhatsAppStory(payload);
        setFeedback(sendNow ? 'Story enviado com sucesso.' : 'Story agendado com sucesso.');
      }

      resetForm();
      await loadStories();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Falha ao salvar story.');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (item: StoryItem) => {
    setEditingId(item.id);
    setFormType(item.payload?.type || 'text');
    setFormText(String(item.payload?.text || ''));
    setFormFile(String(item.payload?.file || ''));
    setMediaSourceMode(String(item.payload?.file || '').startsWith('data:') ? 'FILE' : 'URL');
    setUploadedFileName(String(item.payload?.file || '').startsWith('data:') ? 'arquivo-base64' : '');
    setFormMimeType(String(item.payload?.mimetype || ''));
    setFormBackgroundColor(String(item.payload?.background_color ?? 0));
    setFormFont(String(item.payload?.font ?? 1));
    setFormScheduleAt(toDatetimeLocal(Number(item.scheduleAt || Date.now())));
    setSendNow(false);
    setDeliveryService((item.deliveryService || 'AUTO') as StoryDeliveryService);
  };

  const handleDelete = async (id: string) => {
    setSaving(true);
    setFeedback('');
    try {
      await ApiService.deleteWhatsAppStory(id);
      setFeedback('Story removido com sucesso.');
      if (editingId === id) {
        resetForm();
      }
      await loadStories();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Falha ao remover story.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mt-6 rounded-2xl border border-fuchsia-200 bg-white p-6 dark:bg-zinc-900 dark:border-fuchsia-500/20">
      <p className="text-lg font-black text-slate-900 dark:text-zinc-100">Stories UAZAPI</p>
      <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-zinc-300">
        Envie agora ou agende stories com data e hora, com lista para editar e apagar.
      </p>

      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 dark:bg-zinc-900 dark:border-amber-500/30">
        <p className="text-[11px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-300">
          Serviço atual no envio de stories
        </p>
        <p className="mt-1 text-xs font-semibold text-amber-700/90 dark:text-amber-200">
          Selecionado: {resolvedService === 'EXTERNAL' ? `API cadastrada (${providerSummary.externalProviderCode || 'EXTERNA'})` : 'WhatsApp Baileys'}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Serviço</span>
          <select
            value={deliveryService}
            onChange={(e) => setDeliveryService((e.target.value as StoryDeliveryService) || 'AUTO')}
            className="w-full px-3 py-2.5 rounded-xl border-2 border-fuchsia-100 focus:border-fuchsia-400 outline-none text-sm font-semibold dark:bg-zinc-900 dark:border-white/10 dark:text-zinc-100"
          >
            <option value="AUTO">Automático (usar configuração da Conta)</option>
            <option value="NATIVE">WhatsApp Baileys</option>
            <option value="EXTERNAL">API cadastrada ({providerSummary.externalProviderCode || 'UAZAPI'})</option>
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Tipo</span>
          <select
            value={formType}
            onChange={(e) => setFormType((e.target.value as StoryType) || 'text')}
            className="w-full px-3 py-2.5 rounded-xl border-2 border-fuchsia-100 focus:border-fuchsia-400 outline-none text-sm font-semibold dark:bg-zinc-900 dark:border-white/10 dark:text-zinc-100"
          >
            <option value="text">Texto</option>
            <option value="image">Imagem</option>
            <option value="video">Vídeo</option>
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Agendar para</span>
          <input
            type="datetime-local"
            value={formScheduleAt}
            onChange={(e) => setFormScheduleAt(e.target.value)}
            disabled={sendNow}
            className="w-full px-3 py-2.5 rounded-xl border-2 border-fuchsia-100 focus:border-fuchsia-400 outline-none text-sm font-semibold disabled:bg-slate-100 dark:bg-zinc-900 dark:border-white/10 dark:text-zinc-100"
          />
        </label>

        {formType === 'text' ? (
          <label className="md:col-span-2 space-y-1">
            <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Texto do story</span>
            <textarea
              value={formText}
              onChange={(e) => setFormText(e.target.value)}
              rows={4}
              className="w-full px-3 py-2.5 rounded-xl border-2 border-fuchsia-100 focus:border-fuchsia-400 outline-none text-sm font-semibold dark:bg-zinc-900 dark:border-white/10 dark:text-zinc-100"
              placeholder="Digite o conteúdo do story"
            />
          </label>
        ) : (
          <>
            <label className="md:col-span-2 space-y-1">
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Origem do arquivo</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMediaSourceMode('URL')}
                  className={`px-3 py-2 rounded-xl border text-xs font-black uppercase tracking-widest ${
                    mediaSourceMode === 'URL'
                      ? 'border-fuchsia-500 bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-500/10 dark:text-fuchsia-200'
                      : 'border-slate-200 bg-white text-slate-600 dark:bg-zinc-900 dark:border-white/10 dark:text-zinc-300'
                  }`}
                >
                  URL
                </button>
                <button
                  type="button"
                  onClick={() => setMediaSourceMode('FILE')}
                  className={`px-3 py-2 rounded-xl border text-xs font-black uppercase tracking-widest ${
                    mediaSourceMode === 'FILE'
                      ? 'border-fuchsia-500 bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-500/10 dark:text-fuchsia-200'
                      : 'border-slate-200 bg-white text-slate-600 dark:bg-zinc-900 dark:border-white/10 dark:text-zinc-300'
                  }`}
                >
                  Arquivo (base64)
                </button>
              </div>
            </label>

            <label className="md:col-span-2 space-y-1">
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">
                {mediaSourceMode === 'URL' ? 'URL do arquivo' : 'Arquivo para converter em base64'}
              </span>
              {mediaSourceMode === 'URL' ? (
                <input
                  value={formFile}
                  onChange={(e) => setFormFile(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border-2 border-fuchsia-100 focus:border-fuchsia-400 outline-none text-sm font-semibold dark:bg-zinc-900 dark:border-white/10 dark:text-zinc-100"
                  placeholder="https://arquivo.exemplo.com/midia.jpg"
                />
              ) : (
                <div className="space-y-2">
                  <input
                    type="file"
                    accept={formType === 'video' ? 'video/*' : 'image/*,video/*'}
                    onChange={(e) => {
                      const file = e.target.files && e.target.files[0] ? e.target.files[0] : null;
                      handleFileToBase64(file).catch(() => undefined);
                    }}
                    className="w-full px-3 py-2.5 rounded-xl border-2 border-fuchsia-100 focus:border-fuchsia-400 outline-none text-sm font-semibold dark:bg-zinc-900 dark:border-white/10 dark:text-zinc-100"
                  />
                  {isConvertingFile && (
                    <p className="text-[11px] font-black text-fuchsia-700 dark:text-fuchsia-300">Convertendo arquivo para base64...</p>
                  )}
                  {uploadedFileName && !isConvertingFile && (
                    <p className="text-[11px] font-black text-emerald-700 dark:text-emerald-300">
                      Arquivo pronto: {uploadedFileName}
                    </p>
                  )}
                </div>
              )}
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Mimetype</span>
              <input
                value={formMimeType}
                onChange={(e) => setFormMimeType(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border-2 border-fuchsia-100 focus:border-fuchsia-400 outline-none text-sm font-semibold dark:bg-zinc-900 dark:border-white/10 dark:text-zinc-100"
                placeholder={formType === 'video' ? 'video/mp4' : 'image/jpeg'}
              />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Texto opcional</span>
              <input
                value={formText}
                onChange={(e) => setFormText(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border-2 border-fuchsia-100 focus:border-fuchsia-400 outline-none text-sm font-semibold dark:bg-zinc-900 dark:border-white/10 dark:text-zinc-100"
                placeholder="Legenda"
              />
            </label>
          </>
        )}

        <label className="space-y-1">
          <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Cor de fundo</span>
          <select
            value={formBackgroundColor}
            onChange={(e) => setFormBackgroundColor(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border-2 border-fuchsia-100 focus:border-fuchsia-400 outline-none text-sm font-semibold dark:bg-zinc-900 dark:border-white/10 dark:text-zinc-100"
          >
            {STORY_BACKGROUND_COLOR_OPTIONS.map((option) => (
              <option key={`story-bg-${option.value}`} value={String(option.value)}>
                {option.value} - {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Fonte</span>
          <select
            value={formFont}
            onChange={(e) => setFormFont(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border-2 border-fuchsia-100 focus:border-fuchsia-400 outline-none text-sm font-semibold dark:bg-zinc-900 dark:border-white/10 dark:text-zinc-100"
          >
            {STORY_FONT_OPTIONS.map((option) => (
              <option key={`story-font-${option.value}`} value={String(option.value)}>
                {option.value} - {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="md:col-span-2 inline-flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-zinc-200">
          <input
            type="checkbox"
            checked={sendNow}
            onChange={(e) => setSendNow(e.target.checked)}
          />
          Enviar agora (ignora agendamento)
        </label>
      </div>

      {formType !== 'text' && (
        <div className="mt-4 rounded-xl border border-fuchsia-100 bg-fuchsia-50/40 px-3 py-3 dark:border-fuchsia-500/20 dark:bg-zinc-900">
          <p className="text-[11px] font-black uppercase tracking-widest text-fuchsia-700 dark:text-fuchsia-300">Preview da mídia</p>
          {!previewFile && !isConvertingFile && (
            <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-zinc-300">
              Informe uma URL ou selecione um arquivo para visualizar o preview antes de salvar.
            </p>
          )}
          {isConvertingFile && (
            <p className="mt-2 text-xs font-black text-fuchsia-700 dark:text-fuchsia-300">Convertendo mídia para base64...</p>
          )}
          {previewFile && !isConvertingFile && !canRenderPreviewSource && (
            <p className="mt-2 text-xs font-black text-rose-600">
              O valor informado não parece URL válida nem base64 data URL. Use https://... ou selecione arquivo.
            </p>
          )}

          {previewFile && !isConvertingFile && canRenderPreviewSource && formType === 'image' && (
            <img
              src={previewFile}
              alt="Preview da imagem do story"
              className="mt-3 max-h-64 w-full rounded-xl border border-white object-contain bg-white dark:border-white/10 dark:bg-zinc-950"
            />
          )}

          {previewFile && !isConvertingFile && canRenderPreviewSource && formType === 'video' && (
            <video
              src={previewFile}
              controls
              preload="metadata"
              className="mt-3 max-h-64 w-full rounded-xl border border-white bg-black dark:border-white/10"
            />
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !canSave || isResolvedNative}
          className="px-4 py-2 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-700 disabled:bg-slate-300 text-white text-xs font-black uppercase tracking-widest"
        >
          {saving ? 'Salvando...' : (editingId ? 'Salvar edição' : 'Criar story')}
        </button>
        {editingId && (
          <button
            type="button"
            onClick={resetForm}
            className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-black uppercase tracking-widest hover:bg-slate-50"
          >
            Cancelar edição
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            loadProviderSummary().catch(() => undefined);
            loadStories().catch(() => undefined);
          }}
          disabled={loading}
          className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-black uppercase tracking-widest hover:bg-slate-50"
        >
          {loading ? 'Atualizando...' : 'Atualizar lista'}
        </button>
      </div>

      {isResolvedNative && (
        <p className="mt-3 text-xs font-black text-rose-600">
          Stories não são suportados no serviço WhatsApp Baileys. Selecione API cadastrada para enviar.
        </p>
      )}

      {feedback && (
        <p className="mt-3 text-xs font-black text-fuchsia-700 dark:text-fuchsia-300">{feedback}</p>
      )}

      <div className="mt-5">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <p className="text-xs font-black uppercase tracking-widest text-slate-500">Gerenciamento em lista</p>
          <select
            aria-label="Filtrar status de stories"
            value={statusFilter}
            onChange={(e) => setStatusFilter((e.target.value as 'ALL' | 'pending' | 'sent' | 'failed') || 'ALL')}
            className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold dark:bg-zinc-900 dark:border-white/10 dark:text-zinc-100"
          >
            <option value="ALL">Todos</option>
            <option value="pending">Pendentes</option>
            <option value="sent">Enviados</option>
            <option value="failed">Falhos</option>
          </select>
        </div>
        <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
          {stories.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 px-3 py-4 text-xs font-semibold text-slate-500">
              Nenhum story encontrado.
            </div>
          )}
          {stories.map((item) => (
            <article key={item.id} className="rounded-xl border border-slate-200 px-3 py-3 bg-slate-50/70 dark:bg-zinc-900 dark:border-white/10">
              <div className="flex flex-wrap items-center gap-2 justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-black text-slate-800 dark:text-zinc-100 truncate">
                    {item.payload?.type?.toUpperCase()} - {item.payload?.text || item.payload?.file || 'Sem conteúdo'}
                  </p>
                  <p className="text-[11px] font-semibold text-slate-500 dark:text-zinc-300">
                    Agendado: {new Date(Number(item.scheduleAt || 0)).toLocaleString('pt-BR')} | Status: {item.status}
                  </p>
                  <p className="text-[11px] font-semibold text-slate-500 dark:text-zinc-300">
                    Serviço: {String(item.deliveryService || 'AUTO').toUpperCase()}
                  </p>
                  {item.error && (
                    <p className="text-[11px] font-black text-rose-600 mt-1">{item.error}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleEdit(item)}
                    disabled={saving || item.status !== 'pending'}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-[10px] font-black uppercase tracking-widest hover:bg-white disabled:opacity-40"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(item.id)}
                    disabled={saving}
                    className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-black uppercase tracking-widest disabled:bg-slate-300"
                  >
                    Apagar
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default UazapiStoriesManager;
