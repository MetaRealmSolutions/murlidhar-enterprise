import { Redirect, type Href } from 'expo-router';
import { View } from 'react-native';

import { useSalesmanSession } from '../../auth/AuthContext';
import { T, useTheme } from '../../components/controls';
import { Page, SectionTitle, usePageMetrics } from '../../components/page';
import { useHeldProducts, useHolding } from '../../data/repository';
import { istHour } from '../../data/business-date';
import { formatLong, todayISO } from '../../data/statements';
import { num } from '../../mock/data';

function greeting() {
  const h = istHour();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function SalesmanHome() {
  const session = useSalesmanSession();
  const t = useTheme();
  const { phone } = usePageMetrics();
  const salesmanId = session?.salesmanId ?? '';
  const carried = useHolding(salesmanId);
  const mine = useHeldProducts(salesmanId).filter((h) => h.qty > 0);
  if (!session) return <Redirect href={'/' as Href} />;

  const products = Object.values(carried).filter((v) => v > 0).length;
  const units = Object.values(carried).reduce((n, v) => n + v, 0);

  const metrics = [
    { label: 'Items in Stock', value: String(products), note: `${num(units)} units in total` },
    { label: 'Units Carried', value: num(units), note: 'Carried right now' },
  ];

  return (
    <Page title={`${greeting()}, ${session.user.name}`} subtitle={`Murlidhar Enterprise · ${formatLong(todayISO())}`}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', borderTopWidth: 1, borderBottomWidth: 1, borderColor: t.border }}>
        {metrics.map((m, i) => {
          const cols = 2;
          const col = i % cols;
          return (
            <View
              key={m.label}
              style={{
                width: `${100 / cols}%`,
                paddingVertical: phone ? 16 : 22,
                paddingLeft: col === 0 ? (phone ? 4 : 0) : phone ? 16 : 28,
                paddingRight: 12,
                borderLeftWidth: col > 0 ? 1 : 0,
                borderLeftColor: t.border,
                borderBottomWidth: 0,
                borderBottomColor: t.border,
                gap: 4,
              }}>
              <T size={14} weight="500" muted>
                {m.label}
              </T>
              <T size={phone ? 24 : 30} weight="700" style={{ letterSpacing: -0.6, fontVariant: ['tabular-nums'] }}>
                {m.value}
              </T>
              <T size={13} muted>
                {m.note}
              </T>
            </View>
          );
        })}
      </View>

      <View style={{ gap: 12 }}>
        <SectionTitle title="My Items" />
        {mine.length === 0 ? (
          <T muted>You have no products right now. Goods appear here once the owner gives them to you.</T>
        ) : (
          <View style={{ borderTopWidth: 1, borderColor: t.border }}>
            {mine.map(({ product, qty }) => (
              <View key={product.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 58, borderBottomWidth: 1, borderBottomColor: t.border }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.success }} />
                <T size={16} weight="500" style={{ flex: 1 }}>
                  {product.name}
                </T>
                <T size={17} weight="700" style={{ fontVariant: ['tabular-nums'] }}>
                  {num(qty)}
                </T>
              </View>
            ))}
          </View>
        )}
      </View>
    </Page>
  );
}
