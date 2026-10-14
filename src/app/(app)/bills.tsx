import { Redirect, useLocalSearchParams } from 'expo-router';

// Kept only so old links still work: bills live on the Salesmen page.
export default function BillsRedirect() {
  const { salesman } = useLocalSearchParams<{ salesman?: string }>();
  return <Redirect href={(salesman ? `/salesmen?salesman=${salesman}` : '/salesmen') as never} />;
}
