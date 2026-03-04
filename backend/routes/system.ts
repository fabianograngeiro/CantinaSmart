import { Router, Request, Response } from 'express';
import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { exec as execCallback } from 'child_process';
import { promisify } from 'util';
import { db } from '../database';

const router = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const exec = promisify(execCallback);

const COLLAB_MIGRATION_TAG = 'COLLAB_CONSUMPTION_MIGRATION_V1';

interface DatabaseBackupShape {
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
}

const normalizeBackupPayload = (payload: any): DatabaseBackupShape => {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Backup inválido: arquivo JSON malformado.');
  }

  const readArray = (key: string) => {
    const value = payload[key];
    if (value === undefined) return [];
    if (!Array.isArray(value)) throw new Error(`Backup inválido: campo "${key}" deve ser um array.`);
    return value;
  };

  const productSequenceRaw = payload.productSequence;
  const parsedProductSequence = Number(productSequenceRaw ?? 0);
  if (!Number.isFinite(parsedProductSequence) || parsedProductSequence < 0) {
    throw new Error('Backup inválido: campo "productSequence" deve ser numérico e >= 0.');
  }

  return {
    enterprises: readArray('enterprises'),
    users: readArray('users'),
    products: readArray('products'),
    productSequence: parsedProductSequence,
    categories: readArray('categories'),
    clients: readArray('clients'),
    plans: readArray('plans'),
    suppliers: readArray('suppliers'),
    transactions: readArray('transactions'),
    orders: readArray('orders'),
    ingredients: readArray('ingredients'),
  };
};

const parseLinuxOrMacPrinterNames = (stdout: string): string[] => {
  const lines = String(stdout || '').split('\n').map((line) => line.trim()).filter(Boolean);
  return lines
    .filter((line) => line.toLowerCase().startsWith('printer '))
    .map((line) => line.split(' ')[1]?.trim())
    .filter(Boolean) as string[];
};

const parseLinuxOrMacFallbackNames = (stdout: string): string[] => {
  const lines = String(stdout || '').split('\n').map((line) => line.trim()).filter(Boolean);
  return lines
    .map((line) => line.split(/\s+/)[0]?.trim())
    .filter(Boolean) as string[];
};

const parseLinuxDefaultName = (stdout: string): string => {
  const line = String(stdout || '')
    .split('\n')
    .map((item) => item.trim())
    .find((item) => item.toLowerCase().startsWith('system default destination:'));
  if (!line) return '';
  return line.split(':').slice(1).join(':').trim();
};

const parseLinuxDefaultNameFromOptions = (stdout: string): string => {
  const line = String(stdout || '').trim();
  const match = line.match(/^default\s+(.+)$/i);
  return match ? String(match[1]).trim() : '';
};

const parseWindowsPrinters = (stdout: string): { name: string; isDefault: boolean }[] => {
  try {
    const parsed = JSON.parse(String(stdout || '[]'));
    const asArray = Array.isArray(parsed) ? parsed : [parsed];
    return asArray
      .map((item: any) => ({
        name: String(item?.Name || '').trim(),
        isDefault: Boolean(item?.Default),
      }))
      .filter((item: { name: string }) => Boolean(item.name));
  } catch {
    return [];
  }
};

const listSystemPrinters = async (): Promise<{ name: string; isDefault: boolean }[]> => {
  const platform = process.platform;

  if (platform === 'win32') {
    try {
      const { stdout } = await exec('powershell -NoProfile -Command "Get-Printer | Select-Object Name,Default | ConvertTo-Json -Compress"');
      const printers = parseWindowsPrinters(stdout);
      if (printers.length > 0) return printers;
    } catch {}

    const { stdout } = await exec('powershell -NoProfile -Command "Get-CimInstance Win32_Printer | Select-Object Name,Default | ConvertTo-Json -Compress"');
    return parseWindowsPrinters(stdout);
  }

  let names: string[] = [];
  try {
    const { stdout } = await exec('lpstat -p');
    names = parseLinuxOrMacPrinterNames(stdout);
  } catch {}

  if (names.length === 0) {
    try {
      const { stdout } = await exec('lpstat -a');
      names = parseLinuxOrMacFallbackNames(stdout);
    } catch {}
  }

  let defaultName = '';
  try {
    const { stdout } = await exec('lpstat -d');
    defaultName = parseLinuxDefaultName(stdout);
  } catch {}

  if (!defaultName) {
    try {
      const { stdout } = await exec('lpoptions -d');
      defaultName = parseLinuxDefaultNameFromOptions(stdout);
    } catch {}
  }

  return Array.from(new Set(names)).map((name) => ({
    name,
    isDefault: Boolean(defaultName) && name === defaultName
  }));
};

router.get('/printers', async (_req: Request, res: Response) => {
  try {
    const printers = await listSystemPrinters();
    res.json({
      success: true,
      platform: process.platform,
      source: 'server',
      printers
    });
  } catch (err) {
    console.error('❌ [SYSTEM] Erro ao listar impressoras:', err);
    res.status(200).json({
      success: false,
      platform: process.platform,
      source: 'server',
      printers: [],
      message: 'Não foi possível listar impressoras instaladas no servidor.'
    });
  }
});

// Download completo da database atual
router.get('/backup', async (req: Request, res: Response) => {
  try {
    const databasePath = path.resolve(__dirname, '../data/database.json');
    const databaseRaw = await fs.readFile(databasePath, 'utf-8');

    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, '0');
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    const filename = `database-backup-${stamp}.json`;

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(databaseRaw);
  } catch (err) {
    console.error('❌ [SYSTEM] Erro ao gerar backup da database:', err);
    res.status(500).json({
      success: false,
      message: 'Erro ao gerar backup da database',
      error: err instanceof Error ? err.message : 'Erro desconhecido'
    });
  }
});

// Restaura database completa a partir de arquivo de backup
router.post('/restore', async (req: Request, res: Response) => {
  try {
    const normalizedBackup = normalizeBackupPayload(req.body);
    const databasePath = path.resolve(__dirname, '../data/database.json');
    await fs.writeFile(databasePath, JSON.stringify(normalizedBackup, null, 2), 'utf-8');
    db.reload();

    res.json({
      success: true,
      message: 'Backup restaurado com sucesso.',
      stats: db.getStats()
    });
  } catch (err) {
    console.error('❌ [SYSTEM] Erro ao restaurar backup da database:', err);
    res.status(400).json({
      success: false,
      message: 'Erro ao restaurar backup da database',
      error: err instanceof Error ? err.message : 'Erro desconhecido'
    });
  }
});

// Reset completo da database - apaga todos os dados
router.post('/reset', (req: Request, res: Response) => {
  console.log('\n🔥 [SYSTEM] RESET DATABASE REQUEST RECEIVED');
  
  try {
    db.reset();

    console.log('🔥 [SYSTEM] DATABASE RESET COMPLETO - Todos os dados foram apagados');
    
    res.json({ 
      success: true, 
      message: 'Database resetada com sucesso. Todos os dados foram apagados.',
      filesReset: 1,
      file: 'database.json'
    });
    
  } catch (err) {
    console.error('❌ [SYSTEM] Erro ao resetar database:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Erro ao resetar database',
      error: err instanceof Error ? err.message : 'Erro desconhecido'
    });
  }
});

// Endpoint de status do sistema
router.get('/status', (req: Request, res: Response) => {
  const stats = db.getStats();
  
  res.json({
    success: true,
    stats,
    totalRecords: Object.values(stats).reduce((sum, count) => sum + count, 0)
  });
});

// Verifica se o sistema precisa de setup inicial
router.get('/needs-setup', (req: Request, res: Response) => {
  try {
    const users = db.getUsers();
    const needsSetup = users.length === 0;
    
    console.log(`🔍 [SYSTEM] Verificando setup inicial: ${needsSetup ? 'NECESSÁRIO' : 'JÁ CONFIGURADO'}`);
    
    res.json({
      success: true,
      needsSetup,
      usersCount: users.length
    });
  } catch (err) {
    console.error('❌ [SYSTEM] Erro ao verificar setup:', err);
    res.status(500).json({
      success: false,
      message: 'Erro ao verificar setup',
      error: err instanceof Error ? err.message : 'Erro desconhecido'
    });
  }
});

// Setup inicial - Cria o primeiro usuário SUPERADMIN
router.post('/initial-setup', (req: Request, res: Response) => {
  console.log('\n🚀 [SYSTEM] INITIAL SETUP REQUEST RECEIVED');
  
  const { name, email, password } = req.body;
  
  if (!name || !email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Nome, email e senha são obrigatórios'
    });
  }
  
  try {
    const users = db.getUsers();
    
    // Verifica se já existe algum usuário
    if (users.length > 0) {
      console.log('⚠️ [SYSTEM] Setup inicial já foi realizado');
      return res.status(400).json({
        success: false,
        message: 'Setup inicial já foi realizado. Já existem usuários cadastrados.'
      });
    }
    
    // Cria o primeiro usuário SUPERADMIN
    const superAdmin = {
      id: 'u_super',
      name,
      email,
      password, // Em produção, deveria ser hasheado
      role: 'SUPERADMIN',
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`,
      isActive: true
    };
    
    // Usa a API da database para criar o usuário
    const createdUser = db.createUser(superAdmin);
    
    console.log('✅ [SYSTEM] SUPERADMIN criado com sucesso');
    console.log(`   Nome: ${name}`);
    console.log(`   Email: ${email}`);
    
    // Gera token para o usuário
    const token = Buffer.from(JSON.stringify({ userId: createdUser.id, role: createdUser.role })).toString('base64');
    
    res.json({
      success: true,
      message: 'Setup inicial concluído com sucesso',
      user: {
        id: createdUser.id,
        name: createdUser.name,
        email: createdUser.email,
        role: createdUser.role,
        avatar: createdUser.avatar,
        isActive: createdUser.isActive
      },
      token
    });
    
  } catch (err) {
    console.error('❌ [SYSTEM] Erro ao realizar setup inicial:', err);
    res.status(500).json({
      success: false,
      message: 'Erro ao realizar setup inicial',
      error: err instanceof Error ? err.message : 'Erro desconhecido'
    });
  }
});

// Migra consumo acumulado de colaboradores para transações históricas
router.post('/migrate-collaborator-consumption', (req: Request, res: Response) => {
  try {
    const dryRun = Boolean(req.body?.dryRun);
    const clients = db.getClients();
    const transactions = db.getTransactions();

    const collaborators = clients.filter((c: any) => c.type === 'COLABORADOR');
    const existingMigrationClientIds = new Set(
      transactions
        .filter((t: any) => t?.migrationTag === COLLAB_MIGRATION_TAG)
        .map((t: any) => String(t.clientId))
    );

    const candidates = collaborators
      .map((client: any) => {
        const monthlyConsumption = Number(client.monthlyConsumption || 0);
        const amountDue = Number(client.amountDue || 0);
        const amount = Math.max(monthlyConsumption, amountDue);
        return {
          client,
          amount
        };
      })
      .filter((row: any) => row.amount > 0);

    const toMigrate = candidates.filter((row: any) => !existingMigrationClientIds.has(String(row.client.id)));

    if (!dryRun) {
      toMigrate.forEach((row: any) => {
        const now = new Date();
        db.createTransaction({
          clientId: row.client.id,
          clientName: row.client.name,
          enterpriseId: row.client.enterpriseId,
          type: 'DEBIT',
          amount: row.amount,
          description: 'Migracao de consumo acumulado de colaborador',
          item: 'CONSUMO ACUMULADO (MIGRACAO)',
          paymentMethod: 'CREDITO_COLABORADOR',
          method: 'CREDITO_COLABORADOR',
          timestamp: now.toISOString(),
          date: now.toISOString().split('T')[0],
          time: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          status: 'MIGRADO',
          migrationTag: COLLAB_MIGRATION_TAG,
          items: [
            {
              name: 'CONSUMO ACUMULADO (MIGRACAO)',
              quantity: 1,
              price: row.amount
            }
          ]
        });
      });
    }

    res.json({
      success: true,
      dryRun,
      tag: COLLAB_MIGRATION_TAG,
      collaboratorsFound: collaborators.length,
      candidatesWithConsumption: candidates.length,
      migratedCount: toMigrate.length,
      alreadyMigratedCount: candidates.length - toMigrate.length,
      migratedClients: toMigrate.map((row: any) => ({
        id: row.client.id,
        name: row.client.name,
        amount: row.amount
      }))
    });
  } catch (err) {
    console.error('❌ [SYSTEM] Erro ao migrar consumo de colaboradores:', err);
    res.status(500).json({
      success: false,
      message: 'Erro ao migrar consumo de colaboradores',
      error: err instanceof Error ? err.message : 'Erro desconhecido'
    });
  }
});

export default router;
