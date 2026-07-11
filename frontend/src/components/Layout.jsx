import { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import Footer from './Footer';
import MaintenanceBanner from './MaintenanceBanner';
import { useAuthStore } from '../store/useAuthStore';
import { useGameStore } from '../store/useGameStore';

export default function Layout({ children }) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebarCollapsed') === 'true');
  const user = useAuthStore((s) => s.user);
  const maintenance = useGameStore((s) => s.maintenance);

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', collapsed);
  }, [collapsed]);

  const showBanner = maintenance.enabled && user && user.role !== 'admin';

  return (
    <div className="flex h-screen overflow-hidden bg-surface text-primary">
      <Sidebar collapsed={collapsed} onToggleCollapse={() => setCollapsed(!collapsed)} />
      <main
        className={`flex-1 flex flex-col min-h-0 overflow-y-auto transition-all duration-300 ${collapsed ? 'lg:ml-16' : 'lg:ml-60'}`}
      >
        {showBanner && <MaintenanceBanner message={maintenance.message} />}
        <div className="flex-1 flex flex-col">{children}</div>
        <Footer />
      </main>
    </div>
  );
}
