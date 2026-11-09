import { createFileRoute, ClientOnly } from '@tanstack/react-router';
import { SignIn, useAuth, UserButton } from '@clerk/tanstack-react-start';
import { lazy, Suspense } from 'react';
import { AppSkeleton } from '../components/AppSkeleton';
const Workspace = lazy(() => import('../components/CloudWorkspace'));
export const Route = createFileRoute('/')({ component: Home });
function Home() {
  return <ClientOnly fallback={<AppSkeleton />}><AuthenticatedHome /></ClientOnly>;
}
function AuthenticatedHome() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  if (!isLoaded) return <AppSkeleton />;
  if (!isSignedIn) return <main className="auth-screen"><SignIn routing="hash" /></main>;
  return <><div className="account-control"><UserButton /></div>
    <ClientOnly fallback={<AppSkeleton />}><Suspense fallback={<AppSkeleton />}>
      <Workspace key={userId} userId={userId!} />
    </Suspense></ClientOnly></>;
}
