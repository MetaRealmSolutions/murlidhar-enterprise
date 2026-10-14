import { Redirect } from 'expo-router';

// There is one way to receive stock: Add Stock mode on the Stock page. Old links come here and are sent there.
export default function ReceiveStockRedirect() {
  return <Redirect href={`/stock?action=add&t=${Date.now()}` as never} />;
}
