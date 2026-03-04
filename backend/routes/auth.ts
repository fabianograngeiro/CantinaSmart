import { Router, Request, Response } from 'express';
import { db } from '../database';
import { 
  hashPassword, 
  comparePassword, 
  generateToken, 
  isValidEmail, 
  isStrongPassword 
} from '../utils/security';

const router = Router();

// Login
router.post('/login', async (req: Request, res: Response) => {
  console.log('\n🔐 [AUTH] Login attempt received');
  console.log('📧 Email:', req.body.email);
  
  const { email, password } = req.body;

  // Validate email format
  if (!email || !isValidEmail(email)) {
    console.log('❌ [AUTH] Invalid email format:', email);
    return res.status(400).json({ error: 'Email inválido' });
  }

  // Validate password provided
  if (!password) {
    console.log('❌ [AUTH] Password not provided');
    return res.status(400).json({ error: 'Senha é obrigatória' });
  }

  console.log('🔍 [DB] Searching for user by email...');
  const user = db.getUserByEmail(email);
  
  if (!user) {
    console.log('❌ [AUTH] User not found in database');
    return res.status(401).json({ error: 'Email ou senha inválidos' });
  }

  console.log('✅ [AUTH] User found:', user.email);
  
  // Compare password with stored hash
  try {
    const passwordMatch = await comparePassword(password, user.password);
    
    if (!passwordMatch) {
      console.log('❌ [AUTH] Password mismatch!');
      return res.status(401).json({ error: 'Email ou senha inválidos' });
    }

    console.log('✅ [AUTH] Password matched!');
    
    // Generate JWT token
    const token = generateToken(user.id, user.role);
    console.log('🎫 [AUTH] JWT token generated');
    console.log('✅ [AUTH] Login successful for user:', user.email);
    
    res.json({ user: { ...user, password: undefined }, token });
  } catch (error) {
    console.log('❌ [AUTH] Password comparison error:', (error as Error).message);
    return res.status(500).json({ error: 'Erro ao validar credenciais' });
  }
});

// Register
router.post('/register', async (req: Request, res: Response) => {
  console.log('\n➕ [AUTH] Registration attempt received');
  console.log('📧 Email:', req.body.email);
  
  const { email, password, name, role = 'USER' } = req.body;

  // Validate email
  if (!email || !isValidEmail(email)) {
    console.log('❌ [AUTH] Invalid email format');
    return res.status(400).json({ error: 'Email inválido' });
  }

  // Validate name
  if (!name || name.trim().length === 0) {
    console.log('❌ [AUTH] Name not provided');
    return res.status(400).json({ error: 'Nome é obrigatório' });
  }

  // Validate password strength
  if (!password || !isStrongPassword(password)) {
    console.log('❌ [AUTH] Password does not meet security requirements');
    return res.status(400).json({ 
      error: 'Senha deve ter pelo menos 8 caracteres, 1 maiúscula, 1 minúscula e 1 número' 
    });
  }

  // Check if user already exists
  const existingUser = db.getUserByEmail(email);
  if (existingUser) {
    console.log('❌ [AUTH] User already exists:', email);
    return res.status(400).json({ error: 'Email já registrado' });
  }

  try {
    // Hash password
    const hashedPassword = await hashPassword(password);
    console.log('🔐 [AUTH] Password hashed successfully');

    // Create user with hashed password
    const newUser = db.createUser({
      email,
      password: hashedPassword,
      name,
      role,
    });

    console.log('✅ [AUTH] User created:', newUser.id);
    
    // Generate JWT token
    const token = generateToken(newUser.id, newUser.role);
    console.log('🎫 [AUTH] JWT token generated');

    res.status(201).json({ 
      user: { ...newUser, password: undefined }, 
      token 
    });
  } catch (error) {
    console.log('❌ [AUTH] Registration error:', (error as Error).message);
    return res.status(500).json({ error: 'Erro ao registrar usuário' });
  }
});

// Get all users
router.get('/', (req: Request, res: Response) => {
  console.log('📋 [AUTH] Fetching all users');
  const users = db.getUsers();
  console.log('✅ [AUTH] Returning', users.length, 'users');
  res.json(users.map(u => ({ ...u, password: undefined })));
});

// Get user by ID
router.get('/:id', (req: Request, res: Response) => {
  console.log('🔍 [AUTH] Fetching user by ID:', req.params.id);
  const user = db.getUser(req.params.id);
  if (!user) {
    console.log('❌ [AUTH] User not found:', req.params.id);
    return res.status(404).json({ error: 'Usuário não encontrado' });
  }
  console.log('✅ [AUTH] User found:', user.email);
  res.json({ ...user, password: undefined });
});

// Create user (admin only)
router.post('/', async (req: Request, res: Response) => {
  console.log('➕ [AUTH] Creating new user');
  console.log('📝 User data:', { ...req.body, password: '****' });
  
  const { email, password, name, role = 'USER' } = req.body;

  // Validate inputs
  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: 'Email inválido' });
  }

  if (!name || name.trim().length === 0) {
    return res.status(400).json({ error: 'Nome é obrigatório' });
  }

  if (!password || !isStrongPassword(password)) {
    return res.status(400).json({ 
      error: 'Senha deve ter pelo menos 8 caracteres, 1 maiúscula, 1 minúscula e 1 número' 
    });
  }

  // Check if user already exists
  if (db.getUserByEmail(email)) {
    return res.status(400).json({ error: 'Email já registrado' });
  }

  try {
    const hashedPassword = await hashPassword(password);
    const newUser = db.createUser({ email, password: hashedPassword, name, role });
    console.log('✅ [AUTH] User created:', newUser.id);
    res.status(201).json({ ...newUser, password: undefined });
  } catch (error) {
    console.log('❌ [AUTH] Error creating user:', (error as Error).message);
    res.status(500).json({ error: 'Erro ao criar usuário' });
  }
});

// Update user
router.put('/:id', async (req: Request, res: Response) => {
  const { password, ...updateData } = req.body;
  
  // If password is being updated, validate and hash it
  if (password) {
    if (!isStrongPassword(password)) {
      return res.status(400).json({ 
        error: 'Senha deve ter pelo menos 8 caracteres, 1 maiúscula, 1 minúscula e 1 número' 
      });
    }
    
    try {
      updateData.password = await hashPassword(password);
    } catch (error) {
      console.log('❌ [AUTH] Error hashing password:', (error as Error).message);
      return res.status(500).json({ error: 'Erro ao atualizar usuário' });
    }
  }

  const updated = db.updateUser(req.params.id, updateData);
  if (!updated) {
    return res.status(404).json({ error: 'Usuário não encontrado' });
  }
  
  res.json({ ...updated, password: undefined });
});

// Delete user
router.delete('/:id', (req: Request, res: Response) => {
  const deleted = db.deleteUser(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: 'Usuário não encontrado' });
  }
  res.json({ message: 'Usuário deletado com sucesso' });
});

export default router;
