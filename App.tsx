
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
      // Defaulting to FALSE (Closed) on first boot
      return saved === 'true';
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
                log('SUCCESS', `INFRASTRUCTURE LINK: v${res.version}`);
                setSystemOnline(true);
            } else {
                setSystemOnline(false);
            }
        } catch (e) {
            setSystemOnline(false);
        }
    };
    initSystem();
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
      className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-300 font-serif ${
        activeTab === tab ? 'bg-primary-600 text-white shadow-[0_0_20px_rgba(37,99,235,0.3)]' : 'text-gray-400 hover:bg-gray-700 hover:text-white'
      }`}
    >
      {icon}
      <span className="font-medium tracking-tight uppercase text-xs">{label}</span>
    </button>
  );

  return (
    <div className="flex min-h-screen bg-[#020617] text-gray-100 font-serif selection:bg-primary-500/30">
      <aside className="w-72 bg-[#020617] p-8 border-r border-gray-800 flex flex-col z-20 shadow-2xl">
        <div className="flex items-center justify-between mb-12">
          <div className="flex items-center space-x-3">
            <AzureIcon className="w-8 h-8 text-primary-500" />
            <h1 className="text-xl font-black text-white uppercase tracking-tighter">Enterprise <span className="text-primary-500">Logics</span></h1>
          </div>
          <div className={`w-2 h-2 rounded-full ${systemOnline === true ? 'bg-green-500 animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.6)]' : 'bg-red-500'}`}></div>
        </div>
        <nav className="flex flex-col space-y-3">
          <NavItem tab="dashboard" icon={<DashboardIcon className="w-4 h-4" />} label="Command Center" />
          <NavItem tab="profiles" icon={<BellIcon className="w-4 h-4" />} label="Logic Profiles" />
          <NavItem tab="queue" icon={<ClockIcon className="w-4 h-4" />} label="Staging Queue" />
          <NavItem tab="audit" icon={<ClipboardListIcon className="w-4 h-4" />} label="Audit Records" />
          <NavItem tab="settings" icon={<SettingsIcon className="w-4 h-4" />} label="Infrastructure" />
        </nav>
        
        <div className="mt-auto pt-8 border-t border-gray-800">
            <button 
                onClick={() => setShowConsole(!showConsole)}
                className="flex items-center space-x-3 px-4 py-3 text-[10px] text-gray-500 hover:text-white w-full rounded-lg hover:bg-gray-800/50 uppercase font-black tracking-widest transition-all"
            >
                <div className={`w-1.5 h-1.5 rounded-full ${showConsole ? 'bg-green-500' : 'bg-gray-700'}`}></div>
                <span>{showConsole ? 'Telemetry Engaged' : 'Engage Telemetry'}</span>
            </button>
        </div>
      </aside>
      <main className="flex-1 p-10 overflow-y-auto relative z-10 bg-[#020617]">
        <div className={showConsole ? 'pb-72' : ''}>
            {renderTabContent()}
        </div>
      </main>
      <ConsoleLog visible={showConsole} onClose={() => setShowConsole(false)} />
    </div>
  );
};

export default App;
