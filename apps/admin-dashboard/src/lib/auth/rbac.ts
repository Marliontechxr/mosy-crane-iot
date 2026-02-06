/**
 * RBAC utilities — role-based access control for routes and actions.
 */
import type { UserRole } from '@mosy/shared-types';

/** Minimum role required for each protected route. */
export const ROUTE_PERMISSIONS: Record<string, UserRole> = {
  '/dashboard': 'Viewer',
  '/dashboard/crane': 'Viewer',
  '/dashboard/operators': 'Viewer',
  '/dashboard/reports': 'SiteManager',
  '/dashboard/alerts': 'Viewer',
  '/dashboard/settings': 'SiteManager',
};

/** Action-level permissions. */
export const ACTION_PERMISSIONS = {
  acknowledgeAlert: 'Operator' as UserRole,
  editCrane: 'SiteManager' as UserRole,
  uploadCalibration: 'SiteManager' as UserRole,
  manageUsers: 'SuperAdmin' as UserRole,
  deleteCrane: 'SuperAdmin' as UserRole,
  viewReports: 'SiteManager' as UserRole,
};

const ROLE_HIERARCHY: Record<UserRole, number> = {
  SuperAdmin: 4,
  SiteManager: 3,
  Operator: 2,
  Viewer: 1,
};

/** Check if a user role meets the minimum required role. */
export function hasPermission(userRole: UserRole, requiredRole: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

/** Get the minimum role required for a route path. Matches most specific route first. */
export function getRoutePermission(path: string): UserRole {
  const match = Object.entries(ROUTE_PERMISSIONS)
    .filter(([route]) => path.startsWith(route))
    .sort((a, b) => b[0].length - a[0].length);
  return match[0]?.[1] ?? 'Viewer';
}
