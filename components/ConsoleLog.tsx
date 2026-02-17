
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { subscribeToLogs } from '../services/api';
import { LogEntry, LogLevel } from '../types';

const ConsoleLog: React.FC<{ visible: boolean; onClose: () => void }> = ({ visible, onClose }) => {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [filter, setFilter] = useState<'ALL' | '1' | '2' | '3'>('ALL');
    const endRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const unsubscribe = subscribeToLogs((entry) => {
            setLogs(prev => [...prev, entry]);
        });
        return unsubscribe;
    }, []);

    useEffect(() => {
        if (visible) {
            endRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs, visible]);

    const filteredLogs = useMemo(() => {
        if (filter === 'ALL') return logs;
        return logs.filter(l => {
            if (filter === '1') return l.level === 'DEBUG';
            if (filter === '2') return l.level === 'INFO' || l.level === 'SUCCESS';
            if (filter === '3') return l.level === 'WARN' || l.level === 'ERROR';
            return true;
        });
    }, [logs, filter]);

    if (!visible) return null;

    return (
        <div className="fixed bottom-0 left-[288px] right-0 h-72 bg-gray-950 border-t border-gray-700 text-[10px] font-mono z-[300] flex flex-col shadow-[0_-20px_50px_rgba(0,0,0,0.9)] backdrop-blur-xl">
            <div className="flex justify-between items-center px-6 py-2 bg-gray-900 border-b border-gray-800">
                <div className="flex items-center gap-6">
                    <span className="font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary-500 animate-pulse"></span>
                        Infrastructure Telemetry
                    </span>
                    <select 
                        value={filter} 
                        onChange={(e) => setFilter(e.target.value as any)}
                        className="bg-gray-800 border border-gray-700 text-[9px] text-gray-300 rounded px-3 py-1 uppercase font-black focus:outline-none"
                    >
                        <option value="ALL">All Events</option>
                        <option value="1">Level 1: Trace / Debug</option>
                        <option value="2">Level 2: Info / Success</option>
                        <option value="3">Level 3: Critical / Error</option>
                    </select>
                </div>
                <div className="flex items-center gap-4">
                    <button onClick={() => setLogs([])} className="text-gray-600 hover:text-white font-black uppercase tracking-tighter transition-colors text-[9px]">Wipe Buffer</button>
                    <button onClick={onClose} className="p-2 bg-gray-800 rounded-lg text-gray-500 hover:text-white transition-all">✕</button>
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-1">
                {filteredLogs.length === 0 && <p className="text-gray-800 italic text-center py-10 uppercase tracking-widest">Awaiting Transmission...</p>}
                {filteredLogs.map((log, i) => (
                    <div key={i} className="flex space-x-3 border-b border-white/[0.02] pb-1 animate-in fade-in duration-300">
                        <span className="text-gray-700 shrink-0 font-bold">[{log.timestamp}]</span>
                        <span className={`uppercase font-black shrink-0 w-16 ${
                            log.level === 'ERROR' ? 'text-red-500' :
                            log.level === 'WARN' ? 'text-yellow-500' :
                            log.level === 'SUCCESS' ? 'text-emerald-500' :
                            log.level === 'DEBUG' ? 'text-gray-600' : 'text-primary-500'
                        }`}>{log.level}</span>
                        <span className="text-gray-400 break-all leading-tight">
                            {log.message}
                            {log.details && (
                                <span className="block mt-1 p-2 bg-white/[0.02] rounded border border-white/[0.05] text-gray-600 whitespace-pre-wrap">
                                    {typeof log.details === 'object' ? JSON.stringify(log.details, null, 2) : log.details}
                                </span>
                            )}
                        </span>
                    </div>
                ))}
                <div ref={endRef} />
            </div>
        </div>
    );
};

export default ConsoleLog;
