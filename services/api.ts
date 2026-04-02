const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export class ApiService {
  private static token: string | null = null;
  private static readonly TOKEN_STORAGE_KEY = 'canteen_auth_token';
  private static readonly ACTIVE_ENTERPRISE_STORAGE_KEY = 'canteen_active_enterprise';
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

  private static async readErrorMessage(response: Response, fallback: string) {
    try {
      const payload = await response.json();
      if (payload?.error) return payload.error;
    } catch {
      // no-op
    }
    return fallback;
  }

  private static getActiveEnterpriseId() {
    if (typeof window === 'undefined') return '';
    try {
      const raw = localStorage.getItem(this.ACTIVE_ENTERPRISE_STORAGE_KEY);
      if (!raw) return '';
      const parsed = JSON.parse(raw) as { id?: string } | null;
      return String(parsed?.id || '').trim();
    } catch {
      return '';
    }
  }

  private static requireActiveEnterpriseId() {
    const enterpriseId = this.getActiveEnterpriseId();
    if (!enterpriseId) {
      throw new Error('Selecione uma unidade ativa para usar o WhatsApp.');
    }
    return enterpriseId;
  }

  private static buildApiUrl(
    path: string,
    query?: Record<string, string | number | boolean | undefined | null>
  ) {
    const base = String(API_URL || '').trim().replace(/\/+$/, '') || '/api';
    const normalizedPath = `/${String(path || '').trim().replace(/^\/+/, '')}`;
    const rawUrl = `${base}${normalizedPath}`;

    if (!query) return rawUrl;

    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      const normalizedValue = String(value).trim();
      if (!normalizedValue) return;
      params.append(key, normalizedValue);
    });

    const queryString = params.toString();
    return queryString ? `${rawUrl}?${queryString}` : rawUrl;
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

  static async generatePasswordResetLink(userId: string) {
    const response = await fetch(`${API_URL}/auth/${encodeURIComponent(String(userId || '').trim())}/reset-password-link`, {
      method: 'POST',
      headers: this.getHeaders(),
    });
    this.handleUnauthorized(response);
    if (!response.ok) throw new Error(await this.readErrorMessage(response, 'Falha ao gerar link de redefinição'));
    return response.json();
  }

  static async validatePasswordResetToken(token: string) {
    const response = await fetch(this.buildApiUrl('/auth/reset-password/validate', {
      token: String(token || '').trim(),
    }), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) throw new Error(await this.readErrorMessage(response, 'Link de redefinição inválido ou expirado'));
    return response.json();
  }

  static async completePasswordReset(payload: { token: string; password: string; confirmPassword: string }) {
    const response = await fetch(`${API_URL}/auth/reset-password/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload || {}),
    });
    if (!response.ok) throw new Error(await this.readErrorMessage(response, 'Falha ao redefinir senha'));
    return response.json();
  }

  static async loginWithPortalToken(token: string) {
    const response = await fetch(`${API_URL}/auth/portal/access`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token: String(token || '').trim() }),
    });
    if (!response.ok) throw new Error(await this.readErrorMessage(response, 'Falha ao acessar portal por link'));
    const data = await response.json();
    if (data?.token) this.setToken(String(data.token));
    return data;
  }

  static async generatePortalAccessLink(userId: string) {
    const response = await fetch(`${API_URL}/auth/${encodeURIComponent(String(userId || '').trim())}/portal-link`, {
      method: 'POST',
      headers: this.getHeaders(),
    });
    this.handleUnauthorized(response);
    if (!response.ok) throw new Error(await this.readErrorMessage(response, 'Falha ao gerar link fixo do portal'));
    return response.json();
  }

  static async generatePortalLinksForExistingClients(enterpriseId?: string) {
    const response = await fetch(`${API_URL}/auth/portal-links/backfill`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ enterpriseId: String(enterpriseId || '').trim() }),
    });
    this.handleUnauthorized(response);
    if (!response.ok) throw new Error(await this.readErrorMessage(response, 'Falha ao gerar links dos clientes existentes'));
    return response.json();
  }

  // ===== SAAS FINANCIAL =====
  static async getSaasCashflowEntries() {
    const response = await fetch(`${API_URL}/saas-financial/cashflow`, {
      headers: this.getHeaders(),
    });
    this.handleUnauthorized(response);
    if (!response.ok) throw new Error(await this.readErrorMessage(response, 'Falha ao buscar lancamentos financeiros SaaS'));
    return response.json();
  }

  static async createSaasCashflowEntry(data: any) {
    const response = await fetch(`${API_URL}/saas-financial/cashflow`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data || {}),
    });
    this.handleUnauthorized(response);
    if (!response.ok) throw new Error(await this.readErrorMessage(response, 'Falha ao criar lancamento financeiro SaaS'));
    return response.json();
  }

  static async updateSaasCashflowEntry(id: string, data: any) {
    const response = await fetch(`${API_URL}/saas-financial/cashflow/${encodeURIComponent(String(id || '').trim())}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(data || {}),
    });
    this.handleUnauthorized(response);
    if (!response.ok) throw new Error(await this.readErrorMessage(response, 'Falha ao atualizar lancamento financeiro SaaS'));
    return response.json();
  }

  static async deleteSaasCashflowEntry(id: string) {
    const response = await fetch(`${API_URL}/saas-financial/cashflow/${encodeURIComponent(String(id || '').trim())}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    this.handleUnauthorized(response);
    if (!response.ok) throw new Error(await this.readErrorMessage(response, 'Falha ao excluir lancamento financeiro SaaS'));
    return response.json();
  }

  // ===== TASK REMINDERS =====
  static async getTaskReminders() {
    const response = await fetch(`${API_URL}/task-reminders`, {
      headers: this.getHeaders(),
    });
    this.handleUnauthorized(response);
    if (!response.ok) throw new Error(await this.readErrorMessage(response, 'Falha ao buscar lembretes de tarefas'));
    return response.json();
  }

  static async createTaskReminder(data: any) {
    const response = await fetch(`${API_URL}/task-reminders`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data || {}),
    });
    this.handleUnauthorized(response);
    if (!response.ok) throw new Error(await this.readErrorMessage(response, 'Falha ao criar lembrete de tarefa'));
    return response.json();
  }

  static async updateTaskReminder(id: string, data: any) {
    const response = await fetch(`${API_URL}/task-reminders/${encodeURIComponent(String(id || '').trim())}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(data || {}),
    });
    this.handleUnauthorized(response);
    if (!response.ok) throw new Error(await this.readErrorMessage(response, 'Falha ao atualizar lembrete de tarefa'));
    return response.json();
  }

  static async deleteTaskReminder(id: string) {
    const response = await fetch(`${API_URL}/task-reminders/${encodeURIComponent(String(id || '').trim())}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    this.handleUnauthorized(response);
    if (!response.ok) throw new Error(await this.readErrorMessage(response, 'Falha ao excluir lembrete de tarefa'));
    return response.json();
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
    if (!response.ok) throw new Error(await this.readErrorMessage(response, 'Falha ao criar usuário'));
    return response.json();
  }

  static async updateUser(id: string, data: any) {
    const response = await fetch(`${API_URL}/auth/${id}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error(await this.readErrorMessage(response, 'Falha ao atualizar usuário'));
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
    const response = await fetch(this.buildApiUrl('/products', {
      enterpriseId,
    }), {
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

  static async restoreProductsSnapshot(enterpriseId: string, items: any[]) {
    const response = await fetch(`${API_URL}/products/restore`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ enterpriseId, items }),
    });
    if (!response.ok) throw new Error('Falha ao restaurar backup de produtos');
    return response.json();
  }

  // ===== CATEGORIES =====
  static async getCategories(enterpriseId?: string) {
    const response = await fetch(this.buildApiUrl('/categories', {
      enterpriseId,
    }), {
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
  static async getClients(enterpriseId?: string) {
    const response = await fetch(this.buildApiUrl('/clients', {
      enterpriseId,
    }), {
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
    if (!response.ok) {
      let message = 'Falha ao atualizar cliente';
      try {
        const payload = await response.json();
        const errorMessage = String(payload?.error || '').trim();
        const details = Array.isArray(payload?.details)
          ? payload.details.map((item: any) => String(item || '').trim()).filter(Boolean)
          : [];

        if (errorMessage) {
          message = errorMessage;
        }

        if (details.length > 0) {
          message = `${message}: ${details.join(', ')}`;
        }
      } catch {
        // mantém mensagem padrão
      }
      throw new Error(message);
    }
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

  static async restoreClientsSnapshot(enterpriseId: string, items: any[]) {
    const response = await fetch(`${API_URL}/clients/restore`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ enterpriseId, items }),
    });
    this.handleUnauthorized(response);
    if (!response.ok) throw new Error('Falha ao restaurar backup de clientes');
    return response.json();
  }

  // ===== ERROR TICKETS =====
  static async createErrorTicket(data: {
    title?: string;
    message: string;
    details?: string;
    forceAutoPatch?: boolean;
    source?: string;
    page?: string;
    enterpriseId?: string;
    enterpriseName?: string;
    ownerClientName?: string;
    ownerClientEmail?: string;
    ownerClientPhone?: string;
    userId?: string;
    userName?: string;
    userEmail?: string;
    userPhone?: string;
    userRole?: string;
    context?: Record<string, any>;
  }) {
    const response = await fetch(`${API_URL}/error-tickets`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data || {}),
    });
    this.handleUnauthorized(response);
    if (!response.ok) throw new Error(await this.readErrorMessage(response, 'Falha ao enviar ticket de erro'));
    return response.json();
  }

  static async getErrorTickets(params?: { enterpriseId?: string; status?: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | string }) {
    const response = await fetch(this.buildApiUrl('/error-tickets', {
      enterpriseId: params?.enterpriseId,
      status: params?.status,
    }), {
      headers: this.getHeaders(),
    });
    this.handleUnauthorized(response);
    if (!response.ok) throw new Error(await this.readErrorMessage(response, 'Falha ao buscar tickets de erro'));
    return response.json();
  }

  static async updateErrorTicket(id: string, data: { status?: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | string; resolutionNote?: string }) {
    const response = await fetch(`${API_URL}/error-tickets/${id}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(data || {}),
    });
    this.handleUnauthorized(response);
    if (!response.ok) throw new Error(await this.readErrorMessage(response, 'Falha ao atualizar ticket'));
    return response.json();
  }

  static async removeAiPatchFromTicket(id: string) {
    const response = await fetch(`${API_URL}/error-tickets/${id}/remove-ai-patch`, {
      method: 'POST',
      headers: this.getHeaders(),
    });
    this.handleUnauthorized(response);
    if (!response.ok) throw new Error(await this.readErrorMessage(response, 'Falha ao remover patch IA'));
    return response.json();
  }

  static async validateErrorTicketHuman(id: string) {
    const response = await fetch(`${API_URL}/error-tickets/${id}/validate-human`, {
      method: 'POST',
      headers: this.getHeaders(),
    });
    this.handleUnauthorized(response);
    if (!response.ok) throw new Error(await this.readErrorMessage(response, 'Falha ao validar ticket manualmente'));
    return response.json();
  }

  // ===== PLANS =====
  static async getPlans(enterpriseId?: string) {
    const response = await fetch(this.buildApiUrl('/plans', {
      enterpriseId,
    }), {
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
    const response = await fetch(this.buildApiUrl('/suppliers', {
      enterpriseId,
    }), {
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
    const response = await fetch(this.buildApiUrl('/transactions', {
      clientId: params?.clientId,
      enterpriseId: params?.enterpriseId,
    }), {
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

  static async deleteTransaction(id: string, metadata?: { deletedByName?: string; deleteReason?: string }) {
    const response = await fetch(`${API_URL}/transactions/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
      body: JSON.stringify({
        deletedByName: String(metadata?.deletedByName || '').trim(),
        deleteReason: String(metadata?.deleteReason || '').trim(),
      }),
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
    const response = await fetch(this.buildApiUrl('/orders', {
      enterpriseId,
    }), {
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
  static async getIngredients(includeInactive = false) {
    const response = await fetch(this.buildApiUrl('/ingredients', {
      includeInactive: includeInactive ? 'true' : undefined,
    }), {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Falha ao buscar ingredientes');
    return response.json();
  }

  static async searchIngredients(query: string, limit = 120) {
    const response = await fetch(this.buildApiUrl('/ingredients/search', {
      q: query,
      limit: String(limit),
    }), {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Falha ao buscar sugestões de ingredientes');
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

  static async restoreIngredientsTable(items: any[]) {
    const response = await fetch(`${API_URL}/ingredients/restore`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ items }),
    });
    if (!response.ok) throw new Error('Falha ao restaurar base nutricional');
    return response.json();
  }

  // ===== MENUS =====
  static async getWeeklyMenu(
    enterpriseId: string,
    type: 'ALMOCO' | 'LANCHE',
    weekIndex: number = 1,
    monthKey: string = ''
  ) {
    const response = await fetch(this.buildApiUrl('/menus', {
      enterpriseId,
      type,
      weekIndex: String(Math.max(1, Math.min(5, Number(weekIndex || 1) || 1))),
      monthKey: String(monthKey || '').trim() || undefined,
    }), {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Falha ao buscar cardápio semanal');
    return response.json();
  }

  static async saveWeeklyMenu(
    enterpriseId: string,
    type: 'ALMOCO' | 'LANCHE',
    days: any[],
    weekIndex: number = 1,
    monthKey: string = ''
  ) {
    const response = await fetch(`${API_URL}/menus`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify({
        enterpriseId,
        type,
        weekIndex: Math.max(1, Math.min(5, Number(weekIndex || 1) || 1)),
        monthKey: String(monthKey || '').trim(),
        days
      }),
    });
    if (!response.ok) throw new Error('Falha ao salvar cardápio semanal');
    return response.json();
  }

  // ===== SCHOOL CALENDAR =====
  static async getSchoolCalendar(enterpriseId: string, schoolYear: number) {
    const response = await fetch(this.buildApiUrl('/school-calendar', {
      enterpriseId,
      schoolYear: String(schoolYear),
    }), {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Falha ao buscar calendário escolar');
    return response.json();
  }

  static async saveSchoolCalendar(
    enterpriseId: string,
    schoolYear: number,
    payload: {
      meta: any;
      legends: any[];
      events: any[];
    }
  ) {
    const response = await fetch(`${API_URL}/school-calendar`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify({
        enterpriseId,
        schoolYear,
        meta: payload?.meta,
        legends: Array.isArray(payload?.legends) ? payload.legends : [],
        events: Array.isArray(payload?.events) ? payload.events : [],
      }),
    });
    if (!response.ok) throw new Error('Falha ao salvar calendário escolar');
    return response.json();
  }

  static async getAiNutritionalData(
    foodName: string,
    conversation: Array<{ role: 'user' | 'assistant'; text: string }> = []
  ) {
    const response = await fetch(`${API_URL}/ai/nutritional-data`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ foodName, conversation }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.message || 'Falha ao consultar dados nutricionais com IA');
    return payload;
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

  static async getDevAssistantConfig() {
    const response = await fetch(`${API_URL}/system/dev-assistant-config`, {
      headers: this.getHeaders(),
    });
    this.handleUnauthorized(response);
    if (!response.ok) throw new Error(await this.readErrorMessage(response, 'Falha ao buscar configuração do DEV Assistant'));
    return response.json();
  }

  static async updateDevAssistantConfig(config: { autoPatchEnabled: boolean }) {
    const response = await fetch(`${API_URL}/system/dev-assistant-config`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(config || {}),
    });
    this.handleUnauthorized(response);
    if (!response.ok) throw new Error(await this.readErrorMessage(response, 'Falha ao salvar configuração do DEV Assistant'));
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
    const enterpriseId = this.requireActiveEnterpriseId();
    const response = await fetch(this.buildApiUrl('/whatsapp/status', { enterpriseId }), {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Falha ao buscar status do WhatsApp');
    return response.json();
  }

  static async getWhatsAppQr() {
    const enterpriseId = this.requireActiveEnterpriseId();
    const response = await fetch(this.buildApiUrl('/whatsapp/qr', { enterpriseId }), {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Falha ao buscar QR Code do WhatsApp');
    return response.json();
  }

  static async initWhatsAppSession() {
    const enterpriseId = this.requireActiveEnterpriseId();
    const response = await fetch(`${API_URL}/whatsapp/init`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ enterpriseId }),
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
    safeSyncMode?: boolean;
    syncContacts?: boolean;
    syncHistories?: boolean;
  } = {}) {
    const enterpriseId = this.requireActiveEnterpriseId();
    const response = await fetch(`${API_URL}/whatsapp/start`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        enterpriseId,
        forceNewSession: Boolean(options.forceNewSession),
        sessionName: String(options.sessionName || '').trim(),
        startDate: String(options.startDate || '').trim(),
        endDate: String(options.endDate || '').trim(),
        syncFullHistory: Boolean(options.syncFullHistory),
        safeSyncMode: options.safeSyncMode !== false,
        syncContacts: options.syncContacts !== false,
        syncHistories: options.syncHistories !== false,
      }),
    });
    if (!response.ok) throw new Error('Falha ao iniciar sessão do WhatsApp');
    return response.json();
  }

  static async stopWhatsAppSession() {
    const enterpriseId = this.requireActiveEnterpriseId();
    const response = await fetch(`${API_URL}/whatsapp/stop`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ enterpriseId }),
    });
    if (!response.ok) throw new Error('Falha ao encerrar sessão do WhatsApp');
    return response.json();
  }

  static async sendWhatsAppMessage(phone: string, message: string) {
    const enterpriseId = this.requireActiveEnterpriseId();
    const response = await fetch(`${API_URL}/whatsapp/send`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ enterpriseId, phone, message }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || 'Falha ao enviar mensagem WhatsApp');
    }
    return response.json();
  }

  static async sendWhatsAppBulk(recipients: string[], message: string) {
    const enterpriseId = this.requireActiveEnterpriseId();
    const response = await fetch(`${API_URL}/whatsapp/send-bulk`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ enterpriseId, recipients, message }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || 'Falha ao enviar mensagens em lote');
    }
    return response.json();
  }

  static async getWhatsAppDispatchAudience(params: {
    enterpriseId: string;
    filter?: 'TODOS' | 'RESPONSAVEIS' | 'COLABORADORES' | 'SALDO_BAIXO' | 'PLANO_A_VENCER' | 'RELATORIO_ENTREGA';
    profileType?: 'RESPONSAVEL_PARENTESCO' | 'COLABORADOR';
    periodMode?: 'SEMANAL' | 'QUINZENAL' | 'MENSAL' | 'DESTA_SEMANA';
    businessDaysOnly?: boolean;
  }) {
    const qs = new URLSearchParams({
      enterpriseId: String(params.enterpriseId || ''),
      filter: String(params.filter || 'TODOS'),
      profileType: String(params.profileType || 'RESPONSAVEL_PARENTESCO'),
      periodMode: String(params.periodMode || 'SEMANAL'),
      businessDaysOnly: String(Boolean(params.businessDaysOnly)),
    });
    const response = await fetch(`${API_URL}/whatsapp/dispatch/audience?${qs.toString()}`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || 'Falha ao buscar audiência do disparo');
    }
    return response.json();
  }

  static async getWhatsAppDispatchConfig(enterpriseId: string) {
    const qs = new URLSearchParams({
      enterpriseId: String(enterpriseId || ''),
    });
    const response = await fetch(`${API_URL}/whatsapp/dispatch/config?${qs.toString()}`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || 'Falha ao carregar configuração de disparo');
    }
    return response.json();
  }

  static async saveWhatsAppDispatchConfig(payload: {
    enterpriseId: string;
    config: any;
  }) {
    const response = await fetch(`${API_URL}/whatsapp/dispatch/config`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || 'Falha ao salvar configuração de disparo');
    }
    return response.json();
  }

  static async getWhatsAppDispatchProfiles(enterpriseId: string) {
    const qs = new URLSearchParams({
      enterpriseId: String(enterpriseId || ''),
    });
    const response = await fetch(`${API_URL}/whatsapp/dispatch/profiles?${qs.toString()}`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || 'Falha ao carregar perfis de disparo');
    }
    return response.json();
  }

  static async saveWhatsAppDispatchProfile(payload: {
    enterpriseId: string;
    profile: any;
  }) {
    const response = await fetch(`${API_URL}/whatsapp/dispatch/profiles`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || 'Falha ao salvar perfil de disparo');
    }
    return response.json();
  }

  static async updateWhatsAppDispatchProfileStatus(payload: {
    enterpriseId: string;
    profileId: string;
    paused: boolean;
  }) {
    const response = await fetch(`${API_URL}/whatsapp/dispatch/profiles/${encodeURIComponent(String(payload.profileId || '').trim())}/status`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify({
        enterpriseId: payload.enterpriseId,
        paused: payload.paused,
      }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || 'Falha ao atualizar status do perfil');
    }
    return response.json();
  }

  static async deleteWhatsAppDispatchProfile(payload: { enterpriseId: string; profileId: string }) {
    const qs = new URLSearchParams({
      enterpriseId: String(payload.enterpriseId || ''),
    });
    const response = await fetch(`${API_URL}/whatsapp/dispatch/profiles/${encodeURIComponent(String(payload.profileId || '').trim())}?${qs.toString()}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || 'Falha ao apagar perfil de disparo');
    }
    return response.json();
  }

  static async getWhatsAppDispatchLogs(params: { enterpriseId: string; limit?: number }) {
    const qs = new URLSearchParams({
      enterpriseId: String(params.enterpriseId || ''),
      limit: String(Math.max(1, Math.min(500, Number(params.limit || 100)))),
    });
    const response = await fetch(`${API_URL}/whatsapp/dispatch/logs?${qs.toString()}`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || 'Falha ao carregar logs de disparo');
    }
    return response.json();
  }

  static async getWhatsAppSyncDiagnostics(params: {
    limit?: number;
    reason?: string;
    from?: string | number;
    to?: string | number;
    startDate?: string;
    endDate?: string;
  } = {}) {
    const enterpriseId = this.requireActiveEnterpriseId();
    const qs = new URLSearchParams();
    qs.set('enterpriseId', enterpriseId);
    qs.set('limit', String(Math.max(1, Math.min(400, Number(params.limit || 100)))));
    if (String(params.reason || '').trim()) qs.set('reason', String(params.reason || '').trim());
    if (params.from !== undefined && String(params.from).trim()) qs.set('from', String(params.from).trim());
    if (params.to !== undefined && String(params.to).trim()) qs.set('to', String(params.to).trim());
    if (String(params.startDate || '').trim()) qs.set('startDate', String(params.startDate || '').trim());
    if (String(params.endDate || '').trim()) qs.set('endDate', String(params.endDate || '').trim());

    const response = await fetch(`${API_URL}/whatsapp/sync-diagnostics?${qs.toString()}`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || 'Falha ao carregar diagnóstico de sincronização');
    }
    return response.json();
  }

  static async appendWhatsAppDispatchLogs(payload: { enterpriseId: string; entries: any[] }) {
    const response = await fetch(`${API_URL}/whatsapp/dispatch/logs`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || 'Falha ao salvar logs de disparo');
    }
    return response.json();
  }

  static async clearWhatsAppDispatchLogs(enterpriseId: string) {
    const qs = new URLSearchParams({
      enterpriseId: String(enterpriseId || ''),
    });
    const response = await fetch(`${API_URL}/whatsapp/dispatch/logs?${qs.toString()}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || 'Falha ao limpar logs de disparo');
    }
    return response.json();
  }

  static async getWhatsAppChats() {
    const enterpriseId = this.requireActiveEnterpriseId();
    const response = await fetch(this.buildApiUrl('/whatsapp/chats', { enterpriseId }), {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Falha ao carregar conversas do WhatsApp');
    return response.json();
  }

  static async getWhatsAppChatMessages(chatId: string, limit = 80) {
    const enterpriseId = this.requireActiveEnterpriseId();
    const encoded = String(chatId || '').replace(/@/g, '__AT__');
    const response = await fetch(this.buildApiUrl(`/whatsapp/chats/${encoded}/messages`, { enterpriseId, limit }), {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Falha ao carregar mensagens da conversa');
    return response.json();
  }

  static async deleteWhatsAppChat(chatId: string) {
    const enterpriseId = this.requireActiveEnterpriseId();
    const encoded = String(chatId || '').replace(/@/g, '__AT__');
    const response = await fetch(this.buildApiUrl(`/whatsapp/chats/${encoded}`, { enterpriseId }), {
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
    const enterpriseId = this.requireActiveEnterpriseId();
    const encoded = String(chatId || '').replace(/@/g, '__AT__');
    const response = await fetch(this.buildApiUrl(`/whatsapp/chats/${encoded}/messages`, { enterpriseId }), {
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
    const enterpriseId = this.requireActiveEnterpriseId();
    const response = await fetch(`${API_URL}/whatsapp/send-to-chat`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ enterpriseId, chatId, message }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || 'Falha ao enviar mensagem para a conversa');
    }
    return response.json();
  }

  static async improveWhatsAppTextWithAi(chatId: string, text: string) {
    const enterpriseId = this.requireActiveEnterpriseId();
    const response = await fetch(`${API_URL}/whatsapp/ai/improve-text`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ enterpriseId, chatId, text }),
    });
    if (!response.ok) {
      const textErr = await response.text();
      throw new Error(textErr || 'Falha ao melhorar texto com IA');
    }
    return response.json();
  }

  static async getWhatsAppChatAiAgentState(chatId: string) {
    const enterpriseId = this.requireActiveEnterpriseId();
    const encoded = String(chatId || '').replace(/@/g, '__AT__');
    const response = await fetch(this.buildApiUrl(`/whatsapp/chats/${encoded}/ai-agent`, { enterpriseId }), {
      headers: this.getHeaders(),
    });
    if (!response.ok) {
      const textErr = await response.text();
      throw new Error(textErr || 'Falha ao buscar estado do agente IA');
    }
    return response.json();
  }

  static async setWhatsAppChatAiAgentState(chatId: string, enabled: boolean) {
    const enterpriseId = this.requireActiveEnterpriseId();
    const encoded = String(chatId || '').replace(/@/g, '__AT__');
    const response = await fetch(`${API_URL}/whatsapp/chats/${encoded}/ai-agent`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify({ enterpriseId, enabled: Boolean(enabled) }),
    });
    if (!response.ok) {
      const textErr = await response.text();
      throw new Error(textErr || 'Falha ao atualizar agente IA');
    }
    return response.json();
  }

  static async getWhatsAppAiHandoffRequests() {
    const enterpriseId = this.requireActiveEnterpriseId();
    const response = await fetch(this.buildApiUrl('/whatsapp/ai/handoff-requests', { enterpriseId }), {
      headers: this.getHeaders(),
    });
    if (!response.ok) {
      const textErr = await response.text();
      throw new Error(textErr || 'Falha ao carregar solicitações pendentes de atendimento IA');
    }
    return response.json();
  }

  static async decideWhatsAppAiHandoffRequest(id: string, accept: boolean) {
    const enterpriseId = this.requireActiveEnterpriseId();
    const response = await fetch(`${API_URL}/whatsapp/ai/handoff-requests/${encodeURIComponent(String(id || ''))}/decision`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ enterpriseId, accept: Boolean(accept) }),
    });
    if (!response.ok) {
      const textErr = await response.text();
      throw new Error(textErr || 'Falha ao registrar decisão de atendimento IA');
    }
    return response.json();
  }

  static async sendWhatsAppMediaToChat(
    chatId: string,
    message: string,
    attachment: { mediaType: 'image' | 'document' | 'audio'; base64Data: string; mimeType?: string; fileName?: string }
  ) {
    const enterpriseId = this.requireActiveEnterpriseId();
    const response = await fetch(`${API_URL}/whatsapp/send-media-to-chat`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ enterpriseId, chatId, message, attachment }),
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
    const enterpriseId = this.requireActiveEnterpriseId();
    const response = await fetch(`${API_URL}/whatsapp/transcribe-audio`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        enterpriseId,
        ...(payload || {}),
      }),
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
    const enterpriseId = this.requireActiveEnterpriseId();
    const response = await fetch(`${API_URL}/whatsapp/schedule`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        enterpriseId,
        ...(payload || {}),
      }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || 'Falha ao agendar mensagem');
    }
    return response.json();
  }

  static async getWhatsAppSchedules(chatId?: string) {
    const enterpriseId = this.requireActiveEnterpriseId();
    const query = this.buildApiUrl('/whatsapp/schedule', {
      enterpriseId,
      chatId: chatId || '',
    });
    const response = await fetch(query, {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Falha ao carregar agendamentos');
    return response.json();
  }

  static async cancelWhatsAppSchedule(id: string) {
    const enterpriseId = this.requireActiveEnterpriseId();
    const response = await fetch(this.buildApiUrl(`/whatsapp/schedule/${encodeURIComponent(id)}`, { enterpriseId }), {
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
    const enterpriseId = this.requireActiveEnterpriseId();
    const response = await fetch(this.buildApiUrl('/whatsapp/ai-config', { enterpriseId }), {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Falha ao carregar configuração de AI');
    return response.json();
  }

  static async updateWhatsAppAiConfig(config: any) {
    const enterpriseId = this.requireActiveEnterpriseId();
    const response = await fetch(`${API_URL}/whatsapp/ai-config`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify({
        enterpriseId,
        ...(config || {}),
      }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || 'Falha ao salvar configuração de AI');
    }
    return response.json();
  }

  static async getWhatsAppAiAudit(limit = 50) {
    const safeLimit = Math.max(1, Math.min(200, Number(limit || 50)));
    const enterpriseId = this.requireActiveEnterpriseId();
    const response = await fetch(this.buildApiUrl('/whatsapp/ai-audit', {
      enterpriseId,
      limit: safeLimit,
    }), {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Falha ao carregar auditoria da IA');
    return response.json();
  }

  static async getWhatsAppAiFlowNodes() {
    const enterpriseId = this.requireActiveEnterpriseId();
    const response = await fetch(this.buildApiUrl('/whatsapp/ai-flow-nodes', { enterpriseId }), {
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Falha ao gerar nodes de fluxo de AI');
    return response.json();
  }
}

export default ApiService;
