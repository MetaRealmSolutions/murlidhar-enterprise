import { Redirect, useRouter } from 'expo-router';
import type { ReactNode } from 'react';

import { useAuth } from '../auth/AuthContext';
import { can, firstAllowedHref, isOwner, type Area } from '../auth/access';
import { Btn, T } from './controls';
import { Page } from './page';

/**
 * Guards a route by the signed-in user's role and permissions (not just its link in the menu).
 *   area 'stock' | 'privateBills' | 'salesmen'  the owner, or an employee with that permission
 *   area 'owner'                               the owner only (Users, Reports, Settings, Item Master)
 *   area 'home'                                the owner's Home; an employee is sent to their first allowed page
 * Without access: the page is replaced by an Access Denied message (with a way to an allowed page).
 * Frontend only: see src/auth/access.ts for the Firestore rules this still needs.
 */
export function RequireAccess({ area, children }: { area: Area | 'owner' | 'home'; children: ReactNode }) {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const allowed = area === 'owner' || area === 'home' ? isOwner(user) : can(user, area);
  if (allowed) return <>{children}</>;
  const next = firstAllowedHref(user);
  if (area === 'home' && next) return <Redirect href={next} />;
  return (
    <Page title="Access Denied">
      <T size={16}>{area === 'home' && !next ? 'No pages have been enabled for your account yet. Please ask the owner.' : 'You do not have permission to open this page.'}</T>
      {next ? <Btn title="Go to an allowed page" onPress={() => router.navigate(next)} /> : <Btn title="Sign out" variant="secondary" onPress={signOut} />}
    </Page>
  );
}
