import React, { useEffect, useMemo, useState } from 'react';
import { Building2, Save, Upload, Image as ImageIcon } from 'lucide-react';
import ApiService from '../services/api';
import { User } from '../types';

interface OwnerMatrixDataPageProps {
  currentUser: User;
  onUserUpdated?: (user: User) => void;
}

type MatrixForm = {
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  ownerDocument: string;
  matrizName: string;
  matrizLegalName: string;
  matrizDocument: string;
  matrizPhone1: string;
  matrizPhone2: string;
  matrizEmail: string;
  matrizWebsite: string;
  matrizCep: string;
  matrizStreet: string;
  matrizNumber: string;
  matrizNeighborhood: string;
  matrizCity: string;
  matrizState: string;
  matrizAddressRef: string;
  matrizLogo: string;
};

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Falha ao ler imagem.'));
    reader.readAsDataURL(file);
  });

const OwnerMatrixDataPage: React.FC<OwnerMatrixDataPageProps> = ({ currentUser, onUserUpdated }) => {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<MatrixForm>({
    ownerName: '',
    ownerEmail: '',
    ownerPhone: '',
    ownerDocument: '',
    matrizName: '',
    matrizLegalName: '',
    matrizDocument: '',
    matrizPhone1: '',
    matrizPhone2: '',
    matrizEmail: '',
    matrizWebsite: '',
    matrizCep: '',
    matrizStreet: '',
    matrizNumber: '',
    matrizNeighborhood: '',
    matrizCity: '',
    matrizState: '',
    matrizAddressRef: '',
    matrizLogo: '',
  });

  useEffect(() => {
    const userAny = (currentUser || {}) as any;
    setForm({
      ownerName: String(userAny.name || ''),
      ownerEmail: String(userAny.email || ''),
      ownerPhone: String(userAny.phone || ''),
      ownerDocument: String(userAny.document || ''),
      matrizName: String(userAny.matrizName || ''),
      matrizLegalName: String(userAny.matrizLegalName || ''),
      matrizDocument: String(userAny.matrizDocument || ''),
      matrizPhone1: String(userAny.matrizPhone1 || ''),
      matrizPhone2: String(userAny.matrizPhone2 || ''),
      matrizEmail: String(userAny.matrizEmail || ''),
      matrizWebsite: String(userAny.matrizWebsite || ''),
      matrizCep: String(userAny.matrizCep || ''),
      matrizStreet: String(userAny.matrizStreet || ''),
      matrizNumber: String(userAny.matrizNumber || ''),
      matrizNeighborhood: String(userAny.matrizNeighborhood || ''),
      matrizCity: String(userAny.matrizCity || ''),
      matrizState: String(userAny.matrizState || ''),
      matrizAddressRef: String(userAny.matrizAddressRef || ''),
      matrizLogo: String(userAny.matrizLogo || ''),
    });
  }, [currentUser]);

  const canSave = useMemo(() => String(form.ownerName || '').trim().length >= 2, [form.ownerName]);

  const handleLogoChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imageDataUrl = await fileToDataUrl(file);
      setForm((prev) => ({ ...prev, matrizLogo: imageDataUrl }));
    } catch (err) {
      console.error('Erro ao carregar logo da matriz:', err);
      alert('Nao foi possivel carregar a logo.');
    } finally {
      event.target.value = '';
    }
  };

  const handleSave = async () => {
    if (!canSave) {
      alert('Preencha pelo menos o nome do owner.');
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        name: String(form.ownerName || '').trim(),
        email: String(form.ownerEmail || '').trim(),
        phone: String(form.ownerPhone || '').trim(),
        document: String(form.ownerDocument || '').trim(),
        matrizName: String(form.matrizName || '').trim(),
        matrizLegalName: String(form.matrizLegalName || '').trim(),
        matrizDocument: String(form.matrizDocument || '').trim(),
        matrizPhone1: String(form.matrizPhone1 || '').trim(),
        matrizPhone2: String(form.matrizPhone2 || '').trim(),
        matrizEmail: String(form.matrizEmail || '').trim(),
        matrizWebsite: String(form.matrizWebsite || '').trim(),
        matrizCep: String(form.matrizCep || '').trim(),
        matrizStreet: String(form.matrizStreet || '').trim(),
        matrizNumber: String(form.matrizNumber || '').trim(),
        matrizNeighborhood: String(form.matrizNeighborhood || '').trim(),
        matrizCity: String(form.matrizCity || '').trim(),
        matrizState: String(form.matrizState || '').trim(),
        matrizAddressRef: String(form.matrizAddressRef || '').trim(),
        matrizLogo: String(form.matrizLogo || '').trim(),
      };

      const updated = await ApiService.updateUser(String(currentUser.id || '').trim(), payload);
      onUserUpdated?.(updated);
      alert('Dados da matriz salvos com sucesso.');
    } catch (err) {
      console.error('Erro ao salvar dados da matriz:', err);
      alert('Falha ao salvar dados da matriz.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight">Dados Matriz</h1>
          <p className="text-xs text-slate-500">Cadastro central da empresa matriz (conta OWNER).</p>
        </div>
        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black uppercase tracking-widest hover:bg-emerald-700 disabled:opacity-50"
        >
          <Save size={14} />
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <p className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-3">Logo da matriz</p>
        <div className="flex items-center gap-4">
          <div className="h-24 w-24 rounded-xl border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center">
            {String(form.matrizLogo || '').trim() ? (
              <img src={form.matrizLogo} alt="Logo matriz" className="h-full w-full object-cover" />
            ) : (
              <ImageIcon size={18} className="text-slate-400" />
            )}
          </div>
          <div className="flex flex-col gap-2">
            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-indigo-200 text-indigo-600 text-[10px] font-black uppercase tracking-widest cursor-pointer hover:bg-indigo-50">
              <Upload size={12} />
              Enviar Logo
              <input type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
            </label>
            <button type="button" onClick={() => setForm((prev) => ({ ...prev, matrizLogo: '' }))} className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-red-500">
              Remover
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <p className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-3">Dados do owner</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Nome owner"><input className={inputClass} value={form.ownerName} onChange={(e) => setForm((prev) => ({ ...prev, ownerName: e.target.value }))} /></Field>
          <Field label="Email owner"><input className={inputClass} value={form.ownerEmail} onChange={(e) => setForm((prev) => ({ ...prev, ownerEmail: e.target.value }))} /></Field>
          <Field label="Telefone owner"><input className={inputClass} value={form.ownerPhone} onChange={(e) => setForm((prev) => ({ ...prev, ownerPhone: e.target.value }))} /></Field>
          <Field label="CPF/CNPJ owner"><input className={inputClass} value={form.ownerDocument} onChange={(e) => setForm((prev) => ({ ...prev, ownerDocument: e.target.value }))} /></Field>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <p className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-3">Dados da empresa matriz</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Nome fantasia"><input className={inputClass} value={form.matrizName} onChange={(e) => setForm((prev) => ({ ...prev, matrizName: e.target.value }))} /></Field>
          <Field label="Razao social"><input className={inputClass} value={form.matrizLegalName} onChange={(e) => setForm((prev) => ({ ...prev, matrizLegalName: e.target.value }))} /></Field>
          <Field label="CNPJ matriz"><input className={inputClass} value={form.matrizDocument} onChange={(e) => setForm((prev) => ({ ...prev, matrizDocument: e.target.value }))} /></Field>
          <Field label="Email matriz"><input className={inputClass} value={form.matrizEmail} onChange={(e) => setForm((prev) => ({ ...prev, matrizEmail: e.target.value }))} /></Field>
          <Field label="WhatsApp matriz"><input className={inputClass} value={form.matrizPhone1} onChange={(e) => setForm((prev) => ({ ...prev, matrizPhone1: e.target.value }))} /></Field>
          <Field label="Telefone matriz"><input className={inputClass} value={form.matrizPhone2} onChange={(e) => setForm((prev) => ({ ...prev, matrizPhone2: e.target.value }))} /></Field>
          <Field label="Website"><input className={inputClass} value={form.matrizWebsite} onChange={(e) => setForm((prev) => ({ ...prev, matrizWebsite: e.target.value }))} /></Field>
          <Field label="CEP"><input className={inputClass} value={form.matrizCep} onChange={(e) => setForm((prev) => ({ ...prev, matrizCep: e.target.value }))} /></Field>
          <Field label="Rua"><input className={inputClass} value={form.matrizStreet} onChange={(e) => setForm((prev) => ({ ...prev, matrizStreet: e.target.value }))} /></Field>
          <Field label="Numero"><input className={inputClass} value={form.matrizNumber} onChange={(e) => setForm((prev) => ({ ...prev, matrizNumber: e.target.value }))} /></Field>
          <Field label="Bairro"><input className={inputClass} value={form.matrizNeighborhood} onChange={(e) => setForm((prev) => ({ ...prev, matrizNeighborhood: e.target.value }))} /></Field>
          <Field label="Cidade"><input className={inputClass} value={form.matrizCity} onChange={(e) => setForm((prev) => ({ ...prev, matrizCity: e.target.value }))} /></Field>
          <Field label="UF"><input className={inputClass} value={form.matrizState} onChange={(e) => setForm((prev) => ({ ...prev, matrizState: e.target.value }))} /></Field>
          <Field label="Referencia"><input className={inputClass} value={form.matrizAddressRef} onChange={(e) => setForm((prev) => ({ ...prev, matrizAddressRef: e.target.value }))} /></Field>
        </div>
      </section>
    </div>
  );
};

const inputClass = 'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 bg-white';

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block space-y-1.5">
    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
      <Building2 size={11} />
      {label}
    </span>
    {children}
  </label>
);

export default OwnerMatrixDataPage;
