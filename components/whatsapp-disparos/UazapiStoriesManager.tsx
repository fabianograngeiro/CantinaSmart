import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ApiService from '../../services/api';

type StoryType = 'text' | 'image' | 'video';

type StoryItem = {
  id: string;
  scheduleAt: number;
  status: 'pending' | 'sent' | 'failed';
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

  const [editingId, setEditingId] = useState<string | null>(null);
  const [formType, setFormType] = useState<StoryType>('text');
  const [formText, setFormText] = useState('');
  const [formFile, setFormFile] = useState('');
  const [formMimeType, setFormMimeType] = useState('');
  const [formBackgroundColor, setFormBackgroundColor] = useState('0');
  const [formFont, setFormFont] = useState('1');
  const [formScheduleAt, setFormScheduleAt] = useState(() => toDatetimeLocal(Date.now() + 10 * 60 * 1000));
  const [sendNow, setSendNow] = useState(false);

  const resetForm = useCallback(() => {
    setEditingId(null);
    setFormType('text');
    setFormText('');
    setFormFile('');
    setFormMimeType('');
    setFormBackgroundColor('0');
    setFormFont('1');
    setFormScheduleAt(toDatetimeLocal(Date.now() + 10 * 60 * 1000));
    setSendNow(false);
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
    loadStories().catch(() => undefined);
  }, [loadStories]);

  const canSave = useMemo(() => {
    if (formType === 'text') {
      return Boolean(formText.trim());
    }
    return Boolean(formFile.trim());
  }, [formFile, formText, formType]);

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
    setFormMimeType(String(item.payload?.mimetype || ''));
    setFormBackgroundColor(String(item.payload?.background_color ?? 0));
    setFormFont(String(item.payload?.font ?? 1));
    setFormScheduleAt(toDatetimeLocal(Number(item.scheduleAt || Date.now())));
    setSendNow(false);
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

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
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
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">URL/Base64 do arquivo</span>
              <input
                value={formFile}
                onChange={(e) => setFormFile(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border-2 border-fuchsia-100 focus:border-fuchsia-400 outline-none text-sm font-semibold dark:bg-zinc-900 dark:border-white/10 dark:text-zinc-100"
                placeholder="https://... ou data:..."
              />
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
          <input
            type="number"
            value={formBackgroundColor}
            onChange={(e) => setFormBackgroundColor(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border-2 border-fuchsia-100 focus:border-fuchsia-400 outline-none text-sm font-semibold dark:bg-zinc-900 dark:border-white/10 dark:text-zinc-100"
          />
        </label>

        <label className="space-y-1">
          <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Fonte</span>
          <input
            type="number"
            value={formFont}
            onChange={(e) => setFormFont(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border-2 border-fuchsia-100 focus:border-fuchsia-400 outline-none text-sm font-semibold dark:bg-zinc-900 dark:border-white/10 dark:text-zinc-100"
          />
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

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !canSave}
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
          onClick={() => loadStories().catch(() => undefined)}
          disabled={loading}
          className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-black uppercase tracking-widest hover:bg-slate-50"
        >
          {loading ? 'Atualizando...' : 'Atualizar lista'}
        </button>
      </div>

      {feedback && (
        <p className="mt-3 text-xs font-black text-fuchsia-700 dark:text-fuchsia-300">{feedback}</p>
      )}

      <div className="mt-5">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <p className="text-xs font-black uppercase tracking-widest text-slate-500">Gerenciamento em lista</p>
          <select
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
