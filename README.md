# Aksharveda Blinkit PO & Dispatch Planning Dashboard

An operations management and dispatch planning platform engineered for Aksharveda's Demand and Fulfillment teams. Ingests bulk Blinkit Purchase Order (PO) CSV exports, enforces strict data boundaries between external platform data and internal operations records, delivers multi-dimensional analytical views, and provides a spreadsheet-style dispatch planning matrix with dynamic SKU pivoting and formatted Excel reporting.

---

## Key Features

- **Robust CSV Ingestion & Pre-flight Reconciliation**:
  - Handles real-world Blinkit CSV formatting quirks (IST timezone UTC roll adjustments, regex decomposition of facility codes, uppercase vendor normalization, zero-padding protection on large numeric PO strings).
  - Pre-flight diff preview showing counts of New, Updated, Unchanged, and Near-Expiry POs before committing.
  - Idempotent re-uploads with transactional atomicity.
- **Strict Blinkit vs. Team Ownership Separation**:
  - Re-uploading newer CSV exports updates vendor-owned fields (`po_header`, `po_line`, `sku_master`) while strictly preserving internal team data (`po_plan` remarks, central appointment dates, internal planned dispatch dates, line-level dispatch quantities).
- **Purchase Order Intelligence Dashboard**:
  - KPI summary tiles for Total POs, Total Order Value (₹), Ordered Units, and Near-Expiry alerts (within 7 days).
  - Dual view toggle: **By Month** and dynamic **Rolling Windows** (7, 15, 30, 45, 60 days).
  - Interactive PO slide-over drawer with line item unit breakdowns (ordered vs. GRN vs. remaining) and full state audit history timeline.
- **Interactive Dispatch Planning Matrix**:
  - High-density spreadsheet interface with sticky left identification columns and dynamic horizontally pivoted SKU columns.
  - Real-time inventory tracking: Stock In Hand, Total Open Orders, and Net Balance (visual highlight on stock deficits).
  - Optimistic autosave on blur for remarks and planned dates.
  - Native `.xlsx` formatted workbook export with SKU metadata headers and current filters applied.
- **Alerts & Notification System**:
  - In-app notification bell with real-time unread badges.
  - Multi-channel notification dispatchers (In-App, Resend email alerts, WhatsApp API stub) with per-recipient channel toggles.
- **Dual-Mode Data Architecture**:
  - Operates against **Supabase Postgres** (with RLS policies and compound channel primary keys) in production, or zero-config **local JSON storage** fallback for rapid local prototyping without external dependencies.

---

## Tech Stack

| Layer | Technologies |
|---|---|
| **Framework** | Next.js 16 (App Router) + React 19 + TypeScript |
| **Styling & Icons** | Tailwind CSS + Lucide Icons |
| **Database** | Supabase Postgres (DDL migrations in `supabase/migrations/`) + Local JSON fallback |
| **Parsing & Export** | PapaParse (CSV ingest) + SheetJS (XLSX export) |
| **Validation** | Zod schema validation |
| **Testing** | Vitest (unit & integration) + Playwright (E2E browser tests) |
| **CI / Automation** | GitHub Actions (`.github/workflows/ci.yml`) |

---

## Domain Data Invariant

| Domain | Entities | Behavior on CSV Re-Upload |
|---|---|---|
| **Blinkit-Owned** | `po_header`, `po_line`, `sku_master` | Updated or inserted with newest platform values, delivery dates, and order values. |
| **Team-Owned** | `po_plan`, `po_line_dispatch` | **Never overwritten.** Remarks, appointment dates, planned dispatch dates, actual dispatch dates, and dispatch quantities remain intact. Initial empty plan records are created solely for *brand-new* POs. |
| **Audit & State** | `upload_log`, `po_state_history` | Audit trail appended on PO state transitions (e.g. Unscheduled &rarr; Scheduled). |

---

## Getting Started

### Prerequisites
- Node.js 20.x or later
- npm 10.x or later

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/AnayYadav009/Aksharveda-Dashboard.git
cd "Aksharveda Dashboard"
npm install
```

### 2. Configure Environment Variables
Copy the template configuration file:
```bash
cp .env.example .env.local
```

Edit `.env.local` to fit your setup:
```env
# Supabase Configuration (Required in production; app falls back to local storage in dev if unset)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# App Settings
PORT=3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_DEFAULT_RECENT_DAYS=30
NEXT_PUBLIC_NEAR_EXPIRY_DAYS=7

# Email Notification Service (Resend) - Optional in dev
RESEND_API_KEY=re_123456789
NOTIFICATION_FROM_EMAIL=alerts@aksharveda.com

# Meta WhatsApp Cloud API - Optional in dev / stub
WHATSAPP_API_TOKEN=your_meta_system_user_token
WHATSAPP_PHONE_NUMBER_ID=your_meta_phone_number_id
```

### 3. Database Setup (Supabase)
If using Supabase Postgres:
1. Open the SQL Editor in your Supabase project dashboard.
2. Run the migration scripts in strict timestamp order:
   - `supabase/migrations/20261019000001_initial_schema.sql`
   - `supabase/migrations/20261019000002_align_notifications.sql`
   - `supabase/migrations/20261022000001_fix_upload_log.sql`
   - `supabase/migrations/20261022000002_add_region_to_po_header.sql`
   - `supabase/migrations/20261022000003_profiles_and_rls.sql`

*Note: In development mode, if no Supabase environment variables are provided, the application automatically uses the local JSON database adapter located at `.data/store.json` with atomic writes.*

### 4. Authentication & Role-Based Access Control (RBAC)
When Supabase is configured:
- Users log in via `/login` with Supabase Auth credentials.
- Roles are assigned via the `profiles` table (`demand`, `warehouse`, `management`).
- **Permissions**:
  - `demand`: Ingest Blinkit PO CSV exports, view analytics, edit planning/stock.
  - `warehouse`: Dispatch planning sheet management, edit line items, update stock quantities.
  - `management`: Unrestricted access across all analytical views and configuration settings.

### 5. Start the Development Server
```bash
npm run dev
```
Navigate to [http://localhost:3000](http://localhost:3000) to view the application.

---

## Project Structure

```
aksharveda-po-dashboard/
├── .github/
│   └── workflows/
│       └── ci.yml                     # GitHub Actions CI pipeline
├── scripts/
│   └── check-secrets.js               # Pre-commit secret scanning utility
├── src/
│   ├── middleware.ts                  # Root auth route protection & redirection
│   ├── app/
│   │   ├── api/                       # API routes (upload, pos, planning, stock, recipients)
│   │   ├── login/                     # Authentication login page
│   │   ├── design/                    # Design system documentation & preview page
│   │   ├── planning/                  # Dispatch planning spreadsheet matrix
│   │   ├── pos/                       # Main PO analytics dashboard & drawers
│   │   ├── settings/recipients/       # Notification recipient settings
│   │   ├── stock/                     # Inventory stock management
│   │   ├── upload/                    # CSV file upload & diff preview
│   │   ├── uploads/                   # Upload audit history log
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── notifications/             # Notification bell & unread drawer
│   │   ├── po/                        # PO details slide-over drawer
│   │   ├── shell/                     # AppShell, responsive Sidebar, TopBar
│   │   ├── ui/                        # Reusable UI component library (DataTable, StatTile, etc.)
│   │   └── upload/                    # Upload diff details drawer
│   └── lib/
│       ├── auth.ts                    # Supabase Auth client & RBAC authorization
│       ├── data-layer.ts              # Unified data access layer (Supabase + local fallback)
│       ├── db.ts                      # Repository & transactional commit logic
│       ├── format.ts                  # Currency (INR), date (IST), and unit formatters
│       ├── parser.ts                  # CSV sanitization & quirk correction engine
│       ├── supabase.ts                # Supabase client helpers
│       ├── types.ts                   # Domain TypeScript models & Zod schemas
│       └── notifications/             # Email, WhatsApp, and In-App notification services
├── supabase/
│   └── migrations/                    # Postgres schema migrations
├── test/                              # Vitest unit & Playwright E2E suites
├── .env.example                       # Environment variable template
├── package.json
└── tsconfig.json
```

---

## Scripts & Testing

| Command | Purpose |
|---|---|
| `npm run dev` | Starts local Next.js development server with hot-reload (port 3000) |
| `npm run build` | Builds optimized production bundle |
| `npm start` | Runs production Next.js server |
| `npm run typecheck` | Validates TypeScript types across the entire project |
| `npm run check:secrets` | Scans codebase for accidentally committed secrets or tokens |
| `npm test` | Runs all Vitest unit and integration test suites |
| `npm run test:e2e` | Runs Playwright browser end-to-end test suite |

---

## License

Proprietary and confidential. Internal business dashboard for Aksharveda Lifestyle. All rights reserved.

