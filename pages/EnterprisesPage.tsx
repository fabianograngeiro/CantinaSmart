
import React, { useState, useMemo, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  Building2, Plus, Search, MapPin, ShieldCheck, 
  ExternalLink, Building, CheckCircle2, 
  Edit, Power, PowerOff, Map as MapIcon,
  X, Save, Hash, Phone, Smartphone, UserCircle,
  Mail, Lock, Copy, ArrowRight, Store, School,
  Utensils, Beef, ReceiptText, Calendar, Upload, Image as ImageIcon,
  ChevronRight, Sparkles, DollarSign, AlertCircle, Users
} from 'lucide-react';
import { Enterprise, Role, User } from '../types';
import ApiService from '../services/api';
import { appendSaasAuditLog } from '../services/saasAuditLog';

interface EnterprisesPageProps {
  currentUser: User;
  onSelectEnterprise?: (enterprise: Enterprise) => void;
}

const EnterprisesPage: React.FC<EnterprisesPageProps> = ({ currentUser, onSelectEnterprise }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const isSuperAdmin = currentUser?.role === Role.SUPERADMIN;
  const isOwner = currentUser?.role === Role.OWNER;
  
  const [enterprises, setEnterprises] = useState<Enterprise[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [successData, setSuccessData] = useState<{email: string, pass: string} | null>(null);
  const [editingEnterprise, setEditingEnterprise] = useState<Enterprise | null>(null);
  const [showFirstAccessGuide, setShowFirstAccessGuide] = useState(false);

  // Carregar empresas da API
  useEffect(() => {
    const loadEnterprises = async () => {
      try {
        const data = await ApiService.getEnterprises();
        setEnterprises(data);
      } catch (err) {
        console.error('Erro ao carregar empresas:', err);
        setEnterprises([]);
      }
    };
    loadEnterprises();
  }, []);

  useEffect(() => {
    if (!isOwner) {
      setShowFirstAccessGuide(false);
      return;
    }
    const storageKey = `owner_first_access_guide_seen_${currentUser?.id || 'unknown'}`;
    const alreadySeen = localStorage.getItem(storageKey) === '1';
    const hasEnterprise = enterprises.length > 0;
    setShowFirstAccessGuide(!alreadySeen && !hasEnterprise);
  }, [isOwner, currentUser?.id, enterprises.length]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('openCreate') !== '1') return;

    const ownerDocument = String(currentUser?.document || '').trim();
    const ownerName = String(currentUser?.name || '').trim();

    setFormData({
      type: 'CANTINA',
      nomeFantasia: '',
      managerName: isOwner ? ownerName : '',
      document: isOwner ? formatCpfCnpj(ownerDocument) : '',
      logo: '',
      phone1: '',
      phone2: '',
      attachedSchoolName: '',
      email: '',
      cep: '',
      street: '',
      number: '',
      neighborhood: '',
      city: '',
      state: '',
      planType: 'BASIC',
      monthlyFee: 197.00
    });
    setEditingEnterprise(null);
    setSuccessData(null);
    setIsModalOpen(true);

    params.delete('openCreate');
    const nextSearch = params.toString();
    navigate(`/enterprises${nextSearch ? `?${nextSearch}` : ''}`, { replace: true });
  }, [location.search, navigate, isOwner, currentUser?.document, currentUser?.name]);

  const [formData, setFormData] = useState({
    type: 'CANTINA' as 'CANTINA' | 'RESTAURANTE',
    nomeFantasia: '',
    managerName: '',
    document: '', // CNPJ
    logo: '',
    phone1: '', // Whatsapp
    phone2: '', // Telefone Contato
    attachedSchoolName: '', // Apenas Cantina
    email: '', // Para login
    cep: '',
    street: '',
    number: '',
    neighborhood: '',
    city: '',
    state: '', // UF
    planType: 'BASIC' as 'BASIC' | 'PREMIUM',
    monthlyFee: 197.00
  });
  const [isCnpjLookupLoading, setIsCnpjLookupLoading] = useState(false);
  const [isCepLookupLoading, setIsCepLookupLoading] = useState(false);

  const onlyDigits = (value: string) => String(value || '').replace(/\D/g, '');

  const formatCpfCnpj = (value: string) => {
    const digits = onlyDigits(value).slice(0, 14);
    if (digits.length <= 11) {
      return digits
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    }
    return digits
      .replace(/(\d{2})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1/$2')
      .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
  };

  const formatCep = (value: string) => {
    const digits = onlyDigits(value).slice(0, 8);
    if (digits.length <= 5) return digits;
    return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  };

  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Falha ao ler imagem.'));
      reader.readAsDataURL(file);
    });

  const normalizePlanType = (plan?: string): 'BASIC' | 'PREMIUM' => {
    const normalized = String(plan || '').trim().toUpperCase();
    return normalized === 'PREMIUM' || normalized === 'PRO' || normalized === 'ENTERPRISE' ? 'PREMIUM' : 'BASIC';
  };

  const getDefaultFeeByPlan = (plan: 'BASIC' | 'PREMIUM'): number => (plan === 'PREMIUM' ? 397 : 197);

  const parseAddressParts = (address?: string) => {
    const raw = String(address || '').trim();
    if (!raw) {
      return { street: '', number: '', neighborhood: '', city: '', state: '', cep: '' };
    }
    const pattern = /^(.*?),\s*(.*?)\s*-\s*(.*?),\s*(.*?)\s*-\s*(.*?)(?:\s*\(CEP:\s*([0-9\-]+)\))?$/i;
    const matched = raw.match(pattern);
    if (matched) {
      return {
        street: matched[1] || '',
        number: matched[2] || '',
        neighborhood: matched[3] || '',
        city: matched[4] || '',
        state: matched[5] || '',
        cep: matched[6] || ''
      };
    }
    return {
      street: raw,
      number: '',
      neighborhood: '',
      city: '',
      state: '',
      cep: ''
    };
  };

  const filteredEnterprises = useMemo(() => {
    return enterprises.filter(e => {
      // SUPERADMIN vÃª tudo
      // OWNER vÃª todas as empresas (nÃ£o filtra por enterpriseIds)
      const isUserEnterprise = isSuperAdmin || isOwner || (currentUser.enterpriseIds?.includes(e.id));
      
      const matchesSearch = 
        e.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        e.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (e.document && e.document.includes(searchTerm)) ||
        (e.ownerName && e.ownerName.toLowerCase().includes(searchTerm.toLowerCase()));
        
      return isUserEnterprise && matchesSearch;
    });
  }, [enterprises, searchTerm, isSuperAdmin, isOwner, currentUser.enterpriseIds]);

  const stats = useMemo(() => {
    // Calcular stats baseado nas empresas filtradas (vis\u00edveis ao usu\u00e1rio)
    const visibleEnterprises = filteredEnterprises;
    const totalMRR = visibleEnterprises.reduce((acc, curr) => acc + (curr.monthlyFee || 0), 0);
    const active = visibleEnterprises.filter(e => e.isActive).length;
    const pending = visibleEnterprises.filter(e => e.lastPaymentStatus === 'PENDING' || e.lastPaymentStatus === 'OVERDUE').length;
    
    return { totalMRR, active, pending, total: visibleEnterprises.length };
  }, [filteredEnterprises]);

  const handleSaveEnterprise = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const fullAddress = `${formData.street}, ${formData.number} - ${formData.neighborhood}, ${formData.city} - ${formData.state} (CEP: ${formData.cep})`;

    const newEnterprise = {
      name: formData.nomeFantasia,
      document: formData.document,
      type: formData.type,
      address: fullAddress,
      attachedSchoolName: formData.type === 'CANTINA' ? formData.attachedSchoolName : undefined,
      managerName: formData.managerName,
      phone1: formData.phone1,
      phone2: formData.phone2,
      isActive: true,
      logo: String(formData.logo || '').trim() || `https://api.dicebear.com/7.x/initials/svg?seed=${formData.nomeFantasia}`,
      ownerName: formData.managerName,
      planType: formData.planType,
      monthlyFee: formData.monthlyFee,
      lastPaymentStatus: 'PAID',
      serviceStatus: 'ATIVO' as const
    };

    try {
      if (editingEnterprise) {
        const updated = await ApiService.updateEnterprise(editingEnterprise.id, {
          ...editingEnterprise,
          ...newEnterprise,
          isActive: editingEnterprise.serviceStatus !== 'CANCELADO'
        });
        setEnterprises((prev) => prev.map((ent) => (ent.id === editingEnterprise.id ? updated : ent)));
        if (isSuperAdmin) {
          appendSaasAuditLog({
            actorName: currentUser.name,
            actorRole: String(currentUser.role || ''),
            module: 'CLIENTES',
            action: 'SAAS_CLIENT_UPDATED',
            entityType: 'ENTERPRISE',
            entityId: editingEnterprise.id,
            enterpriseId: editingEnterprise.id,
            enterpriseName: newEnterprise.name,
            summary: 'Cadastro de cliente SaaS atualizado',
            metadata: {
              planType: newEnterprise.planType,
              monthlyFee: newEnterprise.monthlyFee
            }
          });
        }
        resetFormAndClose();
        return;
      }

      const createdEnterprise = await ApiService.createEnterprise(newEnterprise);

      setEnterprises(prev => [createdEnterprise, ...prev]);
      if (isSuperAdmin) {
        const accessEmail = String(formData.email || '').trim();
        const adminUser = {
          name: formData.managerName,
          email: accessEmail,
          password: 'Admin123',
          role: formData.type === 'RESTAURANTE' ? 'ADMIN_RESTAURANTE' : 'ADMIN',
          enterpriseIds: [createdEnterprise.id],
          isActive: true
        };

        await ApiService.createUser(adminUser);
        appendSaasAuditLog({
          actorName: currentUser.name,
          actorRole: String(currentUser.role || ''),
          module: 'CLIENTES',
          action: 'SAAS_CLIENT_CREATED',
          entityType: 'ENTERPRISE',
          entityId: createdEnterprise.id,
          enterpriseId: createdEnterprise.id,
          enterpriseName: createdEnterprise.name,
          summary: 'Novo cliente SaaS criado',
          metadata: {
            planType: createdEnterprise.planType,
            monthlyFee: createdEnterprise.monthlyFee
          }
        });
        setSuccessData({ email: accessEmail, pass: 'Admin123' });
        return;
      }
      resetFormAndClose();
    } catch (err) {
      console.error('Erro ao criar empresa:', err);
      alert('Erro ao criar empresa. Tente novamente.');
    }
  };

  const handleDocumentBlur = async () => {
    const docDigits = onlyDigits(formData.document);
    if (docDigits.length !== 14) return;
    setIsCnpjLookupLoading(true);
    try {
      const cnpjData = await ApiService.lookupEnterpriseByCnpj(docDigits);
      setFormData((prev) => ({
        ...prev,
        nomeFantasia: prev.nomeFantasia || String(cnpjData?.name || cnpjData?.legalName || ''),
        managerName: prev.managerName || String(cnpjData?.managerName || ''),
        email: prev.email || String(cnpjData?.email || ''),
        phone1: prev.phone1 || String(cnpjData?.phone1 || ''),
        phone2: prev.phone2 || String(cnpjData?.phone2 || ''),
      }));
    } catch (err) {
      console.error('Erro ao integrar CNPJ:', err);
    } finally {
      setIsCnpjLookupLoading(false);
    }
  };

  const handleCepBlur = async () => {
    const cepDigits = onlyDigits(formData.cep);
    if (cepDigits.length !== 8) return;
    setIsCepLookupLoading(true);
    try {
      const cepData = await ApiService.lookupAddressByCep(cepDigits);
      setFormData((prev) => ({
        ...prev,
        cep: formatCep(String(cepData?.cep || cepDigits)),
        street: prev.street || String(cepData?.street || ''),
        neighborhood: prev.neighborhood || String(cepData?.neighborhood || ''),
        city: prev.city || String(cepData?.city || ''),
        state: prev.state || String(cepData?.state || ''),
      }));
    } catch (err) {
      console.error('Erro ao integrar CEP:', err);
    } finally {
      setIsCepLookupLoading(false);
    }
  };

  const handleLogoFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      setFormData((prev) => ({ ...prev, logo: dataUrl }));
    } catch (err) {
      console.error('Erro ao carregar logo:', err);
      alert('Nao foi possivel carregar a imagem da logo.');
    } finally {
      event.target.value = '';
    }
  };

  const resetFormAndClose = () => {
    setFormData({
      type: 'CANTINA',
      nomeFantasia: '',
      managerName: '',
      document: '',
      logo: '',
      phone1: '',
      phone2: '',
      attachedSchoolName: '',
      email: '',
      cep: '',
      street: '',
      number: '',
      neighborhood: '',
      city: '',
      state: '',
      planType: 'BASIC',
      monthlyFee: 197.00
    });
    setEditingEnterprise(null);
    setSuccessData(null);
    setIsModalOpen(false);
  };

  const handleOpenCreateModal = () => {
    if (isOwner && showFirstAccessGuide) {
      const storageKey = `owner_first_access_guide_seen_${currentUser?.id || 'unknown'}`;
      localStorage.setItem(storageKey, '1');
      setShowFirstAccessGuide(false);
    }

    const ownerDocument = String(currentUser?.document || '').trim();
    const ownerName = String(currentUser?.name || '').trim();

    setFormData({
      type: 'CANTINA',
      nomeFantasia: '',
      managerName: isOwner ? ownerName : '',
      document: isOwner ? formatCpfCnpj(ownerDocument) : '',
      logo: '',
      phone1: '',
      phone2: '',
      attachedSchoolName: '',
      email: '',
      cep: '',
      street: '',
      number: '',
      neighborhood: '',
      city: '',
      state: '',
      planType: 'BASIC',
      monthlyFee: 197.00
    });

    setEditingEnterprise(null);
    setSuccessData(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (enterprise: Enterprise) => {
    const addressParts = parseAddressParts(enterprise.address);
    const normalizedPlan = normalizePlanType(enterprise.planType);
    setEditingEnterprise(enterprise);
    setSuccessData(null);
    setFormData({
      type: enterprise.type,
      nomeFantasia: enterprise.name || '',
      managerName: enterprise.ownerName || enterprise.managerName || '',
      document: enterprise.document || '',
      logo: String(enterprise.logo || '').trim(),
      phone1: enterprise.phone1 || '',
      phone2: enterprise.phone2 || '',
      attachedSchoolName: enterprise.attachedSchoolName || '',
      email: '',
      cep: addressParts.cep,
      street: addressParts.street,
      number: addressParts.number,
      neighborhood: addressParts.neighborhood,
      city: addressParts.city,
      state: addressParts.state,
      planType: normalizedPlan,
      monthlyFee: Number(enterprise.monthlyFee || getDefaultFeeByPlan(normalizedPlan))
    });
    setIsModalOpen(true);
  };

  const updateServiceStatus = async (enterprise: Enterprise, nextStatus: Enterprise['serviceStatus']) => {
    try {
      const updated = await ApiService.updateEnterprise(enterprise.id, {
        ...enterprise, 
        serviceStatus: nextStatus,
        isActive: nextStatus !== 'CANCELADO'
      });
      setEnterprises(prev => prev.map(e => e.id === enterprise.id ? updated : e));
      if (isSuperAdmin) {
        appendSaasAuditLog({
          actorName: currentUser.name,
          actorRole: String(currentUser.role || ''),
          module: 'CLIENTES',
          action: 'SAAS_CLIENT_STATUS_CHANGED',
          entityType: 'ENTERPRISE',
          entityId: enterprise.id,
          enterpriseId: enterprise.id,
          enterpriseName: enterprise.name,
          summary: `Status do serviÃ§o alterado para ${nextStatus}`,
          metadata: {
            fromStatus: enterprise.serviceStatus || 'ATIVO',
            toStatus: nextStatus
          }
        });
      }
    } catch (err) {
      console.error('Erro ao atualizar status da empresa:', err);
      alert('Erro ao atualizar status. Tente novamente.');
    }
  };

  const handleDeleteEnterprise = async (enterprise: Enterprise) => {
    const confirmed = window.confirm(`Deseja excluir o cliente SaaS "${enterprise.name}"? Essa aÃ§Ã£o Ã© irreversÃ­vel.`);
    if (!confirmed) return;
    try {
      await ApiService.deleteEnterprise(enterprise.id);
      setEnterprises((prev) => prev.filter((item) => item.id !== enterprise.id));
      if (isSuperAdmin) {
        appendSaasAuditLog({
          actorName: currentUser.name,
          actorRole: String(currentUser.role || ''),
          module: 'CLIENTES',
          action: 'SAAS_CLIENT_DELETED',
          entityType: 'ENTERPRISE',
          entityId: enterprise.id,
          enterpriseId: enterprise.id,
          enterpriseName: enterprise.name,
          summary: 'Cliente SaaS excluÃ­do',
          metadata: {
            planType: enterprise.planType,
            monthlyFee: enterprise.monthlyFee
          }
        });
      }
    } catch (err) {
      console.error('Erro ao excluir empresa:', err);
      alert('Erro ao excluir empresa. Tente novamente.');
    }
  };

  return (
    <div className="dash-shell enterprise-shell">
      
      <header className="dash-header">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-600 rounded-2xl text-white shadow-xl shadow-indigo-100">
              <Building2 size={32} />
            </div>
            <div>
              <h1 className="dash-title">
                {isSuperAdmin ? 'GestÃ£o de Clientes SaaS' : 'Minhas Unidades'}
              </h1>
              <p className="dash-subtitle">
                {isSuperAdmin ? 'Console de AdministraÃ§Ã£o Global do Sistema' : 'Gerenciamento de Unidades Operacionais'}
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={handleOpenCreateModal}
          className={`bg-indigo-600 text-white px-4 py-2.5 rounded-xl font-black uppercase tracking-widest text-[11px] shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center gap-2 ${showFirstAccessGuide ? 'animate-pulse ring-4 ring-indigo-200 ring-offset-2' : ''}`}
        >
          <Plus size={14} /> {isSuperAdmin ? 'Cadastrar Novo Cliente SaaS' : 'Cadastrar Nova Unidade'}
        </button>
      </header>

      {showFirstAccessGuide && isOwner && (
        <div className="rounded-2xl border-2 border-indigo-200 bg-indigo-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 animate-pulse">
          <div className="flex items-start gap-2">
            <Sparkles size={16} className="text-indigo-600 mt-0.5" />
            <div>
              <p className="text-[11px] font-black uppercase tracking-wider text-indigo-700">Primeiro acesso do dono de rede</p>
              <p className="text-sm font-bold text-indigo-900">Comece por aqui: clique em <strong>Cadastrar Nova Unidade</strong> para fazer a configuraÃ§Ã£o inicial da sua conta.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              const storageKey = `owner_first_access_guide_seen_${currentUser?.id || 'unknown'}`;
              localStorage.setItem(storageKey, '1');
              setShowFirstAccessGuide(false);
            }}
            className="self-start sm:self-auto px-3 py-1.5 rounded-lg border border-indigo-200 bg-white text-indigo-700 text-[11px] font-black uppercase tracking-wider hover:bg-indigo-100 transition-all"
          >
            Entendi
          </button>
        </div>
      )}

      {isSuperAdmin && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
           <SaaSStatCard title="MRR Total" value={`R$ ${stats.totalMRR.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} icon={<DollarSign className="text-emerald-500" />} />
           <SaaSStatCard title="LicenÃ§as Ativas" value={stats.active.toString()} icon={<CheckCircle2 className="text-indigo-500" />} />
           <SaaSStatCard title="InadimplÃªncia" value={stats.pending.toString()} icon={<AlertCircle className="text-red-500" />} />
           <SaaSStatCard title="Total Clientes" value={stats.total.toString()} icon={<Users className="text-blue-500" />} />
        </div>
      )}

      <div className="dash-filterbar flex flex-col md:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input type="text" placeholder="Buscar por nome, dono, endereÃ§o ou CNPJ..." className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border-transparent border focus:border-indigo-500 rounded-xl outline-none font-bold text-xs transition-all" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}/>
        </div>
      </div>

      {isOwner ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left">
              <thead className="bg-indigo-50/60 border-b border-indigo-100">
                <tr className="text-[10px] font-black uppercase tracking-widest text-indigo-700">
                  <th className="px-4 py-3">Unidade</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Endereco</th>
                  <th className="px-4 py-3">WhatsApp</th>
                  <th className="px-4 py-3">Gerente</th>
                  <th className="px-4 py-3">Instituicao</th>
                  <th className="px-4 py-3 text-right">Acoes</th>
                </tr>
              </thead>
              <tbody>
                {filteredEnterprises.map((ent) => (
                  <tr key={ent.id} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg text-[11px] font-black ${ent.isActive ? 'bg-indigo-50 text-indigo-600' : 'bg-gray-100 text-gray-400'}`}>
                          {ent.name.charAt(0)}
                        </span>
                        <span className="text-xs font-black text-gray-900 uppercase">{ent.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest border ${ent.type === 'CANTINA' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-orange-50 text-orange-600 border-orange-100'}`}>
                        {ent.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs font-semibold text-gray-600 max-w-[300px] truncate">{ent.address}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-gray-600">{ent.phone1 || 'Sem WhatsApp'}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-gray-600">{ent.managerName || 'Nao definido'}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-gray-600">{ent.attachedSchoolName || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => handleOpenEditModal(ent)} className="p-1.5 text-indigo-500 bg-white border rounded-lg shadow-sm hover:bg-indigo-50" title="Editar"><Edit size={12} /></button>
                        <button
                          onClick={() => handleOpenEditModal(ent)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-black text-slate-600 uppercase tracking-widest rounded-lg border border-slate-200 hover:bg-slate-50"
                          title="Dados da empresa"
                        >
                          Dados Empresa
                        </button>
                        <button
                          onClick={() => {
                            if (onSelectEnterprise) onSelectEnterprise(ent);
                            navigate('/pos');
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-black text-indigo-600 uppercase tracking-widest rounded-lg border border-indigo-200 hover:bg-indigo-50"
                          title="Acessar painel"
                        >
                          Painel <ExternalLink size={11} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredEnterprises.map(ent => (
            <div key={ent.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-lg transition-all group border-b-4 border-b-indigo-500/10 flex flex-col">
              <div className="p-4 flex-1">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-lg transition-transform group-hover:rotate-3 ${ent.isActive ? 'bg-indigo-50 text-indigo-600' : 'bg-gray-100 text-gray-400'}`}>{ent.name.charAt(0)}</div>
                    <div>
                      <h3 className="text-base font-black text-gray-900 tracking-tighter uppercase leading-tight">{ent.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest border ${ent.type === 'CANTINA' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-orange-50 text-orange-600 border-orange-100'}`}>{ent.type}</span>
                        {!ent.isActive && <span className="text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest bg-red-50 text-red-500 border border-red-100">Inativo</span>}
                        {isSuperAdmin && (
                          <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest border ${
                            (ent.serviceStatus || 'ATIVO') === 'ATIVO'
                              ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                              : (ent.serviceStatus || '') === 'PAUSADO'
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-red-50 text-red-600 border-red-100'
                          }`}>
                            {ent.serviceStatus || 'ATIVO'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                    {isSuperAdmin && (
                      <button
                        onClick={() => updateServiceStatus(ent, (ent.serviceStatus || 'ATIVO') === 'PAUSADO' ? 'ATIVO' : 'PAUSADO')}
                        className={`p-1.5 rounded-lg transition-all shadow-sm bg-white border ${
                          (ent.serviceStatus || 'ATIVO') === 'PAUSADO' ? 'text-emerald-500 hover:bg-emerald-50' : 'text-amber-600 hover:bg-amber-50'
                        }`}
                        title={(ent.serviceStatus || 'ATIVO') === 'PAUSADO' ? 'Reativar serviço' : 'Pausar serviço'}
                      >
                        {(ent.serviceStatus || 'ATIVO') === 'PAUSADO' ? <Power size={12} /> : <PowerOff size={12} />}
                      </button>
                    )}
                    <button onClick={() => handleOpenEditModal(ent)} className="p-1.5 text-indigo-400 bg-white border rounded-lg shadow-sm hover:bg-indigo-50" title="Editar"><Edit size={12} /></button>
                    {isSuperAdmin && (
                      <button onClick={() => handleDeleteEnterprise(ent)} className="p-1.5 text-red-500 bg-white border rounded-lg shadow-sm hover:bg-red-50" title="Excluir"><X size={12} /></button>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-3 text-gray-500 text-xs font-bold">
                    <MapPin size={14} className="text-indigo-400" />
                    <span className="truncate">{ent.address}</span>
                  </div>
                  <div className="flex items-center gap-3 text-gray-500 text-xs font-bold">
                    <Smartphone size={14} className="text-emerald-500" />
                    <span>{ent.phone1 || 'Sem WhatsApp'}</span>
                  </div>
                  <div className="flex items-center gap-3 text-gray-500 text-xs font-bold">
                    <UserCircle size={14} className="text-indigo-400" />
                    <span>{isSuperAdmin ? `Dono: ${ent.ownerName}` : `Gerente: ${ent.managerName || 'Não definido'}`}</span>
                  </div>
                  {ent.attachedSchoolName && (
                    <div className="flex items-center gap-3 text-gray-500 text-xs font-bold">
                      <School size={14} className="text-indigo-400" />
                      <span>Instituição: {ent.attachedSchoolName}</span>
                    </div>
                  )}
                  {isSuperAdmin && (
                    <div className="flex items-center gap-3 text-gray-500 text-xs font-bold pt-2 border-t border-gray-50 mt-2">
                      <Sparkles size={14} className="text-amber-500" />
                      <span className="uppercase tracking-widest text-[10px]">Plano {ent.planType} - R$ {ent.monthlyFee?.toFixed(2)}/mes</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="px-4 py-3 bg-indigo-50/30 flex items-center justify-center border-t border-gray-100">
                <button
                  onClick={() => {
                    if (onSelectEnterprise) {
                      onSelectEnterprise(ent);
                    }
                    navigate('/');
                  }}
                  className="flex items-center gap-2 text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:underline"
                >
                  ACESSAR PAINEL <ExternalLink size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {isModalOpen && (
        <div className="fixed inset-0 z-[1000] flex items-start justify-center p-4 overflow-y-auto">
           <div className="absolute inset-0 bg-indigo-950/60 backdrop-blur-sm animate-in fade-in" onClick={resetFormAndClose}></div>
           <div className="relative my-4 w-full max-w-3xl bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col h-[calc(100vh-2rem)] max-h-[95vh]">
              
              {!successData ? (
                <form onSubmit={handleSaveEnterprise} className="flex flex-col flex-1 min-h-0">
                  <div className="bg-indigo-600 p-5 text-white flex items-center justify-between shrink-0">
                     <div className="flex items-center gap-3">
                        <div className="w-11 h-11 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-md border border-white/20">
                          <Store size={22} />
                        </div>
                        <div>
                           <h2 className="text-xl font-black uppercase tracking-tight leading-none">
                             {editingEnterprise ? (isSuperAdmin ? 'Editar Cliente SaaS' : 'Editar Unidade') : (isSuperAdmin ? 'Novo Cliente SaaS' : 'Novo Registro de Filial')}
                           </h2>
                           <p className="text-[10px] font-bold text-indigo-100 uppercase tracking-widest mt-1">
                             {editingEnterprise ? 'AtualizaÃ§Ã£o de dados cadastrais e contrato' : (isSuperAdmin ? 'ConfiguraÃ§Ã£o de LicenÃ§a e Acesso Master' : 'Escolha Ãºnica de operaÃ§Ã£o e endereÃ§o')}
                           </p>
                        </div>
                     </div>
                     <button type="button" onClick={resetFormAndClose} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X size={22} /></button>
                  </div>

                  <div className="p-5 space-y-5 flex-1 min-h-0 overflow-y-auto overscroll-contain">
                     <div className="space-y-3 pt-1">
                        <label className="text-[11px] font-black text-gray-400 uppercase tracking-[3px] block text-center">Logo da Empresa (Matriz/Filial)</label>
                        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                          <div className="h-20 w-20 rounded-xl border border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center">
                            {String(formData.logo || '').trim() ? (
                              <img src={String(formData.logo || '').trim()} alt="Logo empresa" className="h-full w-full object-cover" />
                            ) : (
                              <ImageIcon size={18} className="text-gray-400" />
                            )}
                          </div>
                          <div className="flex flex-col items-center sm:items-start gap-2">
                            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-indigo-200 text-indigo-600 text-[10px] font-black uppercase tracking-widest cursor-pointer hover:bg-indigo-50">
                              <Upload size={12} />
                              Enviar Logo
                              <input type="file" accept="image/*" className="hidden" onChange={handleLogoFileChange} />
                            </label>
                            <button
                              type="button"
                              onClick={() => setFormData((prev) => ({ ...prev, logo: '' }))}
                              className="text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-red-500"
                            >
                              Remover
                            </button>
                          </div>
                        </div>
                     </div>
                     {/* Escolha de Tipo de Unidade */}
                     <div className="space-y-4">
                        <label className="text-[11px] font-black text-gray-400 uppercase tracking-[3px] block text-center">Tipo de Unidade Operacional *</label>
                        <div className="flex bg-gray-100 p-1 rounded-xl max-w-sm mx-auto border border-gray-100">
                           <button 
                             type="button"
                             onClick={() => setFormData({...formData, type: 'CANTINA'})}
                             className={`flex-1 py-2.5 rounded-lg font-black text-[11px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${formData.type === 'CANTINA' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-gray-600'}`}
                           >
                             <Store size={16} /> Cantina
                           </button>
                           <button 
                             type="button"
                             onClick={() => setFormData({...formData, type: 'RESTAURANTE'})}
                             className={`flex-1 py-2.5 rounded-lg font-black text-[11px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${formData.type === 'RESTAURANTE' ? 'bg-orange-500 text-white shadow-lg' : 'text-gray-400 hover:text-gray-600'}`}
                           >
                             <Utensils size={16} /> Restaurante
                           </button>
                        </div>
                     </div>

                    {/* InformaÃ§Ãµes da Filial */}
                     <div className="space-y-4 pt-3 border-t border-gray-50">
                        <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-[4px] border-b pb-2 flex items-center gap-2">
                           <ShieldCheck size={14}/> Dados Gerais
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <InputField
                          label="CNPJ/CPF *"
                          value={formData.document}
                          onChange={(v:string) => setFormData({...formData, document: formatCpfCnpj(v)})}
                          onBlur={handleDocumentBlur}
                          required
                          placeholder={formData.type === 'RESTAURANTE' ? '00.000.000/0001-00 ou 000.000.000-00' : '00.000.000/0001-00'}
                          helperText={isCnpjLookupLoading ? 'Consultando dados no CNPJ...' : 'Ao informar CNPJ vÃ¡lido, somente os dados da empresa sÃ£o preenchidos (endereÃ§o nÃ£o Ã© preenchido).'}
                        />
                        <InputField
                          label="Nome/RazÃ£o Social *"
                          value={formData.nomeFantasia}
                          onChange={(v:string) => setFormData({...formData, nomeFantasia: v})}
                          required
                          placeholder={formData.type === 'RESTAURANTE' ? 'Ex: Restaurante Sabor da Serra LTDA' : 'Ex: Cantina Central Alpha LTDA'}
                        />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <InputField label={isSuperAdmin ? "Nome do ProprietÃ¡rio *" : "Nome do Gerente ResponsÃ¡vel *"} value={formData.managerName} onChange={(v:string) => setFormData({...formData, managerName: v})} required placeholder={formData.type === 'RESTAURANTE' ? 'Nome do gerente do restaurante' : 'Nome completo do responsÃ¡vel'} />
                           {isSuperAdmin ? (
                             <InputField label="E-mail de Acesso (Login) *" type="email" value={formData.email} onChange={(v:string) => setFormData({...formData, email: v})} required placeholder="exemplo@email.com" />
                           ) : (
                             <div className="space-y-1.5">
                               <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">E-mail de Acesso</label>
                               <div className="w-full px-4 py-2.5 bg-gray-100 border border-gray-100 rounded-xl text-[11px] font-bold text-gray-500">
                                 Gerado automaticamente pelo sistema
                               </div>
                             </div>
                           )}
                        </div>
                        
                        {formData.type === 'CANTINA' && (
                           <div className="animate-in slide-in-from-top-2 duration-300">
                             <InputField label="Nome da InstituiÃ§Ã£o Anexada *" value={formData.attachedSchoolName} onChange={(v:string) => setFormData({...formData, attachedSchoolName: v})} required placeholder="Ex: ColÃ©gio Anglo Premium" icon={<School className="text-indigo-400" size={18}/>} />
                           </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                           <InputField label="WhatsApp da Unidade *" value={formData.phone1} onChange={(v:string) => setFormData({...formData, phone1: v})} required placeholder="(00) 90000-0000" />
                           <InputField label="Telefone Contato" value={formData.phone2} onChange={(v:string) => setFormData({...formData, phone2: v})} placeholder="(00) 0000-0000" />
                        </div>
                     </div>

                     {isSuperAdmin && (
                        <div className="space-y-4 pt-3 border-t border-gray-50">
                           <h3 className="text-[10px] font-black text-amber-500 uppercase tracking-[4px] border-b pb-2 flex items-center gap-2">
                              <Sparkles size={14}/> ConfiguraÃ§Ã£o SaaS
                           </h3>
                           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                             <div className="space-y-1.5">
                                 <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Plano de LicenÃ§a *</label>
                                 <select 
                                    value={formData.planType}
                                    onChange={e => {
                                      const nextPlan = e.target.value as 'BASIC' | 'PREMIUM';
                                      setFormData({...formData, planType: nextPlan, monthlyFee: getDefaultFeeByPlan(nextPlan)});
                                    }}
                                    className="w-full px-4 py-2.5 bg-gray-50 border border-transparent focus:border-indigo-500 rounded-xl outline-none font-bold text-gray-800 transition-all shadow-inner text-sm"
                                 >
                                    <option value="BASIC">BÃSICO - R$ 197</option>
                                    <option value="PREMIUM">PREMIUM - R$ 397</option>
                                 </select>
                              </div>
                              <InputField label="Mensalidade (R$) *" type="number" value={formData.monthlyFee.toString()} onChange={(v:string) => setFormData({...formData, monthlyFee: parseFloat(v) || 0})} required placeholder="450.00" />
                           </div>
                        </div>
                     )}

                     {/* EndereÃ§o Operacional Detalhado */}
                     <div className="space-y-4 pt-3 border-t border-gray-50">
                        <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-[4px] border-b pb-2 flex items-center gap-2">
                           <MapIcon size={14}/> EndereÃ§o Operacional
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                           <div className="md:col-span-1">
                             <InputField
                               label="CEP *"
                               value={formData.cep}
                               onChange={(v:string) => setFormData({...formData, cep: formatCep(v)})}
                               onBlur={handleCepBlur}
                               required
                               placeholder="00000-000"
                               helperText={isCepLookupLoading ? 'Consultando endereÃ§o pelo CEP...' : 'Ao informar CEP vÃ¡lido, o endereÃ§o Ã© preenchido automaticamente.'}
                             />
                           </div>
                           <div className="md:col-span-2">
                             <InputField label="Logradouro (Rua/Av) *" value={formData.street} onChange={(v:string) => setFormData({...formData, street: v})} required placeholder="Rua das Flores" />
                           </div>
                           <div className="md:col-span-1">
                             <InputField label="NÃºmero *" value={formData.number} onChange={(v:string) => setFormData({...formData, number: v})} required placeholder="123" />
                           </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                           <InputField label="Bairro *" value={formData.neighborhood} onChange={(v:string) => setFormData({...formData, neighborhood: v})} required placeholder="Centro" />
                           <InputField label="Cidade *" value={formData.city} onChange={(v:string) => setFormData({...formData, city: v})} required placeholder="SÃ£o Paulo" />
                           <InputField label="Estado (UF) *" value={formData.state} onChange={(v:string) => setFormData({...formData, state: v})} required placeholder="SP" />
                        </div>
                     </div>
                  </div>

                  <div className="p-5 bg-gray-50 border-t flex items-center justify-end gap-4 shrink-0">
                     <button type="button" onClick={resetFormAndClose} className="px-6 py-3 text-[11px] font-black text-gray-400 uppercase tracking-widest hover:text-gray-600 transition-colors">Descartar</button>
                     <button type="submit" className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-black uppercase tracking-widest text-[11px] shadow-lg shadow-indigo-100 hover:bg-indigo-700 active:scale-95 transition-all flex items-center justify-center gap-2">
                        <Save size={16} /> {editingEnterprise ? 'Salvar AlteraÃ§Ãµes' : (isSuperAdmin ? 'Ativar LicenÃ§a SaaS' : 'Salvar e Gerar LicenÃ§a')}
                     </button>
                  </div>
                </form>
              ) : (
                <div className="p-8 flex flex-col items-center text-center space-y-6 animate-in zoom-in-95">
                   <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center shadow-inner ring-4 ring-emerald-50">
                      <CheckCircle2 size={30} />
                   </div>
                   <div className="space-y-2">
                      <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tight">
                        {isSuperAdmin ? 'Cliente Ativado!' : 'Unidade Ativada!'}
                      </h2>
                      <p className="text-gray-500 font-medium max-w-md mx-auto">
                        {isSuperAdmin ? 'A licenÃ§a SaaS foi gerada com sucesso. O cliente jÃ¡ pode acessar o console de proprietÃ¡rio.' : 'A filial foi registrada com sucesso. Utilize as credenciais abaixo para o primeiro acesso da unidade.'}
                      </p>
                   </div>

                   <div className="w-full max-w-md bg-indigo-50 rounded-2xl p-5 border border-indigo-100 space-y-4 relative overflow-hidden">
                      <div className="space-y-5 relative z-10 text-left">
                         <div className="space-y-1">
                            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest ml-1">E-mail de Login</p>
                            <div className="w-full flex items-center justify-between bg-white px-4 py-3 rounded-xl border border-indigo-100 shadow-sm">
                               <span className="font-bold text-gray-700 text-sm">{successData.email}</span>
                               <button onClick={() => {navigator.clipboard.writeText(successData.email); alert('Copiado!')}} className="text-indigo-400 hover:text-indigo-600 p-1.5"><Copy size={14}/></button>
                            </div>
                         </div>
                         <div className="space-y-1">
                            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest ml-1">Senha PadrÃ£o</p>
                            <div className="w-full flex items-center justify-between bg-white px-4 py-3 rounded-xl border border-indigo-100 shadow-sm">
                               <span className="font-black text-indigo-600 text-base tracking-widest">{successData.pass}</span>
                               <button onClick={() => {navigator.clipboard.writeText(successData.pass); alert('Copiado!')}} className="text-indigo-400 hover:text-indigo-600 p-1.5"><Copy size={14}/></button>
                            </div>
                         </div>
                      </div>
                   </div>

                   <button onClick={resetFormAndClose} className="px-10 py-3 bg-indigo-600 text-white rounded-xl font-black uppercase text-[11px] tracking-widest shadow-lg hover:bg-indigo-700 active:scale-95 transition-all flex items-center gap-2">
                      Concluir e Voltar <ArrowRight size={16} />
                   </button>
                </div>
              )}
           </div>
        </div>
      )}
    </div>
  );
};

const SaaSStatCard = ({ title, value, icon }: any) => (
  <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg transition-all group">
    <div className="flex items-center justify-between mb-4">
      <div className="p-2.5 bg-gray-50 rounded-xl group-hover:scale-110 transition-transform">
        {React.cloneElement(icon as React.ReactElement, { size: 18, strokeWidth: 3 })}
      </div>
    </div>
    <p className="text-gray-400 text-[9px] font-black uppercase tracking-[0.14em] mb-1">{title}</p>
    <p className="text-2xl font-black text-gray-900 tracking-tighter leading-none">{value}</p>
  </div>
);

const InputField = ({ label, value, onChange, onBlur, placeholder, type = "text", required = false, icon, helperText }: any) => (
  <div className="space-y-1.5 relative">
    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">{label}</label>
    <div className="relative">
      {icon && <div className="absolute left-3 top-1/2 -translate-y-1/2">{icon}</div>}
      <input 
        type={type}
        required={required}
        value={value} 
        onChange={e => onChange(e.target.value)} 
        onBlur={onBlur}
        className={`w-full ${icon ? 'pl-10 pr-3' : 'px-4'} py-2.5 bg-gray-50 border border-transparent focus:border-indigo-500 rounded-xl outline-none font-bold text-gray-800 text-sm transition-all shadow-inner focus:bg-white`} 
        placeholder={placeholder} 
      />
    </div>
    {helperText && <p className="text-[10px] font-semibold text-gray-400 ml-1">{helperText}</p>}
  </div>
);

export default EnterprisesPage;

