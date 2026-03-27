import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, KeyRound, Lock, ShieldCheck } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import ApiService from '../services/api';
import notificationService from '../services/notificationService';

const ResetPasswordPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const token = useMemo(() => new URLSearchParams(location.search).get('token') || '', [location.search]);
  const [isValidating, setIsValidating] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isValidToken, setIsValidToken] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [userLabel, setUserLabel] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    let cancelled = false;

    const validateToken = async () => {
      if (!token) {
        setError('Link de redefinição inválido. Solicite um novo link ao superadmin.');
        setIsValidToken(false);
        setIsValidating(false);
        return;
      }

      try {
        const response = await ApiService.validatePasswordResetToken(token);
        if (cancelled) return;
        setUserLabel(String(response?.user?.email || response?.user?.name || 'usuário'));
        setIsValidToken(Boolean(response?.valid));
        setError('');
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Link de redefinição inválido ou expirado.';
        setError(message);
        setIsValidToken(false);
      } finally {
        if (!cancelled) {
          setIsValidating(false);
        }
      }
    };

    void validateToken();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) {
      setError('Link de redefinição inválido. Solicite um novo link ao superadmin.');
      return;
    }

    if (!password || !confirmPassword) {
      const message = 'Informe a nova senha e a confirmação.';
      setError(message);
      notificationService.alerta('Senha incompleta', message);
      return;
    }

    if (password !== confirmPassword) {
      const message = 'As senhas informadas não coincidem.';
      setError(message);
      notificationService.alerta('Senhas divergentes', message);
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const response = await ApiService.completePasswordReset({ token, password, confirmPassword });
      const message = String(response?.message || 'Senha redefinida com sucesso.');
      setSuccessMessage(message);
      setIsValidToken(false);
      notificationService.informativo('Senha redefinida', message);
      window.setTimeout(() => navigate('/'), 1800);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Não foi possível redefinir a senha.';
      setError(message);
      notificationService.critico('Falha na redefinição', message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 relative overflow-hidden font-['Inter']">
      <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-600/10 rounded-full blur-[100px] -mr-48 -mt-48"></div>
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-cyan-600/10 rounded-full blur-[100px] -ml-48 -mb-48"></div>

      <div className="w-full max-w-md space-y-8 animate-in fade-in zoom-in-95 duration-500">
        <div className="text-center space-y-4">
          <div className="w-20 h-20 bg-emerald-600 rounded-3xl mx-auto flex items-center justify-center shadow-2xl shadow-emerald-500/20">
            <ShieldCheck size={40} className="text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-white tracking-tighter uppercase leading-none">Redefinir<span className="text-emerald-400">Senha</span></h1>
            <p className="text-slate-400 text-xs font-black uppercase tracking-[3px] mt-2 opacity-60">Acesso por link seguro</p>
          </div>
        </div>

        <div className="bg-white/5 backdrop-blur-xl p-8 rounded-[32px] border border-white/10 shadow-2xl space-y-6">
          {isValidating ? (
            <div className="text-center space-y-3 py-8">
              <KeyRound size={36} className="mx-auto text-emerald-400 animate-pulse" />
              <p className="text-sm font-bold text-white">Validando link de redefinição...</p>
            </div>
          ) : successMessage ? (
            <div className="space-y-4 text-center py-6">
              <CheckCircle2 size={40} className="mx-auto text-emerald-400" />
              <div>
                <p className="text-lg font-black text-white uppercase">Senha atualizada</p>
                <p className="text-sm text-slate-300 mt-2">{successMessage}</p>
              </div>
            </div>
          ) : isValidToken ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Conta</p>
                <p className="text-sm font-bold text-white">{userLabel}</p>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nova senha</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                  <input
                    required
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full bg-slate-800/50 border-2 border-white/5 rounded-2xl pl-12 pr-6 py-4 text-white font-bold outline-none focus:border-emerald-500 focus:bg-slate-800 transition-all"
                    placeholder="Use 8+ caracteres com maiúscula, minúscula e número"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Confirmar nova senha</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                  <input
                    required
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    className="w-full bg-slate-800/50 border-2 border-white/5 rounded-2xl pl-12 pr-6 py-4 text-white font-bold outline-none focus:border-emerald-500 focus:bg-slate-800 transition-all"
                    placeholder="Repita a nova senha"
                  />
                </div>
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl flex items-center gap-3">
                  <AlertCircle size={18} className="text-red-500 shrink-0" />
                  <p className="text-[11px] font-bold text-red-200">{error}</p>
                </div>
              )}

              <button
                disabled={isSubmitting}
                type="submit"
                className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-black uppercase text-xs tracking-[2px] shadow-xl shadow-emerald-950/40 hover:bg-emerald-700 active:scale-95 transition-all disabled:opacity-50"
              >
                {isSubmitting ? 'Redefinindo...' : 'Salvar nova senha'}
              </button>
            </form>
          ) : (
            <div className="space-y-4 text-center py-6">
              <AlertCircle size={40} className="mx-auto text-red-400" />
              <div>
                <p className="text-lg font-black text-white uppercase">Link inválido</p>
                <p className="text-sm text-slate-300 mt-2">{error || 'Solicite um novo link ao superadmin.'}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResetPasswordPage;