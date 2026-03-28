import React, { useState } from 'react';
import { Mail, User, Lock, Save, Phone } from 'lucide-react';
import { User as UserType } from '../types';
import ApiService from '../services/api';
import notificationService from '../services/notificationService';

interface SuperAdminProfilePageProps {
  currentUser: UserType;
  onUserUpdated?: (nextUser: UserType) => void;
}

const isStrongPassword = (value: string) => {
  const password = String(value || '');
  return password.length >= 8
    && /[A-Z]/.test(password)
    && /[a-z]/.test(password)
    && /[0-9]/.test(password);
};

const SuperAdminProfilePage: React.FC<SuperAdminProfilePageProps> = ({ currentUser, onUserUpdated }) => {
  const [name, setName] = useState(currentUser?.name || '');
  const [email, setEmail] = useState(currentUser?.email || '');
  const [phone, setPhone] = useState(currentUser?.phone || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const handleSaveProfile = async () => {
    if (!name.trim() || !email.trim()) {
      notificationService.alerta('Campos obrigatórios', 'Informe nome e e-mail para salvar o perfil.');
      return;
    }

    try {
      setSavingProfile(true);
      const updatedUser = await ApiService.updateUser(currentUser.id, {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
      });

      const nextUser = {
        ...currentUser,
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        ...(updatedUser || {}),
      };

      if (onUserUpdated) onUserUpdated(nextUser);
      notificationService.informativo('Perfil atualizado', 'Dados do perfil salvos no backend com sucesso.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Não foi possível atualizar o perfil.';
      notificationService.critico('Falha ao atualizar perfil', message);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSavePassword = async () => {
    if (!newPassword || !confirmPassword) {
      notificationService.alerta('Senha incompleta', 'Preencha nova senha e confirmação.');
      return;
    }

    if (newPassword !== confirmPassword) {
      notificationService.alerta('Senhas diferentes', 'A confirmação da senha não confere.');
      return;
    }

    if (!isStrongPassword(newPassword)) {
      notificationService.alerta('Senha fraca', 'A senha deve ter 8+ caracteres, com maiúscula, minúscula e número.');
      return;
    }

    try {
      setSavingPassword(true);
      await ApiService.updateUser(currentUser.id, { password: newPassword });
      setNewPassword('');
      setConfirmPassword('');
      notificationService.informativo('Senha atualizada', 'Senha alterada com sucesso.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Não foi possível atualizar a senha.';
      notificationService.critico('Falha ao atualizar senha', message);
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tighter uppercase mb-2">Perfil do Super Admin</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Edite nome, e-mail e senha da conta principal.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <section className="bg-white dark:bg-zinc-800 rounded-xl border border-gray-200 dark:border-white/10 p-6 space-y-4">
          <h2 className="text-sm font-black uppercase tracking-wider text-gray-700 dark:text-gray-200">Dados do Perfil</h2>

          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-gray-600 dark:text-gray-300 mb-2">
              <User size={13} className="inline mr-1.5" /> Nome
            </label>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-white/10 bg-white dark:bg-zinc-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
              placeholder="Nome do super admin"
            />
          </div>

          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-gray-600 dark:text-gray-300 mb-2">
              <Mail size={13} className="inline mr-1.5" /> E-mail
            </label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-white/10 bg-white dark:bg-zinc-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
              placeholder="email@dominio.com"
            />
          </div>

          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-gray-600 dark:text-gray-300 mb-2">
              <Phone size={13} className="inline mr-1.5" /> Telefone
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-white/10 bg-white dark:bg-zinc-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
              placeholder="(xx) xxxxx-xxxx"
            />
          </div>

          <button
            onClick={handleSaveProfile}
            disabled={savingProfile}
            className="w-full px-4 py-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white font-black uppercase tracking-wider text-xs flex items-center justify-center gap-2"
          >
            <Save size={16} /> {savingProfile ? 'Salvando...' : 'Salvar Perfil'}
          </button>
        </section>

        <section className="bg-white dark:bg-zinc-800 rounded-xl border border-gray-200 dark:border-white/10 p-6 space-y-4">
          <h2 className="text-sm font-black uppercase tracking-wider text-gray-700 dark:text-gray-200">Alterar Senha</h2>

          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-gray-600 dark:text-gray-300 mb-2">
              <Lock size={13} className="inline mr-1.5" /> Nova senha
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-white/10 bg-white dark:bg-zinc-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
              placeholder="Nova senha"
            />
          </div>

          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-gray-600 dark:text-gray-300 mb-2">
              <Lock size={13} className="inline mr-1.5" /> Confirmar nova senha
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-white/10 bg-white dark:bg-zinc-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
              placeholder="Repita a nova senha"
            />
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold">
            A senha deve conter no mínimo 8 caracteres, incluindo letra maiúscula, minúscula e número.
          </p>

          <button
            onClick={handleSavePassword}
            disabled={savingPassword}
            className="w-full px-4 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 text-white font-black uppercase tracking-wider text-xs flex items-center justify-center gap-2"
          >
            <Lock size={16} /> {savingPassword ? 'Alterando...' : 'Salvar Nova Senha'}
          </button>
        </section>
      </div>
    </div>
  );
};

export default SuperAdminProfilePage;