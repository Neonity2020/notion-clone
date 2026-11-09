import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';
import { AppSkeleton } from './components/AppSkeleton';

export function getRouter() {
  return createRouter({ routeTree, scrollRestoration: true, defaultPendingComponent: AppSkeleton });
}
declare module '@tanstack/react-router' {
  interface Register { router: ReturnType<typeof getRouter> }
}
