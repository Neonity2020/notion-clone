import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { initPersistence } from './persist';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

initPersistence().catch((e) => {
  console.error(e);
  document.getElementById('root')!.innerHTML = `<div class="loading">无法打开本地数据库：${String(e?.message ?? e)}</div>`;
});
