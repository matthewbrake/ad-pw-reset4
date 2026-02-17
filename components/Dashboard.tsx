
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
      setError(err.message || 'AD Connectivity Fault');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [graphConfig]);

  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      const matchesSearch = user.displayName.toLowerCase().includes(searchTerm.toLowerCase()) || user.userPrincipalName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesEnabled = filterEnabledOnly ? user.accountEnabled === true : true;
      const matchesNeverExpire = filterNeverExpireOnly ? user.neverExpires === true : true;
      return matchesSearch && matchesEnabled && matchesNeverExpire;
    });
  }, [users, searchTerm, filterEnabledOnly, filterNeverExpireOnly]);

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
            alert(`Forced delivery initiated for ${emails.length} users. Check Queue for live progress.`);
            setShowActionPanel(false);
            setSelectedIds([]);
        }
    } catch (e) {
        alert('Manual push engine failure');
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
            <h2 className="text-4xl font-black text-white tracking-tighter uppercase">Operations Hub</h2>
            <div className="flex items-center gap-2 mt-2">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.5)]"></span>
                <span className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Global Sync State: Active</span>
                <span className="text-gray-700 mx-2">|</span>
                <span className="text-[10px] text-gray-400 font-mono uppercase">LST: {lastRefresh || '—'}</span>
            </div>
        </div>
        <button onClick={loadData} className="bg-gray-800 hover:bg-gray-700 text-white px-5 py-2.5 rounded-xl text-xs flex items-center gap-3 transition-all border border-gray-700 font-black uppercase tracking-widest group">
           <ClockIcon className={`w-4 h-4 text-primary-400 ${loading ? 'animate-spin' : 'group-hover:rotate-180 transition-transform'}`} />
           Sync Domain
        </button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <StatCard title="Total Directory" value={stats.total} colorClass="border-gray-500" icon={<UserIcon className="w-6 h-6" />} />
        <StatCard title="Compliant" value={stats.safe} colorClass="border-green-500" icon={<CheckCircleIcon className="w-6 h-6" />} />
        <StatCard title="At Risk" value={stats.expiringSoon} colorClass="border-yellow-500" icon={<AlertTriangleIcon className="w-6 h-6" />} />
        <StatCard title="Critical" value={stats.expired} colorClass="border-red-500" icon={<XCircleIcon className="w-6 h-6" />} />
        <StatCard title="Persistence" value={stats.neverExpires} colorClass="border-blue-500" icon={<ClockIcon className="w-6 h-6" />} />
      </div>

      <div className="bg-gray-800 p-8 rounded-3xl border border-gray-700 shadow-[0_35px_60px_-15px_rgba(0,0,0,0.5)]">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-10">
            <div className="flex flex-wrap items-center gap-8">
                <div className="relative group">
                    <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-primary-400 transition-colors" />
                    <input type="text" placeholder="Lookup Identity or Principal..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="bg-gray-900 text-white pl-12 pr-6 py-3.5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary-500/50 border border-gray-700 w-96 transition-all text-sm font-bold placeholder:text-gray-700" />
                </div>
                <div className="flex items-center space-x-6">
                    <label className="flex items-center gap-3 cursor-pointer select-none"><input type="checkbox" checked={filterEnabledOnly} onChange={(e) => setFilterEnabledOnly(e.target.checked)} className="w-5 h-5 rounded-lg bg-gray-900 border-gray-700 text-primary-600 focus:ring-primary-500/30 transition-all" /><span className="text-[11px] font-black text-gray-500 uppercase tracking-widest">Enabled Only</span></label>
                    <label className="flex items-center gap-3 cursor-pointer select-none"><input type="checkbox" checked={filterNeverExpireOnly} onChange={(e) => setFilterNeverExpireOnly(e.target.checked)} className="w-5 h-5 rounded-lg bg-gray-900 border-gray-700 text-primary-600 focus:ring-primary-500/30 transition-all" /><span className="text-[11px] font-black text-gray-500 uppercase tracking-widest">Ignore Expiry</span></label>
                </div>
            </div>
            <div className="text-[10px] text-gray-500 font-black uppercase tracking-widest bg-black/40 px-5 py-2.5 rounded-xl border border-gray-700 shadow-inner">VISIBILITY: {filteredUsers.length} ENTITIES</div>
        </div>
        {!loading && !error && <UserTable users={filteredUsers} selectedIds={selectedIds} onSelectionChange={setSelectedIds} />}
      </div>

      {/* Floating Control Bar */}
      {selectedIds.length > 0 && (
          <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-gray-900/95 backdrop-blur-xl border border-primary-500/30 shadow-[0_0_50px_rgba(37,99,235,0.2)] rounded-2xl px-8 py-5 flex items-center gap-10 z-[60] animate-in slide-in-from-bottom-5 duration-300">
              <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-primary-600 rounded-xl flex items-center justify-center font-black text-white shadow-lg shadow-primary-900/40">{selectedIds.length}</div>
                  <div>
                      <p className="text-white font-black text-sm uppercase tracking-tighter">Command Block Active</p>
                      <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Manual override session initialized</p>
                  </div>
              </div>
              <div className="h-10 w-px bg-gray-800"></div>
              <div className="flex items-center gap-3">
                  <button onClick={() => setSelectedIds([])} className="text-gray-400 hover:text-white text-[10px] font-black uppercase tracking-widest px-4 py-2 hover:bg-white/5 rounded-lg transition-all">Cancel</button>
                  <button onClick={() => setShowActionPanel(true)} className="bg-primary-600 hover:bg-primary-500 text-white px-8 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest shadow-xl shadow-primary-900/20 border border-primary-400/20 transition-all">Launch Action Slide</button>
              </div>
          </div>
      )}

      {/* Slide-over Action Panel */}
      <div className={`fixed inset-y-0 right-0 w-[450px] bg-gray-900 border-l border-gray-800 shadow-[0_0_100px_rgba(0,0,0,0.8)] z-[70] transform transition-transform duration-500 ease-in-out p-12 ${showActionPanel ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex justify-between items-center mb-12">
            <div>
                <h3 className="text-3xl font-black text-white uppercase tracking-tighter">Action Control</h3>
                <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mt-1">Forced delivery & manual scheduling</p>
            </div>
            <button onClick={() => setShowActionPanel(false)} className="p-4 bg-gray-800 rounded-2xl text-gray-500 hover:text-white font-black hover:rotate-90 transition-all">✕</button>
        </div>
        
        <div className="space-y-10">
            <div className="p-8 bg-primary-950/20 border border-primary-500/20 rounded-3xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity"><ClipboardListIcon className="w-20 h-20" /></div>
                <p className="text-[10px] font-black text-primary-400 uppercase tracking-widest mb-2">Target Pool</p>
                <div className="flex items-baseline gap-2">
                    <p className="text-5xl font-black text-white">{selectedIds.length}</p>
                    <p className="text-sm font-bold text-gray-600 uppercase">Users</p>
                </div>
                <p className="text-xs text-gray-500 font-bold mt-4 uppercase tracking-tighter leading-tight">Proceeding will inject these users into the delivery engine immediately.</p>
            </div>

            <div className="space-y-4">
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Select Delivery Profile</label>
                <div className="grid grid-cols-1 gap-3">
                    {profiles.map(p => (
                        <button 
                            key={p.id} 
                            onClick={() => setSelectedProfileId(p.id)}
                            className={`p-5 rounded-2xl text-left border transition-all ${selectedProfileId === p.id ? 'bg-primary-600/10 border-primary-500 shadow-[inset_0_0_20px_rgba(37,99,235,0.1)]' : 'bg-gray-800 border-gray-700 hover:border-gray-600'}`}
                        >
                            <div className="flex justify-between items-center">
                                <p className={`font-black uppercase tracking-widest text-xs ${selectedProfileId === p.id ? 'text-primary-400' : 'text-white'}`}>{p.name}</p>
                                {selectedProfileId === p.id && <CheckCircleIcon className="w-4 h-4 text-primary-400" />}
                            </div>
                            <p className="text-[10px] text-gray-500 font-bold mt-1 uppercase truncate">{p.description}</p>
                        </button>
                    ))}
                </div>
            </div>

            <div className="pt-10 border-t border-gray-800 flex flex-col gap-4">
                <button 
                    onClick={handleForcedPush} 
                    disabled={!selectedProfileId || isPushing}
                    className="w-full bg-primary-600 hover:bg-primary-500 disabled:bg-gray-800 disabled:text-gray-700 disabled:border-gray-700 text-white py-5 rounded-3xl font-black uppercase tracking-widest shadow-2xl shadow-primary-900/40 border border-primary-400/30 transition-all text-sm"
                >
                    {isPushing ? 'Processing Signal...' : 'Push Signal Now'}
                </button>
                <button className="w-full bg-gray-900 hover:bg-gray-800 text-gray-500 hover:text-white py-4 rounded-3xl font-black uppercase tracking-widest border border-gray-800 transition-all text-[11px]">Return to Console</button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
