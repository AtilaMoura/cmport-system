"use client"

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from './ThemeToggle';

export default function Sidebar() {
  const pathname = usePathname();

  const menuItems = [
    { name: 'Dashboard', icon: '📊', href: '/' },
    { name: 'Condomínios', icon: '🏢', href: '/condominios' },
    { name: 'Serviços', icon: '🛠️', href: '/servicos' },
    { name: 'Notas Fiscais', icon: '📄', href: '/notas' },
    { name: 'Boletos', icon: '🏦', href: '/boletos' },
    { name: 'Dev / Teste', icon: '⚙️', href: '/dev' },
  ];

  return (
    <aside className="w-64 bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 flex flex-col min-h-screen transition-colors duration-300">
      {/* Header */}
      <div className="p-6 border-b border-slate-200 dark:border-slate-800">
  <div className="flex items-center gap-3 mb-1">
    {/* Box do Logo com a cor Brand */}
    <div className="w-50 h-30 rounded-xl flex items-center justify-center shadow-lg shadow-brand/20 transition-transform hover:scale-105 overflow-hidden">
      <img 
        src="/logo02.png" 
        alt="CMPort Logo" 
        className="w-full h-full object-contain p-1" 
      />
    </div>
    
  </div>
</div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {menuItems.map((item) => {
          const isActive = pathname === item.href || 
                          (item.href !== '/' && pathname.startsWith(item.href));
          
          return (
            <Link 
              key={item.href} 
              href={item.href}
              className={`
                group flex items-center gap-3 px-4 py-3 rounded-xl font-semibold text-sm
                transition-all duration-200 relative overflow-hidden
                ${isActive 
                  ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-900 dark:text-blue-400 shadow-sm' 
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-white'
                }
              `}
            >
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-blue-900 dark:bg-blue-400 rounded-r-full" />
              )}
              <span className="text-xl opacity-80 group-hover:scale-110 transition-transform">
                {item.icon}
              </span>
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Tema</span>
            <div className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />
          </div>
          <ThemeToggle />
        </div>
        
        <div className="px-2 py-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-800 rounded-lg flex items-center justify-center">
              <span className="text-sm font-bold text-slate-700 dark:text-slate-300">AD</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">Administrador</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">admin@cmport.com</p>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}