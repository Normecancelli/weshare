# Prospect Management System — Design Specification

**Date:** 2026-06-20  
**Status:** Design approved  
**Session:** B (Contatti/Prospect Phase)  
**Author:** Claude Code Brainstorming

---

## 1. Overview

Prospect Management is a new module for tracking sales pipeline — from initial contact through appointment scheduling, follow-up nurturing, and conversion to either customer or partner.

**Why:** Alejerry's team (79 partners) needs structured lead tracking beyond casual customer management. Current `customers` table is for finalized clients who buy products; prospects are potential clients OR future partners in the recruitment pipeline.

**Scope:** Three phases delivered sequentially.

---

## 2. Scope Definition

### Phase 1: Prospect Core (MVP)
- CRUD prospect: name, phone, email, city, source (personal contact / list / social / referral / other), notes
- Pipeline states: `nuovo_contatto` → `primo_appt` → `secondo_appt` → conversion or follow-up
- Situational tag + sub-tag for follow-up (e.g., "Interested but not now", "Needs more info", "Said no", custom)
- Next action date + dashboard reminder
- Responsive UI: desktop tabella spreadsheet, mobile card stack
- Partner owns prospect (no visibility to team leaders)

### Phase 2: Appointments + Messaging
- Appointment scheduling: date/time + notes
- **Google Calendar integration:** OAuth, bidirectional sync, event ID tracking
- **Email templates:** Resend integration with predefined templates ("First contact", "Week 1 follow-up", "Month 1 follow-up", "Diamond opportunity")
- **WhatsApp templates:** wa.me link with precompiled text
- **Follow-up list:** Partner manually reviews prospects needing follow-up, sets flag (send/don't send/suspended)
- Cadence reminder: default (14 days) + customizable per prospect
- Message composition: template selector + custom text option
- Tracking: last sent date, next reminder date

### Phase 3: Conversion + Analytics
- **Convert to Customer:** Pre-populate customer form with prospect data, link prospect to new customer record
- **Convert to Partner:** Generate invite link, transition prospect to `convertito_partner` state
- **Analytics dashboard:**
  - Pipeline view: count per stage (Nuovo / Primo appt / Secondo appt / Cliente / Partner / Follow-up)
  - Conversion metrics: % converted to customer, % converted to partner, avg days to conversion, trend this month vs last month

---

## 3. Database Schema

### New Tables

#### `prospects`
```sql
CREATE TABLE prospects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Contact data
  nome TEXT NOT NULL,
  telefono TEXT,
  email TEXT,
  citta TEXT,
  source TEXT NOT NULL CHECK (source IN ('contatto_personale', 'lista', 'social', 'referenza', 'altro')),
  note TEXT,
  
  -- Pipeline state
  stato TEXT NOT NULL DEFAULT 'nuovo_contatto' 
    CHECK (stato IN ('nuovo_contatto', 'primo_appt', 'secondo_appt', 
                     'convertito_cliente', 'convertito_partner', 'follow_up')),
  
  -- Follow-up categorization (only when stato = 'follow_up')
  sub_tag_follow_up TEXT CHECK (sub_tag_follow_up IN ('interessato_non_ora', 'necessita_info', 'ha_detto_no', 'custom')),
  sub_tag_custom TEXT,
  
  -- Follow-up cadence
  cadenza_giorni INT DEFAULT 14,
  prossima_data_reminder DATE,
  
  -- Conversion tracking
  convertito_a TEXT CHECK (convertito_a IN ('cliente', 'partner')),
  customer_id UUID REFERENCES customers(id),
  profile_id_nuovo_partner UUID, -- references new partner profile if converted
  data_conversione TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_prospects_partner ON prospects(partner_id);
CREATE INDEX idx_prospects_stato ON prospects(stato);
CREATE INDEX idx_prospects_prossima_data ON prospects(prossima_data_reminder);
```

#### `prospect_appointments`
```sql
CREATE TABLE prospect_appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  data_ora TIMESTAMPTZ NOT NULL,
  note TEXT,
  
  -- Google Calendar sync
  google_event_id TEXT,
  google_sync_status TEXT CHECK (google_sync_status IN ('synced', 'pending', 'failed')) DEFAULT 'pending',
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_appointments_prospect ON prospect_appointments(prospect_id);
CREATE INDEX idx_appointments_partner ON prospect_appointments(partner_id);
```

#### `prospect_follow_ups`
```sql
CREATE TABLE prospect_follow_ups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Message configuration
  tipo_messaggio TEXT NOT NULL CHECK (tipo_messaggio IN ('email', 'whatsapp')),
  template_id TEXT, -- reference to predefined template
  template_content TEXT, -- custom text if not using template
  
  -- Send state
  flag_invio TEXT NOT NULL DEFAULT 'da_valutare' 
    CHECK (flag_invio IN ('inviare', 'non_inviare', 'sospeso', 'inviato')),
  last_sent_at TIMESTAMPTZ,
  prossima_data TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_follow_ups_prospect ON prospect_follow_ups(prospect_id);
CREATE INDEX idx_follow_ups_partner ON prospect_follow_ups(partner_id);
CREATE INDEX idx_follow_ups_flag ON prospect_follow_ups(flag_invio);
```

### RLS Policies

All three tables: partner can view/edit only their own prospect records.

```sql
-- prospects
ALTER TABLE prospects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prospects_own" ON prospects 
  FOR ALL USING (partner_id = auth.uid());

-- prospect_appointments (transitive via prospect)
ALTER TABLE prospect_appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "appointments_own" ON prospect_appointments
  FOR ALL USING (partner_id = auth.uid());

-- prospect_follow_ups (transitive via prospect)
ALTER TABLE prospect_follow_ups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "follow_ups_own" ON prospect_follow_ups
  FOR ALL USING (partner_id = auth.uid());
```

---

## 4. API Specification

### Authentication & Authorization
All endpoints require valid `auth.uid()`. Partner must own the prospect (verified via `partner_id` foreign key).

### Endpoints

#### Prospect CRUD

**GET `/api/prospects`**
- Query params: `?stato=nuovo_contatto|primo_appt|...` (optional filter)
- Returns: `{ data: prospect[], count: int }`

**POST `/api/prospects`**
- Body: `{ nome, telefono?, email?, citta?, source, note? }`
- Returns: created prospect object
- Validation: `source` in enum, `nome` required

**GET `/api/prospects/[id]`**
- Returns: prospect + related appointments + follow-ups
- Response: `{ prospect, appointments, follow_ups }`

**PATCH `/api/prospects/[id]`**
- Body: `{ nome?, telefono?, email?, citta?, source?, note?, stato?, sub_tag_follow_up?, sub_tag_custom?, cadenza_giorni? }`
- Validation: if `stato` changes to `follow_up`, require `sub_tag_follow_up`
- Returns: updated prospect

**DELETE `/api/prospects/[id]`**
- Behavior: hard delete (prospect is ephemeral; if converted, link to customer/partner exists separately)
- Returns: `{ success: true }`

#### Appointments

**GET `/api/prospects/[id]/appointments`**
- Returns: `{ data: appointment[] }`

**POST `/api/prospects/[id]/appointments`**
- Body: `{ data_ora, note? }`
- Action: Create appointment + attempt Google Calendar sync if partner has token
- Returns: `{ appointment, google_event_id?, google_sync_status }`
- Error handling: if Google sync fails, return appointment anyway with `google_sync_status = 'failed'` + warning message

**PATCH `/api/prospects/[id]/appointments/[appointmentId]`**
- Body: `{ data_ora?, note? }`
- Action: Update appointment + re-sync Google Calendar if date changed
- Returns: updated appointment

**DELETE `/api/prospects/[id]/appointments/[appointmentId]`**
- Action: Delete appointment + remove from Google Calendar if synced
- Returns: `{ success: true }`

#### Conversion

**POST `/api/prospects/[id]/convert`**
- Body: `{ convertTo: 'cliente' | 'partner', customerData?: { ... } }`
- Action:
  - If `cliente`: Create customer record (use provided data or prospect fields), set `prospects.customer_id`, set `stato = 'convertito_cliente'`
  - If `partner`: Generate invite URL (`/invite/[codice_amway_partner]`), set `stato = 'convertito_partner'`, optionally auto-send invite email
- Returns: `{ success: true, customerId?, inviteUrl? }`
- Validation: prospect not already converted

#### Follow-up Management

**GET `/api/prospects/follow-up-list`**
- Query: `?flag=inviare|non_inviare|sospeso` (optional)
- Returns: `{ data: prospect[] }` with follow-up config, ordered by `prossima_data`

**PATCH `/api/prospects/[id]/follow-up`**
- Body: `{ flag_invio: 'inviare' | 'non_inviare' | 'sospeso', prossima_data? }`
- Returns: updated follow-up config

**POST `/api/prospects/[id]/send-message`**
- Body: `{ tipo: 'email' | 'whatsapp', templateId?: string, customText?: string }`
- Action:
  - If `email`: Send via Resend using template or custom text
  - If `whatsapp`: No API call; return wa.me URL for partner to click
  - Set `flag_invio = 'inviato'`, `last_sent_at = now()`
  - Update `prossima_data = now() + (cadenza_giorni days)`
- Returns: `{ success: true, messageId?, url? }`

#### Analytics

**GET `/api/prospects/analytics`**
- Returns: 
```json
{
  "pipeline": {
    "nuovo_contatto": 8,
    "primo_appt": 5,
    "secondo_appt": 3,
    "convertito_cliente": 2,
    "convertito_partner": 1,
    "follow_up": 4
  },
  "conversione": {
    "cliente_percent": 28,
    "partner_percent": 14,
    "tempo_medio_giorni": 24,
    "trend": {
      "questo_mese": 3,
      "mese_scorso": 1
    }
  }
}
```

#### Google Calendar OAuth

**POST `/api/auth/google-calendar`**
- Body: `{ authCode }`
- Action: Exchange auth code for refresh token (via Google OAuth), store token in `profiles.google_calendar_token`
- Returns: `{ success: true }`

**DELETE `/api/auth/google-calendar`**
- Action: Revoke Google Calendar token, clear from profiles
- Returns: `{ success: true }`

---

## 5. Frontend Architecture

### Component Structure
```
src/app/contatti/
├── page.tsx                           # List view (desktop tabella + mobile card)
├── layout.tsx                         # Sidebar + nav
├── [id]/
│   ├── page.tsx                       # Detail view
│   └── components/
│       ├── ProspectHeader.tsx         # Name, contact info, source
│       ├── AppointmentPanel.tsx       # Appointments section + Google sync status
│       ├── FollowUpSection.tsx        # Sub-tag, cadence, conversion buttons
│       └── ConversionButtons.tsx      # Three buttons: Cliente / Partner / Follow-up
├── components/
│   ├── ProspectForm.tsx               # New/Edit prospect modal
│   ├── AppointmentForm.tsx            # New appointment modal + Google Calendar picker
│   ├── FollowUpList.tsx               # Follow-up list with radio buttons (send/don't send/suspended)
│   ├── MessageTemplate.tsx            # Email/WhatsApp template selector modal
│   ├── AnalyticsDashboard.tsx         # Pipeline view + conversion metrics
│   └── ConvertModal.tsx               # Conversion flow (select route + populate fields)
```

### Responsive Design
- **Desktop (md+):** Tabella spreadsheet per lista; side-by-side layout per dettaglio
- **Mobile (<md):** Card stack per lista; vertical stack per dettaglio
- Implementation: Tailwind `hidden md:block` / `md:hidden` (existing pattern in codebase)

### Key UI Behaviors
- Prospect list filters by stato (click badge or dropdown)
- Appointment sync status shows as icon (✓ synced, ⏳ pending, ✗ failed) with tooltip
- Follow-up list shows radio buttons next to each prospect; clicking "Email" or "WhatsApp" opens template modal
- Conversion buttons trigger modal with flow-specific fields (e.g., customer form for cliente, invite settings for partner)
- Analytics shown as cards (pipeline counts) + mini charts (conversion trend)

---

## 6. External Integrations

### Google Calendar OAuth
- **Flow:** Partner clicks "Collega Google Calendar" → OAuth consent screen → callback to `/api/auth/google-calendar` → refresh token stored in `profiles.google_calendar_token`
- **Appointment Sync:** When creating/updating appointment, use Google Calendar API to create/update event; store `google_event_id` and `google_sync_status`
- **Error Handling:** If sync fails (expired token, invalid event), show warning and set `google_sync_status = 'failed'`; user can re-auth or continue without sync
- **Cleanup:** If appointment deleted, remove from Google Calendar if `google_sync_status = 'synced'`

### Resend Email Templates
- **Location:** `src/lib/prospects/email-templates.ts`
- **Templates:**
  - "Primo contatto" — intro message + value prop
  - "Follow-up settimana 1" — recap first meeting
  - "Follow-up mese 1" — soft conversion pitch
  - "Opportunità diamante" — recruitment messaging
- **Customization:** Partner can edit template text in modal before sending
- **Send:** Use `resend.emails.send()` with partner's email as `from` (or configure from address in env)

### WhatsApp Messaging
- **No API integration** (OpenWA = ban risk per CLAUDE.md)
- **UX:** Template selector modal → partner sees precompiled text → clicks "Apri WhatsApp" → opens `wa.me/[phone]?text=[URL-encoded-template]`
- **Tracking:** Partner completes send on WhatsApp side; app marks as `flag_invio = 'inviato'` and updates `last_sent_at` when partner clicks the button

---

## 7. Data Flow & State Transitions

### Prospect Lifecycle
```
1. Nuovo contatto (created)
   ↓
2. Primo appt (scheduled + attended)
   ↓
3. [Optional] Secondo appt (scheduled + attended)
   ↓
4a. Convertito a cliente (customer form filled + saved)
   or
4b. Convertito a partner (invite sent or profile created)
   or
4c. Follow-up (kept in nurture list)
   ↓ (if follow-up)
5. Continua messaggi Email/WhatsApp su cadenza
   ↓ (se accetta)
6. Eventualmente converte a cliente/partner
```

### Follow-up Cadence
- Default: 14 giorni tra messaggi
- Customizable per prospect
- Partner manually reviews "Follow-up list" page, toggles flag (send/don't send/suspended)
- Clicking "Email" or "WhatsApp" → template modal → sends → updates `last_sent_at` + `prossima_data = now() + cadenza_giorni`

---

## 8. Error Handling & Edge Cases

| Scenario | Handling |
|----------|----------|
| Google Calendar sync fails | Show warning, appointment created locally, `google_sync_status = 'failed'`, partner can retry |
| Email send fails (Resend down) | Show error toast, message not marked as sent, partner can retry |
| Partner converts prospect to customer, then tries to convert again | API returns error "already converted" |
| Partner deletes prospect | Prospect deleted; if already converted, customer/partner record remains (separate lifecycle) |
| Google Calendar token expired | Next sync attempt fails; show "Re-authorize Google Calendar" prompt |
| Prospect has no phone/email | Still creatable; appointment/messaging may fail — show validation on form |

---

## 9. Testing Strategy

### Unit Tests (Next Sprint)
- Prospect CRUD: create, read, update, delete
- State transitions: validate stato enum, sub_tag logic
- Conversion flow: customer link, partner invite generation

### Integration Tests
- Google Calendar OAuth flow
- Resend email send
- Follow-up list filtering by flag

### E2E Tests
- Create prospect → schedule appointment → convert to customer → verify customer in app
- Create prospect → mark follow-up → send email → verify last_sent_at updated
- Google Calendar sync (requires test credentials)

---

## 10. Future Enhancements (Out of Scope)

- Prospect import from CSV (team member lists)
- Shared prospect pool (not yet — Phase 3 says no sharing)
- WhatsApp API integration (currently wa.me link only)
- Mobile app notifications for upcoming appointments
- Prospect scoring / lead quality ranking
- Bulk email/WhatsApp campaigns
- Salesforce / HubSpot integration
- Calendar view (show appointments on month grid)

---

## 11. Deployment & Migration

**Migration SQL:** Create new tables (see Section 3) in Supabase

**Environment Variables Needed:**
- `GOOGLE_CLIENT_ID` (OAuth)
- `GOOGLE_CLIENT_SECRET` (OAuth)
- `GOOGLE_REDIRECT_URI` (e.g., `https://metodo.growset.it/api/auth/google-calendar`)
- `RESEND_API_KEY` (already exists)

**Vercel Deployment:** Standard — no special config needed beyond env vars

---

## 12. Success Criteria

✅ Phase 1 complete when:
- Partner can CRUD prospect
- List view responsive (desktop tabella + mobile card)
- Dashboard shows next action reminders

✅ Phase 2 complete when:
- Appointments sync with Google Calendar
- Email/WhatsApp template sending works
- Follow-up list and manual send flag functional

✅ Phase 3 complete when:
- Conversion to customer/partner works end-to-end
- Analytics dashboard shows pipeline + conversion metrics
- Data consistent across new customer/partner records

---

## 13. Questions for Implementation

- Should Google Calendar sync be bidirectional (delete on GCal → delete in app)? Deferring to Phase 2 if needed.
- Email "from" address: use partner's email or default app email?
- When converting to partner, auto-send invite email or just generate link?
- Analytics: should Phase 3 also show individual prospect history (when transitioned between states)?
