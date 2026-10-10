import { Redirect } from 'expo-router';
import { useSession } from '@/shared/session/SessionProvider';

/** The front door: signed-in citizens go to the app, everyone else to sign in. */
export default function Index() {
  const { state } = useSession();
  return <Redirect href={state.status === 'signedIn' ? '/report' : '/sign-in'} />;
}
