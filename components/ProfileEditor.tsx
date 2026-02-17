
import React, { useState, useEffect, useMemo } from 'react';
import { NotificationProfile } from '../types';
import { SearchIcon, UserIcon, BellIcon, CheckCircleIcon, ClockIcon, AzureIcon, XCircleIcon, ClipboardListIcon } from './icons';

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
    emailTemplate: `Hi {{user.displayName}},

Your password for {{user.userPrincipalName}} is set to expire on {{expiryDate}} (in {{daysUntilExpiry}} days).

Please reset it at https://passwordreset.microsoftonline.com

Thanks,
IT Support`,
    preferredTime: '09:00',
    cadence: { daysBefore: [14, 7, 1] },
    recipients: { toUser: true, toManager: false, toAdmins: [], readReceipt: false },
    assignedGroups: ['All Users'],
  });

  const [cadenceInput, setCadenceInput] = useState('14, 7, 1');
  const [assignedGroupsInput, setAssignedGroupsInput] = useState('All Users');
  const [adminsInput, setAdminsInput] = useState('');
  const [verifyingGroup, setVerifyingGroup] = useState(false);
  const [groupSample, setGroupSample] = useState<any[]>([]);

  useEffect(() => {
    if (profile) {
      setFormData(profile);
      setCadenceInput(profile.cadence.daysBefore.join(', '));
      setAssignedGroupsInput(profile.assignedGroups.join(', '));
      setAdminsInput(profile.recipients.toAdmins.join(', '));
    }
  }, [profile]);

  const handleChange = <K extends keyof NotificationProfile,>(key: K, value: NotificationProfile[K]) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const toggleRecipient = (key: keyof typeof formData.recipients) => {
    const val = formData.recipients[key];
    if (typeof val === 'boolean') {
        setFormData(prev => ({
            ...prev,
            recipients: { ...prev.recipients, [key]: !val }
        }));
    }
  };

  const handleVerifyGroup = async () => {
      const groupName = assignedGroupsInput.split(',')[0].trim();
      if (!groupName) return;
      setVerifyingGroup(true);
      try {
        const res = await fetch('/api/verify-group', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ groupName })
        });
        const data = await res.json();
        if (data.success) {
            setGroupSample(data.sampleMembers);
        } else {
            alert(data.message);
            setGroupSample([]);
        }
      } catch (e) {
          alert("Handshake failure with Directory.");
      } finally {
          setVerifyingGroup(false);
      }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const days = cadenceInput.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
    const groups = assignedGroupsInput.split(',').map(s => s.trim()).filter(Boolean);
    const admins = adminsInput.split(',').map(s => s.trim()).filter(Boolean);
    onSave({
        ...formData,
        cadence: { daysBefore: days },
        assignedGroups: groups,
        recipients: { ...formData.recipients, toAdmins: admins }
    });
  };

  return (
    <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-[250] p-4 backdrop-blur-xl animate-in fade-in duration-300">
      <div className="bg-gray-950 border border-gray-800 rounded-[3rem] w-full max-w-[95vw] h-[92vh] flex flex-col overflow-hidden shadow-[0_0_100px_rgba(0,0,0,1)]">
        
        <div className="px-10 py-8 bg-gray-900/50 border-b border-gray-800 flex justify-between items-center">
            <div className="flex items-center gap-6">
                <div className="p-4 bg-primary-600 rounded-2xl shadow-[0_0_20px_rgba(37,99,235,0.4)]">
                    <BellIcon className="w-8 h-8 text-white" />
                </div>
                <div>
                    <h3 className="text-3xl font-black text-white uppercase tracking-tighter">Logic Architect v4.0</h3>
                    <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mt-1">Design automated delivery triggers</p>
                </div>
            </div>
            <button onClick={onClose} className="p-4 bg-gray-800 rounded-2xl text-gray-400 hover:text-white transition-all font-black border border-gray-700">✕</button>
        </div>

        <div className="flex-1 overflow-hidden flex divide-x divide-gray-800">
            <div className="w-2/3 overflow-y-auto p-12 space-y-14 custom-scrollbar">
                <section className="space-y-10">
                    <div className="flex items-center justify-between border-b border-gray-900 pb-4">
                        <p className="text-xs font-black text-primary-500 uppercase tracking-widest flex items-center gap-3">
                            <AzureIcon className="w-4 h-4"/> Targeting Intelligence
                        </p>
                    </div>
                    <div className="grid grid-cols-2 gap-10">
                        <div>
                            <label className="block text-[10px] font-black text-gray-600 uppercase tracking-widest mb-3">Logic Descriptor</label>
                            <input type="text" value={formData.name} onChange={e => handleChange('name', e.target.value)} placeholder="e.g. Sales Regional Policy" className="w-full bg-gray-900 border border-gray-800 rounded-2xl p-5 text-white font-bold focus:ring-2 focus:ring-primary-500/50 focus:outline-none transition-all"/>
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-gray-600 uppercase tracking-widest mb-3">Directory Scope (Group DisplayName)</label>
                            <div className="flex gap-4">
                                <input type="text" value={assignedGroupsInput} onChange={e => setAssignedGroupsInput(e.target.value)} className="flex-1 bg-gray-900 border border-gray-800 rounded-2xl p-5 text-white font-bold focus:ring-2 focus:ring-primary-500/50 focus:outline-none transition-all" placeholder="Enter Azure Group Name..."/>
                                <button type="button" onClick={handleVerifyGroup} className="bg-primary-600 hover:bg-primary-500 px-8 rounded-2xl text-white font-black uppercase text-[10px] tracking-widest transition-all shadow-xl shadow-primary-900/20">
                                    {verifyingGroup ? '...' : 'Expand'}
                                </button>
                            </div>
                        </div>
                    </div>

                    {groupSample.length > 0 && (
                        <div className="bg-gray-900 border border-gray-800 rounded-3xl overflow-hidden shadow-2xl animate-in slide-in-from-top-4 duration-500">
                            <div className="p-6 bg-gray-800/40 border-b border-gray-700 flex justify-between items-center">
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-3">
                                    <ClipboardListIcon className="w-4 h-4 text-primary-500" /> Transitive Scope: {groupSample.length} Identities Identified
                                </span>
                            </div>
                            <div className="max-h-[400px] overflow-auto">
                                <table className="w-full text-left text-[11px] border-collapse">
                                    <thead className="sticky top-0 bg-gray-800 shadow-md">
                                        <tr>
                                            <th className="px-6 py-4 font-black text-gray-500 uppercase border-b border-gray-700">Identity</th>
                                            <th className="px-6 py-4 font-black text-gray-500 uppercase border-b border-gray-700">Manager Mapping</th>
                                            <th className="px-6 py-4 font-black text-gray-500 uppercase border-b border-gray-700 text-center">Engine Logic</th>
                                            <th className="px-6 py-4 font-black text-gray-500 uppercase border-b border-gray-700 text-center">Expiry Vector</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-800">
                                        {groupSample.map((m, i) => (
                                            <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                                                <td className="px-6 py-4">
                                                    <div className="font-bold text-white text-xs">{m.displayName}</div>
                                                    <div className="text-[9px] text-gray-600 font-mono mt-0.5">{m.userPrincipalName}</div>
                                                </td>
                                                <td className="px-6 py-4 text-gray-400 font-bold">{m.managerName}</td>
                                                <td className="px-6 py-4 text-center">
                                                    <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border ${m.isHybrid ? 'bg-primary-900/20 text-primary-400 border-primary-500/20' : 'bg-gray-800 text-gray-500 border-gray-700'}`}>
                                                        {m.isHybrid ? 'Hybrid Forced' : 'Cloud Native'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                     <div className="font-mono text-gray-300">{m.expiryDate}</div>
                                                     <div className={`text-[9px] font-black ${m.daysRemaining < 10 ? 'text-red-500' : 'text-gray-600'}`}>T-{m.daysRemaining}d</div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </section>

                <section className="space-y-10">
                    <div className="flex items-center justify-between border-b border-gray-900 pb-4">
                        <p className="text-xs font-black text-primary-500 uppercase tracking-widest flex items-center gap-3">
                            <ClockIcon className="w-4 h-4"/> Transmission Cadence
                        </p>
                    </div>
                    <div className="grid grid-cols-2 gap-10">
                        <div>
                            <label className="block text-[10px] font-black text-gray-600 uppercase tracking-widest mb-3">T-Minus Trigger Stages (Days)</label>
                            <input type="text" value={cadenceInput} onChange={e => setCadenceInput(e.target.value)} className="w-full bg-gray-900 border border-gray-800 rounded-2xl p-5 text-white font-mono font-black focus:ring-2 focus:ring-primary-500/50 focus:outline-none transition-all" placeholder="14, 7, 3, 1"/>
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-gray-600 uppercase tracking-widest mb-3">Target Delivery Time</label>
                            <input type="time" value={formData.preferredTime} onChange={e => handleChange('preferredTime', e.target.value)} className="w-full bg-gray-900 border border-gray-800 rounded-2xl p-5 text-white font-bold focus:ring-2 focus:ring-primary-500/50 focus:outline-none transition-all"/>
                        </div>
                    </div>
                </section>

                <section className="space-y-10">
                    <div className="flex items-center justify-between border-b border-gray-900 pb-4">
                        <p className="text-xs font-black text-primary-500 uppercase tracking-widest flex items-center gap-3">
                            <ClipboardListIcon className="w-4 h-4"/> Artifact Template
                        </p>
                    </div>
                    <div className="space-y-8">
                        <div>
                            <label className="block text-[10px] font-black text-gray-600 uppercase tracking-widest mb-3">Transmission Subject Line</label>
                            <input type="text" value={formData.subjectLine} onChange={e => handleChange('subjectLine', e.target.value)} className="w-full bg-gray-900 border border-gray-800 rounded-2xl p-5 text-white font-bold focus:ring-2 focus:ring-primary-500/50 focus:outline-none transition-all"/>
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-gray-600 uppercase tracking-widest mb-3">Logic Template (Markdown Supported)</label>
                            <textarea rows={12} value={formData.emailTemplate} onChange={e => handleChange('emailTemplate', e.target.value)} className="w-full bg-black border border-gray-800 rounded-[2.5rem] p-8 text-sm text-primary-300 font-mono focus:ring-2 focus:ring-primary-500/50 focus:outline-none resize-none shadow-inner custom-scrollbar"></textarea>
                        </div>
                    </div>
                </section>
            </div>

            <div className="w-1/3 bg-black/40 p-12 flex flex-col space-y-10 border-l border-gray-800">
                <div>
                    <h4 className="text-2xl font-black text-white uppercase tracking-tighter">Live Artifact Render</h4>
                    <p className="text-[10px] text-gray-600 font-black uppercase tracking-widest mt-1 border-l-2 border-primary-500 pl-3">Real-time Transmission Preview</p>
                </div>

                <div className="bg-gray-950 border border-gray-800 rounded-[3rem] overflow-hidden shadow-2xl flex-1 flex flex-col border-t-8 border-t-primary-600">
                    <div className="p-10 bg-gray-900/50 border-b border-gray-800">
                        <div className="flex items-center gap-4 mb-4">
                            <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest">To:</span>
                            <span className="bg-gray-800 px-4 py-1.5 rounded-xl text-[10px] font-bold text-primary-400 font-mono">user@enterprise.com</span>
                        </div>
                        <div className="flex items-center gap-4">
                            <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest">Sub:</span>
                            <span className="text-xs font-black text-white leading-tight">{formData.subjectLine}</span>
                        </div>
                    </div>
                    <div className="flex-1 p-10 overflow-auto custom-scrollbar">
                        <pre className="bg-transparent p-0 m-0 text-gray-400 font-sans whitespace-pre-wrap leading-relaxed text-sm">
                            {formData.emailTemplate
                                .replace(/{{user.displayName}}/g, 'Sample Identity')
                                .replace(/{{user.userPrincipalName}}/g, 'user@enterprise.com')
                                .replace(/{{expiryDate}}/g, new Date(Date.now() + 86400000 * 7).toLocaleDateString())
                                .replace(/{{daysUntilExpiry}}/g, '7')
                            }
                        </pre>
                    </div>
                </div>

                <div className="p-8 bg-gray-900/40 rounded-3xl border border-gray-800 text-center">
                    <p className="text-[9px] text-gray-700 font-black uppercase tracking-[0.4em]">Engine Link: Awaiting Commit</p>
                </div>
            </div>
        </div>

        <div className="px-12 py-8 bg-gray-900 border-t border-gray-800 flex justify-end gap-6">
            <button type="button" onClick={onClose} className="px-12 py-4 bg-gray-800 hover:bg-gray-700 text-gray-500 hover:text-white rounded-2xl font-black uppercase tracking-widest transition-all border border-gray-700">Discard Delta</button>
            <button onClick={handleSubmit} className="px-16 py-4 bg-primary-600 hover:bg-primary-500 text-white rounded-2xl font-black uppercase tracking-widest shadow-2xl shadow-primary-900/40 transition-all border border-primary-400/20">Commit Logic Profile</button>
        </div>
      </div>
    </div>
  );
};

export default ProfileEditor;
