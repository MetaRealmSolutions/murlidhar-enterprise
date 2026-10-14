import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { useAuth } from '../../../auth/AuthContext';
import { Btn } from '../../../components/controls';
import { InfoRow, Page, SectionTitle, usePageMetrics } from '../../../components/page';
import { useUsers } from '../../../data/repository';
import { BUSINESS_NAME } from '../../../mock/data';

export default function SettingsScreen() {
  const { signOut } = useAuth();
  const users = useUsers();
  const router = useRouter();
  const { phone } = usePageMetrics();
  return (
    <Page title="Settings" subtitle="Business details and account." narrow>
      <View style={{ gap: 4 }}>
        <SectionTitle title="Business" />
        <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: 'transparent' }}>
          <InfoRow label="Business" value={BUSINESS_NAME} />
          <InfoRow label="Users" value={String(users.length)} />
          <InfoRow label="Application" value="Murlidhar Enterprise 1.0 (prototype)" />
        </View>
      </View>
      <View style={{ flexDirection: phone ? 'column' : 'row', gap: 10 }}>
        <Btn title="Manage Users" variant="secondary" fill={phone} onPress={() => router.push('/more/users')} />
        <Btn title="Logout" variant="danger" fill={phone} onPress={signOut} />
      </View>
    </Page>
  );
}
