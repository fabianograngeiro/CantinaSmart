import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/security';

export interface AuthRequest extends Request {
  userId?: string;
  userRole?: string;
  user?: { userId: string; role: string };
}

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
    
    console.log('✅ [AUTH] JWT token verified for user:', decoded.userId);
    next();
  } catch (err) {
    console.log('❌ [AUTH] Token verification error:', (err as Error).message);
    return res.status(401).json({ error: 'Token inválido' });
  }
};
