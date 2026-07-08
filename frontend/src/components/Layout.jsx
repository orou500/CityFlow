import { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import Footer from './Footer';

export default function Layout({ children }) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebarCollapsed') === 'true');

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', collapsed);
  }, [collapsed]);

  return (
    <div className="flex h-screen overflow-hidden bg-surface text-primary">
      <Sidebar collapsed={collapsed} onToggleCollapse={() => setCollapsed(!collapsed)} />
      <main className={`flex-1 flex flex-col min-h-0 overflow-y-auto transition-all duration-300 ${collapsed ? 'lg:ml-16' : 'lg:ml-60'}`}>
        <div className="flex-1 flex flex-col">
          {children}
        </div>
        <Footer />
      </main>
    </div>
  );
}
