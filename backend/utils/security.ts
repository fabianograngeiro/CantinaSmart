import jwt, { SignOptions } from 'jsonwebtoken';
import bcryptjs from 'bcryptjs';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';
const JWT_EXPIRES_IN: string | number = process.env.JWT_EXPIRES_IN || '12h';
const REFRESH_EXPIRES_IN: string | number = process.env.REFRESH_TOKEN_EXPIRES_IN || '7d';

// Hash password with bcrypt
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcryptjs.genSalt(10);
  return bcryptjs.hash(password, salt);
}

// Compare password with hash
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcryptjs.compare(password, hash);
}

// Generate JWT token
export function generateToken(userId: string, role: string): string {
  const options: any = {
    expiresIn: JWT_EXPIRES_IN,
  };
  return jwt.sign(
    { userId, role },
    JWT_SECRET,
    options
  );
}

// Generate Refresh Token
export function generateRefreshToken(userId: string): string {
  const options: any = {
    expiresIn: REFRESH_EXPIRES_IN,
  };
  return jwt.sign(
    { userId },
    JWT_SECRET,
    options
  );
}

// Verify JWT token
export function verifyToken(token: string): { userId: string; role: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: string; role: string };
  } catch (error) {
    console.error('❌ [JWT] Token verification failed:', (error as Error).message);
    return null;
  }
}

// Validate email format
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Validate password strength
export function isStrongPassword(password: string): boolean {
  // At least 8 characters, 1 uppercase, 1 lowercase, 1 number
  return password.length >= 8 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /[0-9]/.test(password);
}

export default {
  hashPassword,
  comparePassword,
  generateToken,
  generateRefreshToken,
  verifyToken,
  isValidEmail,
  isStrongPassword,
};
