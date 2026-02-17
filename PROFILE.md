
# AD Notifier: Logic Architecture & Technical Manifest

## 1. Group Verification Intelligence
Verification of Azure AD Groups is non-trivial due to Graph API's eventual consistency and the separation of Group Metadata from Membership Metadata.
- **The Protocol**:
  1. **Identity Resolution**: Search `/v1.0/groups?$filter=displayName eq '{name}'` to obtain the GUID.
  2. **Transitive Expansion**: Query `/v1.0/groups/{guid}/members` with `$expand=manager`. 
  3. **Metadata Mapping**: Users are piped through the Hybrid Expiry Logic before being presented in the "Sample Members" table.
- **Why this is hard**: Transitive membership expansion is a heavy operation. Our engine performs this server-side to prevent browser timeouts and ensure the `$expand` logic is applied correctly to nested identities.

## 2. Hybrid Expiry Formula
Standard Azure Cloud policies (`DisablePasswordExpiration`) are ignored for Hybrid identities.
- **Logic**: `ExpiryDate = lastPasswordChangeDateTime + systemDefaultDays`
- **Justification**: On-prem Domain Controllers do not communicate the exact expiry date to Entra ID; they only communicate the 'Last Set' timestamp. The engine reconstructs the expiry timeline by simulating your on-prem GPO.

## 3. The Portability Standard
Profiles are stored as atomic JSON artifacts. They can be hot-swapped between instances without re-authentication.
