import { Redirect, type Href } from 'expo-router';

// Accounts are created in Firebase Authentication (with a users/{uid} profile), not in the app.
export default function UserFormScreen() {
  return <Redirect href={'/more/users' as Href} />;
}
