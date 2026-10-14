import { Stack } from 'expo-router';

import { RequireAccess } from '../../../components/require-access';

// The shared app header is the only header; pages draw their own titles.
export default function MoreLayout() {
  // Reports, Users, Businesses, Settings and the Item Master pages: the owner only.
  return (
    <RequireAccess area="owner">
      <Stack screenOptions={{ headerShown: false }} />
    </RequireAccess>
  );
}
