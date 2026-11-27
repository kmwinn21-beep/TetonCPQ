/** Roles and the user shape — no dependencies, safe to import in the browser. */
/** The roles the app ships with (admins can rename them and add more; see lib/data/roles.ts). */
export const ROLES = ['rep', 'deal_desk', 'vp_sales', 'ceo', 'admin'] as const;
export type BuiltinRole = (typeof ROLES)[number];
/** A role's permanent key: a built-in one, or a custom role's ("r_…"). */
export type Role = string;
/** The built-in roles' original names (the roles table holds the current ones). */
export const ROLE_LABEL: Record<BuiltinRole, string> = { rep: 'Sales rep', deal_desk: 'RevOps', vp_sales: 'VP Sales', ceo: 'CEO', admin: 'Admin' };

/** A role as admins see and edit it. */
export interface RoleDef {
  key: string;
  name: string;
  description: string;
  sort: number;
  /** Custom roles: the built-in role whose defaults it takes for permissions added later (null: everything off). */
  basedOn: string | null;
  builtin: boolean;
  /** Active users with this role. */
  users: number;
}

export interface User {
  id: number;
  email: string;
  name: string;
  role: Role;
  active: boolean;
  createdAt: string;
  /** Their role's permissions (set for the signed-in user; see lib/auth/permissions.ts). */
  grants?: import('./permissions').Grants;
}
