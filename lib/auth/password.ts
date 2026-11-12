import bcrypt from 'bcryptjs';

export const MIN_PASSWORD_LENGTH = 10;

export function checkPasswordRules(pw: string): string | null {
  if (typeof pw !== 'string' || pw.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  if (pw.length > 200) return 'Password is too long';
  return null;
}

export const hashPassword = (pw: string) => bcrypt.hash(pw, 12);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);
