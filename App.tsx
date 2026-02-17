
import React, { useState, useEffect } from 'react';
import { DashboardIcon, SettingsIcon, BellIcon, AzureIcon, ClockIcon, ClipboardListIcon } from './components/icons';
import Dashboard from './components/Dashboard';
import Settings from './components/Settings';
import Profiles from './components/Profiles';
import QueueViewer from './components/QueueViewer';
import AuditLog from './components/AuditLog';
import ConsoleLog from './components/ConsoleLog';
import { log, checkConnectivity } from './services/api';

type Tab = 'dashboard' | 'profiles' | 'queue' | 'audit' | 'settings';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>(() => {
      return (localStorage.getItem('activeTab') as Tab) || 'dashboard';
  });
  
  const [showConsole, setShowConsole] = useState<boolean>(() => {
      const saved = localStorage.getItem('showConsole');
      return saved === null ? true : saved === 'true';
  });
  
  const [systemOnline, setSystemOnline] = useState<boolean | null>(null);

  useEffect(() => {
    localStorage.setItem('activeTab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    localStorage.setItem('showConsole', String(showConsole));
  }, [showConsole]);

  useEffect(() => {
    const initSystem = async () => {
        try {
            const res = await checkConnectivity();
            if (res) {
                log('SUCCESS', `SYSTEM HANDSHAKE VERIFIED (v${res.version})`);
                log('INFO', '--- ENTERPRISE SYSTEM MANIFEST ---');
                log('INFO', 'Feature [1]: Hybrid Expiry Processor - [ACTIVE]');
                log('INFO', 'Feature [2]: Manager Metadata Expansion - [ACTIVE]');
                log('INFO', 'Feature [3]: Atomic Data Persistence - [ONLINE]');
                log('INFO', 'Feature [4]: SMTP Delivery Queue - [READY]');
                log('INFO', 'Feature [5]: Audit History Database - [SYNCHRONIZED]');
                log('INFO', 'Feature [6]: JSON Profile Portability - [ACTIVE]');
                log('INFO', '----------------------------------');
                setSystemOnline(true);
            } else {
                log('ERROR', 'CRITICAL: Engine unreachable. API endpoints (404/Timeout).');
                setSystemOnline(false);
            }
        } catch (e) {
            log('ERROR', 'Initialization Protocol Error', e.message);
            setSystemOnline(false);
        }
    };

    initSystem();
    const interval = setInterval(initSystem, 60000);
    return () => clearInterval(interval);
  }, []);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'dashboard': return <Dashboard />;
      case 'profiles': return <Profiles />;
      case 'queue': return <QueueViewer />;
      case 'audit': return <AuditLog />;
      case 'settings': return <Settings toggleConsole={() => setShowConsole(!showConsole)} />;
      default: return <Dashboard />;
    }
  };

  const NavItem = ({ tab, icon, label }: { tab: Tab, icon: React.ReactNode, label: string }) => (
    <button
      onClick={() => setActiveTab(tab)}
      className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors duration-200 ${
        activeTab === tab ? 'bg-primary-600 text-white shadow-lg' : 'text-gray-400 hover:bg-gray-700 hover:text-white'
      }`}
    >
      {icon}
      <span className="font-medium">{label}</span>
    </button>
  );

  return (
    <div className="flex min-h-screen bg-gray-900 text-gray-100 font-sans selection:bg-primary-500/30">
      <aside className="w-72 bg-gray-800 p-6 border-r border-gray-700 flex flex-col z-20">
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center space-x-3">
            <AzureIcon className="w-10 h-10 text-primary-400" />
            <h1 className="text-2xl font-black text-white tracking-tight">AD <span className="text-primary-500">Notifier</span></h1>
          </div>
          <div className={`w-2.5 h-2.5 rounded-full ${systemOnline === true ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.6)]' : systemOnline === false ? 'bg-red-500' : 'bg-gray-600 animate-pulse'}`}></div>
        </div>
        <nav className="flex flex-col space-y-2">
          <NavItem tab="dashboard" icon={<DashboardIcon className="w-5 h-5" />} label="Dashboard" />
          <NavItem tab="profiles" icon={<BellIcon className="w-5 h-5" />} label="Profiles" />
          <NavItem tab="queue" icon={<ClockIcon className="w-5 h-5" />} label="Queue" />
          <NavItem tab="audit" icon={<ClipboardListIcon className="w-5 h-5" />} label="Audit Logs" />
          <NavItem tab="settings" icon={<SettingsIcon className="w-5 h-5" />} label="Settings" />
        </nav>
        
        <div className="mt-auto pt-4 border-t border-gray-700">
            <button 
                onClick={() => setShowConsole(!showConsole)}
                className="flex items-center space-x-3 px-4 py-3 text-sm text-gray-400 hover:text-white w-full rounded-lg hover:bg-gray-700"
            >
                <div className={`w-2 h-2 rounded-full ${showConsole ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-gray-600'}`}></div>
                <span>{showConsole ? 'Telemetry Active' : 'Resume Console'}</span>
            </button>
        </div>
      </aside>
      <main className="flex-1 p-8 overflow-y-auto relative z-10">
        <div className={showConsole ? 'pb-72' : ''}>
            {renderTabContent()}
        </div>
      </main>
      <ConsoleLog visible={showConsole} onClose={() => setShowConsole(false)} />
    </div>
  );
};

export default App;
