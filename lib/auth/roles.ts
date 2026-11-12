/** Roles and the user shape — no dependencies, safe to import in the browser. */
export const ROLES = ['rep', 'deal_desk', 'vp_sales', 'ceo', 'admin'] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABEL: Record<Role, string> = { rep: 'Sales rep', deal_desk: 'Deal Desk', vp_sales: 'VP Sales', ceo: 'CEO', admin: 'Admin' };

export interface User {
  id: number;
  email: string;
  name: string;
  role: Role;
  active: boolean;
  createdAt: string;
}
