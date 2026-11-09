import { Skeleton } from './ui/skeleton';

export function AppSkeleton() {
  return <div className="app app-skeleton" role="status" aria-label="正在加载工作区" aria-busy="true">
    <span className="sr-only">正在加载工作区…</span>
    <aside className="sidebar skeleton-sidebar" aria-hidden="true">
      <Skeleton className="h-6 w-36" />
      <Skeleton className="h-8 w-full" />
      <div className="flex flex-col gap-4 pt-6">
        {[80, 65, 90, 72, 55, 82].map((width, i) => <Skeleton key={i} className="h-4" style={{ width: `${width}%` }} />)}
      </div>
    </aside>
    <main className="main" aria-hidden="true">
      <div className="topbar"><Skeleton className="h-4 w-40" /></div>
      <div className="page-scroll"><div className="page flex flex-col gap-6">
        <Skeleton className="size-16" /><Skeleton className="h-10 w-3/4" />
        <div className="flex flex-col gap-3 pt-4">
          {[100, 94, 80, 100, 90, 64].map((width, i) => <Skeleton key={i} className="h-4" style={{ width: `${width}%` }} />)}
        </div>
      </div></div>
    </main>
  </div>;
}
