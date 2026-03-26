import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/security';
import { db } from '../database';

export interface AuthRequest extends Request {
  userId?: string;
  userRole?: string;
  user?: { userId: string; role: string };
}

const startOfToday = () => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
};

const isDateOnOrBeforeToday = (value?: string) => {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  date.setHours(0, 0, 0, 0);
  return date.getTime() <= startOfToday().getTime();
};

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    console.log('❌ [AUTH] No authorization header provided');
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    console.log('❌ [AUTH] No token provided in authorization header');
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  try {
    // Verify JWT token
    const decoded = verifyToken(token);
    
    if (!decoded) {
      console.log('❌ [AUTH] Invalid or expired JWT token');
      return res.status(401).json({ error: 'Token inválido ou expirado' });
    }
    
    // Set user data on request object
    req.userId = decoded.userId;
    req.userRole = decoded.role;
    req.user = decoded;

    const currentUser = db.getUser(decoded.userId);
    if (!currentUser || currentUser.isActive === false) {
      console.log('⛔ [AUTH] Access denied for inactive/nonexistent user:', decoded.userId);
      return res.status(401).json({ error: 'Conta desativada. Faça login novamente.' });
    }

    if (isDateOnOrBeforeToday(currentUser.expirationDate)) {
      if (currentUser.isActive !== false) {
        db.updateUser(currentUser.id, { isActive: false });
      }
      console.log('⛔ [AUTH] Access denied for expired account:', decoded.userId, currentUser.expirationDate);
      return res.status(401).json({ error: 'Acesso vencido. Renove sua mensalidade para continuar.' });
    }
    
    console.log('✅ [AUTH] JWT token verified for user:', decoded.userId);
    next();
  } catch (err) {
    console.log('❌ [AUTH] Token verification error:', (err as Error).message);
    return res.status(401).json({ error: 'Token inválido' });
  }
};
