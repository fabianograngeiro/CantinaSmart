import express, { Express } from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

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
import aiRoutes from './routes/ai.js';
import systemRoutes from './routes/system.js';
import whatsappRoutes from './routes/whatsapp.js';
import { authMiddleware } from './middleware/auth.js';
import { whatsappSession } from './utils/whatsappSession.js';

const app: Express = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
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
app.use('/api/ai', aiRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/products_photos', express.static(path.join(__dirname, 'products_photos')));
app.use('/clients_photos', express.static(path.join(__dirname, 'clients_photos')));

// Serve static files (optional)
app.use(express.static(path.join(__dirname, '../dist')));

// Start server
app.listen(PORT, () => {
  console.log('\n' + '='.repeat(50));
  console.log('🚀 [SERVER] CantinaSmart Backend iniciado');
  console.log(`🌐 Servidor rodando em http://localhost:${PORT}`);
  console.log(`🔗 API URL: http://localhost:${PORT}/api`);
  console.log('='.repeat(50) + '\n');

  whatsappSession.initializeOnBoot().catch((err) => {
    console.error('❌ [SERVER] Falha ao inicializar integração WhatsApp no boot:', err);
  });
});

export default app;
