import { Redirect } from 'expo-router';

// Adding and editing a salesman happens in the form on the Salesmen list; this old route just goes there.
export default function SalesmanFormRedirect() {
  return <Redirect href="/salesmen" />;
}
