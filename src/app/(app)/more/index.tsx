import { Redirect } from 'expo-router';

// "More" is a dropdown in the header, not a page. Anyone landing here is sent to Products.
export default function MoreIndex() {
  return <Redirect href="/stock" />;
}
