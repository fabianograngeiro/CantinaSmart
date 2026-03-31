import React, { useEffect, useState } from 'react';
import { ApiService } from '../services/api';

const AUTH_USER_STORAGE_KEY = 'canteen_auth_user';

const PortalAccessPage: React.FC = () => {
  const [status, setStatus] = useState('Validando acesso do portal...');

  useEffect(() => {
    const run = async () => {
      try {
        const hash = String(window.location.hash || '');
        const hashQuery = hash.includes('?') ? hash.split('?')[1] : '';
        const searchQuery = String(window.location.search || '').replace(/^\?/, '');
        const params = new URLSearchParams(searchQuery || hashQuery);
        const token = String(params.get('t') || '').trim();

        if (!token) {
          setStatus('Token não informado no link.');
          return;
        }

        const data = await ApiService.loginWithPortalToken(token);
        const user = data?.user;
        if (!user?.id) {
          setStatus('Não foi possível autenticar o usuário.');
          return;
        }

        localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(user));
        window.location.hash = '#/portal';
        window.location.reload();
      } catch (err) {
        setStatus(err instanceof Error ? err.message : 'Falha ao validar link do portal.');
      }
    };

    run();
  }, []);

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8 max-w-md w-full text-center">
        <h1 className="text-lg font-black text-slate-900">Portal de Acesso</h1>
        <p className="text-sm font-semibold text-slate-600 mt-3">{status}</p>
      </div>
    </div>
  );
};

export default PortalAccessPage;
