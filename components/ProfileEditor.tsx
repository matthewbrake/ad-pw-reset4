
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
  const [permCheck, setPermCheck] = useState<{users: boolean, groups: boolean} | null>(null);

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

  const livePreview = useMemo(() => {
    const mockUser = {
        displayName: "John Admin",
        userPrincipalName: "j.admin@enterprise.com",
        expiryDate: new Date(Date.now() + 86400000 * 7).toLocaleDateString(),
        daysUntilExpiry: 7
    };
    let subject = formData.subjectLine.replace(/{{daysUntilExpiry}}/g, mockUser.daysUntilExpiry.toString());
    let body = formData.emailTemplate
        .replace(/{{user.displayName}}/g, mockUser.displayName)
        .replace(/{{user.userPrincipalName}}/g, mockUser.userPrincipalName)
        .replace(/{{expiryDate}}/g, mockUser.expiryDate)
        .replace(/{{daysUntilExpiry}}/g, mockUser.daysUntilExpiry.toString());
    return { subject, body };
  }, [formData.emailTemplate, formData.subjectLine]);

  const handleVerifyGroup = async () => {
      const groupName = assignedGroupsInput.split(',')[0].trim();
      if (!groupName) return alert("Enter a group name.");
      setVerifyingGroup(true);
      try {
        const res = await fetch('/api/verify-group', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ groupName })
        });
        const data = await res.json();
        if (data.sampleMembers) {
            setGroupSample(data.sampleMembers);
            setPermCheck({ users: true, groups: true });
        } else {
            alert(data.message);
            setPermCheck({ users: false, groups: false });
        }
      } catch (e) {
          alert("Handshake failure.");
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
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[100] p-4 backdrop-blur-md">
      <div className="bg-gray-900 border border-gray-700 rounded-[2.5rem] w-full max-w-[98vw] h-[98vh] flex flex-col overflow-hidden shadow-2xl">
        
        <div className="p-8 bg-gray-800/80 border-b border-gray-700 flex justify-between items-center">
            <div className="flex items-center gap-6">
                <div className="p-4 bg-primary-600 rounded-2xl shadow-lg">
                    <BellIcon className="w-8 h-8 text-white" />
                </div>
                <div>
                    <h3 className="text-3xl font-black text-white uppercase tracking-tighter">Logic Matrix v4.0</h3>
                    <div className="flex items-center gap-4 mt-1">
                        <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Enterprise Notification Architect</p>
                        {permCheck && (
                            <div className="flex gap-2">
                                <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border ${permCheck.users ? 'bg-green-900/20 text-green-400 border-green-500/20' : 'bg-red-900/20 text-red-400 border-red-500/20'}`}>User.Read</span>
                                <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border ${permCheck.groups ? 'bg-green-900/20 text-green-400 border-green-500/20' : 'bg-red-900/20 text-red-400 border-red-500/20'}`}>Group.Read</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            <button onClick={onClose} className="p-4 bg-gray-800 rounded-2xl text-gray-400 hover:text-white transition-all font-black border border-gray-700">✕</button>
        </div>

        <div className="flex-1 overflow-hidden flex divide-x divide-gray-800">
            <div className="w-2/3 overflow-y-auto p-10 space-y-12 bg-gray-900/50">
                <section className="space-y-8">
                    <div className="flex items-center justify-between border-b border-gray-800 pb-4">
                        <p className="text-xs font-black text-primary-500 uppercase tracking-widest flex items-center gap-3">
                            <AzureIcon className="w-4 h-4"/> Targeting Intelligence
                        </p>
                    </div>
                    <div className="grid grid-cols-2 gap-8">
                        <div>
                            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3">Profile Name</label>
                            <input type="text" value={formData.name} onChange={e => handleChange('name', e.target.value)} placeholder="e.g. Sales Staff Policy" className="w-full bg-gray-800 border border-gray-700 rounded-2xl p-4 text-white font-bold focus:ring-2 focus:ring-primary-500 focus:outline-none"/>
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3">Scope (Azure Group)</label>
                            <div className="flex gap-3">
                                <input type="text" value={assignedGroupsInput} onChange={e => setAssignedGroupsInput(e.target.value)} className="flex-1 bg-gray-800 border border-gray-700 rounded-2xl p-4 text-white font-bold focus:ring-2 focus:ring-primary-500 focus:outline-none" placeholder="Security Group Name"/>
                                <button type="button" onClick={handleVerifyGroup} className="bg-primary-600 hover:bg-primary-500 px-6 rounded-2xl text-white transition-all">
                                    {verifyingGroup ? '...' : 'Verify'}
                                </button>
                            </div>
                        </div>
                    </div>

                    {groupSample.length > 0 && (
                        <div className="bg-black/40 border border-gray-800 rounded-3xl overflow-hidden shadow-2xl">
                            <div className="p-5 bg-gray-800/40 border-b border-gray-700 flex justify-between items-center">
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                    <ClipboardListIcon className="w-4 h-4 text-primary-400" /> Deep Impact Assessment ({groupSample.length} Active Targets)
                                </span>
                            </div>
                            <div className="max-h-[350px] overflow-auto">
                                <table className="w-full text-left text-[11px]">
                                    <thead className="sticky top-0 bg-gray-800">
                                        <tr>
                                            <th className="px-5 py-4 font-black text-gray-500 uppercase border-b border-gray-700">Display Identity</th>
                                            <th className="px-5 py-4 font-black text-gray-500 uppercase border-b border-gray-700">Manager</th>
                                            <th className="px-5 py-4 font-black text-gray-500 uppercase border-b border-gray-700 text-center">Hybrid</th>
                                            <th className="px-5 py-4 font-black text-gray-500 uppercase border-b border-gray-700 text-center">Last Reset</th>
                                            <th className="px-5 py-4 font-black text-gray-500 uppercase border-b border-gray-700 text-center">Expiry</th>
                                            <th className="px-5 py-4 font-black text-gray-500 uppercase border-b border-gray-700 text-center">Force Change</th>
                                            <th className="px-5 py-4 font-black text-gray-500 uppercase border-b border-gray-700 text-center">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-800">
                                        {groupSample.map((m, i) => (
                                            <tr key={i} className="hover:bg-white/[0.03]">
                                                <td className="px-5 py-3">
                                                    <div className="font-bold text-white">{m.displayName}</div>
                                                    <div className="text-[9px] text-gray-500 font-mono truncate max-w-[120px]">{m.userPrincipalName}</div>
                                                </td>
                                                <td className="px-5 py-3 text-gray-400">{m.managerName}</td>
                                                <td className="px-5 py-3 text-center">
                                                    {m.isHybrid ? <AzureIcon className="w-4 h-4 mx-auto text-primary-400" /> : <span className="text-gray-700">No</span>}
                                                </td>
                                                <td className="px-5 py-3 text-center text-gray-500 font-mono">{m.daysSinceSet}d ago</td>
                                                <td className="px-5 py-3 text-center text-gray-300 font-mono">{m.expiryDate}</td>
                                                <td className="px-5 py-3 text-center">
                                                    {m.forceChange ? <span className="text-orange-400 font-black">YES</span> : <span className="text-gray-700">No</span>}
                                                </td>
                                                <td className="px-5 py-3 text-center">
                                                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border ${m.accountEnabled ? 'bg-emerald-900/20 text-emerald-400 border-emerald-500/20' : 'bg-red-900/20 text-red-400 border-red-500/20'}`}>
                                                        {m.accountEnabled ? 'Enabled' : 'Disabled'}
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

                <section className="space-y-8">
                    <div className="flex items-center justify-between border-b border-gray-800 pb-4">
                        <p className="text-xs font-black text-primary-500 uppercase tracking-widest flex items-center gap-3">
                            <BellIcon className="w-4 h-4"/> Notification Topology
                        </p>
                    </div>
                    <div className="grid grid-cols-2 gap-10">
                        <div className="space-y-4">
                            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Delivery Recipients</label>
                            <div className="grid grid-cols-2 gap-4">
                                <label className="flex items-center gap-4 bg-gray-800 p-4 rounded-2xl border border-gray-700 cursor-pointer hover:border-primary-500">
                                    <input type="checkbox" checked={formData.recipients.toUser} onChange={() => toggleRecipient('toUser')} className="w-5 h-5 rounded-lg bg-gray-900 border-gray-700 text-primary-600" />
                                    <span className="text-xs font-black text-gray-300 uppercase">To User</span>
                                </label>
                                <label className="flex items-center gap-4 bg-gray-800 p-4 rounded-2xl border border-gray-700 cursor-pointer hover:border-primary-500">
                                    <input type="checkbox" checked={formData.recipients.toManager} onChange={() => toggleRecipient('toManager')} className="w-5 h-5 rounded-lg bg-gray-900 border-gray-700 text-primary-600" />
                                    <span className="text-xs font-black text-gray-300 uppercase">To Manager</span>
                                </label>
                                <label className="flex items-center gap-4 bg-gray-800 p-4 rounded-2xl border border-gray-700 cursor-pointer hover:border-primary-500 col-span-2">
                                    <input type="checkbox" checked={formData.recipients.readReceipt} onChange={() => toggleRecipient('readReceipt')} className="w-5 h-5 rounded-lg bg-gray-900 border-gray-700 text-primary-600" />
                                    <span className="text-xs font-black text-gray-300 uppercase">Request Read Receipt</span>
                                </label>
                            </div>
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3">Admin Observer List (CSV Emails)</label>
                            <textarea value={adminsInput} onChange={e => setAdminsInput(e.target.value)} placeholder="it-ops@company.com, audits@company.com" className="w-full bg-gray-800 border border-gray-700 rounded-2xl p-4 text-white font-mono text-xs focus:ring-2 focus:ring-primary-500 focus:outline-none resize-none h-[120px]"></textarea>
                        </div>
                    </div>
                </section>

                <section className="space-y-8">
                    <div className="flex items-center justify-between border-b border-gray-800 pb-4">
                        <p className="text-xs font-black text-primary-500 uppercase tracking-widest flex items-center gap-3">
                            <ClockIcon className="w-4 h-4"/> Time Cadence
                        </p>
                    </div>
                    <div className="grid grid-cols-2 gap-8">
                        <div>
                            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3">T-Minus Alarms (Days)</label>
                            <input type="text" value={cadenceInput} onChange={e => setCadenceInput(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-2xl p-4 text-white font-mono font-bold focus:ring-2 focus:ring-primary-500 focus:outline-none" placeholder="14, 7, 3, 1"/>
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3">Preferred Transmission Time</label>
                            <input type="time" value={formData.preferredTime} onChange={e => handleChange('preferredTime', e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-2xl p-4 text-white font-bold focus:ring-2 focus:ring-primary-500 focus:outline-none"/>
                        </div>
                    </div>
                </section>

                <section className="space-y-8">
                    <div className="flex items-center justify-between border-b border-gray-800 pb-4">
                        <p className="text-xs font-black text-primary-500 uppercase tracking-widest flex items-center gap-3">
                            <ClipboardListIcon className="w-4 h-4"/> Payload Definition
                        </p>
                    </div>
                    <div className="space-y-6">
                        <div>
                            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3">Email Subject Line</label>
                            <input type="text" value={formData.subjectLine} onChange={e => handleChange('subjectLine', e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-2xl p-4 text-white font-bold focus:ring-2 focus:ring-primary-500 focus:outline-none"/>
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3">Email Body (Markdown/Text)</label>
                            <textarea rows={10} value={formData.emailTemplate} onChange={e => handleChange('emailTemplate', e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded-3xl p-8 text-sm text-primary-300 font-mono focus:ring-2 focus:ring-primary-500 focus:outline-none resize-none shadow-inner"></textarea>
                        </div>
                    </div>
                </section>
            </div>

            <div className="w-1/3 bg-gray-950 p-10 flex flex-col space-y-8">
                <div>
                    <h4 className="text-xl font-black text-white uppercase tracking-tighter">Live Transmission Preview</h4>
                    <p className="text-[10px] text-gray-600 font-black uppercase tracking-widest mt-1">Real-time Artifact Render</p>
                </div>

                <div className="bg-gray-900 border border-gray-800 rounded-[2.5rem] overflow-hidden shadow-2xl flex-1 flex flex-col border-t-8 border-t-primary-600">
                    <div className="p-8 bg-gray-800/40 border-b border-gray-800">
                        <div className="flex items-center gap-4 mb-4">
                            <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Recipient:</span>
                            <span className="bg-gray-800 px-4 py-1.5 rounded-xl text-xs font-bold text-primary-400">j.admin@enterprise.com</span>
                        </div>
                        <div className="flex items-center gap-4">
                            <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Subject:</span>
                            <span className="text-sm font-black text-white leading-tight">{livePreview.subject}</span>
                        </div>
                    </div>
                    <div className="flex-1 p-10 overflow-auto">
                        <pre className="bg-transparent p-0 m-0 text-gray-300 font-sans whitespace-pre-wrap leading-relaxed text-base">
                            {livePreview.body}
                        </pre>
                    </div>
                </div>

                <div className="p-6 bg-gray-900/50 rounded-3xl border border-gray-800">
                    <p className="text-[9px] text-gray-600 font-black uppercase tracking-[0.3em] text-center">Monitoring Active Link</p>
                </div>
            </div>
        </div>

        <div className="p-10 bg-gray-800 border-t border-gray-700 flex justify-end gap-6">
            <button type="button" onClick={onClose} className="px-10 py-4 bg-gray-900 hover:bg-gray-700 text-gray-500 hover:text-white rounded-2xl font-black uppercase tracking-widest transition-all border border-gray-700">Discard</button>
            <button onClick={handleSubmit} className="px-14 py-4 bg-primary-600 hover:bg-primary-500 text-white rounded-2xl font-black uppercase tracking-widest shadow-2xl shadow-primary-900/40 transition-all border border-primary-400/30">Commit Logic</button>
        </div>
      </div>
    </div>
  );
};

export default ProfileEditor;
