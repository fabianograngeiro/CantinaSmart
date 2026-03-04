import React, { useState } from 'react';
import { Rocket, User, Mail, Lock, ArrowRight, ShieldCheck, Sparkles, CheckCircle2, Upload } from 'lucide-react';
import ApiService from '../services/api';

interface SetupPageProps {
  onSetupComplete: () => void;
}

const SetupPage: React.FC<SetupPageProps> = ({ onSetupComplete }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<'welcome' | 'form'>('welcome');

  const handleBackupFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.json')) {
      alert('Selecione um arquivo .json de backup válido.');
      return;
    }

    setIsRestoring(true);
    setError('');

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      await ApiService.restoreDatabaseBackup(parsed);
      alert('✅ Backup restaurado com sucesso! A página será recarregada.');
      window.location.reload();
    } catch (err) {
      console.error('Erro ao restaurar backup no setup:', err);
      alert('❌ Falha ao restaurar backup. Verifique se o arquivo está correto.');
    } finally {
      setIsRestoring(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validações
    if (!name || !email || !password || !confirmPassword) {
      setError('Todos os campos são obrigatórios');
      return;
    }

    if (password.length < 6) {
      setError('A senha deve ter no mínimo 6 caracteres');
      return;
    }

    if (password !== confirmPassword) {
      setError('As senhas não coincidem');
      return;
    }

    if (!email.includes('@')) {
      setError('Email inválido');
      return;
    }

    setIsLoading(true);

    try {
      await ApiService.initialSetup(name, email, password);
      // Setup concluído com sucesso
      setTimeout(() => {
        onSetupComplete();
      }, 1500);
    } catch (err) {
      console.error('Erro no setup:', err);
      setError('Erro ao configurar o sistema. Tente novamente.');
      setIsLoading(false);
    }
  };

  if (step === 'welcome') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-slate-900 flex items-center justify-center p-6 relative overflow-hidden">
        {/* Background Effects */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/20 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-purple-500/20 rounded-full blur-[120px]"></div>
        
        <div className="max-w-2xl w-full animate-in fade-in zoom-in-95 duration-700">
          <div className="text-center space-y-8">
            {/* Icon */}
            <div className="relative inline-block">
              <div className="absolute inset-0 bg-indigo-500/30 rounded-full blur-xl animate-pulse"></div>
              <div className="relative w-24 h-24 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full mx-auto flex items-center justify-center shadow-2xl">
                <Rocket size={48} className="text-white" />
              </div>
            </div>

            {/* Welcome Text */}
            <div className="space-y-4">
              <h1 className="text-5xl font-black text-white tracking-tighter uppercase leading-none">
                Bem-vindo ao<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">CantinaSmart</span>
              </h1>
              <p className="text-lg text-slate-300 font-medium max-w-md mx-auto">
                Primeiro acesso detectado. Vamos configurar seu sistema em apenas alguns passos.
              </p>
            </div>

            {/* Features List */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl mx-auto mt-12">
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 space-y-2">
                <ShieldCheck className="text-indigo-400 mx-auto" size={32} />
                <p className="text-white font-bold text-sm">Gestão Completa</p>
                <p className="text-slate-400 text-xs">PDV, estoque, clientes e relatórios</p>
              </div>
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 space-y-2">
                <Sparkles className="text-purple-400 mx-auto" size={32} />
                <p className="text-white font-bold text-sm">Multiplataforma</p>
                <p className="text-slate-400 text-xs">Cantinas e restaurantes</p>
              </div>
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 space-y-2">
                <CheckCircle2 className="text-emerald-400 mx-auto" size={32} />
                <p className="text-white font-bold text-sm">Fácil de Usar</p>
                <p className="text-slate-400 text-xs">Interface intuitiva e moderna</p>
              </div>
            </div>

            {/* CTA Button */}
            <button
              onClick={() => setStep('form')}
              disabled={isRestoring}
              className="group mt-12 px-8 py-5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-2xl font-black uppercase text-sm tracking-[2px] shadow-2xl shadow-indigo-900/50 hover:shadow-indigo-600/50 transition-all flex items-center justify-center gap-3 mx-auto hover:scale-105 active:scale-95"
            >
              Iniciar Configuração
              <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </button>

            <label className="group mt-4 px-8 py-4 bg-white/10 border border-white/20 text-white rounded-2xl font-black uppercase text-xs tracking-[2px] shadow-xl hover:bg-white/15 transition-all flex items-center justify-center gap-3 mx-auto cursor-pointer">
              {isRestoring ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Restaurando Backup...
                </>
              ) : (
                <>
                  <Upload size={18} />
                  Restaurar Backup
                </>
              )}
              <input
                type="file"
                accept=".json,application/json"
                onChange={handleBackupFileSelected}
                className="hidden"
                disabled={isRestoring}
              />
            </label>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-slate-900 flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/20 rounded-full blur-[120px]"></div>
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-purple-500/20 rounded-full blur-[120px]"></div>

      <div className="w-full max-w-lg animate-in fade-in zoom-in-95 duration-700">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl mx-auto flex items-center justify-center shadow-2xl mb-4">
            <User size={32} className="text-white" />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tighter uppercase">Criar Administrador</h1>
          <p className="text-slate-400 text-sm font-medium mt-2">Configure a conta principal do sistema</p>
        </div>

        <div className="bg-white/10 backdrop-blur-xl p-8 rounded-[40px] border border-white/20 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Name */}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest ml-1">Nome Completo</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  required
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full bg-white/10 border-2 border-white/20 rounded-2xl pl-12 pr-6 py-4 text-white font-bold outline-none focus:border-indigo-400 focus:bg-white/20 transition-all placeholder:text-slate-500"
                  placeholder="Seu nome"
                  autoFocus
                />
              </div>
            </div>

            {/* Email */}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest ml-1">Email de Acesso</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  required
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full bg-white/10 border-2 border-white/20 rounded-2xl pl-12 pr-6 py-4 text-white font-bold outline-none focus:border-indigo-400 focus:bg-white/20 transition-all placeholder:text-slate-500"
                  placeholder="email@exemplo.com"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest ml-1">Senha de Segurança</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  required
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full bg-white/10 border-2 border-white/20 rounded-2xl pl-12 pr-6 py-4 text-white font-bold outline-none focus:border-indigo-400 focus:bg-white/20 transition-all placeholder:text-slate-500"
                  placeholder="Mínimo 6 caracteres"
                  minLength={6}
                />
              </div>
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest ml-1">Confirmar Senha</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  required
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  className="w-full bg-white/10 border-2 border-white/20 rounded-2xl pl-12 pr-6 py-4 text-white font-bold outline-none focus:border-indigo-400 focus:bg-white/20 transition-all placeholder:text-slate-500"
                  placeholder="Digite novamente"
                  minLength={6}
                />
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-500/20 border-2 border-red-500/50 p-4 rounded-2xl">
                <p className="text-red-200 text-sm font-bold text-center">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              disabled={isLoading}
              type="submit"
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-5 rounded-2xl font-black uppercase text-xs tracking-[2px] shadow-xl shadow-indigo-900/40 hover:shadow-indigo-600/50 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 active:scale-95"
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Configurando...
                </>
              ) : (
                <>
                  Criar Conta e Continuar
                  <ArrowRight size={20} />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Info */}
        <div className="mt-6 text-center">
          <p className="text-slate-400 text-xs font-medium">
            Esta conta terá privilégios de <span className="text-indigo-400 font-bold">SUPERADMIN</span>
          </p>
        </div>
      </div>
    </div>
  );
};

export default SetupPage;
