import { createRootRoute, HeadContent, Outlet, Scripts } from '@tanstack/react-router';
import { ClerkProvider } from '@clerk/tanstack-react-start';
import { shadcn } from '@clerk/ui/themes';
import { zhCN } from '@clerk/localizations';
import styles from '../styles.css?url';

// zhCN 语言包缺此 key（回落英文），其余缺失项为 Clerk 品牌徽章不走 i18n
const clerkZhCN = { ...zhCN, formFieldInputPlaceholder__password: '请输入密码' };

export const Route = createRootRoute({
  head: () => ({
    meta: [{ charSet: 'utf-8' }, { name: 'viewport', content: 'width=device-width, initial-scale=1' }, { title: 'Notes · 块笔记' }],
    links: [{ rel: 'stylesheet', href: styles }, { rel: 'icon', type: 'image/png', href: '/product-favicon.png' }],
  }),
  component: Root,
  notFoundComponent: () => <main className="loading"><a href="/">页面不存在，返回首页</a></main>,
  errorComponent: () => <main className="loading"><a href="/">加载失败，点击重试</a></main>,
});
function Root() {
  return <html lang="zh-CN"><head><HeadContent /></head><body>
    <ClerkProvider localization={clerkZhCN} appearance={{ theme: shadcn }}><Outlet /></ClerkProvider>
    <Scripts />
  </body></html>;
}
