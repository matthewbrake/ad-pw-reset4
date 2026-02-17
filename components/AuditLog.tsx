
import React, { useState, useEffect } from 'react';
import { ClipboardListIcon, CheckCircleIcon, XCircleIcon } from './icons';

const AuditLog: React.FC = () => {
    const [history, setHistory] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedEntry, setSelectedEntry] = useState<any | null>(null);

    const fetchHistory = async () => {
        try {
            const res = await fetch('/api/history');
            const data = await res.json();
            setHistory(data.sort((a:any, b:any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    useEffect(() => {
        fetchHistory();
        const interval = setInterval(fetchHistory, 5000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-4xl font-black text-white uppercase tracking-tighter">System Audit</h2>
                    <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mt-2">Irrefutable record of all infrastructure actions</p>
                </div>
            </div>

            <div className="bg-gray-800 rounded-[32px] border border-gray-700 overflow-hidden shadow-2xl">
                <div className="overflow-x-auto">
                    <table className="min-w-full border-collapse">
                        <thead className="bg-gray-900/50">
                            <tr>
                                <th className="px-8 py-6 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Time Vector</th>
                                <th className="px-8 py-6 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Recipient</th>
                                <th className="px-8 py-6 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Origin Profile</th>
                                <th className="px-8 py-6 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">State</th>
                                <th className="px-8 py-6 text-right"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700/50">
                            {history.map((entry, i) => (
                                <tr key={i} className="hover:bg-white/[0.02] transition-colors group">
                                    <td className="px-8 py-6 whitespace-nowrap text-xs text-gray-400 font-mono">
                                        {new Date(entry.timestamp).toLocaleString()}
                                    </td>
                                    <td className="px-8 py-6 whitespace-nowrap">
                                        <div className="text-sm font-black text-white group-hover:text-primary-400 transition-colors">{entry.email}</div>
                                        <div className="text-[10px] text-gray-600 font-bold uppercase tracking-tighter">{entry.details || 'System Call'}</div>
                                    </td>
                                    <td className="px-8 py-6 whitespace-nowrap text-xs text-gray-500 font-black uppercase tracking-widest">{entry.profileId}</td>
                                    <td className="px-8 py-6 whitespace-nowrap">
                                        <span className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border ${entry.status === 'sent' ? 'bg-green-900/20 text-green-400 border-green-500/20' : 'bg-red-900/20 text-red-400 border-red-500/20'}`}>
                                            {entry.status}
                                        </span>
                                    </td>
                                    <td className="px-8 py-6 text-right">
                                        <button onClick={() => setSelectedEntry(entry)} className="p-3 bg-gray-900 rounded-xl text-[10px] text-primary-400 hover:text-white border border-gray-700 transition-all font-black uppercase tracking-widest">Handshake</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {history.length === 0 && (
                    <div className="py-40 text-center">
                        <ClipboardListIcon className="w-16 h-16 mx-auto mb-6 opacity-10" />
                        <p className="text-gray-500 font-black uppercase tracking-widest">Audit Database Empty</p>
                    </div>
                )}
            </div>

            {selectedEntry && (
                <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-[100] p-12 backdrop-blur-2xl">
                    <div className="bg-gray-900 border border-gray-700 rounded-[40px] w-full max-w-4xl max-h-full flex flex-col overflow-hidden shadow-[0_0_150px_rgba(0,0,0,1)]">
                        <div className="p-10 bg-gray-800/50 border-b border-gray-700 flex justify-between items-center">
                            <div>
                                <h3 className="text-3xl font-black text-white uppercase tracking-tighter">Raw Audit Intelligence</h3>
                                <p className="text-xs text-gray-500 font-black uppercase tracking-widest mt-2">Internal SMTP & Handshake Metadata</p>
                            </div>
                            <button onClick={() => setSelectedEntry(null)} className="p-5 bg-gray-800 rounded-2xl text-gray-400 hover:text-white font-black transition-all">✕</button>
                        </div>
                        <div className="flex-1 overflow-auto p-10 bg-black/40">
                            <div className="grid grid-cols-2 gap-8 mb-8">
                                <div className="p-6 bg-gray-800/30 border border-gray-700 rounded-2xl">
                                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Recipient Trace</p>
                                    <p className="text-sm font-bold text-white font-mono">{selectedEntry.email}</p>
                                </div>
                                <div className="p-6 bg-gray-800/30 border border-gray-700 rounded-2xl">
                                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Profile ID</p>
                                    <p className="text-sm font-bold text-white font-mono">{selectedEntry.profileId}</p>
                                </div>
                            </div>
                            <div className="space-y-4">
                                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Full System JSON Payload</p>
                                <pre className="bg-gray-950 p-8 rounded-3xl text-sm text-green-500 overflow-auto border border-gray-800 font-mono shadow-inner">
                                    {JSON.stringify(selectedEntry, null, 4)}
                                </pre>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AuditLog;
