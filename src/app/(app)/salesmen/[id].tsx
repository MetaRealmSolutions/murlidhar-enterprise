import { Redirect, useLocalSearchParams } from 'expo-router';

// Old links to a salesman land on the Salesmen page with that salesman selected. Not used by the app's own navigation.
export default function SalesmanRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={`/salesmen?salesman=${id}` as never} />;
}
