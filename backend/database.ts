import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
const DATABASE_FILE = path.join(DATA_DIR, 'database.json');
const CURRENT_SCHEMA_VERSION = 1;

interface DatabaseShape {
  schemaVersion: number;
  enterprises: any[];
  users: any[];
  products: any[];
  productSequence: number;
  categories: any[];
  clients: any[];
  plans: any[];
  suppliers: any[];
  transactions: any[];
  orders: any[];
  ingredients: any[];
  whatsappStore?: {
    history?: any;
    schedules?: any;
    aiConfig?: any;
    updatedAt?: string;
  };
}

const createEmptyDatabase = (): DatabaseShape => ({
  schemaVersion: CURRENT_SCHEMA_VERSION,
  enterprises: [],
  users: [],
  products: [],
  productSequence: 0,
  categories: [],
  clients: [],
  plans: [],
  suppliers: [],
  transactions: [],
  orders: [],
  ingredients: [],
  whatsappStore: {},
});

export class Database {
  private schemaVersion = CURRENT_SCHEMA_VERSION;
  private enterprises: any[] = [];
  private users: any[] = [];
  private products: any[] = [];
  private productSequence = 0;
  private categories: any[] = [];
  private clients: any[] = [];
  private plans: any[] = [];
  private suppliers: any[] = [];
  private transactions: any[] = [];
  private orders: any[] = [];
  private ingredients: any[] = [];
  private whatsappStore: {
    history?: any;
    schedules?: any;
    aiConfig?: any;
    updatedAt?: string;
  } = {};

  private normalizeBrazilPhone(value: any) {
    const digits = String(value ?? '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('55')) return digits;
    if (digits.length >= 10) return `55${digits}`;
    return digits;
  }

  private normalizeContactFields(record: any) {
    const next = { ...(record || {}) };
    const phoneFields = ['phone', 'phone1', 'phone2', 'guardianPhone', 'parentWhatsapp'];

    for (const field of phoneFields) {
      if (field in next) {
        next[field] = this.normalizeBrazilPhone(next[field]);
      }
    }

    return next;
  }

  private normalizeStoredData() {
    this.enterprises = this.enterprises.map((enterprise) => this.normalizeContactFields(enterprise));
    this.clients = this.clients.map((client) => this.normalizeContactFields(client));
    this.suppliers = this.suppliers.map((supplier) => this.normalizeContactFields(supplier));
  }

  constructor() {
    this.loadData();
  }

  private ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  private readLegacyData(): DatabaseShape {
    const readArrayFile = (fileName: string): any[] => {
      const filePath = path.join(DATA_DIR, fileName);
      if (!fs.existsSync(filePath)) return [];

      try {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    };

    return {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      enterprises: readArrayFile('enterprises.json'),
      users: readArrayFile('users.json'),
      products: readArrayFile('products.json'),
      productSequence: 0,
      categories: [],
      clients: readArrayFile('clients.json'),
      plans: readArrayFile('plans.json'),
      suppliers: readArrayFile('suppliers.json'),
      transactions: readArrayFile('transactions.json'),
      orders: readArrayFile('orders.json'),
      ingredients: readArrayFile('ingredients.json'),
    };
  }

  private normalizeIncomingData(raw: any): DatabaseShape {
    const safeRaw = raw && typeof raw === 'object' ? raw : {};
    const ensureArray = (value: any) => (Array.isArray(value) ? value : []);
    const rawVersion = Number(safeRaw.schemaVersion);
    const detectedVersion = Number.isFinite(rawVersion) && rawVersion > 0
      ? Math.trunc(rawVersion)
      : 0;
    const merged = {
      ...createEmptyDatabase(),
      ...safeRaw,
      enterprises: ensureArray(safeRaw.enterprises),
      users: ensureArray(safeRaw.users),
      products: ensureArray(safeRaw.products),
      categories: ensureArray(safeRaw.categories),
      clients: ensureArray(safeRaw.clients),
      plans: ensureArray(safeRaw.plans),
      suppliers: ensureArray(safeRaw.suppliers),
      transactions: ensureArray(safeRaw.transactions),
      orders: ensureArray(safeRaw.orders),
      ingredients: ensureArray(safeRaw.ingredients),
      whatsappStore: safeRaw.whatsappStore && typeof safeRaw.whatsappStore === 'object'
        ? safeRaw.whatsappStore
        : {},
      productSequence: Number(safeRaw.productSequence) || 0,
    } as DatabaseShape;

    let version = detectedVersion;
    if (version < 1) {
      version = 1;
    }

    merged.schemaVersion = Math.max(version, CURRENT_SCHEMA_VERSION);
    return merged;
  }

  private migrateData(raw: any) {
    const detectedVersion = Number.isFinite(Number(raw?.schemaVersion)) && Number(raw?.schemaVersion) > 0
      ? Math.trunc(Number(raw.schemaVersion))
      : 0;
    const normalized = this.normalizeIncomingData(raw);
    const migrated = detectedVersion !== normalized.schemaVersion;
    return { data: normalized, migrated, fromVersion: detectedVersion, toVersion: normalized.schemaVersion };
  }

  private assignData(data: DatabaseShape) {
    this.schemaVersion = Number(data.schemaVersion || CURRENT_SCHEMA_VERSION);
    this.enterprises = data.enterprises;
    this.users = data.users;
    this.products = data.products;
    this.productSequence = Number(data.productSequence || 0);
    this.categories = data.categories;
    this.clients = data.clients;
    this.plans = data.plans;
    this.suppliers = data.suppliers;
    this.transactions = data.transactions;
    this.orders = data.orders;
    this.ingredients = data.ingredients;
    this.whatsappStore = (data as any).whatsappStore && typeof (data as any).whatsappStore === 'object'
      ? (data as any).whatsappStore
      : {};
  }

  private snapshotData(): DatabaseShape {
    return {
      schemaVersion: this.schemaVersion,
      enterprises: this.enterprises,
      users: this.users,
      products: this.products,
      productSequence: this.productSequence,
      categories: this.categories,
      clients: this.clients,
      plans: this.plans,
      suppliers: this.suppliers,
      transactions: this.transactions,
      orders: this.orders,
      ingredients: this.ingredients,
      whatsappStore: this.whatsappStore,
    };
  }

  private loadData() {
    try {
      this.ensureDataDir();
      console.log('📂 [DB] Loading data from database.json...');

      let data: DatabaseShape;

      if (fs.existsSync(DATABASE_FILE)) {
        const parsed = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf-8'));
        const migration = this.migrateData(parsed);
        data = migration.data;
        if (migration.migrated) {
          console.log(`ℹ️ [DB] Schema migration aplicada: v${migration.fromVersion} -> v${migration.toVersion}`);
          fs.writeFileSync(DATABASE_FILE, JSON.stringify(data, null, 2), 'utf-8');
        }
      } else {
        console.log('ℹ️ [DB] database.json not found, migrating legacy files...');
        const legacyData = this.readLegacyData();
        const hasLegacyRecords = [
          legacyData.enterprises,
          legacyData.users,
          legacyData.products,
          legacyData.categories,
          legacyData.clients,
          legacyData.plans,
          legacyData.suppliers,
          legacyData.transactions,
          legacyData.orders,
          legacyData.ingredients,
        ].some((collection) => collection.length > 0);
        const baseData = hasLegacyRecords ? legacyData : createEmptyDatabase();
        data = this.migrateData(baseData).data;
        fs.writeFileSync(DATABASE_FILE, JSON.stringify(data, null, 2), 'utf-8');
        console.log('✅ [DB] database.json created successfully');
      }

      this.assignData(data);
      this.normalizeStoredData();
      this.syncProductSequence();

      console.log('✅ [DB] Data loaded successfully');
      console.log(`   - Enterprise: ${this.enterprises.length}`);
      console.log(`   - Users: ${this.users.length}`);
      console.log(`   - Products: ${this.products.length}`);
      console.log(`   - Schema version: ${this.schemaVersion}`);
      console.log(`   - Categories: ${this.categories.length}`);
      console.log(`   - Clients: ${this.clients.length}`);
      console.log(`   - Plans: ${this.plans.length}`);
      console.log(`   - Suppliers: ${this.suppliers.length}`);
    } catch (err) {
      console.error('❌ [DB] Error loading data:', err);
    }
  }

  private saveData() {
    try {
      this.ensureDataDir();
      fs.writeFileSync(DATABASE_FILE, JSON.stringify(this.snapshotData(), null, 2), 'utf-8');
    } catch (err) {
      console.error('Error saving data:', err);
    }
  }

  // Método público para recarregar dados do disco
  reload() {
    this.loadData();
  }

  reset() {
    this.assignData(createEmptyDatabase());
    this.saveData();
  }

  private syncProductSequence() {
    const maxExistingSequence = this.products.reduce((max, product) => {
      const id = String(product?.id || '');
      const match = id.match(/^p_(\d+)$/i);
      if (!match) return max;
      const parsed = Number(match[1]);
      if (!Number.isFinite(parsed)) return max;
      return Math.max(max, parsed);
    }, 0);

    this.productSequence = Math.max(this.productSequence, maxExistingSequence);
  }

  getStats() {
    return {
      enterprises: this.enterprises.length,
      users: this.users.length,
      products: this.products.length,
      categories: this.categories.length,
      clients: this.clients.length,
      plans: this.plans.length,
      suppliers: this.suppliers.length,
      ingredients: this.ingredients.length,
      orders: this.orders.length,
      transactions: this.transactions.length,
    };
  }

  // ===== WHATSAPP STORE (persistido no database.json) =====
  getWhatsAppStore() {
    return this.whatsappStore && typeof this.whatsappStore === 'object'
      ? this.whatsappStore
      : {};
  }

  updateWhatsAppStore(patch: {
    history?: any;
    schedules?: any;
    aiConfig?: any;
  }) {
    this.whatsappStore = {
      ...this.getWhatsAppStore(),
      ...(patch && typeof patch === 'object' ? patch : {}),
      updatedAt: new Date().toISOString(),
    };
    this.saveData();
    return this.whatsappStore;
  }

  // ===== ENTERPRISES =====
  getEnterprises() {
    return this.enterprises;
  }

  getEnterprise(id: string) {
    return this.enterprises.find(e => e.id === id);
  }

  createEnterprise(data: any) {
    const newEnterprise = this.normalizeContactFields({ ...data, id: 'ent_' + Date.now() });
    this.enterprises.push(newEnterprise);
    this.saveData();
    return newEnterprise;
  }

  updateEnterprise(id: string, data: any) {
    const index = this.enterprises.findIndex(e => e.id === id);
    if (index > -1) {
      this.enterprises[index] = this.normalizeContactFields({ ...this.enterprises[index], ...data });
      this.saveData();
      return this.enterprises[index];
    }
    return null;
  }

  deleteEnterprise(id: string) {
    const index = this.enterprises.findIndex(e => e.id === id);
    if (index > -1) {
      this.enterprises.splice(index, 1);
      this.saveData();
      return true;
    }
    return false;
  }

  // ===== USERS =====
  getUsers() {
    console.log('📋 [DB] Getting all users, total:', this.users.length);
    return this.users;
  }

  getUser(id: string) {
    console.log('🔍 [DB] Getting user by ID:', id);
    const user = this.users.find(u => u.id === id);
    console.log('   Result:', user ? `Found ${user.email}` : 'Not found');
    return user;
  }

  getUserByEmail(email: string) {
    console.log('🔍 [DB] Getting user by email:', email);
    const user = this.users.find(u => u.email === email);
    console.log('   Result:', user ? `Found ${user.id}` : 'Not found');
    if (!user) {
      console.log('   Available emails:', this.users.map(u => u.email).join(', '));
    }
    return user;
  }

  createUser(data: any) {
    const newUser = { ...data, id: 'u_' + Date.now() };
    this.users.push(newUser);
    this.saveData();
    return newUser;
  }

  updateUser(id: string, data: any) {
    const index = this.users.findIndex(u => u.id === id);
    if (index > -1) {
      this.users[index] = { ...this.users[index], ...data };
      this.saveData();
      return this.users[index];
    }
    return null;
  }

  deleteUser(id: string) {
    const index = this.users.findIndex(u => u.id === id);
    if (index > -1) {
      this.users.splice(index, 1);
      this.saveData();
      return true;
    }
    return false;
  }

  // ===== PRODUCTS =====
  getProducts(enterpriseId?: string) {
    if (enterpriseId) {
      return this.products.filter(p => p.enterpriseId === enterpriseId);
    }
    return this.products;
  }

  getProduct(id: string) {
    return this.products.find(p => p.id === id);
  }

  createProduct(data: any) {
    this.productSequence += 1;
    const nextId = `p_${String(this.productSequence).padStart(6, '0')}`;
    const newProduct = { ...data, id: nextId };
    this.products.push(newProduct);
    this.saveData();
    return newProduct;
  }

  updateProduct(id: string, data: any) {
    const index = this.products.findIndex(p => p.id === id);
    if (index > -1) {
      this.products[index] = { ...this.products[index], ...data };
      this.saveData();
      return this.products[index];
    }
    return null;
  }

  deleteProduct(id: string) {
    const index = this.products.findIndex(p => p.id === id);
    if (index > -1) {
      this.products.splice(index, 1);
      this.saveData();
      return true;
    }
    return false;
  }

  // ===== CATEGORIES =====
  getCategories(enterpriseId?: string) {
    if (enterpriseId) {
      return this.categories.filter(c => c.enterpriseId === enterpriseId);
    }
    return this.categories;
  }

  getCategory(id: string) {
    return this.categories.find(c => c.id === id);
  }

  createCategory(data: any) {
    const newCategory = {
      ...data,
      id: data.id || 'cat_' + Date.now(),
      subCategories: data.subCategories || [],
    };
    this.categories.push(newCategory);
    this.saveData();
    return newCategory;
  }

  updateCategory(id: string, data: any) {
    const index = this.categories.findIndex(c => c.id === id);
    if (index > -1) {
      this.categories[index] = { ...this.categories[index], ...data };
      this.saveData();
      return this.categories[index];
    }
    return null;
  }

  deleteCategory(id: string) {
    const index = this.categories.findIndex(c => c.id === id);
    if (index > -1) {
      this.categories.splice(index, 1);
      this.saveData();
      return true;
    }
    return false;
  }

  // ===== CLIENTS =====
  getClients(enterpriseId?: string) {
    if (enterpriseId) {
      return this.clients.filter(c => c.enterpriseId === enterpriseId);
    }
    return this.clients;
  }

  getClient(id: string) {
    return this.clients.find(c => c.id === id);
  }

  createClient(data: any) {
    const newClient = this.normalizeContactFields({ ...data, id: 'c_' + Date.now() });
    this.clients.push(newClient);
    this.saveData();
    return newClient;
  }

  updateClient(id: string, data: any) {
    const index = this.clients.findIndex(c => c.id === id);
    if (index > -1) {
      this.clients[index] = this.normalizeContactFields({ ...this.clients[index], ...data });
      this.saveData();
      return this.clients[index];
    }
    return null;
  }

  deleteClient(id: string) {
    const index = this.clients.findIndex(c => c.id === id);
    if (index > -1) {
      this.clients.splice(index, 1);
      this.saveData();
      return true;
    }
    return false;
  }

  // ===== PLANS =====
  getPlans(enterpriseId?: string) {
    if (enterpriseId) {
      return this.plans.filter(p => p.enterpriseId === enterpriseId);
    }
    return this.plans;
  }

  getPlan(id: string) {
    return this.plans.find(p => p.id === id);
  }

  createPlan(data: any) {
    const newPlan = { ...data, id: 'plan_' + Date.now() };
    this.plans.push(newPlan);
    this.saveData();
    return newPlan;
  }

  updatePlan(id: string, data: any) {
    const index = this.plans.findIndex(p => p.id === id);
    if (index > -1) {
      this.plans[index] = { ...this.plans[index], ...data };
      this.saveData();
      return this.plans[index];
    }
    return null;
  }

  deletePlan(id: string) {
    const index = this.plans.findIndex(p => p.id === id);
    if (index > -1) {
      this.plans.splice(index, 1);
      this.saveData();
      return true;
    }
    return false;
  }

  // ===== SUPPLIERS =====
  getSuppliers(enterpriseId?: string) {
    if (enterpriseId) {
      return this.suppliers.filter(s => s.enterpriseId === enterpriseId);
    }
    return this.suppliers;
  }

  getSupplier(id: string) {
    return this.suppliers.find(s => s.id === id);
  }

  createSupplier(data: any) {
    const newSupplier = this.normalizeContactFields({ ...data, id: 's_' + Date.now() });
    this.suppliers.push(newSupplier);
    this.saveData();
    return newSupplier;
  }

  updateSupplier(id: string, data: any) {
    const index = this.suppliers.findIndex(s => s.id === id);
    if (index > -1) {
      this.suppliers[index] = this.normalizeContactFields({ ...this.suppliers[index], ...data });
      this.saveData();
      return this.suppliers[index];
    }
    return null;
  }

  deleteSupplier(id: string) {
    const index = this.suppliers.findIndex(s => s.id === id);
    if (index > -1) {
      this.suppliers.splice(index, 1);
      this.saveData();
      return true;
    }
    return false;
  }

  // ===== TRANSACTIONS =====
  getTransactions(filters?: { clientId?: string; enterpriseId?: string }) {
    const { clientId, enterpriseId } = filters || {};
    let result = this.transactions;

    if (clientId) {
      result = result.filter(t => t.clientId === clientId);
    }

    if (enterpriseId) {
      result = result.filter(t => t.enterpriseId === enterpriseId);
    }

    return [...result].sort((a, b) => {
      const aTs = new Date(a.timestamp || `${a.date || ''}T${a.time || '00:00'}`).getTime();
      const bTs = new Date(b.timestamp || `${b.date || ''}T${b.time || '00:00'}`).getTime();
      return (Number.isFinite(bTs) ? bTs : 0) - (Number.isFinite(aTs) ? aTs : 0);
    });
  }

  getTransaction(id: string) {
    return this.transactions.find(t => t.id === id);
  }

  createTransaction(data: any) {
    const now = new Date();
    const nowIso = now.toISOString();
    const date = nowIso.split('T')[0];
    const time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const randomSuffix = Math.random().toString(36).slice(2, 7);

    const parsedAmount = Number(data?.amount ?? data?.total ?? data?.value ?? 0);
    const amount = Number.isFinite(parsedAmount) ? parsedAmount : 0;

    const newTransaction = {
      ...data,
      id: data?.id || `t_${Date.now()}_${randomSuffix}`,
      type: data?.type || 'DEBIT',
      amount,
      total: Number(data?.total ?? amount) || amount,
      status: data?.status || 'CONCLUIDA',
      executionSource: String(data?.executionSource || 'USUARIO').toUpperCase() === 'SISTEMA' ? 'SISTEMA' : 'USUARIO',
      timestamp: data?.timestamp || nowIso,
      date: data?.date || date,
      time: data?.time || time,
    };
    this.transactions.push(newTransaction);
    this.saveData();
    return newTransaction;
  }

  updateTransaction(id: string, data: any) {
    const index = this.transactions.findIndex(t => t.id === id);
    if (index > -1) {
      const previous = this.transactions[index];
      const parsedAmount = Number(data?.amount ?? data?.total ?? data?.value ?? previous?.amount ?? previous?.total ?? 0);
      const nextAmount = Number.isFinite(parsedAmount) ? parsedAmount : Number(previous?.amount ?? previous?.total ?? 0);
      const applyClientEffects = data?.applyClientEffects !== false;

      const updatePayload = { ...data };
      delete (updatePayload as any).applyClientEffects;

      this.transactions[index] = {
        ...previous,
        ...updatePayload,
        id: previous.id,
        amount: nextAmount,
        total: Number(updatePayload?.total ?? nextAmount) || nextAmount
      };

      if (applyClientEffects) {
        const normalize = (value?: string) =>
          String(value || '')
            .trim()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toUpperCase();

        const amountFromTx = (tx: any) => {
          const n = Number(tx?.amount ?? tx?.total ?? tx?.value ?? 0);
          return Number.isFinite(n) ? n : 0;
        };

        const applyPlanBalance = (clientRef: any, tx: any, signedAmount: number) => {
          const planId = String(tx?.planId || '').trim();
          const planName = String(tx?.plan || '').trim();
          if (!planId && !planName) return;

          const balances = { ...(clientRef.planCreditBalances || {}) } as Record<string, any>;
          let key = planId;
          if (!key && planName) {
            const byNameKey = Object.keys(balances).find((k) =>
              normalize(balances[k]?.planName) === normalize(planName)
            );
            key = byNameKey || planName.toUpperCase();
          }

          const current = balances[key] || {};
          const currentBalance = Number(current.balance || 0);
          const nextBalance = Math.max(0, Number((currentBalance + signedAmount).toFixed(2)));
          balances[key] = {
            ...current,
            planId: current.planId || planId || key,
            planName: current.planName || planName || 'PLANO',
            balance: nextBalance,
            updatedAt: new Date().toISOString()
          };
          clientRef.planCreditBalances = balances;
        };

        const applyEffect = (clientRef: any, tx: any, factor: number) => {
          const signedAmount = Number((amountFromTx(tx) * factor).toFixed(2));
          const txType = normalize(tx?.type);
          const txDesc = normalize(tx?.description || tx?.item);

          if (txType === 'CREDIT' || txType === 'CREDITO') {
            if (txDesc.includes('PAGAMENTO DE CONSUMO DO COLABORADOR')) {
              const currentDue = Number(clientRef.amountDue || 0);
              const currentMonthly = Number(clientRef.monthlyConsumption || 0);
              clientRef.amountDue = Math.max(0, Number((currentDue - signedAmount).toFixed(2)));
              clientRef.monthlyConsumption = Math.max(0, Number((currentMonthly - signedAmount).toFixed(2)));
              return;
            }

            if (tx?.planId || txDesc.includes('CREDITO PLANO') || txDesc.includes('RECARGA DE PLANO')) {
              applyPlanBalance(clientRef, tx, signedAmount);
              return;
            }

            clientRef.balance = Number((Number(clientRef.balance || 0) + signedAmount).toFixed(2));
            return;
          }

          if (txType === 'CONSUMO') {
            if (tx?.planId || tx?.plan) {
              applyPlanBalance(clientRef, tx, -signedAmount);
            }
          }
        };

        const prevClientId = String(previous?.clientId || '').trim();
        const nextClientId = String(this.transactions[index]?.clientId || '').trim();

        if (prevClientId && prevClientId === nextClientId) {
          const cIndex = this.clients.findIndex(c => String(c.id) === prevClientId);
          if (cIndex > -1) {
            const clientRef: any = { ...this.clients[cIndex] };
            // desfaz efeito anterior e aplica novo
            applyEffect(clientRef, previous, -1);
            applyEffect(clientRef, this.transactions[index], 1);
            this.clients[cIndex] = clientRef;
          }
        }
      }

      this.saveData();
      return this.transactions[index];
    }
    return null;
  }

  deleteTransaction(id: string) {
    const index = this.transactions.findIndex(t => t.id === id);
    if (index > -1) {
      const txToDelete: any = this.transactions[index];

      const normalize = (value?: string) =>
        String(value || '')
          .trim()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toUpperCase();

      const amountFromTx = (tx: any) => {
        const n = Math.abs(Number(tx?.amount ?? tx?.total ?? tx?.value ?? 0));
        return Number.isFinite(n) ? n : 0;
      };

      const applyPlanBalance = (clientRef: any, tx: any, signedAmount: number) => {
        const planId = String(tx?.planId || '').trim();
        const planName = String(tx?.plan || '').trim();
        if (!planId && !planName) return;

        const balances = { ...(clientRef.planCreditBalances || {}) } as Record<string, any>;
        let key = planId;
        if (!key && planName) {
          const byNameKey = Object.keys(balances).find((k) =>
            normalize(balances[k]?.planName) === normalize(planName)
          );
          key = byNameKey || planName.toUpperCase();
        }

        const current = balances[key] || {};
        const currentBalance = Number(current.balance || 0);
        const nextBalance = Math.max(0, Number((currentBalance + signedAmount).toFixed(2)));
        balances[key] = {
          ...current,
          planId: current.planId || planId || key,
          planName: current.planName || planName || 'PLANO',
          balance: nextBalance,
          updatedAt: new Date().toISOString()
        };
        clientRef.planCreditBalances = balances;
      };

      const applyEffect = (clientRef: any, tx: any, factor: number) => {
        const signedAmount = Number((amountFromTx(tx) * factor).toFixed(2));
        const txType = normalize(tx?.type);
        const txDesc = normalize(tx?.description || tx?.item);
        const txMethod = normalize(tx?.paymentMethod || tx?.method);
        const isSaldoMethod = txMethod.includes('SALDO') || txMethod.includes('CARTEIRA');
        const isCollaboratorCreditMethod = txMethod.includes('CREDITO_COLABORADOR');
        const planNameNormalized = normalize(tx?.plan);
        const isPlanConsumption =
          Boolean(tx?.planId)
          || txMethod.includes('PLANO')
          || (planNameNormalized.length > 0 && !['AVULSO', 'PREPAGO', 'GERAL'].includes(planNameNormalized));

        if (txType === 'CREDIT' || txType === 'CREDITO') {
          if (txDesc.includes('PAGAMENTO DE CONSUMO DO COLABORADOR')) {
            const currentDue = Number(clientRef.amountDue || 0);
            const currentMonthly = Number(clientRef.monthlyConsumption || 0);
            clientRef.amountDue = Math.max(0, Number((currentDue - signedAmount).toFixed(2)));
            clientRef.monthlyConsumption = Math.max(0, Number((currentMonthly - signedAmount).toFixed(2)));
            return;
          }

          if (tx?.planId || txDesc.includes('CREDITO PLANO') || txDesc.includes('RECARGA DE PLANO')) {
            applyPlanBalance(clientRef, tx, signedAmount);
            return;
          }

          clientRef.balance = Number((Number(clientRef.balance || 0) + signedAmount).toFixed(2));
          return;
        }

        if (txType === 'CONSUMO') {
          if (isPlanConsumption) {
            applyPlanBalance(clientRef, tx, -signedAmount);
            return;
          }
          if (isSaldoMethod) {
            clientRef.balance = Number((Number(clientRef.balance || 0) - signedAmount).toFixed(2));
            return;
          }
          if (isCollaboratorCreditMethod) {
            const currentDue = Number(clientRef.amountDue || 0);
            const currentMonthly = Number(clientRef.monthlyConsumption || 0);
            clientRef.amountDue = Math.max(0, Number((currentDue + signedAmount).toFixed(2)));
            clientRef.monthlyConsumption = Math.max(0, Number((currentMonthly + signedAmount).toFixed(2)));
            return;
          }
        }

        if (txType === 'DEBIT' || txType === 'VENDA_BALCAO') {
          if (isSaldoMethod) {
            clientRef.balance = Number((Number(clientRef.balance || 0) - signedAmount).toFixed(2));
          }
          if (isCollaboratorCreditMethod) {
            const currentDue = Number(clientRef.amountDue || 0);
            const currentMonthly = Number(clientRef.monthlyConsumption || 0);
            clientRef.amountDue = Math.max(0, Number((currentDue + signedAmount).toFixed(2)));
            clientRef.monthlyConsumption = Math.max(0, Number((currentMonthly + signedAmount).toFixed(2)));
          }
        }
      };

      const clientId = String(txToDelete?.clientId || '').trim();
      let clientIndex = -1;
      if (clientId) {
        clientIndex = this.clients.findIndex(c => String(c.id) === clientId);
      } else {
        const txClientName = normalize(txToDelete?.clientName || txToDelete?.client);
        if (txClientName && txClientName !== 'CONSUMIDOR FINAL') {
          clientIndex = this.clients.findIndex(c => normalize(c.name) === txClientName);
        }
      }

      if (clientIndex > -1) {
        const clientRef: any = { ...this.clients[clientIndex] };
        // Reverte os efeitos desta transação no cadastro do cliente.
        applyEffect(clientRef, txToDelete, -1);
        this.clients[clientIndex] = clientRef;
      }

      this.transactions.splice(index, 1);
      this.saveData();
      return true;
    }
    return false;
  }

  clearTransactions() {
    const removedCount = this.transactions.length;
    this.transactions = [];
    this.saveData();
    return removedCount;
  }

  // ===== ORDERS =====
  getOrders(enterpriseId?: string) {
    if (enterpriseId) {
      return this.orders.filter(o => o.enterpriseId === enterpriseId);
    }
    return this.orders;
  }

  getOrder(id: string) {
    return this.orders.find(o => o.id === id);
  }

  createOrder(data: any) {
    const newOrder = { ...data, id: 'ord_' + Date.now() };
    this.orders.push(newOrder);
    this.saveData();
    return newOrder;
  }

  updateOrder(id: string, data: any) {
    const index = this.orders.findIndex(o => o.id === id);
    if (index > -1) {
      this.orders[index] = { ...this.orders[index], ...data };
      this.saveData();
      return this.orders[index];
    }
    return null;
  }

  deleteOrder(id: string) {
    const index = this.orders.findIndex(o => o.id === id);
    if (index > -1) {
      this.orders.splice(index, 1);
      this.saveData();
      return true;
    }
    return false;
  }

  // ===== INGREDIENTS =====
  getIngredients() {
    return this.ingredients;
  }

  getIngredient(id: string) {
    return this.ingredients.find(i => i.id === id);
  }

  createIngredient(data: any) {
    const newIngredient = { ...data, id: 'ing_' + Date.now() };
    this.ingredients.push(newIngredient);
    this.saveData();
    return newIngredient;
  }

  updateIngredient(id: string, data: any) {
    const index = this.ingredients.findIndex(i => i.id === id);
    if (index > -1) {
      this.ingredients[index] = { ...this.ingredients[index], ...data };
      this.saveData();
      return this.ingredients[index];
    }
    return null;
  }

  deleteIngredient(id: string) {
    const index = this.ingredients.findIndex(i => i.id === id);
    if (index > -1) {
      this.ingredients.splice(index, 1);
      this.saveData();
      return true;
    }
    return false;
  }
}

export const db = new Database();
