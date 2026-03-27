import React, { useState, useEffect } from 'react';
import {
  User, Mail, Phone, MapPin, Lock, Save, AlertCircle, CheckCircle,
  Eye, EyeOff, Building2
} from 'lucide-react';
import { User as UserType, Enterprise } from '../types';
import ApiService from '../services/api';
import notificationService from '../services/notificationService';

interface OwnerProfilePageProps {
  currentUser: UserType;
  enterprises: Enterprise[];
}

type ActiveTab = 'DADOS_PESSOAIS' | 'EMPRESA' | 'SENHA';

const OwnerProfilePage: React.FC<OwnerProfilePageProps> = ({ currentUser, enterprises }) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('DADOS_PESSOAIS');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Dados Pessoais
  const [name, setName] = useState(currentUser?.name || '');
  const [email, setEmail] = useState(currentUser?.email || '');
  const [phone, setPhone] = useState(currentUser?.phone || '');

  // Empresa
  const [selectedEnterpriseId, setSelectedEnterpriseId] = useState(enterprises[0]?.id || '');
  const [enterpriseName, setEnterpriseName] = useState('');
  const [enterpriseAddress, setEnterpriseAddress] = useState('');
  const [enterprisePhone, setEnterprisePhone] = useState('');

  // Senha
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Load enterprise data when selected
  useEffect(() => {
    if (selectedEnterpriseId) {
      const enterprise = enterprises.find(e => e.id === selectedEnterpriseId);
      if (enterprise) {
        setEnterpriseName(enterprise.name || '');
        setEnterpriseAddress(enterprise.address || '');
        setEnterprisePhone(enterprise.phone1 || '');
      }
    }
  }, [selectedEnterpriseId, enterprises]);

  const handleSavePersonalData = async () => {
    if (!name || !email || !phone) {
      notificationService.alerta('Erro', 'Preencha todos os campos');
      return;
    }

    try {
      setSaving(true);
      await ApiService.updateUser(currentUser.id, {
        name,
        email,
        phone,
      });
      notificationService.informativo('Sucesso', 'Dados pessoais atualizado com sucesso');
    } catch (err) {
      notificationService.alerta('Erro', 'Erro ao atualizar dados pessoais');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEnterpriseData = async () => {
    if (!enterpriseName || !enterpriseAddress || !enterprisePhone) {
      notificationService.alerta('Erro', 'Preencha todos os campos da empresa');
      return;
    }

    try {
      setSaving(true);
      await ApiService.updateEnterprise(selectedEnterpriseId, {
        name: enterpriseName,
        address: enterpriseAddress,
        phone1: enterprisePhone,
      });
      notificationService.informativo('Sucesso', 'Dados da empresa atualizado com sucesso');
    } catch (err) {
      notificationService.alerta('Erro', 'Erro ao atualizar dados da empresa');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      notificationService.alerta('Erro', 'Preencha todos os campos de senha');
      return;
    }

    if (newPassword !== confirmPassword) {
      notificationService.alerta('Erro', 'Senhas não conferem');
      return;
    }

    if (newPassword.length < 6) {
      notificationService.alerta('Erro', 'Senha deve ter no mínimo 6 caracteres');
      return;
    }

    try {
      setSaving(true);
      await ApiService.updateUser(currentUser.id, {
        password: newPassword,
      });
      notificationService.informativo('Sucesso', 'Senha atualizada com sucesso');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      notificationService.alerta('Erro', 'Erro ao atualizar senha');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tighter uppercase mb-2">
          Meu Perfil
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Gerencie suas informações pessoais e da empresa</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200 dark:border-white/10">
        <button
          onClick={() => setActiveTab('DADOS_PESSOAIS')}
          className={`px-4 py-3 font-black text-xs uppercase tracking-wider transition-all border-b-2 ${
            activeTab === 'DADOS_PESSOAIS'
              ? 'text-indigo-600 dark:text-indigo-400 border-b-indigo-600 dark:border-b-indigo-400'
              : 'text-gray-600 dark:text-gray-400 border-b-transparent hover:text-gray-900 dark:hover:text-gray-200'
          }`}
        >
          <User size={16} className="inline mr-2" /> Dados Pessoais
        </button>
        <button
          onClick={() => setActiveTab('EMPRESA')}
          className={`px-4 py-3 font-black text-xs uppercase tracking-wider transition-all border-b-2 ${
            activeTab === 'EMPRESA'
              ? 'text-indigo-600 dark:text-indigo-400 border-b-indigo-600 dark:border-b-indigo-400'
              : 'text-gray-600 dark:text-gray-400 border-b-transparent hover:text-gray-900 dark:hover:text-gray-200'
          }`}
        >
          <Building2 size={16} className="inline mr-2" /> Empresa
        </button>
        <button
          onClick={() => setActiveTab('SENHA')}
          className={`px-4 py-3 font-black text-xs uppercase tracking-wider transition-all border-b-2 ${
            activeTab === 'SENHA'
              ? 'text-indigo-600 dark:text-indigo-400 border-b-indigo-600 dark:border-b-indigo-400'
              : 'text-gray-600 dark:text-gray-400 border-b-transparent hover:text-gray-900 dark:hover:text-gray-200'
          }`}
        >
          <Lock size={16} className="inline mr-2" /> Senha
        </button>
      </div>

      {/* Content */}
      <div className="bg-white dark:bg-zinc-800 rounded-xl border border-gray-200 dark:border-white/10 p-6">
        {/* DADOS PESSOAIS */}
        {activeTab === 'DADOS_PESSOAIS' && (
          <div className="space-y-6 max-w-2xl">
            <div>
              <label className="block text-xs font-black text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2">
                <User size={14} className="inline mr-2" /> Nome Completo
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Seu nome completo"
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-white/10 bg-white dark:bg-zinc-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>

            <div>
              <label className="block text-xs font-black text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2">
                <Mail size={14} className="inline mr-2" /> Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-white/10 bg-white dark:bg-zinc-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>

            <div>
              <label className="block text-xs font-black text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2">
                <Phone size={14} className="inline mr-2" /> Telefone
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(48) 99999-9999"
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-white/10 bg-white dark:bg-zinc-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>

            <button
              onClick={handleSavePersonalData}
              disabled={saving}
              className="w-full mt-6 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white font-black uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-2"
            >
              <Save size={18} /> {saving ? 'Salvando...' : 'Salvar Dados Pessoais'}
            </button>
          </div>
        )}

        {/* EMPRESA */}
        {activeTab === 'EMPRESA' && (
          <div className="space-y-6 max-w-2xl">
            <div>
              <label className="block text-xs font-black text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2">
                Selecione uma Empresa
              </label>
              <select
                value={selectedEnterpriseId}
                onChange={(e) => setSelectedEnterpriseId(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-white/10 bg-white dark:bg-zinc-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
              >
                {enterprises.map((ent) => (
                  <option key={ent.id} value={ent.id}>
                    {ent.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-black text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2">
                <Building2 size={14} className="inline mr-2" /> Nome da Empresa
              </label>
              <input
                type="text"
                value={enterpriseName}
                onChange={(e) => setEnterpriseName(e.target.value)}
                placeholder="Nome da sua empresa"
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-white/10 bg-white dark:bg-zinc-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>

            <div>
              <label className="block text-xs font-black text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2">
                <MapPin size={14} className="inline mr-2" /> Endereço
              </label>
              <textarea
                value={enterpriseAddress}
                onChange={(e) => setEnterpriseAddress(e.target.value)}
                placeholder="Rua, número, bairro, cidade, estado"
                rows={3}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-white/10 bg-white dark:bg-zinc-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>

            <div>
              <label className="block text-xs font-black text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2">
                <Phone size={14} className="inline mr-2" /> Telefone
              </label>
              <input
                type="tel"
                value={enterprisePhone}
                onChange={(e) => setEnterprisePhone(e.target.value)}
                placeholder="(48) 99999-9999"
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-white/10 bg-white dark:bg-zinc-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>

            <button
              onClick={handleSaveEnterpriseData}
              disabled={saving}
              className="w-full mt-6 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white font-black uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-2"
            >
              <Save size={18} /> {saving ? 'Salvando...' : 'Salvar Dados da Empresa'}
            </button>
          </div>
        )}

        {/* SENHA */}
        {activeTab === 'SENHA' && (
          <div className="space-y-6 max-w-2xl">
            <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-lg p-4 flex gap-3">
              <AlertCircle size={20} className="text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-blue-700 dark:text-blue-300">
                Por segurança, você será desconectado após alterar sua senha.
              </p>
            </div>

            <div className="relative">
              <label className="block text-xs font-black text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2">
                <Lock size={14} className="inline mr-2" /> Senha Atual
              </label>
              <div className="relative">
                <input
                  type={showCurrentPassword ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Digite sua senha atual"
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-white/10 bg-white dark:bg-zinc-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                >
                  {showCurrentPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="relative">
              <label className="block text-xs font-black text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2">
                <Lock size={14} className="inline mr-2" /> Nova Senha
              </label>
              <div className="relative">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Digite sua nova senha"
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-white/10 bg-white dark:bg-zinc-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                >
                  {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="relative">
              <label className="block text-xs font-black text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2">
                <Lock size={14} className="inline mr-2" /> Confirmar Nova Senha
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirme sua nova senha"
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-white/10 bg-white dark:bg-zinc-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              onClick={handleChangePassword}
              disabled={saving}
              className="w-full mt-6 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white font-black uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-2"
            >
              <Lock size={18} /> {saving ? 'Alterando...' : 'Alterar Senha'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default OwnerProfilePage;
