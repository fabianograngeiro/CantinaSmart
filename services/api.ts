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
}

export default ApiService;
