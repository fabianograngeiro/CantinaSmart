import 'dotenv/config';
import express, { Express } from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import authRoutes from './routes/auth.js';
import enterprisesRoutes from './routes/enterprises.js';
import productsRoutes from './routes/products.js';
import categoriesRoutes from './routes/categories.js';
import clientsRoutes from './routes/clients.js';
import plansRoutes from './routes/plans.js';
import suppliersRoutes from './routes/suppliers.js';
import transactionsRoutes from './routes/transactions.js';
import ordersRoutes from './routes/orders.js';
import ingredientsRoutes from './routes/ingredients.js';
import menusRoutes from './routes/menus.js';
import schoolCalendarRoutes from './routes/schoolCalendar.js';
import aiRoutes from './routes/ai.js';
import systemRoutes from './routes/system.js';
import whatsappRoutes from './routes/whatsapp.js';
import errorTicketsRoutes from './routes/errorTickets.js';
import saasFinancialRoutes from './routes/saasFinancial.js';
import taskRemindersRoutes from './routes/taskReminders.js';
import { startWhatsAppDispatchScheduler } from './services/dispatchSchedulerService.js';
import { startPlanConsumptionAutoProcessor } from './services/planConsumptionAutoProcessor.js';
import { authMiddleware } from './middleware/auth.js';
import { whatsappSession } from './utils/whatsappSession.js';

const app: Express = express();
const PORT = process.env.PORT || 3001;

const resolveFrontendDistPath = () => {
  const currentDir = path.basename(__dirname);
  if (currentDir === 'dist') {
    // Running from backend/dist/server.js in production build
    return path.resolve(__dirname, '../../dist');
  }
  // Running from backend/server.ts in dev
  return path.resolve(__dirname, '../dist');
};

const frontendDistPath = resolveFrontendDistPath();

// Middleware
const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'x-idempotency-key',
    'X-Idempotency-Key',
  ],
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '10mb' }));

// Logging middleware
app.use((req, res, next) => {
  console.log(`\n📨 [HTTP] ${req.method} ${req.path}`);
  if (req.path === '/api/products/upload-photo' || req.path === '/api/clients/upload-photo') {
    const body = req.body || {};
    const sizeKb = body?.dataBase64 ? Math.round((String(body.dataBase64).length * 3 / 4) / 1024) : 0;
    console.log(`📦 Body:`, {
      fileName: body?.fileName,
      mimeType: body?.mimeType,
      dataBase64: `[base64 ${sizeKb}KB]`
    });
  } else {
    console.log(`📦 Body:`, req.body);
  }
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/enterprises', enterprisesRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/plans', plansRoutes);
app.use('/api/suppliers', suppliersRoutes);
app.use('/api/transactions', transactionsRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/ingredients', ingredientsRoutes);
app.use('/api/menus', menusRoutes);
app.use('/api/school-calendar', schoolCalendarRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/error-tickets', errorTicketsRoutes);
app.use('/api/saas-financial', saasFinancialRoutes);
app.use('/api/task-reminders', taskRemindersRoutes);
app.use('/products_photos', express.static(path.join(__dirname, 'products_photos')));
app.use('/clients_photos', express.static(path.join(__dirname, 'clients_photos')));

// Serve static files (optional)
app.use(express.static(frontendDistPath));

// SPA fallback (except API and static media routes)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  if (req.path.startsWith('/products_photos')) return next();
  if (req.path.startsWith('/clients_photos')) return next();
  return res.sendFile(path.join(frontendDistPath, 'index.html'));
});

// Start server
app.listen(PORT, () => {
  startWhatsAppDispatchScheduler();
  startPlanConsumptionAutoProcessor();
  whatsappSession.initializeOnBoot().catch((err: unknown) => {
    console.error('[SERVER] Falha na inicialização automática do WhatsApp:', err);
  });
  console.log('\n' + '='.repeat(50));
  console.log('🚀 [SERVER] CantinaSmart Backend iniciado');
  console.log(`🌐 Servidor rodando em http://localhost:${PORT}`);
  console.log(`🔗 API URL: http://localhost:${PORT}/api`);
  console.log('📲 [SERVER] WhatsApp inicializando automaticamente (WHATSAPP_AUTO_START=true por padrão).');
  console.log('='.repeat(50) + '\n');
});

export default app;
