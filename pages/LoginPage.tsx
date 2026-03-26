
import React, { useState } from 'react';
import { Mail, Lock, LogIn, ShieldCheck, UserPlus, X, User, AlertCircle } from 'lucide-react';
import { User as UserType } from '../types';
import ApiService from '../services/api';
import notificationService from '../services/notificationService';

interface LoginPageProps {
  onLogin: (user: UserType) => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [registerData, setRegisterData] = useState({
    name: '',
    email: '',
    password: '',
    type: 'ALUNO' as 'ALUNO' | 'COLABORADOR'
  });
  const [registerError, setRegisterError] = useState('');
  const [isRegisterLoading, setIsRegisterLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      // Fazer login via API
      const response = await ApiService.login(email, password);
      onLogin(response.user);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Credenciais inválidas';
      setError(message);
      notificationService.critico('Falha no login', message);
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsRegisterLoading(true);
    setRegisterError('');

    if (!registerData.name || !registerData.email || !registerData.password) {
      const message = 'Preencha todos os campos';
      setRegisterError(message);
      notificationService.alerta('Cadastro incompleto', message);
      setIsRegisterLoading(false);
      return;
    }

    try {
      // Registrar novo usuário
      const newUser = await ApiService.registerUser({
        name: registerData.name,
        email: registerData.email,
        password: registerData.password,
        role: registerData.type === 'ALUNO' ? 'RESPONSAVEL' : 'COLABORADOR'
      });

      // Fazer login automático
      onLogin(newUser);
      setIsRegisterModalOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao registrar. Tente novamente.';
      setRegisterError(message);
      notificationService.critico('Falha no cadastro', message);
      setIsRegisterLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 relative overflow-hidden font-['Inter']">
      {/* Background Decorativo */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-600/10 rounded-full blur-[100px] -mr-48 -mt-48"></div>
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-indigo-600/10 rounded-full blur-[100px] -ml-48 -mb-48"></div>

      <div className="w-full max-w-md space-y-10 animate-in fade-in zoom-in-95 duration-700">
        <div className="text-center space-y-4">
           <div className="w-20 h-20 bg-indigo-600 rounded-3xl mx-auto flex items-center justify-center shadow-2xl shadow-indigo-500/20 group">
              <ShieldCheck size={40} className="text-white transition-transform group-hover:scale-110" />
           </div>
           <div>
              <h1 className="text-3xl font-black text-white tracking-tighter uppercase leading-none">Cantina<span className="text-indigo-400">Smart</span></h1>
              <p className="text-slate-400 text-xs font-black uppercase tracking-[3px] mt-2 opacity-60">Logistics & Banking Control</p>
           </div>
        </div>

        <div className="bg-white/5 backdrop-blur-xl p-10 rounded-[40px] border border-white/10 shadow-2xl space-y-8">
           <div className="space-y-2">
              <h2 className="text-xl font-black text-white uppercase tracking-tight">Acesso Administrativo</h2>
              <p className="text-xs text-slate-400 font-medium">Insira suas credenciais para entrar no console.</p>
           </div>

           <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-4">
                 <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">E-mail de Acesso</label>
                    <div className="relative">
                       <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                       <input 
                         required
                         type="email" 
                         value={email}
                         onChange={e => setEmail(e.target.value)}
                         className="w-full bg-slate-800/50 border-2 border-white/5 rounded-2xl pl-12 pr-6 py-4 text-white font-bold outline-none focus:border-indigo-500 focus:bg-slate-800 transition-all"
                         placeholder="exemplo@email.com"
                       />
                    </div>
                 </div>

                 <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Senha de Segurança</label>
                    <div className="relative">
                       <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                       <input 
                         required
                         type="password" 
                         value={password}
                         onChange={e => setPassword(e.target.value)}
                         className="w-full bg-slate-800/50 border-2 border-white/5 rounded-2xl pl-12 pr-6 py-4 text-white font-bold outline-none focus:border-indigo-500 focus:bg-slate-800 transition-all"
                         placeholder="••••••"
                       />
                    </div>
                 </div>
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl flex items-center gap-3">
                   <ShieldAlert size={18} className="text-red-500 shrink-0" />
                   <p className="text-[10px] font-black text-red-500 uppercase tracking-widest">{error}</p>
                </div>
              )}

              <button 
                disabled={isLoading}
                type="submit"
                className="w-full bg-indigo-600 text-white py-5 rounded-2xl font-black uppercase text-xs tracking-[2px] shadow-xl shadow-indigo-900/40 hover:bg-indigo-700 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
              >
                 {isLoading ? 'Autenticando...' : 'Entrar no Sistema'}
                 <LogIn size={20} />
              </button>

              <button
                type="button"
                onClick={() => setIsRegisterModalOpen(true)}
                className="w-full bg-slate-700/50 text-slate-100 py-4 rounded-2xl font-bold uppercase text-xs tracking-[2px] border-2 border-slate-600 hover:bg-slate-700 active:scale-95 transition-all flex items-center justify-center gap-3"
              >
                 <UserPlus size={18} />
                 Registrar como Novo Usuário
              </button>
           </form>
        </div>
      </div>

      {/* Modal de Registro */}
      {isRegisterModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md bg-slate-800 rounded-[40px] border border-white/10 shadow-2xl animate-in zoom-in-95 duration-300">
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 p-8 flex items-center justify-between rounded-t-[40px]">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 p-2 rounded-xl">
                  <UserPlus size={24} className="text-white" />
                </div>
                <h2 className="text-2xl font-black text-white uppercase tracking-tight">Novo Cadastro</h2>
              </div>
              <button
                onClick={() => setIsRegisterModalOpen(false)}
                className="text-white/60 hover:text-white transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            {/* Content */}
            <form onSubmit={handleRegister} className="p-8 space-y-6">
              {/* Seleção de Tipo */}
              <div className="space-y-3">
                <label className="text-xs font-black text-slate-300 uppercase tracking-widest">Tipo de Cadastro</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setRegisterData({ ...registerData, type: 'ALUNO' })}
                    className={`p-4 rounded-2xl border-2 font-black text-sm uppercase transition-all ${
                      registerData.type === 'ALUNO'
                        ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
                        : 'border-slate-600 bg-slate-700/30 text-slate-400 hover:border-slate-500'
                    }`}
                  >
                    <User size={18} className="mx-auto mb-1" />
                    Conta Responsavel
                  </button>
                  <button
                    type="button"
                    onClick={() => setRegisterData({ ...registerData, type: 'COLABORADOR' })}
                    className={`p-4 rounded-2xl border-2 font-black text-sm uppercase transition-all ${
                      registerData.type === 'COLABORADOR'
                        ? 'border-amber-500 bg-amber-500/10 text-amber-300'
                        : 'border-slate-600 bg-slate-700/30 text-slate-400 hover:border-slate-500'
                    }`}
                  >
                    <User size={18} className="mx-auto mb-1" />
                    Colaborador
                  </button>
                </div>
              </div>

              {/* Nome */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome Completo</label>
                <input
                  type="text"
                  value={registerData.name}
                  onChange={(e) => setRegisterData({ ...registerData, name: e.target.value })}
                  placeholder="Seu nome completo"
                  className="w-full bg-slate-700/50 border-2 border-white/5 rounded-2xl px-4 py-3 text-white font-bold outline-none focus:border-indigo-500 focus:bg-slate-700 transition-all"
                />
              </div>

              {/* Email */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">E-mail</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                  <input
                    type="email"
                    value={registerData.email}
                    onChange={(e) => setRegisterData({ ...registerData, email: e.target.value })}
                    placeholder="seu@email.com"
                    className="w-full bg-slate-700/50 border-2 border-white/5 rounded-2xl pl-12 pr-4 py-3 text-white font-bold outline-none focus:border-indigo-500 focus:bg-slate-700 transition-all"
                  />
                </div>
              </div>

              {/* Senha */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Senha</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                  <input
                    type="password"
                    value={registerData.password}
                    onChange={(e) => setRegisterData({ ...registerData, password: e.target.value })}
                    placeholder="••••••"
                    className="w-full bg-slate-700/50 border-2 border-white/5 rounded-2xl pl-12 pr-4 py-3 text-white font-bold outline-none focus:border-indigo-500 focus:bg-slate-700 transition-all"
                  />
                </div>
              </div>

              {registerError && (
                <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-xl flex items-center gap-2">
                  <AlertCircle size={16} className="text-red-500 shrink-0" />
                  <p className="text-[10px] font-black text-red-500 uppercase tracking-widest">{registerError}</p>
                </div>
              )}

              {/* Botões */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsRegisterModalOpen(false)}
                  className="flex-1 py-3 bg-slate-700 text-slate-200 rounded-2xl font-bold uppercase text-xs tracking-widest hover:bg-slate-600 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isRegisterLoading}
                  className="flex-1 py-3 bg-indigo-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-indigo-900/40 hover:bg-indigo-700 disabled:opacity-50 transition-all"
                >
                  {isRegisterLoading ? 'Registrando...' : 'Registrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const ShieldAlert = ({ size, className }: any) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="M12 8v4"/><path d="M12 16h.01"/>
  </svg>
);

export default LoginPage;
