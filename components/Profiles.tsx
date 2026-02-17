
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { NotificationProfile } from '../types';
import { fetchProfiles, saveProfile, deleteProfile, runNotificationJob, log } from '../services/api';
import ProfileEditor from './ProfileEditor';
import { BellIcon, EditIcon, PlusCircleIcon, TrashIcon, ClockIcon, UserIcon, CheckCircleIcon, ClipboardListIcon } from './icons';

// Simple helper to download individual profile as JSON
const downloadProfile = (profile: NotificationProfile) => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(profile, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `logic-${profile.name.toLowerCase().replace(/\s+/g, '-')}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
};

const Profiles: React.FC = () => {
    const [profiles, setProfiles] = useState<NotificationProfile[]>([]);
    const [history, setHistory] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [selectedProfile, setSelectedProfile] = useState<NotificationProfile | null>(null);
    const [previewData, setPreviewData] = useState<any[] | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const loadData = async () => {
        setLoading(true);
        try {
            const [pData, hData] = await Promise.all([
                fetchProfiles(),
                fetch('/api/history').then(r => r.json())
            ]);
            setProfiles(pData);
            setHistory(hData);
        } catch (e) {
            log('ERROR', 'History Synchronizer Fault');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadData(); }, []);

    const handleSave = async (profile: NotificationProfile) => {
        await saveProfile(profile);
        setIsEditorOpen(false);
        loadData();
    };

    const handleExportAll = () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(profiles, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `ad-notifier-full-library-${new Date().toISOString().split('T')[0]}.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
        log('SUCCESS', 'Infrastructure library exported.');
    };

    const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const imported = JSON.parse(e.target?.result as string);
                if (Array.isArray(imported)) {
                    for (const p of imported) await saveProfile(p);
                    log('SUCCESS', `Infrastructure Import Complete: ${imported.length} Logics.`);
                } else if (imported.id || imported.name) {
                    await saveProfile(imported);
                    log('SUCCESS', `Logic Ingested: ${imported.name}`);
                }
                loadData();
            } catch (err) {
                log('ERROR', 'Import Fault: Invalid JSON Structure');
            }
        };
        reader.readAsText(file);
    };

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-black text-white uppercase tracking-tight">Logic Architect</h2>
                    <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-1">Design and maintain delivery triggers</p>
                </div>
                <div className="flex gap-4">
                    <input type="file" ref={fileInputRef} onChange={handleImport} className="hidden" accept=".json" />
                    <button onClick={() => fileInputRef.current?.click()} className="px-5 py-3 bg-gray-800 text-gray-400 hover:text-white rounded-xl font-black uppercase tracking-widest border border-gray-700 transition-all text-[10px]">Import</button>
                    <button onClick={handleExportAll} className="px-5 py-3 bg-gray-800 text-gray-400 hover:text-white rounded-xl font-black uppercase tracking-widest border border-gray-700 transition-all text-[10px]">Export Library</button>
                    <button onClick={() => { setSelectedProfile(null); setIsEditorOpen(true); }} className="flex items-center space-x-3 bg-primary-600 text-white px-6 py-3 rounded-xl font-black uppercase tracking-widest hover:bg-primary-500 shadow-xl transition-all border border-primary-400/20">
                        <PlusCircleIcon className="w-5 h-5"/>
                        <span>New Profile</span>
                    </button>
                </div>
            </div>
            
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                {profiles.map(profile => (
                    <div key={profile.id} className="bg-gray-800 border border-gray-700 rounded-3xl p-8 flex flex-col justify-between hover:border-primary-500 transition-all shadow-2xl group relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                            <BellIcon className="w-32 h-32" />
                        </div>
                        
                        <div className="relative z-10">
                            <div className="flex justify-between items-start mb-8">
                                <div className="flex items-center gap-4">
                                    <div className="p-4 bg-primary-950 rounded-2xl border border-primary-500/30">
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
                                    <button onClick={() => downloadProfile(profile)} title="Export Logic" className="p-3 bg-gray-900 rounded-xl text-gray-500 hover:text-primary-400 border border-gray-700 transition-colors">
                                        <ClipboardListIcon className="w-5 h-5"/>
                                    </button>
                                    <button onClick={() => { setSelectedProfile(profile); setIsEditorOpen(true); }} title="Edit Logic" className="p-3 bg-gray-900 rounded-xl text-gray-500 hover:text-white border border-gray-700 transition-colors">
                                        <EditIcon className="w-5 h-5"/>
                                    </button>
                                    <button onClick={async () => { if(confirm('Permanently purge this logic?')) { await deleteProfile(profile.id); loadData(); } }} title="Delete Logic" className="p-3 bg-gray-900 rounded-xl text-gray-500 hover:text-red-400 border border-gray-700 transition-colors">
                                        <TrashIcon className="w-5 h-5"/>
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-6 mb-8 text-[11px] font-bold text-gray-500 uppercase tracking-widest">
                                <div className="bg-gray-900/60 p-5 rounded-2xl border border-gray-700/50">
                                    <p className="mb-3 flex items-center gap-2 text-primary-400"><UserIcon className="w-3 h-3"/> Target Group</p>
                                    <p className="text-gray-200">{profile.assignedGroups.join(', ') || 'Global'}</p>
                                </div>
                                <div className="bg-gray-900/60 p-5 rounded-2xl border border-gray-700/50">
                                    <p className="mb-3 flex items-center gap-2 text-orange-400"><ClockIcon className="w-3 h-3"/> Cadence Triggers</p>
                                    <div className="flex flex-wrap gap-1">
                                        {profile.cadence.daysBefore.map(d => <span key={d} className="px-2 py-0.5 bg-gray-800 rounded border border-gray-700">T-{d}</span>)}
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div className="flex gap-4 relative z-10">
                             <button onClick={() => runNotificationJob(profile, 'preview').then(r => setPreviewData(r.previewData || []))} className="flex-1 bg-gray-900 hover:bg-gray-700 text-gray-400 hover:text-white py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all border border-gray-700">Inspect Impact</button>
                             <button onClick={() => runNotificationJob(profile, 'live').then(() => alert('Live jobs queued.'))} className="flex-1 bg-primary-600 hover:bg-primary-500 text-white py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all shadow-lg">Trigger Sync</button>
                        </div>
                    </div>
                ))}
            </div>

            {isEditorOpen && <ProfileEditor profile={selectedProfile} onSave={handleSave} onClose={() => setIsEditorOpen(false)} />}
            
            {previewData && (
                <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-[500] p-12 backdrop-blur-xl animate-in zoom-in-95 duration-300">
                    <div className="bg-gray-900 border border-gray-700 rounded-[32px] w-full max-w-6xl h-full flex flex-col overflow-hidden shadow-2xl">
                        <div className="p-10 bg-gray-800/50 border-b border-gray-700 flex justify-between items-center">
                            <div>
                                <h3 className="text-3xl font-black text-white uppercase tracking-tighter">Impact Intelligence</h3>
                                <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-1">Impact analysis for current date cadence</p>
                            </div>
                            <button onClick={() => setPreviewData(null)} className="p-4 bg-gray-800 rounded-2xl text-gray-400 hover:text-white font-black border border-gray-700 transition-all">✕</button>
                        </div>
                        <div className="flex-1 overflow-auto p-10">
                            <table className="w-full text-left border-collapse">
                                <thead className="text-gray-500 uppercase font-black text-[10px] tracking-widest sticky top-0 bg-gray-900 z-10">
                                    <tr>
                                        <th className="pb-6 border-b border-gray-800">Identity</th>
                                        <th className="pb-6 border-b border-gray-800">Email Vector</th>
                                        <th className="pb-6 border-b border-gray-800">T-Minus Window</th>
                                        <th className="pb-6 border-b border-gray-800">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-800/50 text-sm">
                                    {previewData.map((d, i) => (
                                        <tr key={i} className="hover:bg-white/[0.02]">
                                            <td className="py-6 font-black text-white">{d.user}</td>
                                            <td className="py-6 text-gray-400 font-mono">{d.email}</td>
                                            <td className="py-6">
                                                <span className="px-3 py-1 bg-orange-900/20 text-orange-400 font-black rounded-lg border border-orange-500/20">{d.daysUntilExpiry} DAYS</span>
                                            </td>
                                            <td className="py-6">
                                                <span className="flex items-center gap-2 text-green-500 font-black uppercase text-[10px] tracking-widest">
                                                    <CheckCircleIcon className="w-4 h-4"/> Ready
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                    {previewData.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="py-20 text-center text-gray-700 uppercase font-black tracking-widest">No Identities Match Current Cadence</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Profiles;
