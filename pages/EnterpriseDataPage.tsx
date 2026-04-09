import React, { useEffect, useMemo, useState } from 'react';
import { Building2, Upload, Save, Image as ImageIcon, RefreshCw } from 'lucide-react';
import ApiService from '../services/api';
import { Enterprise } from '../types';

interface EnterpriseDataPageProps {
  activeEnterprise: Enterprise | null;
  onEnterpriseUpdated?: (enterprise: Enterprise) => void;
}

type EnterpriseFormState = {
  name: string;
  document: string;
  type: 'CANTINA' | 'RESTAURANTE';
  attachedSchoolName: string;
  ownerName: string;
  managerName: string;
  address: string;
  locationReference: string;
  phone1: string;
  phone2: string;
  website: string;
  planType: 'BASIC' | 'PREMIUM' | 'PRO' | 'ENTERPRISE';
  serviceStatus: 'TRIAL' | 'ATIVO' | 'PAUSADO' | 'INADIMPLENTE' | 'CANCELADO';
  lastPaymentStatus: 'PAID' | 'PENDING' | 'OVERDUE';
  monthlyFee: string;
  expirationDate: string;
  isActive: boolean;
};

const emptyForm: EnterpriseFormState = {
  name: '',
  document: '',
  type: 'CANTINA',
  attachedSchoolName: '',
  ownerName: '',
  managerName: '',
  address: '',
  locationReference: '',
  phone1: '',
  phone2: '',
  website: '',
  planType: 'BASIC',
  serviceStatus: 'ATIVO',
  lastPaymentStatus: 'PAID',
  monthlyFee: '',
  expirationDate: '',
  isActive: true,
};

const toSquareLogoDataUrl = (file: File, size: number = 512): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Falha ao ler arquivo de imagem.'));
    reader.onload = () => {
      const source = String(reader.result || '').trim();
      if (!source) {
        reject(new Error('Imagem invalida.'));
        return;
      }
      const img = new Image();
      img.onerror = () => reject(new Error('Falha ao processar imagem.'));
      img.onload = () => {
        const width = Number(img.width || 0);
        const height = Number(img.height || 0);
        if (!width || !height) {
          reject(new Error('Imagem invalida.'));
          return;
        }

        const cropSize = Math.min(width, height);
        const sx = Math.floor((width - cropSize) / 2);
        const sy = Math.floor((height - cropSize) / 2);

        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Nao foi possivel preparar a imagem.'));
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, sx, sy, cropSize, cropSize, 0, 0, size, size);
        const dataUrl = canvas.toDataURL('image/png', 0.96);
        resolve(dataUrl);
      };
      img.src = source;
    };
    reader.readAsDataURL(file);
  });

const EnterpriseDataPage: React.FC<EnterpriseDataPageProps> = ({ activeEnterprise, onEnterpriseUpdated }) => {
  const [form, setForm] = useState<EnterpriseFormState>(emptyForm);
  const [logoDataUrl, setLogoDataUrl] = useState('');
  const [logoBusy, setLogoBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!activeEnterprise) {
      setForm(emptyForm);
      setLogoDataUrl('');
      return;
    }

    setForm({
      name: String(activeEnterprise.name || ''),
      document: String(activeEnterprise.document || ''),
      type: activeEnterprise.type === 'RESTAURANTE' ? 'RESTAURANTE' : 'CANTINA',
      attachedSchoolName: String(activeEnterprise.attachedSchoolName || ''),
      ownerName: String(activeEnterprise.ownerName || ''),
      managerName: String(activeEnterprise.managerName || ''),
      address: String(activeEnterprise.address || ''),
      locationReference: String(activeEnterprise.locationReference || ''),
      phone1: String(activeEnterprise.phone1 || ''),
      phone2: String(activeEnterprise.phone2 || ''),
      website: String(activeEnterprise.website || ''),
      planType: (['BASIC', 'PREMIUM', 'PRO', 'ENTERPRISE'].includes(String(activeEnterprise.planType || '').toUpperCase())
        ? String(activeEnterprise.planType || '').toUpperCase()
        : 'BASIC') as EnterpriseFormState['planType'],
      serviceStatus: (['TRIAL', 'ATIVO', 'PAUSADO', 'INADIMPLENTE', 'CANCELADO'].includes(String(activeEnterprise.serviceStatus || '').toUpperCase())
        ? String(activeEnterprise.serviceStatus || '').toUpperCase()
        : 'ATIVO') as EnterpriseFormState['serviceStatus'],
      lastPaymentStatus: (['PAID', 'PENDING', 'OVERDUE'].includes(String(activeEnterprise.lastPaymentStatus || '').toUpperCase())
        ? String(activeEnterprise.lastPaymentStatus || '').toUpperCase()
        : 'PAID') as EnterpriseFormState['lastPaymentStatus'],
      monthlyFee: Number.isFinite(Number(activeEnterprise.monthlyFee)) ? String(Number(activeEnterprise.monthlyFee)) : '',
      expirationDate: String(activeEnterprise.expirationDate || '').slice(0, 10),
      isActive: activeEnterprise.isActive !== false,
    });

    setLogoDataUrl(String(activeEnterprise.logo || '').trim());
  }, [activeEnterprise]);

  const canSave = useMemo(() => {
    return Boolean(activeEnterprise?.id) && String(form.name || '').trim().length >= 2;
  }, [activeEnterprise?.id, form.name]);

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setLogoBusy(true);
    try {
      const squareLogo = await toSquareLogoDataUrl(file, 512);
      setLogoDataUrl(squareLogo);
    } catch (error) {
      console.error('Erro ao processar logo:', error);
      alert(error instanceof Error ? error.message : 'Falha ao processar logo.');
    } finally {
      setLogoBusy(false);
      event.target.value = '';
    }
  };

  const handleSave = async () => {
    if (!activeEnterprise?.id) return;
    if (!canSave) {
      alert('Preencha pelo menos o nome da empresa.');
      return;
    }

    setSaving(true);
    try {
      const updated = await ApiService.updateEnterprise(activeEnterprise.id, {
        ...activeEnterprise,
        name: String(form.name || '').trim(),
        document: String(form.document || '').trim(),
        type: form.type,
        attachedSchoolName: String(form.attachedSchoolName || '').trim(),
        ownerName: String(form.ownerName || '').trim(),
        managerName: String(form.managerName || '').trim(),
        address: String(form.address || '').trim(),
        locationReference: String(form.locationReference || '').trim(),
        phone1: String(form.phone1 || '').trim(),
        phone2: String(form.phone2 || '').trim(),
        website: String(form.website || '').trim(),
        planType: form.planType,
        serviceStatus: form.serviceStatus,
        lastPaymentStatus: form.lastPaymentStatus,
        monthlyFee: form.monthlyFee === '' ? undefined : Number(form.monthlyFee),
        expirationDate: String(form.expirationDate || '').trim(),
        isActive: Boolean(form.isActive),
        logo: String(logoDataUrl || '').trim(),
      });

      onEnterpriseUpdated?.(updated);
      alert('Dados da empresa salvos com sucesso.');
    } catch (error) {
      console.error('Erro ao salvar dados da empresa:', error);
      alert('Falha ao salvar dados da empresa.');
    } finally {
      setSaving(false);
    }
  };

  if (!activeEnterprise) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm font-semibold text-slate-600">Selecione uma unidade para editar os dados da empresa.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100 uppercase">Dados Empresa</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">Cadastro completo da unidade com logo institucional.</p>
        </div>
        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black uppercase tracking-widest hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
          Salvar Dados
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white dark:bg-zinc-900/60 p-5">
        <p className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-3">Logo quadrada da empresa</p>
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="h-28 w-28 rounded-2xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden">
            {String(logoDataUrl || '').trim() ? (
              <img src={logoDataUrl} alt="Logo da empresa" className="h-full w-full object-cover" />
            ) : (
              <ImageIcon size={24} className="text-slate-400" />
            )}
          </div>
          <div className="space-y-2">
            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-indigo-200 text-indigo-600 text-xs font-black uppercase tracking-widest cursor-pointer hover:bg-indigo-50">
              <Upload size={13} />
              {logoBusy ? 'Processando...' : 'Enviar Logo'}
              <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} disabled={logoBusy} />
            </label>
            <div>
              <button
                type="button"
                onClick={() => setLogoDataUrl('')}
                className="text-[11px] font-bold text-slate-500 hover:text-red-600"
              >
                Remover logo
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white dark:bg-zinc-900/60 p-5">
        <p className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-4">Dados cadastrais</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Nome da empresa">
            <input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} className={inputClassName} />
          </Field>
          <Field label="Documento (CPF/CNPJ)">
            <input value={form.document} onChange={(e) => setForm((prev) => ({ ...prev, document: e.target.value }))} className={inputClassName} />
          </Field>
          <Field label="Tipo de unidade">
            <select value={form.type} onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value === 'RESTAURANTE' ? 'RESTAURANTE' : 'CANTINA' }))} className={inputClassName}>
              <option value="CANTINA">CANTINA</option>
              <option value="RESTAURANTE">RESTAURANTE</option>
            </select>
          </Field>
          <Field label="Instituicao vinculada">
            <input value={form.attachedSchoolName} onChange={(e) => setForm((prev) => ({ ...prev, attachedSchoolName: e.target.value }))} className={inputClassName} />
          </Field>
          <Field label="Nome do dono">
            <input value={form.ownerName} onChange={(e) => setForm((prev) => ({ ...prev, ownerName: e.target.value }))} className={inputClassName} />
          </Field>
          <Field label="Nome do gerente">
            <input value={form.managerName} onChange={(e) => setForm((prev) => ({ ...prev, managerName: e.target.value }))} className={inputClassName} />
          </Field>
          <Field label="Endereco completo">
            <input value={form.address} onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))} className={inputClassName} />
          </Field>
          <Field label="Referencia local">
            <input value={form.locationReference} onChange={(e) => setForm((prev) => ({ ...prev, locationReference: e.target.value }))} className={inputClassName} />
          </Field>
          <Field label="WhatsApp">
            <input value={form.phone1} onChange={(e) => setForm((prev) => ({ ...prev, phone1: e.target.value }))} className={inputClassName} />
          </Field>
          <Field label="Telefone contato">
            <input value={form.phone2} onChange={(e) => setForm((prev) => ({ ...prev, phone2: e.target.value }))} className={inputClassName} />
          </Field>
          <Field label="Website">
            <input value={form.website} onChange={(e) => setForm((prev) => ({ ...prev, website: e.target.value }))} className={inputClassName} />
          </Field>
          <Field label="Ativo">
            <select value={form.isActive ? 'SIM' : 'NAO'} onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.value === 'SIM' }))} className={inputClassName}>
              <option value="SIM">SIM</option>
              <option value="NAO">NAO</option>
            </select>
          </Field>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white dark:bg-zinc-900/60 p-5">
        <p className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-4">Contrato e status</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Plano">
            <select value={form.planType} onChange={(e) => setForm((prev) => ({ ...prev, planType: e.target.value as EnterpriseFormState['planType'] }))} className={inputClassName}>
              <option value="BASIC">BASIC</option>
              <option value="PREMIUM">PREMIUM</option>
              <option value="PRO">PRO</option>
              <option value="ENTERPRISE">ENTERPRISE</option>
            </select>
          </Field>
          <Field label="Mensalidade">
            <input type="number" step="0.01" value={form.monthlyFee} onChange={(e) => setForm((prev) => ({ ...prev, monthlyFee: e.target.value }))} className={inputClassName} />
          </Field>
          <Field label="Status servico">
            <select value={form.serviceStatus} onChange={(e) => setForm((prev) => ({ ...prev, serviceStatus: e.target.value as EnterpriseFormState['serviceStatus'] }))} className={inputClassName}>
              <option value="TRIAL">TRIAL</option>
              <option value="ATIVO">ATIVO</option>
              <option value="PAUSADO">PAUSADO</option>
              <option value="INADIMPLENTE">INADIMPLENTE</option>
              <option value="CANCELADO">CANCELADO</option>
            </select>
          </Field>
          <Field label="Status pagamento">
            <select value={form.lastPaymentStatus} onChange={(e) => setForm((prev) => ({ ...prev, lastPaymentStatus: e.target.value as EnterpriseFormState['lastPaymentStatus'] }))} className={inputClassName}>
              <option value="PAID">PAID</option>
              <option value="PENDING">PENDING</option>
              <option value="OVERDUE">OVERDUE</option>
            </select>
          </Field>
          <Field label="Vencimento licenca">
            <input type="date" value={form.expirationDate} onChange={(e) => setForm((prev) => ({ ...prev, expirationDate: e.target.value }))} className={inputClassName} />
          </Field>
        </div>
      </div>
    </div>
  );
};

const inputClassName =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40';

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block space-y-1.5">
    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
      <Building2 size={11} />
      {label}
    </span>
    {children}
  </label>
);

export default EnterpriseDataPage;
