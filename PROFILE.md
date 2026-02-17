
# Logic Profile Architecture (v4.0)

## 1. The Core Concept
A "Profile" in this system is a self-contained unit of logic that defines **Who** gets notified, **When** they are notified, and **What** the message contains.

## 2. Targeting Intelligence
Profiles use Azure AD (Entra ID) Security Groups as the primary targeting vector.
- **Transitive Mapping**: The system resolves Group DisplayNames to GUIDs and expands members transitively.
- **Hybrid Detection**: The engine inspects the `onPremisesSyncEnabled` attribute. 
  - If **True**: Cloud policies (like 'Never Expires') are ignored. Expiry is calculated as `lastPasswordChangeDateTime + SystemDefaultDays`.
  - If **False**: Standard Cloud policies are respected.

## 3. Cadence Staging (The T-Minus System)
Cadence is defined as an array of integers (e.g., `[14, 7, 3, 1]`). 
- Every 24 hours, the engine calculates the "Delta" (Days until expiry).
- If `Delta` exists in the `cadence` array, a delivery artifact is created in the Queue.

## 4. Portability (JSON Standard)
Profiles are fully portable. Each profile can be exported as a standalone JSON object:
```json
{
  "name": "Global Executive Policy",
  "assignedGroups": ["Exec-Users"],
  "cadence": { "daysBefore": [15, 10, 5, 1] },
  "recipients": { "toUser": true, "toManager": true },
  "emailTemplate": "Hello {{user.displayName}}..."
}
```
Importing this JSON into another instance of the engine will immediately re-initialize the monitoring logic for that group.
