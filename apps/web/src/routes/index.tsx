import { createFileRoute, ClientOnly } from '@tanstack/react-router';
import { SignIn, useAuth, UserButton } from '@clerk/tanstack-react-start';
import { lazy, Suspense } from 'react';
import { AppSkeleton } from '../components/AppSkeleton';
import { AuthShell } from '../components/AuthShell';
const Workspace = lazy(() => import('../components/CloudWorkspace'));
export const Route = createFileRoute('/')({ component: Home });
function Home() {
  return <ClientOnly fallback={<AppSkeleton />}><AuthenticatedHome /></ClientOnly>;
}
function AuthenticatedHome() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  if (!isLoaded) return <AppSkeleton />;
  if (!isSignedIn) return <AuthShell><SignIn routing="hash" /></AuthShell>;
  return <><div className="account-control"><UserButton /></div>
    <ClientOnly fallback={<AppSkeleton />}><Suspense fallback={<AppSkeleton />}>
      <Workspace key={userId} userId={userId!} />
    </Suspense></ClientOnly></>;
}
