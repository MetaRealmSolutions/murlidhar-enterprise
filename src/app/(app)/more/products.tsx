import { Redirect } from 'expo-router';

// Products live on the Products page; the old duplicate screens redirect there.
export default function ProductsRedirect() {
  return <Redirect href="/products" />;
}
