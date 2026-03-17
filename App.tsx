
import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Link, useLocation, Navigate, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, ShoppingCart, Users, Package, ArrowRightLeft, 
  ReceiptText, Building2, Building, ShieldCheck, 
  UserCircle, Globe, ClipboardList, 
  Sparkles, Beef, Store, Calendar,
  LogOut, Menu, DollarSign, MessageCircle,
  Truck, Settings, AlertTriangle, X, Plus, Check // Ícones adicionais
} from 'lucide-react';

// Pages
import LoginPage from './pages/LoginPage';
import SetupPage from './pages/SetupPage';
import POSPage from './pages/POSPage';
import RestaurantPOSPage from './pages/RestaurantPOSPage';
import DashboardPage from './pages/DashboardPage';
import ClientsPage from './pages/ClientsPage';
import ProductsPage from './pages/ProductsPage';
import InventoryPage from './pages/InventoryPage';
import ReportsPage from './pages/ReportsPage';
import EnterprisesPage from './pages/EnterprisesPage';
import SuppliersPage from './pages/SuppliersPage';
import ClientPortalPage from './pages/ClientPortalPage';
import ClientPortalPageDesktop from './pages/ClientPortalPage_Desktop';
import CollaboratorPortalPage from './pages/CollaboratorPortalPage';
import MenuManagementPage from './pages/MenuManagementPage';
import OrdersPage from './pages/OrdersPage';
import RegistrationPage from './pages/RegistrationPage';
import NutritionalInfoPage from './pages/NutritionalInfoPage';
import UnitSalesTransactionsPage from './pages/UnitSalesTransactionsPage';
import PlansPage from './pages/PlansPage';
import DailyDeliveryPage from './pages/DailyDeliveryPage';
import UserManagementPage from './pages/UserManagementPage';
import SystemSettingsPage from './pages/SystemSettingsPage';
import SettingsPage from './pages/SettingsPage';
import FinancialPage from './pages/FinancialPage';
import WhatsAppPage from './pages/WhatsAppPage';
import NotificationCenter from './components/NotificationCenter';


import { Enterprise, Role, User, TransactionRecord } from './types';
import ApiService from './services/api';
import notificationService from './services/notificationService';

const AUTH_USER_STORAGE_KEY = 'canteen_auth_user';
const ACTIVE_ENTERPRISE_STORAGE_KEY = 'canteen_active_enterprise';

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeEnterprise, setActiveEnterprise] = useState<Enterprise | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null); // null = loading, true = needs setup, false = already configured
  const [showEnterpriseSelector, setShowEnterpriseSelector] = useState(false);
  const [availableEnterprises, setAvailableEnterprises] = useState<Enterprise[]>([]);

  // Verificar se o sistema precisa de setup inicial
  useEffect(() => {
    const checkSetup = async () => {
      try {
        const response = await ApiService.checkNeedsSetup();
        setNeedsSetup(response.needsSetup);
      } catch (err) {
        console.error('Erro ao verificar setup:', err);
        setNeedsSetup(false); // Assume que já está configurado em caso de erro
      }
    };
    checkSetup();
  }, []);

  useEffect(() => {
    try {
      const token = ApiService.getToken();
      const rawUser = localStorage.getItem(AUTH_USER_STORAGE_KEY);
      const rawEnterprise = localStorage.getItem(ACTIVE_ENTERPRISE_STORAGE_KEY);
      if (!token || !rawUser) return;
      const parsedUser = JSON.parse(rawUser) as User;
      if (!parsedUser?.id) return;
      setCurrentUser(parsedUser);
      setIsAuthenticated(true);
      if (rawEnterprise) {
        const parsedEnterprise = JSON.parse(rawEnterprise) as Enterprise;
        if (parsedEnterprise?.id) {
          setActiveEnterprise(parsedEnterprise);
        }
      }
    } catch (err) {
      console.error('Erro ao restaurar sessão:', err);
      ApiService.clearToken();
      localStorage.removeItem(AUTH_USER_STORAGE_KEY);
      localStorage.removeItem(ACTIVE_ENTERPRISE_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;

    if (activeEnterprise?.id) {
      localStorage.setItem(ACTIVE_ENTERPRISE_STORAGE_KEY, JSON.stringify(activeEnterprise));
      return;
    }

    localStorage.removeItem(ACTIVE_ENTERPRISE_STORAGE_KEY);
  }, [isAuthenticated, activeEnterprise]);

  useEffect(() => {
    const onSessionExpired = () => {
      setIsAuthenticated(false);
      setCurrentUser(null);
      setActiveEnterprise(null);
      setTransactions([]);
      localStorage.removeItem(AUTH_USER_STORAGE_KEY);
      localStorage.removeItem(ACTIVE_ENTERPRISE_STORAGE_KEY);
      notificationService.critico(
        'Sessão expirada',
        'Sua sessão expirou. Faça login novamente.'
      );
    };
    window.addEventListener('canteen:session-expired', onSessionExpired);
    return () => window.removeEventListener('canteen:session-expired', onSessionExpired);
  }, []);

  // Recarregar empresas quando usuário autenticado não tiver empresa selecionada
  useEffect(() => {
    const loadEnterprises = async () => {
      if (isAuthenticated && currentUser && currentUser.role !== 'SUPERADMIN' && !activeEnterprise) {
        try {
          const enterprises = await ApiService.getEnterprises();
          setAvailableEnterprises(enterprises);
          if (currentUser.enterpriseIds && currentUser.enterpriseIds.length > 0) {
            const ent = enterprises.find((e: any) => e.id === currentUser.enterpriseIds?.[0]);
            if (ent) {
              setActiveEnterprise(ent);
              return;
            }
          }
          if (currentUser.role !== 'OWNER' && enterprises.length > 0) {
            setActiveEnterprise(enterprises[0]);
          }
        } catch (err) {
          console.error('Erro ao carregar empresas:', err);
        }
      }
    };
    loadEnterprises();
  }, [isAuthenticated, currentUser, activeEnterprise]);

  const handleLogin = async (user: User) => {
    try {
      // Usuário já foi autenticado em LoginPage, apenas atualiza estado
      setCurrentUser(user);
      setIsAuthenticated(true);
      localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(user));
      
      // Para SUPERADMIN, não precisa de activeEnterprise
      if (user.role === 'SUPERADMIN') {
        return;
      }
      
      // Carregar empresas
      const enterprises = await ApiService.getEnterprises();
      setAvailableEnterprises(enterprises);
      
      // Se tem enterpriseIds específicos, usa o primeiro
      if (user.enterpriseIds && user.enterpriseIds.length > 0) {
        const ent = enterprises.find((e: any) => e.id === user.enterpriseIds?.[0]);
        if (ent) setActiveEnterprise(ent);
      } 
      // Se é OWNER, NÃO auto-seleciona - deixa ele escolher via modal
      else if (user.role === 'OWNER') {
        // Não seta activeEnterprise, o modal será mostrado quando necessário
        setActiveEnterprise(null);
      }
      // Para outros usuários sem empresa, carrega a primeira disponível
      else if (enterprises.length > 0) {
        setActiveEnterprise(enterprises[0]);
      }
    } catch (err) {
      console.error('Erro ao processar login:', err);
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setCurrentUser(null);
    setActiveEnterprise(null);
    setTransactions([]);
    ApiService.clearToken();
    localStorage.removeItem(AUTH_USER_STORAGE_KEY);
    localStorage.removeItem(ACTIVE_ENTERPRISE_STORAGE_KEY);
  };

  const handleSetupComplete = () => {
    setNeedsSetup(false);
  };

  const isSuperAdmin = currentUser?.role === Role.SUPERADMIN;
  const isOwner = currentUser?.role === Role.OWNER;
  const isAdminUnit = currentUser?.role === Role.ADMIN
    || currentUser?.role === Role.ADMIN_RESTAURANTE
    || currentUser?.role === Role.GERENTE
    || currentUser?.role === Role.FUNCIONARIO_BASICO;
  const roleDefaultPermissions = (() => {
    switch (currentUser?.role) {
      case Role.FUNCIONARIO_BASICO:
        return {
          canAccessInventory: false,
          canAccessReports: false,
          canAccessPOS: true,
          canAccessClients: true,
          canManageStaff: false,
        };
      case Role.GERENTE:
      case Role.ADMIN:
      case Role.ADMIN_RESTAURANTE:
      case Role.OWNER:
      case Role.SUPERADMIN:
        return {
          canAccessInventory: true,
          canAccessReports: true,
          canAccessPOS: true,
          canAccessClients: true,
          canManageStaff: true,
        };
      default:
        return {
          canAccessInventory: false,
          canAccessReports: false,
          canAccessPOS: false,
          canAccessClients: false,
          canManageStaff: false,
        };
    }
  })();
  const resolvedPermissions = {
    ...roleDefaultPermissions,
    ...(currentUser?.permissions || {}),
  };
  const isPortalUser = currentUser?.role === 'RESPONSAVEL' || currentUser?.role === 'COLABORADOR' || currentUser?.role === 'CLIENTE';
  const isRestaurant = activeEnterprise?.type === 'RESTAURANTE';
  const isCantina = activeEnterprise?.type === 'CANTINA';

  // Loading state
  if (needsSetup === null) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin inline-block w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full"></div>
          <p className="text-slate-400 font-medium">Carregando sistema...</p>
        </div>
      </div>
    );
  }

  // Show setup page if needed
  if (needsSetup) {
    return <SetupPage onSetupComplete={handleSetupComplete} />;
  }

  return (
    <HashRouter>
      <AppContent 
        isAuthenticated={isAuthenticated}
        needsSetup={needsSetup}
        handleSetupComplete={handleSetupComplete}
        currentUser={currentUser}
        isSuperAdmin={isSuperAdmin}
        isOwner={isOwner}
        isAdminUnit={isAdminUnit}
        isRestaurant={isRestaurant}
        isCantina={isCantina}
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={setIsSidebarOpen}
        activeEnterprise={activeEnterprise}
        setActiveEnterprise={setActiveEnterprise}
        handleLogout={handleLogout}
        handleLogin={handleLogin}
        transactions={transactions}
        setTransactions={setTransactions}
        availableEnterprises={availableEnterprises}
        showEnterpriseSelector={showEnterpriseSelector}
        setShowEnterpriseSelector={setShowEnterpriseSelector}
        resolvedPermissions={resolvedPermissions}
      />
    </HashRouter>
  );
};

// Component wrapper que escolhe entre mobile e desktop baseado na largura da tela
const ClientPortalPageWrapper: React.FC<{ currentUser?: any }> = ({ currentUser }) => {
  const [isDesktop, setIsDesktop] = React.useState(window.innerWidth >= 1024);
  const enterpriseId = currentUser?.enterpriseIds?.[0];

  React.useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [currentUser]);

  return isDesktop ? <ClientPortalPageDesktop enterpriseId={enterpriseId} currentUser={currentUser} /> : <ClientPortalPage enterpriseId={enterpriseId} currentUser={currentUser} />;
};

const AppContent: React.FC<any> = (props) => {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    isAuthenticated, needsSetup, handleSetupComplete, currentUser,
    isSuperAdmin, isOwner, isAdminUnit, isRestaurant, isCantina,
    isSidebarOpen, setIsSidebarOpen, activeEnterprise, setActiveEnterprise,
    handleLogout, handleLogin, transactions, setTransactions,
    availableEnterprises,
    showEnterpriseSelector, setShowEnterpriseSelector, resolvedPermissions
  } = props;

  // Verificar se está na página de enterprises
  const isOnEnterprisesPage = location.pathname === '/enterprises';
  
  // Redirecionar usuários RESPONSAVEL, COLABORADOR e CLIENTE para /portal
  const isPortalUser = currentUser?.role === 'RESPONSAVEL' || currentUser?.role === 'COLABORADOR' || currentUser?.role === 'CLIENTE';
  React.useEffect(() => {
    if (isAuthenticated && isPortalUser && !location.pathname.startsWith('/portal')) {
      navigate('/portal');
    }
  }, [isAuthenticated, isPortalUser, location.pathname]);

  return (
      <div className="flex h-screen bg-gray-50 overflow-hidden text-gray-900 font-['Inter'] relative">
        <NotificationCenter />
        
        {!isAuthenticated ? (
          <div className="flex-1">
             <Routes>
               <Route path="/portal" element={<ClientPortalPage />} />
               <Route path="/register" element={<RegistrationPage />} />
               <Route path="*" element={<LoginPage onLogin={handleLogin} />} />
             </Routes>
          </div>
        ) : isPortalUser ? (
          // Portal users - sem sidebar, renderiza apenas portal routes
          <div className="flex-1">
             <Routes>
               <Route path="/portal" element={<ClientPortalPageWrapper currentUser={currentUser} />} />
               <Route path="*" element={<ClientPortalPageWrapper currentUser={currentUser} />} />
             </Routes>
          </div>
        ) : (
          // Admin users - com sidebar completo
          <>
            <aside className={`${isSidebarOpen ? 'w-64' : 'w-20'} bg-slate-900 text-white transition-all duration-300 flex flex-col hidden md:flex z-50 shadow-2xl`}>
              <div className="p-5 flex items-center justify-between border-b border-slate-800/50">
                {isSidebarOpen ? (
                  <span className="text-xl font-black tracking-tight flex items-center gap-2">
                    <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center shadow-lg">CS</div>
                    Cantina<span className="text-indigo-400">Smart</span>
                  </span>
                ) : (
                  <div className="w-10 h-10 bg-indigo-500 rounded-lg flex items-center justify-center mx-auto shadow-lg font-black">CS</div>
                )}
                <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-1 hover:bg-slate-800 rounded-md transition-colors"><Menu size={20} /></button>
              </div>

              <nav className="flex-1 mt-4 px-3 space-y-1 overflow-y-auto scrollbar-hide pb-10">
                <SidebarItem icon={<LayoutDashboard size={20} />} label="Início" to="/" isOpen={isSidebarOpen} />
                
                {isSuperAdmin && (
                  <div className="pt-4 pb-2 space-y-1">
                    <p className={`text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-2 px-3 ${!isSidebarOpen && 'hidden'}`}>Master Control</p>
                    <SidebarItem icon={<ShieldCheck size={20} />} label="Usuários" to="/users" isOpen={isSidebarOpen} />
                    <SidebarItem icon={<Building2 size={20} />} label="Owners da Rede" to="/enterprises" isOpen={isSidebarOpen} />
                    <SidebarItem icon={<ReceiptText size={20} />} label="Faturamento SaaS" to="/reports" isOpen={isSidebarOpen} />
                    <SidebarItem icon={<Settings size={20} />} label="Configurações" to="/system-settings" isOpen={isSidebarOpen} />
                  </div>
                )}

                {isAdminUnit && (
                  <div className="pt-4 pb-2 space-y-1 border-t border-slate-800/30 mt-4">
                    <p className={`text-[9px] font-black text-emerald-400 uppercase tracking-widest mb-2 px-3 ${!isSidebarOpen && 'hidden'}`}>Minha Unidade</p>
                    
                    {/* MENU EXCLUSIVO PARA CANTINA */}
                    {isCantina && resolvedPermissions.canAccessReports && (
                      <SidebarItem icon={<Truck size={20} />} label="Entrega do Dia" to="/daily-delivery" isOpen={isSidebarOpen} />
                    )}

                    {resolvedPermissions.canAccessInventory && <SidebarItem icon={<Calendar size={20} />} label="Cardápio Local" to="/menu-lunch" isOpen={isSidebarOpen} />}
                    {resolvedPermissions.canAccessInventory && <SidebarItem icon={<Beef size={20} />} label="Base Nutricional" to="/nutritional-info" isOpen={isSidebarOpen} />}
                    {resolvedPermissions.canAccessInventory && <SidebarItem icon={<Sparkles size={20} />} label="Planos Ativos" to={`/plans/${activeEnterprise?.id}`} isOpen={isSidebarOpen} />}
                    {resolvedPermissions.canAccessReports && <SidebarItem icon={<ReceiptText size={20} />} label="Transações" to="/unit-sales" isOpen={isSidebarOpen} />}
                    {resolvedPermissions.canAccessReports && <SidebarItem icon={<DollarSign size={20} />} label="Financeiro" to="/financial" isOpen={isSidebarOpen} />}
                    {resolvedPermissions.canAccessReports && <SidebarItem icon={<MessageCircle size={20} />} label="WhatsApp" to="/whatsapp" isOpen={isSidebarOpen} />}
                    {resolvedPermissions.canAccessInventory && <SidebarItem icon={<ArrowRightLeft size={20} />} label="Estoque Unidade" to="/inventory" isOpen={isSidebarOpen} />}
                    {resolvedPermissions.canManageStaff && <SidebarItem icon={<Settings size={20} />} label="Ajustes" to="/settings" isOpen={isSidebarOpen} />}
                  </div>
                )}

                {isOwner && (
                  <div className="pt-4 pb-2 space-y-1">
                    <p className={`text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-2 px-3 ${!isSidebarOpen && 'hidden'}`}>Administração</p>
                    <SidebarItem icon={<Building2 size={20} />} label="Minhas Unidades" to="/enterprises" isOpen={isSidebarOpen} />
                    <SidebarItem icon={<Users size={20} />} label="Usuários da Rede" to="/users" isOpen={isSidebarOpen} />
                    <SidebarItem icon={<ArrowRightLeft size={20} />} label="Estoque Geral" to="/inventory" isOpen={isSidebarOpen} />
                  </div>
                )}

                {!isSuperAdmin && (
                  <div className="py-4 border-t border-slate-800/50 mt-4 space-y-1">
                    <p className={`text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 px-3 ${!isSidebarOpen && 'hidden'}`}>Operacional</p>
                    {resolvedPermissions.canAccessPOS && <SidebarItem icon={<ShoppingCart size={20} />} label="Vender (PDV)" to="/pos" isOpen={isSidebarOpen} />}
                    {resolvedPermissions.canAccessClients && <SidebarItem icon={<Users size={20} />} label="Clientes" to="/clients" isOpen={isSidebarOpen} />}
                    {resolvedPermissions.canAccessInventory && <SidebarItem icon={<Package size={20} />} label="Produtos" to="/products" isOpen={isSidebarOpen} />}
                    <SidebarItem icon={<ClipboardList size={20} />} label="Suprimentos" to="/orders" isOpen={isSidebarOpen} />
                  </div>
                )}
              </nav>

              <div className="p-4 border-t border-slate-800 space-y-2">
                {/* Botão para trocar unidade (apenas para OWNER) */}
                {isOwner && (
                  <button 
                    onClick={() => {
                      setActiveEnterprise(null);
                      // O modal será mostrado automaticamente quando activeEnterprise for null
                    }}
                    className={`flex items-center w-full p-3 rounded-xl text-indigo-400 hover:bg-indigo-500/10 transition-all ${!isSidebarOpen && 'justify-center'}`}
                  >
                    <Building2 size={20} />
                    {isSidebarOpen && (
                      <div className="ml-3 flex-1 text-left">
                        <span className="font-bold text-xs block">Trocar Unidade</span>
                        {activeEnterprise && (
                          <span className="text-[10px] text-slate-500 font-medium truncate block">{activeEnterprise.name}</span>
                        )}
                      </div>
                    )}
                  </button>
                )}
                
                <button onClick={handleLogout} className={`flex items-center w-full p-3 rounded-xl text-red-400 hover:bg-red-500/10 transition-all ${!isSidebarOpen && 'justify-center'}`}>
                  <LogOut size={20} />
                  {isSidebarOpen && <span className="ml-3 font-bold text-sm">Sair</span>}
                </button>
              </div>
            </aside>

            <main className="flex-1 flex flex-col overflow-hidden relative">
              <header className="h-16 bg-white border-b flex items-center justify-between px-6 shadow-sm z-40 md:flex hidden shrink-0">
                <h2 className="text-[10px] font-black text-gray-800 uppercase tracking-[3px] flex items-center gap-2">
                  {isSuperAdmin ? (
                    <><Globe size={14} className="text-indigo-600" /> Console Global</>
                  ) : (
                    <><Building size={14} className="text-indigo-600" /> {activeEnterprise?.name || 'Carregando...'}</>
                  )}
                </h2>
                <div className="flex items-center space-x-3">
                  <div className="text-right">
                    <p className="text-xs font-black text-gray-900 leading-none uppercase">{currentUser?.name || 'Usuário'}</p>
                    <p className="text-[9px] text-indigo-600 font-black uppercase mt-1 tracking-widest">{currentUser?.role.replace('_', ' ') || 'CARREGANDO'}</p>
                  </div>
                  <img 
                    src={currentUser?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser?.name || 'User')}&background=4f46e5&color=fff&bold=true`} 
                    alt="Avatar" 
                    className="w-10 h-10 rounded-xl border-2 border-indigo-100 shadow-sm" 
                  />
                </div>
              </header>

              <div className="flex-1 overflow-y-auto bg-gray-50 scrollbar-hide">
                <Routes>
                  <Route path="/" element={<DashboardPage currentUser={currentUser} activeEnterprise={activeEnterprise} />} />
                  <Route path="/pos" element={resolvedPermissions.canAccessPOS ? (isRestaurant ? <RestaurantPOSPage currentUser={currentUser} activeEnterprise={activeEnterprise} onRegisterTransaction={(t) => setTransactions(prev => [t, ...prev])} /> : <POSPage currentUser={currentUser} activeEnterprise={activeEnterprise} onRegisterTransaction={(t) => setTransactions(prev => [t, ...prev])} />) : <Navigate to="/" />} />
                  <Route path="/clients" element={resolvedPermissions.canAccessClients ? <ClientsPage currentUser={currentUser} activeEnterprise={activeEnterprise} /> : <Navigate to="/" />} />
                  <Route path="/products" element={resolvedPermissions.canAccessInventory ? <ProductsPage currentUser={currentUser} activeEnterprise={activeEnterprise} /> : <Navigate to="/" />} />
                  <Route path="/inventory" element={resolvedPermissions.canAccessInventory ? <InventoryPage currentUser={currentUser} activeEnterprise={activeEnterprise} /> : <Navigate to="/" />} />
                  <Route path="/reports" element={resolvedPermissions.canAccessReports ? <ReportsPage currentUser={currentUser} /> : <Navigate to="/" />} />
                  <Route path="/unit-sales" element={resolvedPermissions.canAccessReports ? <UnitSalesTransactionsPage activeEnterprise={activeEnterprise} transactions={transactions} /> : <Navigate to="/" />} />
                  <Route path="/financial" element={resolvedPermissions.canAccessReports ? <FinancialPage activeEnterprise={activeEnterprise} /> : <Navigate to="/" />} />
                  <Route path="/whatsapp" element={resolvedPermissions.canAccessReports ? <WhatsAppPage currentUser={currentUser} activeEnterprise={activeEnterprise} /> : <Navigate to="/" />} />
                  <Route path="/users" element={(isSuperAdmin || isOwner || resolvedPermissions.canManageStaff) ? <UserManagementPage currentUser={currentUser} /> : <Navigate to="/" />} />
                  <Route path="/system-settings" element={<SystemSettingsPage currentUser={currentUser} />} />
                  <Route path="/enterprises" element={<EnterprisesPage currentUser={currentUser} />} />
                  <Route path="/suppliers" element={<SuppliersPage currentUser={currentUser} activeEnterprise={activeEnterprise} />} />
                  <Route path="/portal" element={
                    currentUser?.role === 'RESPONSAVEL' ? <ClientPortalPageWrapper /> :
                    currentUser?.role === 'COLABORADOR' ? <CollaboratorPortalPage /> :
                    <Navigate to="/" />
                  } />
                  <Route path="/menu-lunch" element={resolvedPermissions.canAccessInventory ? <MenuManagementPage type="ALMOCO" currentUser={currentUser} activeEnterprise={activeEnterprise} /> : <Navigate to="/" />} />
                  <Route path="/nutritional-info" element={resolvedPermissions.canAccessInventory ? <NutritionalInfoPage /> : <Navigate to="/" />} />
                  <Route path="/orders" element={<OrdersPage currentUser={currentUser} activeEnterprise={activeEnterprise} />} />
                  <Route path="/register" element={<RegistrationPage />} />
                  <Route path="/plans/:enterpriseId" element={resolvedPermissions.canAccessInventory ? <PlansPage activeEnterprise={activeEnterprise} /> : <Navigate to="/" />} />
                  <Route path="/daily-delivery" element={resolvedPermissions.canAccessReports ? <DailyDeliveryPage activeEnterprise={activeEnterprise} onRegisterTransaction={(t) => setTransactions(prev => [t, ...prev])} /> : <Navigate to="/" />} />
                  <Route path="/settings" element={resolvedPermissions.canManageStaff ? <SettingsPage currentUser={currentUser} activeEnterprise={activeEnterprise} /> : <Navigate to="/" />} />
                  <Route path="*" element={<Navigate to="/" />} />
                </Routes>
              </div>
            </main>
          </>
        )}

        {/* Modal de Seleção de Empresa para OWNER */}
        {isAuthenticated && isOwner && !activeEnterprise && !isOnEnterprisesPage && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
            <div className="bg-white rounded-3xl p-8 max-w-2xl w-full shadow-2xl border animate-in zoom-in-95 duration-200">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center">
                  <Building className="text-indigo-600" size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-gray-800">Selecione uma Unidade</h3>
                  <p className="text-xs text-gray-500 font-medium">Escolha qual unidade você deseja acessar</p>
                </div>
              </div>

              {availableEnterprises.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <AlertTriangle className="text-amber-600" size={32} />
                  </div>
                  <h4 className="text-lg font-black text-gray-800 mb-2">Nenhuma Unidade Cadastrada</h4>
                  <p className="text-sm text-gray-600 mb-6">
                    Você ainda não possui nenhuma unidade cadastrada no sistema.
                  </p>
                  <Link
                    to="/enterprises"
                    className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all"
                  >
                    <Plus size={18} />
                    Criar Primeira Unidade
                  </Link>
                </div>
              ) : (
                <>
                  <div className="space-y-3 max-h-96 overflow-y-auto mb-6">
                    {availableEnterprises.map((enterprise) => (
                      <button
                        key={enterprise.id}
                        onClick={() => {
                          setActiveEnterprise(enterprise);
                          setShowEnterpriseSelector(false);
                        }}
                        className="w-full p-4 border-2 border-gray-200 rounded-2xl hover:border-indigo-500 hover:bg-indigo-50 transition-all text-left group"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-white border-2 border-gray-200 rounded-xl flex items-center justify-center group-hover:border-indigo-500 transition-all">
                            {enterprise.type === 'RESTAURANTE' ? (
                              <Store className="text-indigo-600" size={24} />
                            ) : (
                              <Building className="text-indigo-600" size={24} />
                            )}
                          </div>
                          <div className="flex-1">
                            <h4 className="text-base font-black text-gray-800">{enterprise.name}</h4>
                            <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">
                              {enterprise.type === 'RESTAURANTE' ? 'Restaurante' : 'Cantina'}
                              {enterprise.attachedSchoolName && ` • ${enterprise.attachedSchoolName}`}
                            </p>
                          </div>
                          <Check className="text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity" size={20} />
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="flex gap-3 pt-4 border-t">
                    <Link
                      to="/enterprises"
                      onClick={() => setShowEnterpriseSelector(false)}
                      className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold text-sm hover:bg-gray-200 transition-all flex items-center justify-center gap-2"
                    >
                      <Plus size={18} />
                      Criar Nova Unidade
                    </Link>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
  );
};

const SidebarItem: React.FC<any> = ({ icon, label, to, isOpen }) => {
  const location = useLocation();
  const isActive = location.pathname === to;
  return (
    <Link to={to} className={`flex items-center p-3 rounded-xl transition-all duration-200 group ${isActive ? 'bg-indigo-600 text-white shadow-xl' : 'text-slate-400 hover:bg-slate-800 hover:text-white'} ${!isOpen && 'justify-center'}`}>
      <div className={`${isActive ? 'text-white' : 'group-hover:scale-110 transition-transform'}`}>{icon}</div>
      {isOpen && <span className="ml-3 font-bold text-[13px] tracking-tight">{label}</span>}
    </Link>
  );
};

export default App;
