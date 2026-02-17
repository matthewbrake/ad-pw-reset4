
import React, { useState, useEffect, useMemo } from 'react';
import { NotificationProfile, AuditEntry } from '../types';
import { fetchProfiles, saveProfile, deleteProfile, runNotificationJob } from '../services/api';
import ProfileEditor from './ProfileEditor';
import { BellIcon, EditIcon, PlusCircleIcon, TrashIcon, ClockIcon, UserIcon, ClipboardListIcon, CheckCircleIcon } from './icons';

const Profiles: React.FC = () => {
    const [profiles, setProfiles] = useState<NotificationProfile[]>([]);
    const [history, setHistory] = useState<AuditEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [selectedProfile, setSelectedProfile] = useState<NotificationProfile | null>(null);
    const [previewData, setPreviewData] = useState<any[] | null>(null);

    const loadData = async () => {
        setLoading(true);
        const [pData, hData] = await Promise.all([
            fetchProfiles(),
            fetch('/api/history').then(r => r.json())
        ]);
        setProfiles(pData);
        setHistory(hData);
        setLoading(false);
    };

    useEffect(() => { loadData(); }, []);

    const handleSave = async (profile: NotificationProfile) => {
        await saveProfile(profile);
        setIsEditorOpen(false);
        loadData();
    };

    const getMetrics = (profileName: string) => {
        const matching = history.filter(h => h.profileId === profileName);
        const sent = matching.filter(m => m.status === 'sent').length;
        const last = matching.length > 0 ? new Date(matching[matching.length - 1].timestamp).toLocaleDateString() : 'Never';
        return { sent, last };
    };

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-black text-white uppercase tracking-tight">Notification Architect</h2>
                    <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-1">Design and maintain delivery triggers</p>
                </div>
                <button onClick={() => { setSelectedProfile(null); setIsEditorOpen(true); }} className="flex items-center space-x-3 bg-primary-600 text-white px-6 py-3 rounded-xl font-black uppercase tracking-widest hover:bg-primary-500 shadow-xl shadow-primary-900/20 transition-all border border-primary-400/20">
                    <PlusCircleIcon className="w-5 h-5"/>
                    <span>New Profile</span>
                </button>
            </div>
            
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                {profiles.map(profile => {
                    const metrics = getMetrics(profile.name);
                    return (
                        <div key={profile.id} className="bg-gray-800 border border-gray-700 rounded-3xl p-8 flex flex-col justify-between hover:border-primary-500 transition-all shadow-2xl group relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                                <BellIcon className="w-32 h-32" />
                            </div>
                            
                            <div className="relative z-10">
                                <div className="flex justify-between items-start mb-8">
                                    <div className="flex items-center gap-4">
                                        <div className="p-4 bg-primary-950 rounded-2xl border border-primary-500/30 shadow-inner">
                                            <BellIcon className="w-8 h-8 text-primary-400" />
                                        </div>
                                        <div>
                                            <h4 className="font-black text-2xl text-white tracking-tighter">{profile.name}</h4>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                                                <span className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Logic Active</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex space-x-2">
                                        <button onClick={() => { setSelectedProfile(profile); setIsEditorOpen(true); }} className="p-3 bg-gray-900 rounded-xl text-gray-500 hover:text-white border border-gray-700 transition-colors"><EditIcon className="w-5 h-5"/></button>
                                        <button onClick={async () => { if(confirm('Permanently purge this logic?')) { await deleteProfile(profile.id); loadData(); } }} className="p-3 bg-gray-900 rounded-xl text-gray-500 hover:text-red-400 border border-gray-700 transition-colors"><TrashIcon className="w-5 h-5"/></button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-6 mb-8">
                                    <div className="bg-gray-900/60 p-5 rounded-2xl border border-gray-700/50">
                                        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                                            <UserIcon className="w-3 h-3"/> WHO (WHAT IS)
                                        </p>
                                        <div className="space-y-1">
                                            <p className="text-sm font-black text-gray-200 truncate">{profile.assignedGroups.join(', ') || 'Global'}</p>
                                            <p className="text-[9px] text-gray-500 uppercase font-bold">Scoped Groups</p>
                                        </div>
                                    </div>
                                    <div className="bg-gray-900/60 p-5 rounded-2xl border border-gray-700/50">
                                        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                                            <ClockIcon className="w-3 h-3"/> WHEN (THE NEXT)
                                        </p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {profile.cadence.daysBefore.map(d => (
                                                <span key={d} className="px-2 py-0.5 bg-orange-950 text-orange-400 text-[9px] font-black rounded border border-orange-500/20 uppercase">T-{d}D</span>
                                            ))}
                                        </div>
                                        <p className="text-[9px] text-gray-500 uppercase font-bold mt-2">Next Run Window: Daily @ {profile.preferredTime || '09:00 AM'}</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 gap-4 mb-10">
                                    <div className="text-center p-3">
                                        <p className="text-2xl font-black text-white">{metrics.sent}</p>
                                        <p className="text-[9px] text-gray-500 font-bold uppercase tracking-tighter">Total Sent</p>
                                    </div>
                                    <div className="text-center p-3 border-x border-gray-700">
                                        <p className="text-lg font-black text-gray-300">{metrics.last}</p>
                                        <p className="text-[9px] text-gray-500 font-bold uppercase tracking-tighter">Last Run</p>
                                    </div>
                                    <div className="text-center p-3">
                                        <p className="text-2xl font-black text-primary-500">100%</p>
                                        <p className="text-[9px] text-gray-500 font-bold uppercase tracking-tighter">Deliverability</p>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="flex gap-4 relative z-10">
                                 <button onClick={() => runNotificationJob(profile, 'preview').then(r => setPreviewData(r.previewData || []))} className="flex-1 bg-gray-900 hover:bg-gray-700 text-gray-400 hover:text-white py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all border border-gray-700">Inspect Impact</button>
                                 <button onClick={() => runNotificationJob(profile, 'live').then(() => alert('Profile logic applied. Jobs queued for processing.'))} className="flex-1 bg-primary-600 hover:bg-primary-500 text-white py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all shadow-lg shadow-primary-900/20 border border-primary-400/30">Trigger Sync</button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {isEditorOpen && <ProfileEditor profile={selectedProfile} onSave={handleSave} onClose={() => setIsEditorOpen(false)} />}
            
            {previewData && (
                <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-[100] p-12 backdrop-blur-xl">
                    <div className="bg-gray-900 border border-gray-700 rounded-[32px] w-full max-w-6xl h-full flex flex-col overflow-hidden shadow-[0_0_100px_rgba(37,99,235,0.15)]">
                        <div className="p-10 bg-gray-800/50 border-b border-gray-700 flex justify-between items-center">
                            <div>
                                <h3 className="text-3xl font-black text-white uppercase tracking-tighter">Engine Preview Intelligence</h3>
                                <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-1">Impact analysis for current date cadence</p>
                            </div>
                            <button onClick={() => setPreviewData(null)} className="p-4 bg-gray-800 rounded-2xl text-gray-400 hover:text-white font-black border border-gray-700">✕</button>
                        </div>
                        <div className="flex-1 overflow-auto p-10">
                            <table className="w-full text-left border-collapse">
                                <thead className="text-gray-500 uppercase font-black text-[10px] tracking-widest sticky top-0 bg-gray-900 z-10">
                                    <tr>
                                        <th className="pb-6 border-b border-gray-800">Target Identity</th>
                                        <th className="pb-6 border-b border-gray-800">Delivery Vector</th>
                                        <th className="pb-6 border-b border-gray-800">T-Minus Window</th>
                                        <th className="pb-6 border-b border-gray-800">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-800/50">
                                    {previewData.map((d, i) => (
                                        <tr key={i} className="hover:bg-white/[0.02] transition-colors group">
                                            <td className="py-6">
                                                <div className="flex flex-col">
                                                    <span className="font-black text-white text-base group-hover:text-primary-400 transition-colors">{d.user}</span>
                                                    <span className="text-[10px] text-gray-500 uppercase font-bold mt-0.5">{d.group || 'Direct Sync'}</span>
                                                </div>
                                            </td>
                                            <td className="py-6 text-gray-400 font-mono text-xs">{d.email}</td>
                                            <td className="py-6">
                                                <span className="px-3 py-1 bg-orange-950 text-orange-400 text-[11px] font-black rounded-lg border border-orange-500/20">{d.daysUntilExpiry} DAYS LEFT</span>
                                            </td>
                                            <td className="py-6">
                                                <span className="flex items-center gap-2 text-green-500 text-[10px] font-black uppercase tracking-widest">
                                                    <CheckCircleIcon className="w-4 h-4"/> Ready
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {previewData.length === 0 && (
                                <div className="text-center py-40">
                                    <BellIcon className="w-16 h-16 mx-auto mb-6 opacity-10 text-primary-500" />
                                    <p className="text-gray-500 font-black uppercase tracking-widest text-lg">Zero Target Hits</p>
                                    <p className="text-[10px] text-gray-600 uppercase font-bold mt-2">No users match the T-Minus window for today</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Profiles;
