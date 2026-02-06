/**
 * Tests for RBAC utilities — role hierarchy, route permissions, action permissions.
 */
import { describe, it, expect } from 'vitest';
import {
  hasPermission,
  getRoutePermission,
  ROUTE_PERMISSIONS,
  ACTION_PERMISSIONS,
} from './rbac';

describe('hasPermission', () => {
  it('SuperAdmin has access to everything', () => {
    expect(hasPermission('SuperAdmin', 'SuperAdmin')).toBe(true);
    expect(hasPermission('SuperAdmin', 'SiteManager')).toBe(true);
    expect(hasPermission('SuperAdmin', 'Operator')).toBe(true);
    expect(hasPermission('SuperAdmin', 'Viewer')).toBe(true);
  });

  it('SiteManager has access to SiteManager and below', () => {
    expect(hasPermission('SiteManager', 'SuperAdmin')).toBe(false);
    expect(hasPermission('SiteManager', 'SiteManager')).toBe(true);
    expect(hasPermission('SiteManager', 'Operator')).toBe(true);
    expect(hasPermission('SiteManager', 'Viewer')).toBe(true);
  });

  it('Operator has access to Operator and below', () => {
    expect(hasPermission('Operator', 'SuperAdmin')).toBe(false);
    expect(hasPermission('Operator', 'SiteManager')).toBe(false);
    expect(hasPermission('Operator', 'Operator')).toBe(true);
    expect(hasPermission('Operator', 'Viewer')).toBe(true);
  });

  it('Viewer has access to Viewer only', () => {
    expect(hasPermission('Viewer', 'SuperAdmin')).toBe(false);
    expect(hasPermission('Viewer', 'SiteManager')).toBe(false);
    expect(hasPermission('Viewer', 'Operator')).toBe(false);
    expect(hasPermission('Viewer', 'Viewer')).toBe(true);
  });
});

describe('getRoutePermission', () => {
  it('returns Viewer for dashboard base route', () => {
    expect(getRoutePermission('/dashboard')).toBe('Viewer');
  });

  it('returns Viewer for crane detail', () => {
    expect(getRoutePermission('/dashboard/crane/CRANE-001')).toBe('Viewer');
  });

  it('returns SiteManager for reports', () => {
    expect(getRoutePermission('/dashboard/reports')).toBe('SiteManager');
  });

  it('returns SiteManager for settings', () => {
    expect(getRoutePermission('/dashboard/settings')).toBe('SiteManager');
  });

  it('returns Viewer for unknown routes', () => {
    expect(getRoutePermission('/unknown/route')).toBe('Viewer');
  });
});

describe('ROUTE_PERMISSIONS', () => {
  it('defines all expected routes', () => {
    expect(ROUTE_PERMISSIONS['/dashboard']).toBeDefined();
    expect(ROUTE_PERMISSIONS['/dashboard/crane']).toBeDefined();
    expect(ROUTE_PERMISSIONS['/dashboard/operators']).toBeDefined();
    expect(ROUTE_PERMISSIONS['/dashboard/reports']).toBeDefined();
    expect(ROUTE_PERMISSIONS['/dashboard/alerts']).toBeDefined();
    expect(ROUTE_PERMISSIONS['/dashboard/settings']).toBeDefined();
  });
});

describe('ACTION_PERMISSIONS', () => {
  it('requires Operator+ to acknowledge alerts', () => {
    expect(hasPermission('Operator', ACTION_PERMISSIONS.acknowledgeAlert)).toBe(true);
    expect(hasPermission('Viewer', ACTION_PERMISSIONS.acknowledgeAlert)).toBe(false);
  });

  it('requires SiteManager+ to edit crane', () => {
    expect(hasPermission('SiteManager', ACTION_PERMISSIONS.editCrane)).toBe(true);
    expect(hasPermission('Operator', ACTION_PERMISSIONS.editCrane)).toBe(false);
  });

  it('requires SuperAdmin to manage users', () => {
    expect(hasPermission('SuperAdmin', ACTION_PERMISSIONS.manageUsers)).toBe(true);
    expect(hasPermission('SiteManager', ACTION_PERMISSIONS.manageUsers)).toBe(false);
  });

  it('requires SuperAdmin to delete crane', () => {
    expect(hasPermission('SuperAdmin', ACTION_PERMISSIONS.deleteCrane)).toBe(true);
    expect(hasPermission('SiteManager', ACTION_PERMISSIONS.deleteCrane)).toBe(false);
  });
});
