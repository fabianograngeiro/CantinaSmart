import React, { useState } from 'react';
import { Settings, Trash2, AlertTriangle, RefreshCw, Shield, Database, Info, Download } from 'lucide-react';
import ApiService from '../services/api';
import { User } from '../types';

interface SystemSettingsPageProps {
  currentUser: User;
}

const SystemSettingsPage: React.FC<SystemSettingsPageProps> = ({ currentUser }) => {
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);

  const handleResetDatabase = async () => {
    if (resetConfirmText !== 'RESETAR TUDO') {
      alert('Digite "RESETAR TUDO" para confirmar');
      return;
    }

    setIsResetting(true);
    try {
      await ApiService.resetDatabase();
      alert('✅ Database resetada com sucesso! A página será recarregada.');
      window.location.reload();
    } catch (err) {
      console.error('Erro ao resetar database:', err);
      alert('❌ Erro ao resetar database. Verifique o console.');
      setIsResetting(false);
    }
  };

  const handleBackupDatabase = async () => {
    setIsBackingUp(true);
    try {
      const { blob, filename } = await ApiService.downloadDatabaseBackup();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      alert('✅ Backup baixado com sucesso!');
    } catch (err) {
      console.error('Erro ao baixar backup da database:', err);
      alert('❌ Erro ao gerar backup da database. Verifique o console.');
    } finally {
      setIsBackingUp(false);
    }
  };

  return (
    <div className="system-settings-shell space-y-4 p-4 animate-in fade-in duration-500">
      {/* Header */}
      <div>
        <h1 className="text-xl font-black text-gray-800 dark:text-zinc-100 flex items-center gap-2">
          <Settings className="text-indigo-600" size={20} />
          Configurações do Sistema
        </h1>
        <p className="text-xs text-gray-500 dark:text-zinc-400 font-medium mt-1">
          Gerenciamento e controle do sistema
        </p>
      </div>

      {/* Info Card */}
      <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200 rounded-2xl p-4 dark:from-zinc-900 dark:to-zinc-900 dark:border-white/10 dark:ring-1 dark:ring-white/5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm dark:bg-zinc-800">
            <Shield className="text-indigo-600" size={18} />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-black text-gray-800 dark:text-zinc-100 mb-1.5">Área Restrita - SUPERADMIN</h3>
            <p className="text-xs text-gray-600 dark:text-zinc-300 leading-relaxed">
              Esta área contém configurações críticas do sistema. As ações realizadas aqui afetam 
              todos os usuários e empresas da plataforma. Proceda com cautela.
            </p>
          </div>
        </div>
      </div>

      {/* Database Management */}
      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden dark:bg-[#121214] dark:border-white/10 dark:ring-1 dark:ring-white/5">
        <div className="p-4 border-b bg-gray-50 dark:bg-zinc-900 dark:border-white/10">
          <div className="flex items-center gap-3">
            <Database className="text-gray-700 dark:text-zinc-300" size={18} />
            <div>
              <h2 className="text-base font-black text-gray-800 dark:text-zinc-100">Gerenciamento da Database</h2>
              <p className="text-xs text-gray-500 dark:text-zinc-400 font-medium">Controle total do banco de dados</p>
            </div>
          </div>
        </div>

        <div className="p-4 space-y-3">
          {/* Backup Database Section */}
          <div className="border border-emerald-200 rounded-xl p-4 bg-emerald-50">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <Download className="text-emerald-600" size={18} />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-black text-gray-800 mb-1.5">Backup Completo da Database</h3>
                <p className="text-xs text-gray-600 mb-3 leading-relaxed">
                  Faça o download do arquivo completo <strong className="text-emerald-700">database.json</strong> com todos os dados atuais do sistema.
                </p>

                <button
                  onClick={handleBackupDatabase}
                  disabled={isBackingUp}
                  className="px-4 py-2.5 bg-emerald-600 text-white rounded-lg font-bold text-xs uppercase tracking-wider hover:bg-emerald-700 transition-all flex items-center gap-2 shadow-md hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isBackingUp ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      Gerando Backup...
                    </>
                  ) : (
                    <>
                      <Download size={14} />
                      Fazer Backup
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Reset Database Section */}
          <div className="border border-red-200 rounded-xl p-4 bg-red-50">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <Trash2 className="text-red-600" size={18} />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-black text-gray-800 mb-1.5">Resetar Database Completa</h3>
                <p className="text-xs text-gray-600 mb-3 leading-relaxed">
                  Esta ação irá <strong className="text-red-600">apagar permanentemente</strong> todos os dados do sistema, 
                  incluindo empresas, usuários, produtos, clientes, planos, fornecedores, pedidos, transações e ingredientes.
                </p>
                
                <div className="bg-white border border-red-200 rounded-lg p-3 mb-3 dark:bg-zinc-900 dark:border-rose-500/30">
                  <p className="text-xs font-black text-red-900 uppercase tracking-widest mb-2">⚠️ Dados que serão apagados:</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>
                      <span className="text-xs font-bold text-gray-700 dark:text-zinc-300">Empresas</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>
                      <span className="text-xs font-bold text-gray-700 dark:text-zinc-300">Usuários</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>
                      <span className="text-xs font-bold text-gray-700 dark:text-zinc-300">Produtos</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>
                      <span className="text-xs font-bold text-gray-700 dark:text-zinc-300">Clientes</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>
                      <span className="text-xs font-bold text-gray-700 dark:text-zinc-300">Planos</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>
                      <span className="text-xs font-bold text-gray-700 dark:text-zinc-300">Fornecedores</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>
                      <span className="text-xs font-bold text-gray-700 dark:text-zinc-300">Pedidos</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>
                      <span className="text-xs font-bold text-gray-700 dark:text-zinc-300">Transações</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>
                      <span className="text-xs font-bold text-gray-700 dark:text-zinc-300">Ingredientes</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setIsResetModalOpen(true)}
                  className="px-4 py-2.5 bg-red-600 text-white rounded-lg font-bold text-xs uppercase tracking-wider hover:bg-red-700 transition-all flex items-center gap-2 shadow-md hover:shadow-lg"
                >
                  <Trash2 size={14} />
                  Resetar Database
                </button>
              </div>
            </div>
          </div>

          {/* Info Box */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
            <div className="flex items-start gap-3">
              <Info className="text-blue-600 flex-shrink-0" size={16} />
              <div>
                <p className="text-xs font-bold text-blue-900 mb-1">Informação</p>
                <p className="text-xs text-blue-800 leading-relaxed">
                  Após resetar a database, o sistema será redirecionado para a tela de configuração inicial, 
                  onde você poderá criar um novo usuário SUPERADMIN.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal de Confirmação de Reset */}
      {isResetModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-5 max-w-md w-full shadow-2xl border-2 border-red-500 animate-in zoom-in-95 duration-200 dark:bg-zinc-900 dark:border-rose-500/40">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                <AlertTriangle className="text-red-600" size={18} />
              </div>
              <div>
                <h3 className="text-lg font-black text-gray-800 dark:text-zinc-100 uppercase tracking-tight">Resetar Database</h3>
                <p className="text-xs text-red-600 font-bold uppercase tracking-widest">Ação irreversível</p>
              </div>
            </div>

            <div className="space-y-3 mb-4">
              <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                <p className="text-xs font-bold text-red-900 mb-2">⚠️ ATENÇÃO:</p>
                <ul className="text-xs text-red-800 space-y-1 font-medium">
                  <li>• Todos os dados serão apagados permanentemente</li>
                  <li>• Empresas, usuários, produtos, clientes, planos</li>
                  <li>• Fornecedores, pedidos, transações, ingredientes</li>
                  <li>• Esta ação NÃO PODE SER DESFEITA</li>
                </ul>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black text-gray-600 dark:text-zinc-400 uppercase tracking-widest">
                  Digite "RESETAR TUDO" para confirmar:
                </label>
                <input
                  type="text"
                  value={resetConfirmText}
                  onChange={(e) => setResetConfirmText(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg font-bold text-center text-sm uppercase focus:border-red-500 focus:outline-none dark:bg-zinc-800 dark:border-white/10 dark:text-zinc-100"
                  placeholder="RESETAR TUDO"
                />
              </div>
            </div>

            <div className="flex gap-2.5">
              <button
                onClick={() => {
                  setIsResetModalOpen(false);
                  setResetConfirmText('');
                }}
                className="flex-1 px-3 py-2.5 bg-gray-200 text-gray-700 rounded-lg font-bold text-[11px] uppercase tracking-wider hover:bg-gray-300 transition-all"
                disabled={isResetting}
              >
                Cancelar
              </button>
              <button
                onClick={handleResetDatabase}
                disabled={resetConfirmText !== 'RESETAR TUDO' || isResetting}
                className="flex-1 px-3 py-2.5 bg-red-600 text-white rounded-lg font-bold text-[11px] uppercase tracking-wider hover:bg-red-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isResetting ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    Resetando...
                  </>
                ) : (
                  <>
                    <Trash2 size={14} />
                    Confirmar Reset
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SystemSettingsPage;
