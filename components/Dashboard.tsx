
import React, { useState, useEffect, useMemo } from 'react';
import useLocalStorage from '../hooks/useLocalStorage';
import { fetchUsers, fetchProfiles } from '../services/api';
import { User, GraphApiConfig, NotificationProfile } from '../types';
import UserTable from './UserTable';
import { AlertTriangleIcon, CheckCircleIcon, SearchIcon, UserIcon, XCircleIcon, ClockIcon, BellIcon, ClipboardListIcon } from './icons';

const Dashboard: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  const [filterEnabledOnly, setFilterEnabledOnly] = useState(false);
  const [filterNeverExpireOnly, setFilterNeverExpireOnly] = useState(false);
  const [managerFilter, setManagerFilter] = useState('');
  const [daysFilter, setDaysFilter] = useState<number | ''>('');
  
  const [profiles, setProfiles] = useState<NotificationProfile[]>([]);
  const [showActionPanel, setShowActionPanel] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [isPushing, setIsPushing] = useState(false);

  const [graphConfig] = useLocalStorage<GraphApiConfig>('graphApiConfig', { tenantId: '', clientId: '', clientSecret: '' });

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [uData, pData] = await Promise.all([
        fetchUsers(graphConfig),
        fetchProfiles()
      ]);
      setUsers(uData);
      setProfiles(pData);
      setLastRefresh(new Date().toLocaleTimeString());
    } catch (err: any) {
      setError(err.message || 'Infrastructure Synchronizer Fault');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const uniqueManagers = useMemo(() => {
    const managers = users.map(u => u.managerName).filter(m => m && m !== "N/A") as string[];
    return Array.from(new Set(managers)).sort();
  }, [users]);

  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      const matchesSearch = user.displayName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           user.userPrincipalName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           user.managerName?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesEnabled = filterEnabledOnly ? user.accountEnabled === true : true;
      const matchesNeverExpire = filterNeverExpireOnly ? user.neverExpires === true : true;
      const matchesManager = managerFilter ? user.managerName === managerFilter : true;
      const matchesDays = daysFilter !== '' ? user.passwordExpiresInDays <= daysFilter && !user.neverExpires : true;
      return matchesSearch && matchesEnabled && matchesNeverExpire && matchesManager && matchesDays;
    });
  }, [users, searchTerm, filterEnabledOnly, filterNeverExpireOnly, managerFilter, daysFilter]);

  const stats = useMemo(() => ({
    total: users.length,
    expiringSoon: users.filter(u => u.passwordExpiresInDays > 0 && u.passwordExpiresInDays <= 14 && !u.neverExpires).length,
    expired: users.filter(u => u.passwordExpiresInDays <= 0 && !u.neverExpires).length,
    neverExpires: users.filter(u => u.neverExpires).length,
    safe: users.filter(u => u.passwordExpiresInDays > 14 && !u.neverExpires).length
  }), [users]);

  const handleForcedPush = async () => {
    if (!selectedProfileId) return;
    setIsPushing(true);
    const emails = users.filter(u => selectedIds.includes(u.id)).map(u => u.userPrincipalName);
    
    try {
        const res = await fetch('/api/manual-push', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ userEmails: emails, profileId: selectedProfileId })
        });
        if (res.ok) {
            alert(`Forced delivery signal sent for ${emails.length} identities.`);
            setShowActionPanel(false);
            setSelectedIds([]);
        } else {
            alert('Manual transmission failed at endpoint.');
        }
    } catch (e) {
        alert('Critical Manual Push Engine Failure');
    } finally {
        setIsPushing(false);
    }
  };

  const StatCard = ({ title, value, colorClass, icon }: any) => (
    <div className={`bg-gray-800 p-6 rounded-2xl flex items-center space-x-5 border border-gray-700 shadow-2xl relative overflow-hidden group hover:border-gray-500 transition-all`}>
        <div className={`p-4 rounded-xl ${colorClass.replace('border-', 'bg-').replace('-500', '-500/10')} text-white/90`}>{icon}</div>
        <div>
            <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">{title}</p>
            <p className="text-3xl font-black text-white mt-0.5 tracking-tighter">{value}</p>
        </div>
        <div className={`absolute bottom-0 left-0 h-1 w-full ${colorClass.replace('border-', 'bg-')}`}></div>
    </div>
  );

  return (
    <div className="space-y-8 relative">
      <div className="flex justify-between items-center">
        <div>
            <h2 className="text-4xl font-black text-white tracking-tighter uppercase">Directory Health Hub</h2>
            <div className="flex items-center gap-2 mt-2">
                <span className="w-2 h-2 rounded-full bg-primary-500 animate-pulse shadow-[0_0_10px_rgba(37,99,235,0.5)]"></span>
                <span className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Global Handshake: Active</span>
                <span className="text-gray-700 mx-2">|</span>
                <span className="text-[10px] text-gray-400 font-mono uppercase tracking-tighter">Sync Vector: {lastRefresh || 'Handshaking...'}</span>
            </div>
        </div>
        <button onClick={loadData} className="bg-gray-800 hover:bg-gray-700 text-white px-6 py-3 rounded-xl text-xs flex items-center gap-3 transition-all border border-gray-700 font-black uppercase tracking-widest group shadow-xl">
           <ClockIcon className={`w-4 h-4 text-primary-400 ${loading ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`} />
           Sync Domain
        </button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <StatCard title="Total Directory" value={stats.total} colorClass="border-gray-500" icon={<UserIcon className="w-6 h-6" />} />
        <StatCard title="Compliant" value={stats.safe} colorClass="border-green-500" icon={<CheckCircleIcon className="w-6 h-6" />} />
        <StatCard title="At Risk" value={stats.expiringSoon} colorClass="border-yellow-500" icon={<AlertTriangleIcon className="w-6 h-6" />} />
        <StatCard title="Critical" value={stats.expired} colorClass="border-red-500" icon={<XCircleIcon className="w-6 h-6" />} />
        <StatCard title="Safe Policy" value={stats.neverExpires} colorClass="border-blue-500" icon={<ClockIcon className="w-6 h-6" />} />
      </div>

      <div className="bg-gray-800 p-8 rounded-[2.5rem] border border-gray-700 shadow-2xl relative overflow-hidden border-t-4 border-t-primary-600">
        <div className="space-y-6 mb-10">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
                <div className="relative group flex-1">
                    <SearchIcon className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-600 group-focus-within:text-primary-400 transition-colors" />
                    <input type="text" placeholder="Lookup Identity, Principal, or Manager..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="bg-gray-900/50 text-white pl-14 pr-6 py-4 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary-500/30 border border-gray-700 w-full transition-all text-sm font-bold placeholder:text-gray-700 shadow-inner" />
                </div>
                <div className="flex items-center space-x-6 shrink-0">
                    <label className="flex items-center gap-3 cursor-pointer select-none group">
                        <input type="checkbox" checked={filterEnabledOnly} onChange={(e) => setFilterEnabledOnly(e.target.checked)} className="w-5 h-5 rounded-lg bg-gray-900 border-gray-700 text-primary-600 focus:ring-primary-500/30" />
                        <span className="text-[10px] font-black text-gray-500 group-hover:text-gray-300 uppercase tracking-widest transition-colors">Enabled Only</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer select-none group">
                        <input type="checkbox" checked={filterNeverExpireOnly} onChange={(e) => setFilterNeverExpireOnly(e.target.checked)} className="w-5 h-5 rounded-lg bg-gray-900 border-gray-700 text-primary-600 focus:ring-primary-500/30" />
                        <span className="text-[10px] font-black text-gray-500 group-hover:text-gray-300 uppercase tracking-widest transition-colors">Safe Policies</span>
                    </label>
                </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-6 border-t border-gray-700/50">
                <div className="space-y-2">
                    <label className="block text-[10px] font-black text-gray-600 uppercase tracking-[0.2em] mb-1">Filter By Manager</label>
                    <select value={managerFilter} onChange={e => setManagerFilter(e.target.value)} className="w-full bg-gray-900/50 border border-gray-700 rounded-xl p-3.5 text-xs text-white focus:ring-2 focus:ring-primary-500/30 outline-none appearance-none cursor-pointer hover:bg-gray-900 transition-all font-bold">
                        <option value="">-- All Reporting Managers --</option>
                        {uniqueManagers.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                </div>
                <div className="space-y-2">
                    <label className="block text-[10px] font-black text-gray-600 uppercase tracking-[0.2em] mb-1">Expires Within (Days)</label>
                    <div className="flex gap-4">
                        <input type="number" value={daysFilter} onChange={e => setDaysFilter(e.target.value ? parseInt(e.target.value) : '')} placeholder="e.g. 30" className="w-full bg-gray-900/50 border border-gray-700 rounded-xl p-3 text-sm text-white focus:ring-2 focus:ring-primary-500/30 outline-none font-mono placeholder:text-gray-800" />
                        <button onClick={() => setDaysFilter('')} className="p-3 bg-gray-700/30 hover:bg-gray-700 rounded-xl text-xs text-gray-500 transition-all uppercase font-black">Clear</button>
                    </div>
                </div>
                <div className="flex items-end">
                    <div className="text-[10px] text-gray-500 font-black uppercase tracking-[0.25em] bg-black/40 px-6 py-4 rounded-xl border border-gray-700 shadow-inner w-full text-center border-l-4 border-l-primary-500">
                        STREAMING {filteredUsers.length} IDENTITIES
                    </div>
                </div>
            </div>
        </div>
        {!loading && !error && <UserTable users={filteredUsers} selectedIds={selectedIds} onSelectionChange={setSelectedIds} />}
        {loading && <div className="py-40 text-center uppercase tracking-[1em] text-gray-800 animate-pulse font-black">Syncing Infrastructure...</div>}
        {error && <div className="py-20 text-center text-red-500 uppercase font-black tracking-widest">{error}</div>}
      </div>

      {selectedIds.length > 0 && (
          <div className="fixed bottom-32 left-1/2 -translate-x-1/2 bg-gray-950 border border-primary-500/40 shadow-[0_0_80px_rgba(37,99,235,0.3)] rounded-3xl px-10 py-6 flex items-center gap-12 z-[60] animate-in slide-in-from-bottom-10 duration-500 backdrop-blur-3xl">
              <div className="flex items-center gap-5">
                  <div className="w-14 h-14 bg-primary-600 rounded-2xl flex items-center justify-center font-black text-xl text-white shadow-2xl">{selectedIds.length}</div>
                  <div>
                      <p className="text-white font-black text-base uppercase tracking-tighter">Command Block Active</p>
                      <p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest mt-0.5">Force Signal Session Initialized</p>
                  </div>
              </div>
              <div className="h-12 w-px bg-gray-800"></div>
              <div className="flex items-center gap-5">
                  <button onClick={() => setSelectedIds([])} className="text-gray-500 hover:text-white text-[11px] font-black uppercase tracking-widest px-6 py-3 rounded-xl transition-all">Cancel Override</button>
                  <button onClick={() => setShowActionPanel(true)} className="bg-primary-600 hover:bg-primary-500 text-white px-10 py-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-2xl shadow-primary-900/30 border border-primary-400/20">Launch Manual Action</button>
              </div>
          </div>
      )}

      {/* Slide-over Action Panel */}
      <div className={`fixed inset-y-0 right-0 w-[500px] bg-gray-900 border-l border-gray-800 shadow-[0_0_100px_rgba(0,0,0,0.8)] z-[150] transform transition-transform duration-700 cubic-bezier(0.4, 0, 0.2, 1) p-14 ${showActionPanel ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex justify-between items-center mb-16">
            <div>
                <h3 className="text-4xl font-black text-white uppercase tracking-tighter">Action Control</h3>
                <p className="text-[10px] text-gray-600 font-black uppercase tracking-widest mt-2 border-l-2 border-primary-500 pl-3">Manual Override Topology</p>
            </div>
            <button onClick={() => setShowActionPanel(false)} className="p-5 bg-gray-800 rounded-2xl text-gray-500 hover:text-white font-black transition-all border border-gray-700">✕</button>
        </div>
        
        <div className="space-y-12">
            <div className="p-10 bg-primary-950/20 border border-primary-500/20 rounded-[2rem] relative overflow-hidden group shadow-inner">
                <p className="text-[10px] font-black text-primary-500 uppercase tracking-widest mb-3">Manual Target Pool</p>
                <div className="flex items-baseline gap-3">
                    <p className="text-6xl font-black text-white leading-none">{selectedIds.length}</p>
                    <p className="text-sm font-bold text-gray-700 uppercase tracking-widest">Selected Entities</p>
                </div>
            </div>

            <div className="space-y-6">
                <label className="block text-[11px] font-black text-gray-500 uppercase tracking-[0.2em] mb-3 ml-1">Assign Delivery Profile</label>
                <div className="grid grid-cols-1 gap-4">
                    {profiles.map(p => (
                        <button 
                            key={p.id} 
                            onClick={() => setSelectedProfileId(p.id)}
                            className={`p-6 rounded-[1.5rem] text-left border-2 transition-all duration-300 ${selectedProfileId === p.id ? 'bg-primary-600/10 border-primary-500 shadow-[0_0_30px_rgba(37,99,235,0.2)]' : 'bg-gray-800/50 border-gray-800 hover:border-gray-700 hover:bg-gray-800'}`}
                        >
                            <div className="flex justify-between items-center">
                                <div>
                                    <p className={`font-black uppercase tracking-[0.15em] text-xs ${selectedProfileId === p.id ? 'text-primary-400' : 'text-gray-300'}`}>{p.name}</p>
                                    <p className="text-[9px] text-gray-600 font-bold uppercase mt-1">Logic: {p.cadence.daysBefore.length} Stages</p>
                                </div>
                                {selectedProfileId === p.id && <CheckCircleIcon className="w-5 h-5 text-primary-400" />}
                            </div>
                        </button>
                    ))}
                    {profiles.length === 0 && <p className="text-center py-10 text-gray-700 uppercase text-[10px] font-black tracking-widest">No Logic Profiles Defined</p>}
                </div>
            </div>

            <div className="pt-12 border-t border-gray-800 flex flex-col gap-6">
                <button 
                    onClick={handleForcedPush} 
                    disabled={!selectedProfileId || isPushing}
                    className="w-full bg-primary-600 hover:bg-primary-500 disabled:bg-gray-800 disabled:text-gray-700 text-white py-6 rounded-[2rem] font-black uppercase tracking-[0.2em] transition-all text-sm shadow-2xl shadow-primary-900/40 border border-primary-400/20"
                >
                    {isPushing ? 'Transmitting Signal...' : 'Push Signal to Targets'}
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
