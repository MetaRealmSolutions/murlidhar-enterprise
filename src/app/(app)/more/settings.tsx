import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';

import { useAuth } from '../../../auth/AuthContext';
import { AppUpdater } from '../../../components/app-updater';
import { Btn, T, TextAction, useTheme } from '../../../components/controls';
import { InfoRow, Page, SectionTitle, usePageMetrics } from '../../../components/page';
import { APP_NAME, BUILD_NUMBER, DEVELOPER, PACKAGE_VERSION, RELEASE_VERSION } from '../../../constants/app-info';
import { useUsers } from '../../../data/repository';
import { BUSINESS_ADDRESS, BUSINESS_GSTIN, BUSINESS_NAME, BUSINESS_PHONES } from '../../../mock/data';

/** A support detail that opens in the matching app (mail, phone) and can be copied. */
function ContactRow({ label, value, href, copyLabel }: { label: string; value: string; href: string; copyLabel: string }) {
  const t = useTheme();
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const copy = async () => {
    let next: 'copied' | 'failed' = 'copied';
    try {
      await Clipboard.setStringAsync(value);
    } catch {
      next = 'failed';
    }
    setState(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 2000);
  };
  // A desktop browser may have no handler for mailto: or tel:; the copy button still works there.
  const open = () => Linking.openURL(href).catch(() => undefined);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 58, borderBottomWidth: 1, borderBottomColor: t.border }}>
      <T size={15} muted>
        {label}
      </T>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 }}>
        <Pressable accessibilityRole="link" accessibilityLabel={`${label}: ${value}`} onPress={open} style={{ flexShrink: 1 }}>
          <T size={15} weight="500" style={{ color: t.accent, textAlign: 'right' }}>
            {value}
          </T>
        </Pressable>
        <TextAction title={state === 'copied' ? 'Copied' : state === 'failed' ? 'Failed' : 'Copy'} label={copyLabel} onPress={copy} />
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const { signOut } = useAuth();
  const users = useUsers();
  const { phone } = usePageMetrics();
  return (
    <Page title="Settings" subtitle="Business details, application information and support." narrow>
      <View style={{ gap: 4 }}>
        <SectionTitle title="Business Details" />
        <View style={{ marginTop: 8 }}>
          <InfoRow label="Business" value={BUSINESS_NAME} />
          <InfoRow label="Users" value={String(users.length)} />
          <InfoRow label="GSTIN" value={BUSINESS_GSTIN} />
          <InfoRow label="Phone" value={BUSINESS_PHONES.join(', ')} />
          <InfoRow label="Address" value={BUSINESS_ADDRESS} />
        </View>
      </View>

      <View style={{ gap: 4 }}>
        <SectionTitle title="Application Information" />
        <View style={{ marginTop: 8 }}>
          <InfoRow label="Application" value={APP_NAME} />
          <InfoRow label="Release" value={RELEASE_VERSION} />
          <InfoRow label="Package version" value={PACKAGE_VERSION} />
          <InfoRow label="Build number" value={String(BUILD_NUMBER)} />
          {/* Temporary: remove after the 1.0 -> 1.1 updater test is verified. */}
          <InfoRow label="Update test build 1.1" value="Delivered by auto-update" />
        </View>
        <AppUpdater />
      </View>

      <View style={{ gap: 4 }}>
        <SectionTitle title="Software Ownership" />
        <View style={{ marginTop: 8 }}>
          <InfoRow label="Developed and owned by" value={DEVELOPER.name} />
          <View style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'transparent' }}>
            <T size={13} muted>
              {DEVELOPER.copyright}
            </T>
          </View>
        </View>
      </View>

      <View style={{ gap: 4 }}>
        <SectionTitle title="Support" />
        <View style={{ marginTop: 8 }}>
          <ContactRow label="Email" value={DEVELOPER.email} href={`mailto:${DEVELOPER.email}`} copyLabel="Copy support email" />
          <ContactRow label="Phone" value={DEVELOPER.phone} href={`tel:${DEVELOPER.phone.replace(/\s/g, '')}`} copyLabel="Copy support phone" />
        </View>
      </View>

      <View style={{ flexDirection: phone ? 'column' : 'row', gap: 10 }}>
        <Btn title="Logout" variant="danger" fill={phone} onPress={signOut} />
      </View>
    </Page>
  );
}
