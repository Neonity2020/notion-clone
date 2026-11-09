import { createRootRoute, HeadContent, Outlet, Scripts } from '@tanstack/react-router';
import { ClerkProvider } from '@clerk/tanstack-react-start';
import { shadcn } from '@clerk/ui/themes';
import styles from '../styles.css?url';

export const Route = createRootRoute({
  head: () => ({
    meta: [{ charSet: 'utf-8' }, { name: 'viewport', content: 'width=device-width, initial-scale=1' }, { title: 'Notes · 块笔记' }],
    links: [{ rel: 'stylesheet', href: styles }],
  }),
  component: Root,
  notFoundComponent: () => <main className="loading"><a href="/">页面不存在，返回首页</a></main>,
  errorComponent: () => <main className="loading"><a href="/">加载失败，点击重试</a></main>,
});
function Root() {
  return <html lang="zh-CN"><head><HeadContent /></head><body>
    <ClerkProvider appearance={{ theme: shadcn }}><Outlet /></ClerkProvider>
    <Scripts />
  </body></html>;
}
