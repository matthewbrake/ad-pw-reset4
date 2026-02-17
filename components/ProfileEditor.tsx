
import React, { useState, useEffect } from 'react';
import { NotificationProfile } from '../types';
import { AzureIcon, BellIcon, CheckCircleIcon, ClockIcon, ClipboardListIcon, UserIcon } from './icons';

interface ProfileEditorProps {
  profile: NotificationProfile | null;
  onSave: (profile: NotificationProfile) => void;
  onClose: () => void;
}

const ProfileEditor: React.FC<ProfileEditorProps> = ({ profile, onSave, onClose }) => {
  const [formData, setFormData] = useState<NotificationProfile>({
    id: '',
    name: '',
    description: '',
    subjectLine: 'Action Required: Password Expiry Warning',
    emailTemplate: `Hi {{user.displayName}},\n\nYour password for {{user.userPrincipalName}} expires on {{expiryDate}} (in {{daysUntilExpiry}} days).\n\nReset here: https://passwordreset.microsoftonline.com`,
    preferredTime: '09:00',
    cadence: { daysBefore: [14, 7, 1] },
    recipients: { toUser: true, toManager: false, toAdmins: [], readReceipt: false },
    assignedGroups: ['All Users'],
  });

  const [cadenceInput, setCadenceInput] = useState('14, 7, 1');
  const [assignedGroupsInput, setAssignedGroupsInput] = useState('All Users');
  const [verifying, setVerifying] = useState(false);
  const [sample, setSample] = useState<any[]>([]);

  useEffect(() => {
    if (profile) {
      setFormData(profile);
      setCadenceInput(profile.cadence.daysBefore.join(', '));
      setAssignedGroupsInput(profile.assignedGroups.join(', '));
    }
  }, [profile]);

  const handleVerify = async () => {
    const group = assignedGroupsInput.split(',')[0].trim();
    if (!group) return;
    setVerifying(true);
    try {
        const res = await fetch('/api/verify-group', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ groupName: group })
        });
        const data = await res.json();
        if (data.success) setSample(data.sampleMembers);
        else alert(data.message);
    } catch (e) { alert("Infrastructure handshake failed."); }
    finally { setVerifying(false); }
  };

  const handleSaveClick = () => {
    const days = cadenceInput.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
    const groups = assignedGroupsInput.split(',').map(s => s.trim()).filter(Boolean);
    onSave({ ...formData, cadence: { daysBefore: days }, assignedGroups: groups });
  };

  const Input = ({ label, value, onChange, placeholder }: any) => (
    <div className="space-y-2">
        <label className="block text-[10px] font-black text-gray-600 uppercase tracking-widest ml-1">{label}</label>
        <input 
            type="text" 
            value={value} 
            onChange={e => onChange(e.target.value)} 
            placeholder={placeholder}
            className="w-full bg-gray-950 border border-gray-800 rounded-xl p-4 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-primary-500 transition-all font-serif"
        />
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/95 z-[500] flex items-center justify-center p-8 backdrop-blur-2xl animate-in zoom-in-95 duration-300">
        <div className="bg-[#020617] border border-gray-800 rounded-[2.5rem] w-full max-w-7xl h-full flex flex-col overflow-hidden shadow-[0_0_120px_rgba(0,0,0,1)]">
            
            {/* Header */}
            <div className="px-10 py-6 border-b border-gray-800 flex justify-between items-center bg-gray-900/20">
                <div className="flex items-center gap-6">
                    <div className="p-3 bg-primary-600 rounded-xl shadow-2xl">
                        <BellIcon className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Logic Architect v4.2</h3>
                        <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mt-0.5">Enterprise Staging Protocol</p>
                    </div>
                </div>
                <button onClick={onClose} className="p-3 text-gray-500 hover:text-white font-black text-xl transition-colors">✕</button>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-hidden flex divide-x divide-gray-800">
                <div className="w-2/3 overflow-y-auto p-12 space-y-12 custom-scrollbar">
                    
                    {/* Targeting Section */}
                    <section className="space-y-8">
                        <div className="flex items-center justify-between border-b border-gray-900 pb-3">
                            <h4 className="text-xs font-black text-primary-500 uppercase tracking-widest flex items-center gap-2">
                                <AzureIcon className="w-3 h-3"/> Target Directory Intelligence
                            </h4>
                        </div>
                        <div className="grid grid-cols-2 gap-8">
                            <Input label="Logic Profile Name" value={formData.name} onChange={(v:any) => setFormData({...formData, name: v})} placeholder="Executive Expiry Policy" />
                            <div className="space-y-2">
                                <label className="block text-[10px] font-black text-gray-600 uppercase tracking-widest ml-1">Assigned AD Groups</label>
                                <div className="flex gap-2">
                                    <input 
                                        type="text" 
                                        value={assignedGroupsInput} 
                                        onChange={e => setAssignedGroupsInput(e.target.value)} 
                                        className="flex-1 bg-gray-950 border border-gray-800 rounded-xl p-4 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-primary-500 font-serif" 
                                    />
                                    <button onClick={handleVerify} className="bg-primary-600 hover:bg-primary-500 px-6 rounded-xl text-white font-black text-[10px] uppercase tracking-widest transition-all shadow-xl">
                                        {verifying ? '...' : 'Verify'}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {sample.length > 0 && (
                            <div className="bg-gray-950 border border-gray-800 rounded-2xl overflow-hidden shadow-inner">
                                <div className="p-4 bg-gray-900/50 border-b border-gray-800 flex justify-between items-center">
                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Expansion Protocol: {sample.length} Identities Found</span>
                                </div>
                                <div className="max-h-[200px] overflow-auto p-2">
                                    <table className="w-full text-left text-[11px] font-serif border-collapse">
                                        <thead className="bg-gray-900/80 sticky top-0">
                                            <tr>
                                                <th className="p-3 font-black text-gray-600 uppercase border-b border-gray-800">Identity</th>
                                                <th className="p-3 font-black text-gray-600 uppercase border-b border-gray-800">Manager Mapping</th>
                                                <th className="p-3 font-black text-gray-600 uppercase border-b border-gray-800 text-center">Engine Logic</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-900">
                                            {sample.map((s, i) => (
                                                <tr key={i} className="hover:bg-white/[0.02]">
                                                    <td className="p-3">
                                                        <div className="text-white font-bold">{s.displayName}</div>
                                                        <div className="text-[9px] text-gray-600 italic">{s.userPrincipalName}</div>
                                                    </td>
                                                    <td className="p-3 text-gray-500 italic">{s.managerName}</td>
                                                    <td className="p-3 text-center">
                                                        <span className={`px-2 py-0.5 rounded text-[8px] font-black border ${s.isHybrid ? 'bg-primary-900/20 text-primary-400 border-primary-500/20' : 'bg-gray-800 text-gray-500 border-gray-700'}`}>
                                                            {s.isHybrid ? 'HYBRID' : 'CLOUD'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </section>

                    {/* Content Section */}
                    <section className="space-y-8">
                        <div className="flex items-center justify-between border-b border-gray-900 pb-3">
                            <h4 className="text-xs font-black text-primary-500 uppercase tracking-widest flex items-center gap-2">
                                <ClipboardListIcon className="w-3 h-3"/> Transmission Blueprint
                            </h4>
                        </div>
                        <Input label="Artifact Subject Line" value={formData.subjectLine} onChange={(v:any) => setFormData({...formData, subjectLine: v})} />
                        <div className="space-y-2">
                            <label className="block text-[10px] font-black text-gray-600 uppercase tracking-widest ml-1">Template Engine (Markdown)</label>
                            <textarea 
                                rows={8} 
                                value={formData.emailTemplate} 
                                onChange={e => setFormData({...formData, emailTemplate: e.target.value})} 
                                className="w-full bg-black border border-gray-800 rounded-2xl p-6 text-sm text-primary-200 font-serif focus:ring-1 focus:ring-primary-500 focus:outline-none shadow-inner leading-relaxed resize-none"
                            ></textarea>
                        </div>
                    </section>
                </div>

                {/* Sidebar Preview */}
                <div className="w-1/3 bg-black/40 p-10 flex flex-col space-y-10 border-l border-gray-800">
                    <div>
                        <h5 className="text-xl font-black text-white uppercase tracking-tighter">Transmission Simulator</h5>
                        <p className="text-[9px] text-gray-500 font-black uppercase tracking-[0.25em] mt-2 border-l-2 border-primary-600 pl-3">Live Artifact Render</p>
                    </div>

                    <div className="flex-1 bg-gray-950 border border-gray-800 rounded-[2rem] overflow-hidden shadow-2xl flex flex-col border-t-8 border-t-primary-600 animate-in fade-in duration-700">
                        <div className="p-8 bg-gray-900/50 border-b border-gray-800 space-y-3">
                            <p className="text-[9px] font-bold text-gray-600 uppercase tracking-widest">To: <span className="text-primary-400 font-mono ml-2">target.user@enterprise.com</span></p>
                            <p className="text-[9px] font-bold text-gray-600 uppercase tracking-widest">Sub: <span className="text-white ml-2 italic">{formData.subjectLine}</span></p>
                        </div>
                        <div className="p-8 flex-1 overflow-auto text-xs text-gray-400 font-serif leading-relaxed whitespace-pre-wrap italic">
                            {formData.emailTemplate
                                .replace(/{{user.displayName}}/g, 'Sample User')
                                .replace(/{{user.userPrincipalName}}/g, 'target.user@enterprise.com')
                                .replace(/{{expiryDate}}/g, new Date(Date.now() + 86400000 * 7).toLocaleDateString())
                                .replace(/{{daysUntilExpiry}}/g, '7')
                            }
                        </div>
                    </div>

                    <div className="p-6 bg-gray-950 border border-gray-900 rounded-2xl text-center text-[9px] font-black text-gray-700 uppercase tracking-[0.4em]">
                        Handshake Protocol: Pending
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="px-10 py-8 bg-gray-900 border-t border-gray-800 flex justify-end gap-6 shadow-2xl">
                <button onClick={onClose} className="px-10 py-4 text-gray-600 hover:text-white font-black uppercase text-[10px] tracking-widest transition-all">Discard Changes</button>
                <button onClick={handleSaveClick} className="px-14 py-4 bg-primary-600 hover:bg-primary-500 text-white rounded-xl font-black uppercase text-[10px] tracking-widest transition-all shadow-xl shadow-primary-900/40 border border-primary-400/20">Commit Logic Profile</button>
            </div>
        </div>
    </div>
  );
};

export default ProfileEditor;
