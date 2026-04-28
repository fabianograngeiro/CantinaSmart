import React, { useState, useRef } from 'react';
import {
  X,
  ChevronLeft,
  Plus,
  Trash2,
  Image,
  List,
  LayoutGrid,
  Landmark,
  CheckSquare,
  Send,
  AlertCircle,
} from 'lucide-react';
import ApiService from '../services/api';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type EnvioAvancadoTool =
  | 'BOTOES'
  | 'LISTA'
  | 'IMAGEM'
  | 'CAROUSEL'
  | 'PIX';

interface BaseProps {
  chatId: string;
  phone: string;
  onClose: () => void;
  onSent: () => void;
}

// Helper: convert File → base64
const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

// ─────────────────────────────────────────────────────────────────────────────
// Sub-modals
// ─────────────────────────────────────────────────────────────────────────────

interface BotoesModalProps extends BaseProps {
  mode: 'BOTOES' | 'LISTA';
}

const BotoesModal: React.FC<BotoesModalProps> = ({ phone, mode, onClose, onSent }) => {
  const [text, setText] = useState('');
  const [footer, setFooter] = useState('');
  const [listTitle, setListTitle] = useState('Ver opções');
  const [choices, setChoices] = useState<string[]>(['', '']);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const addChoice = () => setChoices((prev) => [...prev, '']);
  const removeChoice = (i: number) => setChoices((prev) => prev.filter((_, idx) => idx !== i));
  const updateChoice = (i: number, val: string) =>
    setChoices((prev) => prev.map((c, idx) => (idx === i ? val : c)));

  const handleSend = async () => {
    const filledChoices = choices.map((c) => c.trim()).filter(Boolean);
    if (!text.trim()) { setError('Digite o texto da mensagem.'); return; }
    if (filledChoices.length < 1) { setError('Adicione pelo menos 1 opção.'); return; }
    if (mode === 'BOTOES' && filledChoices.length > 3) { setError('Máximo 3 botões.'); return; }
    if (mode === 'LISTA' && filledChoices.length > 10) { setError('Máximo 10 itens na lista.'); return; }
    setSending(true);
    setError('');
    try {
      await ApiService.sendWhatsAppInteractiveMenu({
        number: phone,
        type: mode === 'BOTOES' ? 'button' : 'list',
        text: text.trim(),
        choices: filledChoices,
        footerText: footer.trim() || undefined,
        listButton: mode === 'LISTA' ? listTitle.trim() || 'Ver opções' : undefined,
      });
      onSent();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao enviar.');
    } finally {
      setSending(false);
    }
  };

  const maxChoices = mode === 'BOTOES' ? 3 : 10;
  const label = mode === 'BOTOES' ? 'Botão' : 'Item da lista';

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Texto da mensagem *</label>
        <textarea
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ex: Escolha uma opção abaixo:"
          className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 focus:border-emerald-400 outline-none text-sm resize-none"
        />
      </div>

      {mode === 'LISTA' && (
        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Texto do botão da lista</label>
          <input
            value={listTitle}
            onChange={(e) => setListTitle(e.target.value)}
            placeholder="Ver opções"
            className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 focus:border-emerald-400 outline-none text-sm"
          />
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
            {label}s ({choices.length}/{maxChoices})
          </label>
          {choices.length < maxChoices && (
            <button
              type="button"
              onClick={addChoice}
              className="flex items-center gap-1 text-emerald-700 text-[11px] font-black hover:underline"
            >
              <Plus size={12} /> Adicionar
            </button>
          )}
        </div>
        {choices.map((c, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={c}
              onChange={(e) => updateChoice(i, e.target.value)}
              placeholder={`${label} ${i + 1}`}
              className="flex-1 px-3 py-2 rounded-xl border-2 border-slate-200 focus:border-emerald-400 outline-none text-sm"
              maxLength={20}
            />
            {choices.length > 1 && (
              <button
                type="button"
                onClick={() => removeChoice(i)}
                className="p-2 rounded-lg border border-rose-200 text-rose-500 hover:bg-rose-50"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Rodapé (opcional)</label>
        <input
          value={footer}
          onChange={(e) => setFooter(e.target.value)}
          placeholder="Ex: Cantina Smart"
          className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 focus:border-emerald-400 outline-none text-sm"
          maxLength={60}
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-rose-50 border border-rose-200 px-3 py-2">
          <AlertCircle size={14} className="text-rose-500 shrink-0" />
          <p className="text-xs font-bold text-rose-700">{error}</p>
        </div>
      )}

      <button
        type="button"
        onClick={handleSend}
        disabled={sending}
        className="w-full py-3 rounded-xl bg-[#065f46] hover:bg-emerald-800 disabled:opacity-60 text-white font-black flex items-center justify-center gap-2"
      >
        <Send size={14} />
        {sending ? 'Enviando...' : 'Enviar'}
      </button>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────

const ImagemModal: React.FC<BaseProps> = ({ chatId, onClose, onSent }) => {
  const [caption, setCaption] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleSend = async () => {
    if (!file) { setError('Selecione uma imagem.'); return; }
    setSending(true);
    setError('');
    try {
      const base64Data = await fileToBase64(file);
      const response = await fetch(`${(import.meta.env.VITE_API_URL || 'http://localhost:3001/api')}/whatsapp/send-media-to-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('canteen_auth_token')}`,
          'X-Enterprise-Id': localStorage.getItem('canteen_active_enterprise') || '',
        },
        body: JSON.stringify({
          chatId,
          message: caption.trim() || undefined,
          attachment: {
            mediaType: 'image',
            base64Data,
            mimeType: file.type || 'image/jpeg',
            fileName: file.name,
          },
        }),
      });
      if (!response.ok) {
        const txt = await response.text();
        throw new Error(txt || 'Falha ao enviar imagem.');
      }
      onSent();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao enviar imagem.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div
        onClick={() => fileRef.current?.click()}
        className="flex flex-col items-center justify-center gap-3 h-36 rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50 cursor-pointer hover:bg-emerald-100 transition"
      >
        {file ? (
          <p className="text-sm font-black text-emerald-700 px-4 text-center truncate">{file.name}</p>
        ) : (
          <>
            <Image size={28} className="text-emerald-400" />
            <p className="text-xs font-black text-emerald-600">Clique para selecionar imagem</p>
          </>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Legenda (opcional)</label>
        <textarea
          rows={2}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Ex: Cardápio do dia!"
          className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 focus:border-emerald-400 outline-none text-sm resize-none"
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-rose-50 border border-rose-200 px-3 py-2">
          <AlertCircle size={14} className="text-rose-500 shrink-0" />
          <p className="text-xs font-bold text-rose-700">{error}</p>
        </div>
      )}

      <button
        type="button"
        onClick={handleSend}
        disabled={sending}
        className="w-full py-3 rounded-xl bg-[#065f46] hover:bg-emerald-800 disabled:opacity-60 text-white font-black flex items-center justify-center gap-2"
      >
        <Send size={14} />
        {sending ? 'Enviando...' : 'Enviar imagem'}
      </button>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────

interface CarouselItem {
  text: string;
  image: string;
  buttons: { id: string; text: string; type: 'REPLY' | 'URL' | 'COPY' | 'CALL' }[];
}

const defaultCarouselItem = (): CarouselItem => ({
  text: '',
  image: '',
  buttons: [{ id: `btn-${Date.now()}`, text: '', type: 'REPLY' }],
});

const CarouselModal: React.FC<BaseProps> = ({ phone, onClose, onSent }) => {
  const [headerText, setHeaderText] = useState('');
  const [cards, setCards] = useState<CarouselItem[]>([defaultCarouselItem(), defaultCarouselItem()]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const updateCard = (i: number, patch: Partial<CarouselItem>) =>
    setCards((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  const addCard = () => setCards((prev) => [...prev, defaultCarouselItem()]);
  const removeCard = (i: number) => setCards((prev) => prev.filter((_, idx) => idx !== i));

  const addButton = (cardIdx: number) =>
    setCards((prev) =>
      prev.map((c, i) =>
        i === cardIdx && c.buttons.length < 3
          ? { ...c, buttons: [...c.buttons, { id: `btn-${Date.now()}`, text: '', type: 'REPLY' }] }
          : c
      )
    );

  const removeButton = (cardIdx: number, btnIdx: number) =>
    setCards((prev) =>
      prev.map((c, i) =>
        i === cardIdx ? { ...c, buttons: c.buttons.filter((_, bi) => bi !== btnIdx) } : c
      )
    );

  const updateButton = (
    cardIdx: number,
    btnIdx: number,
    patch: Partial<CarouselItem['buttons'][0]>
  ) =>
    setCards((prev) =>
      prev.map((c, i) =>
        i === cardIdx
          ? { ...c, buttons: c.buttons.map((b, bi) => (bi === btnIdx ? { ...b, ...patch } : b)) }
          : c
      )
    );

  const handleSend = async () => {
    if (!headerText.trim()) { setError('Digite o texto principal do carrossel.'); return; }
    if (cards.length < 2) { setError('Adicione pelo menos 2 cards.'); return; }
    for (let i = 0; i < cards.length; i++) {
      if (!cards[i].text.trim()) { setError(`Card ${i + 1}: adicione um texto.`); return; }
      if (!cards[i].image.trim()) { setError(`Card ${i + 1}: adicione a URL da imagem.`); return; }
      const emptyBtn = cards[i].buttons.find((b) => !b.text.trim());
      if (emptyBtn) { setError(`Card ${i + 1}: preencha todos os botões.`); return; }
    }
    setSending(true);
    setError('');
    try {
      await ApiService.sendWhatsAppCarousel({
        number: phone,
        text: headerText.trim(),
        carousel: cards.map((c) => ({
          text: c.text.trim(),
          image: c.image.trim(),
          buttons: c.buttons.map((b) => ({
            id: b.id,
            text: b.text.trim(),
            type: b.type,
          })),
        })),
      });
      onSent();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao enviar carrossel.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Texto principal *</label>
        <textarea
          rows={2}
          value={headerText}
          onChange={(e) => setHeaderText(e.target.value)}
          placeholder="Ex: Veja nossas novidades!"
          className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 focus:border-emerald-400 outline-none text-sm resize-none"
        />
      </div>

      <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1">
        {cards.map((card, ci) => (
          <div key={ci} className="rounded-2xl border-2 border-slate-100 p-3 space-y-2 bg-slate-50">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Card {ci + 1}</p>
              {cards.length > 2 && (
                <button type="button" onClick={() => removeCard(ci)} className="p-1 text-rose-400 hover:text-rose-600">
                  <Trash2 size={13} />
                </button>
              )}
            </div>
            <input
              value={card.image}
              onChange={(e) => updateCard(ci, { image: e.target.value })}
              placeholder="URL da imagem (https://...)"
              className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 focus:border-emerald-400 outline-none text-sm"
            />
            <textarea
              rows={2}
              value={card.text}
              onChange={(e) => updateCard(ci, { text: e.target.value })}
              placeholder="Texto do card"
              className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 focus:border-emerald-400 outline-none text-sm resize-none"
            />
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Botões ({card.buttons.length}/3)</p>
                {card.buttons.length < 3 && (
                  <button type="button" onClick={() => addButton(ci)} className="text-emerald-600 text-[10px] font-black hover:underline flex items-center gap-0.5">
                    <Plus size={11} /> Botão
                  </button>
                )}
              </div>
              {card.buttons.map((btn, bi) => (
                <div key={bi} className="flex items-center gap-2">
                  <select
                    value={btn.type}
                    onChange={(e) => updateButton(ci, bi, { type: e.target.value as any })}
                    className="px-2 py-1.5 rounded-lg border-2 border-slate-200 text-[11px] font-bold outline-none bg-white"
                  >
                    <option value="REPLY">Resposta</option>
                    <option value="URL">URL</option>
                    <option value="COPY">Copiar</option>
                    <option value="CALL">Ligar</option>
                  </select>
                  <input
                    value={btn.text}
                    onChange={(e) => updateButton(ci, bi, { text: e.target.value })}
                    placeholder="Texto do botão"
                    className="flex-1 px-2 py-1.5 rounded-lg border-2 border-slate-200 focus:border-emerald-400 outline-none text-sm"
                    maxLength={25}
                  />
                  {card.buttons.length > 1 && (
                    <button type="button" onClick={() => removeButton(ci, bi)} className="p-1.5 text-rose-400 hover:text-rose-600">
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {cards.length < 10 && (
        <button
          type="button"
          onClick={addCard}
          className="w-full py-2 rounded-xl border-2 border-dashed border-emerald-300 text-emerald-600 text-xs font-black uppercase tracking-widest hover:bg-emerald-50"
        >
          + Adicionar card
        </button>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-rose-50 border border-rose-200 px-3 py-2">
          <AlertCircle size={14} className="text-rose-500 shrink-0" />
          <p className="text-xs font-bold text-rose-700">{error}</p>
        </div>
      )}

      <button
        type="button"
        onClick={handleSend}
        disabled={sending}
        className="w-full py-3 rounded-xl bg-[#065f46] hover:bg-emerald-800 disabled:opacity-60 text-white font-black flex items-center justify-center gap-2"
      >
        <Send size={14} />
        {sending ? 'Enviando...' : 'Enviar carrossel'}
      </button>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────

const PixModal: React.FC<BaseProps> = ({ phone, onClose, onSent }) => {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [footer, setFooter] = useState('');
  const [pixKey, setPixKey] = useState('');
  const [pixType, setPixType] = useState<'CPF' | 'CNPJ' | 'PHONE' | 'EMAIL' | 'EVP'>('EVP');
  const [pixName, setPixName] = useState('');
  const [amount, setAmount] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const handleSend = async () => {
    const parsedAmount = Number(String(amount).replace(',', '.'));
    if (!text.trim()) { setError('Digite o texto da mensagem.'); return; }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) { setError('Informe um valor válido.'); return; }
    setSending(true);
    setError('');
    try {
      await ApiService.sendWhatsAppRequestPayment({
        number: phone,
        title: title.trim() || undefined,
        text: text.trim(),
        footer: footer.trim() || undefined,
        pixKey: pixKey.trim() || undefined,
        pixType,
        pixName: pixName.trim() || undefined,
        amount: parsedAmount,
      });
      onSent();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao enviar PIX.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Título (opcional)</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex: Pagamento da mensalidade"
            className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 focus:border-emerald-400 outline-none text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Valor (R$) *</label>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0,00"
            className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 focus:border-emerald-400 outline-none text-sm"
            inputMode="decimal"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Mensagem *</label>
        <textarea
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ex: Segue a cobrança da mensalidade de abril."
          className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 focus:border-emerald-400 outline-none text-sm resize-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Tipo de chave PIX</label>
          <select
            value={pixType}
            onChange={(e) => setPixType(e.target.value as any)}
            className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 outline-none text-sm font-semibold bg-white"
          >
            <option value="EVP">Chave aleatória (EVP)</option>
            <option value="CPF">CPF</option>
            <option value="CNPJ">CNPJ</option>
            <option value="PHONE">Telefone</option>
            <option value="EMAIL">E-mail</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Chave PIX</label>
          <input
            value={pixKey}
            onChange={(e) => setPixKey(e.target.value)}
            placeholder="Informe a chave"
            className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 focus:border-emerald-400 outline-none text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Nome do recebedor</label>
          <input
            value={pixName}
            onChange={(e) => setPixName(e.target.value)}
            placeholder="Ex: Cantina Smart"
            className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 focus:border-emerald-400 outline-none text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Rodapé (opcional)</label>
          <input
            value={footer}
            onChange={(e) => setFooter(e.target.value)}
            placeholder="Ex: Obrigado!"
            className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 focus:border-emerald-400 outline-none text-sm"
          />
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-rose-50 border border-rose-200 px-3 py-2">
          <AlertCircle size={14} className="text-rose-500 shrink-0" />
          <p className="text-xs font-bold text-rose-700">{error}</p>
        </div>
      )}

      <button
        type="button"
        onClick={handleSend}
        disabled={sending}
        className="w-full py-3 rounded-xl bg-[#065f46] hover:bg-emerald-800 disabled:opacity-60 text-white font-black flex items-center justify-center gap-2"
      >
        <Send size={14} />
        {sending ? 'Enviando...' : 'Enviar cobrança PIX'}
      </button>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Tool catalog
// ─────────────────────────────────────────────────────────────────────────────

interface ToolDef {
  id: EnvioAvancadoTool;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}

const TOOLS: ToolDef[] = [
  {
    id: 'BOTOES',
    label: 'Lista de botões',
    description: 'Envie até 3 botões interativos. Cada resposta pode acionar uma ação.',
    icon: <CheckSquare size={22} />,
    color: 'bg-violet-50 text-violet-600 border-violet-200',
  },
  {
    id: 'LISTA',
    label: 'Menu / Lista',
    description: 'Envie uma lista com até 10 opções selecionáveis.',
    icon: <List size={22} />,
    color: 'bg-blue-50 text-blue-600 border-blue-200',
  },
  {
    id: 'IMAGEM',
    label: 'Imagem com legenda',
    description: 'Envie uma imagem com texto de legenda opcional.',
    icon: <Image size={22} />,
    color: 'bg-cyan-50 text-cyan-600 border-cyan-200',
  },
  {
    id: 'CAROUSEL',
    label: 'Carrossel',
    description: 'Envie cards deslizáveis com imagem, texto e botões por card.',
    icon: <LayoutGrid size={22} />,
    color: 'bg-orange-50 text-orange-600 border-orange-200',
  },
  {
    id: 'PIX',
    label: 'Cobrança PIX',
    description: 'Envie botão de pagamento via PIX com valor e chave cadastrada.',
    icon: <Landmark size={22} />,
    color: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

interface EnvioAvancadoModalProps {
  chatId: string;
  phone: string;
  displayName?: string;
  onClose: () => void;
  onSent: () => void;
}

const EnvioAvancadoModal: React.FC<EnvioAvancadoModalProps> = ({
  chatId,
  phone,
  displayName,
  onClose,
  onSent,
}) => {
  const [activeTool, setActiveTool] = useState<EnvioAvancadoTool | null>(null);

  const titles: Record<EnvioAvancadoTool, string> = {
    BOTOES: 'Lista de botões',
    LISTA: 'Menu / Lista',
    IMAGEM: 'Imagem com legenda',
    CAROUSEL: 'Carrossel',
    PIX: 'Cobrança PIX',
  };

  return (
    <div className="fixed inset-0 z-[90] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-[24px] bg-white shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2">
            {activeTool && (
              <button
                type="button"
                onClick={() => setActiveTool(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
                title="Voltar"
              >
                <ChevronLeft size={16} />
              </button>
            )}
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                {displayName || phone}
              </p>
              <h3 className="text-base font-black text-slate-900">
                {activeTool ? titles[activeTool] : 'Envio avançado UAZAPI'}
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-slate-100 text-slate-400"
          >
            <X size={17} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto flex-1">
          {!activeTool ? (
            <div className="grid grid-cols-1 gap-3">
              {TOOLS.map((tool) => (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => setActiveTool(tool.id)}
                  className={`flex items-center gap-4 rounded-2xl border-2 px-4 py-3.5 transition hover:scale-[1.01] text-left ${tool.color}`}
                >
                  <span className="shrink-0">{tool.icon}</span>
                  <div className="min-w-0">
                    <p className="font-black text-sm leading-tight">{tool.label}</p>
                    <p className="text-xs font-semibold opacity-75 mt-0.5">{tool.description}</p>
                  </div>
                </button>
              ))}
            </div>
          ) : activeTool === 'BOTOES' ? (
            <BotoesModal chatId={chatId} phone={phone} mode="BOTOES" onClose={onClose} onSent={onSent} />
          ) : activeTool === 'LISTA' ? (
            <BotoesModal chatId={chatId} phone={phone} mode="LISTA" onClose={onClose} onSent={onSent} />
          ) : activeTool === 'IMAGEM' ? (
            <ImagemModal chatId={chatId} phone={phone} onClose={onClose} onSent={onSent} />
          ) : activeTool === 'CAROUSEL' ? (
            <CarouselModal chatId={chatId} phone={phone} onClose={onClose} onSent={onSent} />
          ) : activeTool === 'PIX' ? (
            <PixModal chatId={chatId} phone={phone} onClose={onClose} onSent={onSent} />
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default EnvioAvancadoModal;
