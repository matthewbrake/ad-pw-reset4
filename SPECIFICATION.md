# AZURE AD PASSWORD NOTIFIER
## UI/UX Design Specification v3.0.0

### 1. Introduction
This application provides enterprise administrators with a high-performance interface for managing password expiration notifications. It strictly adheres to "Midnight Code" aesthetics for professional IT environments.

### 2. Design System
- **Font**: Times New Roman (Legacy Professional)
- **Primary Color**: #020617 (Midnight)
- **Success Color**: #16A34A (Enterprise Green)
- **Warning Color**: #CA8A04 (Cautionary Yellow)
- **Danger Color**: #DC2626 (Critical Red)

### 3. Core Foundation Paradygms
- **Zero-Trust Connectivity**: All Azure AD calls are performed server-side via Client Credentials flow.
- **Hybrid Intelligent Calculation**: The system automatically detects On-Premises synchronized users and forces a custom expiry calculation, bypassing the Azure "PasswordNeverExpires" flag typically set during sync.
- **Queue-First Delivery**: Instead of bulk-sending, jobs are scheduled into a Delivery Queue for staggered transmission or specific preferred times.

### 4. Component Logic
- **Dashboard**: Real-time overview of Entra ID health with 5-card statistics.
- **Profiles**: The logic "brain" where targeting, cadence, and templates are defined.
- **Queue**: Observability into pending delivery items. Items can be canceled or accelerated.
- **Audit Logs**: Irrefutable history of system actions and mail deliveries.

### 5. Implementation Notes
- **Persistence**: All data stored in `/app/data/config` via atomic JSON writes.
- **Security**: SMTP and Client Secrets are masked in the UI with `********`.
- **Responsive**: Fully operational on mobile, tablet, and desktop viewports.
