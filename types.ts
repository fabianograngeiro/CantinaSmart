
export enum Role {
  SUPERADMIN = 'SUPERADMIN',
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  ADMIN_RESTAURANTE = 'ADMIN_RESTAURANTE',
  GERENTE = 'GERENTE',
  FUNCIONARIO_BASICO = 'FUNCIONARIO_BASICO',
  CAIXA = 'CAIXA',
  COLABORADOR = 'COLABORADOR',
  RESPONSAVEL = 'RESPONSAVEL',
  CLIENTE = 'CLIENTE'
}

export type UserPermissions = {
  canAccessInventory: boolean;
  canAccessReports: boolean;
  canAccessPOS: boolean;
  canAccessClients: boolean;
  canManageStaff: boolean;
};

export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatar?: string;
  enterpriseIds?: string[];
  isActive: boolean;
  phone?: string;
  createdAt?: string;
  permissions?: UserPermissions;
};

export type OpeningHours = {
  open: string;
  close: string;
  closed: boolean;
};

export type Enterprise = {
  id: string;
  name: string;
  document?: string; // Opcional agora
  type: 'CANTINA' | 'RESTAURANTE';
  attachedSchoolName?: string; // Escola onde a cantina está anexada
  address: string;
  locationReference?: string; // Referência de localização
  managerName?: string; // Nome do gerente responsável
  logo?: string;
  isActive: boolean;
  phone1?: string; // WhatsApp
  phone2?: string; // Contato
  website?: string;
  openingHours?: Record<string, OpeningHours>;
  pricePerKg?: number; 
  monthlyFee?: number;
  expirationDate?: string;
  ownerName?: string;
  planType?: 'BASIC' | 'PRO' | 'ENTERPRISE';
  lastPaymentStatus?: 'PAID' | 'PENDING' | 'OVERDUE';
  collaboratorPaymentStartDay?: number; // Dia do mês para início do período de consumo (1-31) - Exemplo: 5 significa 5 março até 4 abril
  collaboratorPaymentDueDay?: number; // Dia do mês para vencimento do pagamento do mês anterior (1-31) - Exemplo: 7 de abril para consumo de março
  allowNegativeSalesForClients?: boolean;
  negativeLimitClients?: number;
  allowNegativeSalesForCollaborators?: boolean;
  negativeLimitCollaborators?: number;
  autoPrintPDVReceipt?: boolean;
  receiptPrinterName?: string;
  receiptPrintMode?: 'SERVER_BROWSER' | 'LOCAL_AGENT';
  localPrintAgentUrl?: string;
  receiptPaperWidth?: '58mm' | '80mm';
  receiptFontFamily?: 'ARIAL_BLACK' | 'ARIAL' | 'COURIER_NEW' | 'MONOSPACE';
  receiptFontSize?: 'SMALL' | 'NORMAL' | 'LARGE';
  receiptMarginVertical?: number;
  receiptMarginHorizontal?: number;
  receiptItemGapTop?: number;
  receiptItemGapBottom?: number;
};

export type Transaction = {
  id: string;
  clientId: string;
  type: 'CREDIT' | 'DEBIT';
  amount: number;
  description: string;
  timestamp: string;
  paymentMethod: string;
  items?: string[]; // Itens comprados no caso de débito
};

export type Category = {
  id: string;
  name: string;
  enterpriseId: string;
  subCategories: SubCategory[];
};

export type SubCategory = {
  id: string;
  name: string;
};

export type ProductCategory = 'LANCHE' | 'BEBIDA' | 'ALMOCO' | 'DOCE' | 'REFEICAO_KG' | 'PF' | 'MARMITA';
export type ProductUnit = 'KG' | 'UN' | 'PCT';

export type Product = {
  id: string;
  name: string;
  ean?: string; 
  category: ProductCategory | string; 
  subCategory?: string;
  price: number;
  cost: number;
  stock: number;
  minStock: number;
  unit?: ProductUnit;
  controlsStock?: boolean;
  isActive: boolean;
  image?: string;
  enterpriseId: string;
  expiryDate?: string;
  nutritionalInfo?: {
    calories: number;
    sugar: boolean;
    gluten: boolean;
    lactose: boolean;
  };
};

export type IngredientUnit = 'g' | 'ml' | 'un';

export type Ingredient = {
  id: string;
  name: string;
  category: string; // Adicionado para categorização
  unit: IngredientUnit;
  calories: number;
  proteins: number;
  carbs: number;
  fats: number;
};

export type MenuItem = {
  id: string;
  name: string;
  description?: string;
  price: number;
  ingredients: Ingredient[];
  isFixedPF?: boolean;
  isSnackCombo?: boolean;
  planId?: string;
};

export type MenuDay = {
  id: string;
  dayOfWeek: 'SEGUNDA' | 'TERCA' | 'QUARTA' | 'QUINTA' | 'SEXTA' | 'SABADO';
  items: MenuItem[];
};

export type PlanItem = {
  id: string;
  name: string;
  type: 'PRODUCT' | 'RECIPE';
  price: number;
};

export type Plan = {
  id: string;
  name: string;
  description?: string;
  price: number;
  items: PlanItem[];
  enterpriseId: string;
  isActive: boolean;
};

export type SupplierCategory = 'ALIMENTOS' | 'BEBIDA' | 'LIMPEZA' | 'EQUIPAMENTOS' | 'LOGISTICA';

export type SuppliedProduct = {
  name: string;
  cost: number;
};

export type Supplier = {
  id: string;
  name: string;
  document: string;
  category: string;
  contactPerson: string;
  email: string;
  phone: string;
  isActive: boolean;
  enterpriseId: string;
  suppliedProducts?: SuppliedProduct[];
};

export type OrderItem = {
  productName: string;
  quantity: number;
  cost: number;
};

export type Order = {
  id: string;
  supplierId: string;
  supplierName: string;
  date: string;
  items: OrderItem[];
  originalItems?: OrderItem[];
  total: number;
  originalTotal?: number;
  status: 'ABERTO' | 'ENTREGUE' | 'CANCELADO';
  enterpriseId: string;
};

export type FixedSnackConfig = {
  juice: string[];
  snack: string[];
  fruit: string[];
  packQuantity: number;
  packValue: number;
  daysOfWeek: string[];
};

export type ClientPlanType = 'LANCHE_FIXO' | 'PF_FIXO' | 'PREPAGO';

export type Client = {
  id: string;
  registrationId: string;
  name: string;
  type: 'ALUNO' | 'COLABORADOR' | 'AVULSO' | 'EMPRESA';
  cpf?: string; 
  phone?: string; 
  email?: string; 
  servicePlans: ClientPlanType[];
  fixedSnackConfig?: FixedSnackConfig;
  balance: number;
  creditLimit?: number;
  dailyLimit?: number;
  spentToday: number;
  amountDue?: number; // Valor devido (para colaboradores)
  monthlyConsumption?: number; // Consumo do período de pagamento atual (para colaboradores)
  isBlocked: boolean;
  class?: string;
  photo?: string;
  restrictions: string[];
  dietaryNotes?: string;
  guardians: string[];
  guardianName?: string;
  guardianCPF?: string;
  guardianPhone?: string;
  guardianEmail?: string;
  parentName?: string;
  parentWhatsapp?: string;
  parentCpf?: string;
  parentEmail?: string;
  planCreditBalances?: Record<string, {
    planId: string;
    planName: string;
    balance: number;
    updatedAt?: string;
  }>;
  enterpriseId: string;
};

export type PaymentMethod = 'SALDO' | 'PIX' | 'DINHEIRO' | 'DEBITO' | 'CREDITO' | 'TICKET' | 'CREDITO_COLABORADOR';

export type PaymentEntry = {
  method: PaymentMethod;
  amount: number;
  receivedAmount?: number;
  status: string;
};

export type SaleItem = {
  productId: string;
  name: string;
  quantity: number;
  price: number;
  mode?: 'KG' | 'UN' | 'PF' | 'MARMITA';
  weight?: number;
  serviceAction?: 'CREDIT_STUDENT_FREE' | 'CREDIT_STUDENT_PLAN' | 'PAY_COLLAB' | 'PLAN_CONSUMPTION';
  planId?: string;
  planName?: string;
  selectedDays?: string[];
  selectedDates?: string[];
};

export type SuspendedSale = {
  id: string;
  clientId: string | null;
  items: any[];
  operatorId: string;
  timestamp: Date;
  status: string;
};

export type TransactionRecord = {
  id: string;
  time: string;
  date: string;
  client: string;
  plan: string;
  item: string;
  type: 'CONSUMO' | 'VENDA_BALCAO' | 'CREDITO';
  method: string;
  value?: number;
  total?: number;
  status: string;
};
