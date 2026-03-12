const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export class ApiService {
  private static token: string | null = null;
  private static readonly TOKEN_STORAGE_KEY = 'canteen_auth_token';
  private static readonly SESSION_EXPIRED_EVENT = 'canteen:session-expired';

  static setToken(token: string) {
    this.token = token;
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.TOKEN_STORAGE_KEY, token);
    }
  }

  static getToken() {
    if (!this.token && typeof window !== 'undefined') {
      this.token = localStorage.getItem(this.TOKEN_STORAGE_KEY);
    }
    return this.token;
  }

  static clearToken() {
    this.token = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem(this.TOKEN_STORAGE_KEY);
    }
  }

  private static getHeaders() {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  private static handleUnauthorized(response: Response) {
    if (response.status !== 401) return;
    this.clearToken();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(this.SESSION_EXPIRED_EVENT));
    }
  }

  // ===== AUTH =====
  static async login(email: string, password: string) {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) throw new Error('Falha ao fazer login');
    const data = await response.json();
    this.setToken(data.token);
    return data;
  }

  static async registerUser(data: { name: string; email: string; password: string; role: string }) {
    // Criar o usuário
    const createResponse = await fetch(`${API_URL}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!createResponse.ok) throw new Error('Falha ao registrar usuário');
    
    // Fazer login automático com as credenciais
    const loginResponse = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: data.email, password: data.password }),
    });
    if (!loginResponse.ok) throw new Error('Falha ao fazer login após registro');
    
    const loginData = await loginResponse.json();
    this.setToken(loginData.token);
    return loginData.user;
  }

  // ===== ENTERPRISES =====
  static async getEnterprises() {
    const response = await fetch(`${API_URL}/enterprises`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Falha ao buscar empresas');
    return response.json();
  }

  static async getEnterprise(id: string) {
    const response = await fetch(`${API_URL}/enterprises/${id}`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Falha ao buscar empresa');
    return response.json();
  }

  static async createEnterprise(data: any) {
    const response = await fetch(`${API_URL}/enterprises`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Falha ao criar empresa');
    return response.json();
  }

  static async updateEnterprise(id: string, data: any) {
    const response = await fetch(`${API_URL}/enterprises/${id}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Falha ao atualizar empresa');
    return response.json();
  }

  static async deleteEnterprise(id: string) {
    const response = await fetch(`${API_URL}/enterprises/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Falha ao deletar empresa');
    return response.json();
  }

  // ===== USERS =====
  static async getUsers() {
    const response = await fetch(`${API_URL}/auth`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Falha ao buscar usuários');
    return response.json();
  }

  static async getUser(id: string) {
    const response = await fetch(`${API_URL}/auth/${id}`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Falha ao buscar usuário');
    return response.json();
  }

  static async createUser(data: any) {
    const response = await fetch(`${API_URL}/auth`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Falha ao criar usuário');
    return response.json();
  }

  static async updateUser(id: string, data: any) {
    const response = await fetch(`${API_URL}/auth/${id}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Falha ao atualizar usuário');
    return response.json();
  }

  static async deleteUser(id: string) {
    const response = await fetch(`${API_URL}/auth/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Falha ao deletar usuário');
    return response.json();
  }

  // ===== PRODUCTS =====
  static async getProducts(enterpriseId?: string) {
    const url = new URL(`${API_URL}/products`);
    if (enterpriseId) url.searchParams.append('enterpriseId', enterpriseId);
    const response = await fetch(url.toString(), {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Falha ao buscar produtos');
    return response.json();
  }

  static async getProduct(id: string) {
    const response = await fetch(`${API_URL}/products/${id}`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Falha ao buscar produto');
    return response.json();
  }

  static async createProduct(data: any) {
    const response = await fetch(`${API_URL}/products`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Falha ao criar produto');
    return response.json();
  }

  static async uploadProductPhoto(payload: { fileName: string; mimeType: string; dataBase64: string }) {
    const response = await fetch(`${API_URL}/products/upload-photo`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error('Falha ao enviar foto do produto');
    return response.json();
  }

  static async updateProduct(id: string, data: any) {
    const response = await fetch(`${API_URL}/products/${id}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Falha ao atualizar produto');
    return response.json();
  }

  static async deleteProduct(id: string) {
    const response = await fetch(`${API_URL}/products/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Falha ao deletar produto');
    return response.json();
  }

  // ===== CATEGORIES =====
  static async getCategories(enterpriseId?: string) {
    const url = new URL(`${API_URL}/categories`);
    if (enterpriseId) url.searchParams.append('enterpriseId', enterpriseId);
    const response = await fetch(url.toString(), {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Falha ao buscar categorias');
    return response.json();
  }

  static async getCategory(id: string) {
    const response = await fetch(`${API_URL}/categories/${id}`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Falha ao buscar categoria');
    return response.json();
  }

  static async createCategory(data: any) {
    const response = await fetch(`${API_URL}/categories`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Falha ao criar categoria');
    return response.json();
  }

  static async updateCategory(id: string, data: any) {
    const response = await fetch(`${API_URL}/categories/${id}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Falha ao atualizar categoria');
    return response.json();
  }

  static async deleteCategory(id: string) {
    const response = await fetch(`${API_URL}/categories/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Falha ao deletar categoria');
    return response.json();
  }

  // ===== CLIENTS =====
  static async getClients(enterpriseId: string) {
    const url = new URL(`${API_URL}/clients`);
    url.searchParams.append('enterpriseId', enterpriseId);
    const response = await fetch(url.toString(), {
      headers: this.getHeaders(),
    });
    this.handleUnauthorized(response);
    if (!response.ok) throw new Error('Falha ao buscar clientes');
    return response.json();
  }

  static async getClient(id: string) {
    const response = await fetch(`${API_URL}/clients/${id}`, {
      headers: this.getHeaders(),
    });
    this.handleUnauthorized(response);
    if (!response.ok) throw new Error('Falha ao buscar cliente');
    return response.json();
  }

  static async createClient(data: any) {
    
    const response = await fetch(`${API_URL}/clients`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    this.handleUnauthorized(response);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Erro na resposta:', errorText);
      throw new Error(`Falha ao criar cliente: ${response.status} - ${errorText}`);
    }
    
    const result = await response.json();
    return result;
  }

  static async uploadClientPhoto(payload: { fileName: string; mimeType: string; dataBase64: string }) {
    const response = await fetch(`${API_URL}/clients/upload-photo`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    this.handleUnauthorized(response);
    if (!response.ok) throw new Error('Falha ao enviar foto do cliente');
    return response.json();
  }

  static async updateClient(id: string, data: any) {
    const response = await fetch(`${API_URL}/clients/${id}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    this.handleUnauthorized(response);
    if (!response.ok) throw new Error('Falha ao atualizar cliente');
    return response.json();
  }

  static async deleteClient(id: string) {
    const response = await fetch(`${API_URL}/clients/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    this.handleUnauthorized(response);
    if (!response.ok) throw new Error('Falha ao deletar cliente');
    return response.json();
  }

  // ===== PLANS =====
  static async getPlans(enterpriseId?: string) {
    const url = new URL(`${API_URL}/plans`);
    if (enterpriseId) url.searchParams.append('enterpriseId', enterpriseId);
    const response = await fetch(url.toString(), {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Falha ao buscar planos');
    return response.json();
  }

  static async getPlan(id: string) {
    const response = await fetch(`${API_URL}/plans/${id}`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Falha ao buscar plano');
    return response.json();
  }

  static async createPlan(data: any) {
    const response = await fetch(`${API_URL}/plans`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Falha ao criar plano');
    return response.json();
  }

  static async updatePlan(id: string, data: any) {
    const response = await fetch(`${API_URL}/plans/${id}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Falha ao atualizar plano');
    return response.json();
  }

  static async deletePlan(id: string) {
    const response = await fetch(`${API_URL}/plans/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Falha ao deletar plano');
    return response.json();
  }

  // ===== SUPPLIERS =====
  static async getSuppliers(enterpriseId?: string) {
    const url = new URL(`${API_URL}/suppliers`);
    if (enterpriseId) url.searchParams.append('enterpriseId', enterpriseId);
    const response = await fetch(url.toString(), {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Falha ao buscar fornecedores');
    return response.json();
  }

  static async getSupplier(id: string) {
    const response = await fetch(`${API_URL}/suppliers/${id}`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Falha ao buscar fornecedor');
    return response.json();
  }

  static async createSupplier(data: any) {
    const response = await fetch(`${API_URL}/suppliers`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Falha ao criar fornecedor');
    return response.json();
  }

  static async updateSupplier(id: string, data: any) {
    const response = await fetch(`${API_URL}/suppliers/${id}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Falha ao atualizar fornecedor');
    return response.json();
  }

  static async deleteSupplier(id: string) {
    const response = await fetch(`${API_URL}/suppliers/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Falha ao deletar fornecedor');
    return response.json();
  }

  // ===== TRANSACTIONS =====
  static async getTransactions(params?: { clientId?: string; enterpriseId?: string }) {
    const url = new URL(`${API_URL}/transactions`);
    if (params?.clientId) url.searchParams.append('clientId', params.clientId);
    if (params?.enterpriseId) url.searchParams.append('enterpriseId', params.enterpriseId);
    const response = await fetch(url.toString(), {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Falha ao buscar transações');
    return response.json();
  }

  static async getTransaction(id: string) {
    const response = await fetch(`${API_URL}/transactions/${id}`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Falha ao buscar transação');
    return response.json();
  }

  static async createTransaction(data: any) {
    const response = await fetch(`${API_URL}/transactions`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Falha ao criar transação');
    return response.json();
  }

  static async updateTransaction(id: string, data: any) {
    const response = await fetch(`${API_URL}/transactions/${id}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Falha ao atualizar transação');
    return response.json();
  }

  static async deleteTransaction(id: string) {
    const response = await fetch(`${API_URL}/transactions/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Falha ao excluir transação');
    return response.json();
  }

  static async clearAllTransactions() {
    const response = await fetch(`${API_URL}/transactions/clear-all`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Falha ao limpar transações');
    return response.json();
  }

  // ===== ORDERS =====
  static async getOrders(enterpriseId?: string) {
    const url = new URL(`${API_URL}/orders`);
    if (enterpriseId) url.searchParams.append('enterpriseId', enterpriseId);
    const response = await fetch(url.toString(), {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Falha ao buscar pedidos');
    return response.json();
  }

  static async getOrder(id: string) {
    const response = await fetch(`${API_URL}/orders/${id}`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Falha ao buscar pedido');
    return response.json();
  }

  static async createOrder(data: any) {
    const response = await fetch(`${API_URL}/orders`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Falha ao criar pedido');
    return response.json();
  }

  static async updateOrder(id: string, data: any) {
    const response = await fetch(`${API_URL}/orders/${id}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Falha ao atualizar pedido');
    return response.json();
  }

  static async deleteOrder(id: string) {
    const response = await fetch(`${API_URL}/orders/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Falha ao deletar pedido');
    return response.json();
  }

  // ===== INGREDIENTS =====
  static async getIngredients() {
    const response = await fetch(`${API_URL}/ingredients`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Falha ao buscar ingredientes');
    return response.json();
  }

  static async getIngredient(id: string) {
    const response = await fetch(`${API_URL}/ingredients/${id}`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Falha ao buscar ingrediente');
    return response.json();
  }

  static async createIngredient(data: any) {
    const response = await fetch(`${API_URL}/ingredients`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Falha ao criar ingrediente');
    return response.json();
  }

  static async updateIngredient(id: string, data: any) {
    const response = await fetch(`${API_URL}/ingredients/${id}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Falha ao atualizar ingrediente');
    return response.json();
  }

  static async deleteIngredient(id: string) {
    const response = await fetch(`${API_URL}/ingredients/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Falha ao deletar ingrediente');
    return response.json();
  }

  // ===== SYSTEM =====
  static async resetDatabase() {
    const response = await fetch(`${API_URL}/system/reset`, {
      method: 'POST',
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Falha ao resetar database');
    return response.json();
  }

  static async downloadDatabaseBackup(): Promise<{ blob: Blob; filename: string }> {
    const response = await fetch(`${API_URL}/system/backup`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) throw new Error('Falha ao baixar backup da database');

    const contentDisposition = response.headers.get('content-disposition') || '';
    const filenameMatch = contentDisposition.match(/filename="([^"]+)"/i);
    const filename = filenameMatch?.[1] || 'database-backup.json';
    const blob = await response.blob();

    return { blob, filename };
  }

  static async restoreDatabaseBackup(backupData: any) {
    const response = await fetch(`${API_URL}/system/restore`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(backupData),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || 'Falha ao restaurar backup da database');
    }
    return response.json();
  }

  static async getSystemStatus() {
    const response = await fetch(`${API_URL}/system/status`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Falha ao buscar status do sistema');
    return response.json();
  }

  static async checkNeedsSetup() {
    const response = await fetch(`${API_URL}/system/needs-setup`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Falha ao verificar setup');
    return response.json();
  }

  static async initialSetup(name: string, email: string, password: string) {
    const response = await fetch(`${API_URL}/system/initial-setup`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ name, email, password }),
    });
    if (!response.ok) throw new Error('Falha ao realizar setup inicial');
    const data = await response.json();
    this.setToken(data.token);
    return data;
  }

  static async getSystemPrinters() {
    const response = await fetch(`${API_URL}/system/printers`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Falha ao buscar impressoras instaladas');
    return response.json();
  }

  // ===== WHATSAPP =====
  static async getWhatsAppStatus() {
    const response = await fetch(`${API_URL}/whatsapp/status`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Falha ao buscar status do WhatsApp');
    return response.json();
  }

  static async getWhatsAppQr() {
    const response = await fetch(`${API_URL}/whatsapp/qr`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Falha ao buscar QR Code do WhatsApp');
    return response.json();
  }

  static async initWhatsAppSession() {
    const response = await fetch(`${API_URL}/whatsapp/init`, {
      method: 'POST',
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Falha ao inicializar integração do WhatsApp');
    return response.json();
  }

  static async startWhatsAppSession(options: {
    forceNewSession?: boolean;
    sessionName?: string;
    startDate?: string;
    endDate?: string;
    syncFullHistory?: boolean;
  } = {}) {
    const response = await fetch(`${API_URL}/whatsapp/start`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        forceNewSession: Boolean(options.forceNewSession),
        sessionName: String(options.sessionName || '').trim(),
        startDate: String(options.startDate || '').trim(),
        endDate: String(options.endDate || '').trim(),
        syncFullHistory: Boolean(options.syncFullHistory),
      }),
    });
    if (!response.ok) throw new Error('Falha ao iniciar sessão do WhatsApp');
    return response.json();
  }

  static async stopWhatsAppSession() {
    const response = await fetch(`${API_URL}/whatsapp/stop`, {
      method: 'POST',
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Falha ao encerrar sessão do WhatsApp');
    return response.json();
  }

  static async sendWhatsAppMessage(phone: string, message: string) {
    const response = await fetch(`${API_URL}/whatsapp/send`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ phone, message }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || 'Falha ao enviar mensagem WhatsApp');
    }
    return response.json();
  }

  static async sendWhatsAppBulk(recipients: string[], message: string) {
    const response = await fetch(`${API_URL}/whatsapp/send-bulk`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ recipients, message }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || 'Falha ao enviar mensagens em lote');
    }
    return response.json();
  }

  static async getWhatsAppChats() {
    const response = await fetch(`${API_URL}/whatsapp/chats`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Falha ao carregar conversas do WhatsApp');
    return response.json();
  }

  static async getWhatsAppChatMessages(chatId: string, limit = 80) {
    const encoded = String(chatId || '').replace(/@/g, '__AT__');
    const response = await fetch(`${API_URL}/whatsapp/chats/${encoded}/messages?limit=${limit}`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Falha ao carregar mensagens da conversa');
    return response.json();
  }

  static async deleteWhatsAppChat(chatId: string) {
    const encoded = String(chatId || '').replace(/@/g, '__AT__');
    const response = await fetch(`${API_URL}/whatsapp/chats/${encoded}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || 'Falha ao excluir conversa');
    }
    return response.json();
  }

  static async clearWhatsAppChatMessages(chatId: string) {
    const encoded = String(chatId || '').replace(/@/g, '__AT__');
    const response = await fetch(`${API_URL}/whatsapp/chats/${encoded}/messages`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || 'Falha ao apagar mensagens da conversa');
    }
    return response.json();
  }

  static async sendWhatsAppMessageToChat(chatId: string, message: string) {
    const response = await fetch(`${API_URL}/whatsapp/send-to-chat`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ chatId, message }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || 'Falha ao enviar mensagem para a conversa');
    }
    return response.json();
  }

  static async improveWhatsAppTextWithAi(chatId: string, text: string) {
    const response = await fetch(`${API_URL}/whatsapp/ai/improve-text`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ chatId, text }),
    });
    if (!response.ok) {
      const textErr = await response.text();
      throw new Error(textErr || 'Falha ao melhorar texto com IA');
    }
    return response.json();
  }

  static async getWhatsAppChatAiAgentState(chatId: string) {
    const encoded = String(chatId || '').replace(/@/g, '__AT__');
    const response = await fetch(`${API_URL}/whatsapp/chats/${encoded}/ai-agent`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) {
      const textErr = await response.text();
      throw new Error(textErr || 'Falha ao buscar estado do agente IA');
    }
    return response.json();
  }

  static async setWhatsAppChatAiAgentState(chatId: string, enabled: boolean) {
    const encoded = String(chatId || '').replace(/@/g, '__AT__');
    const response = await fetch(`${API_URL}/whatsapp/chats/${encoded}/ai-agent`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify({ enabled: Boolean(enabled) }),
    });
    if (!response.ok) {
      const textErr = await response.text();
      throw new Error(textErr || 'Falha ao atualizar agente IA');
    }
    return response.json();
  }

  static async sendWhatsAppMediaToChat(
    chatId: string,
    message: string,
    attachment: { mediaType: 'image' | 'document' | 'audio'; base64Data: string; mimeType?: string; fileName?: string }
  ) {
    const response = await fetch(`${API_URL}/whatsapp/send-media-to-chat`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ chatId, message, attachment }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || 'Falha ao enviar mídia para a conversa');
    }
    return response.json();
  }

  static async transcribeWhatsAppAudio(payload: {
    chatId?: string;
    messageId?: string;
    mediaDataUrl: string;
    mimeType?: string | null;
    fileName?: string | null;
  }) {
    const response = await fetch(`${API_URL}/whatsapp/transcribe-audio`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload || {}),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || 'Falha ao transcrever áudio');
    }
    return response.json();
  }

  static async scheduleWhatsAppMessage(payload: {
    chatId: string;
    message?: string;
    scheduleAt: string;
    attachment?: { mediaType: 'image' | 'document' | 'audio'; base64Data: string; mimeType?: string; fileName?: string } | null;
  }) {
    const response = await fetch(`${API_URL}/whatsapp/schedule`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || 'Falha ao agendar mensagem');
    }
    return response.json();
  }

  static async getWhatsAppSchedules(chatId?: string) {
    const query = chatId ? `?chatId=${encodeURIComponent(chatId)}` : '';
    const response = await fetch(`${API_URL}/whatsapp/schedule${query}`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Falha ao carregar agendamentos');
    return response.json();
  }

  static async cancelWhatsAppSchedule(id: string) {
    const response = await fetch(`${API_URL}/whatsapp/schedule/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || 'Falha ao cancelar agendamento');
    }
    return response.json();
  }

  static async getWhatsAppAiConfig() {
    const response = await fetch(`${API_URL}/whatsapp/ai-config`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Falha ao carregar configuração de AI');
    return response.json();
  }

  static async updateWhatsAppAiConfig(config: any) {
    const response = await fetch(`${API_URL}/whatsapp/ai-config`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(config || {}),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || 'Falha ao salvar configuração de AI');
    }
    return response.json();
  }

  static async getWhatsAppAiAudit(limit = 50) {
    const safeLimit = Math.max(1, Math.min(200, Number(limit || 50)));
    const response = await fetch(`${API_URL}/whatsapp/ai-audit?limit=${encodeURIComponent(String(safeLimit))}`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Falha ao carregar auditoria da IA');
    return response.json();
  }

  static async getWhatsAppAiFlowNodes() {
    const response = await fetch(`${API_URL}/whatsapp/ai-flow-nodes`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Falha ao gerar nodes de fluxo de AI');
    return response.json();
  }
}

export default ApiService;
