import { Redirect } from 'expo-router';

// Products live on the Stock page (add, edit and stock in one place); the old duplicate screens redirect there.
export default function ProductsRedirect() {
  return <Redirect href="/stock" />;
}
