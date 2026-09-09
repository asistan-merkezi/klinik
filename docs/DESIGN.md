---
name: Klinik Asistanı Design System
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#444653'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#757684'
  outline-variant: '#c4c5d5'
  surface-tint: '#3755c3'
  primary: '#00288e'
  on-primary: '#ffffff'
  primary-container: '#1e40af'
  on-primary-container: '#a8b8ff'
  inverse-primary: '#b8c4ff'
  secondary: '#006a61'
  on-secondary: '#ffffff'
  secondary-container: '#86f2e4'
  on-secondary-container: '#006f66'
  tertiary: '#003272'
  on-tertiary: '#ffffff'
  tertiary-container: '#00489e'
  on-tertiary-container: '#9cbbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dde1ff'
  primary-fixed-dim: '#b8c4ff'
  on-primary-fixed: '#001453'
  on-primary-fixed-variant: '#173bab'
  secondary-fixed: '#89f5e7'
  secondary-fixed-dim: '#6bd8cb'
  on-secondary-fixed: '#00201d'
  on-secondary-fixed-variant: '#005049'
  tertiary-fixed: '#d8e2ff'
  tertiary-fixed-dim: '#adc6ff'
  on-tertiary-fixed: '#001a42'
  on-tertiary-fixed-variant: '#004395'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 30px
    fontWeight: '600'
    lineHeight: 38px
    letterSpacing: -0.015em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.005em
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: 0em
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0.01em
  label-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 14px
    letterSpacing: 0.04em
  tabular-data:
    fontFamily: Plus Jakarta Sans
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: 0.01em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  space-2xs: 0.25rem
  space-xs: 0.5rem
  space-sm: 0.75rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
  space-2xl: 2.5rem
  space-3xl: 3.5rem
  sidebar-width: 17.5rem
  header-height: 4.25rem
  gutter-desktop: 1.5rem
  gutter-mobile: 1rem
---

## Brand & Style

The design system establishes a clinical, highly competent, yet human-centered atmosphere tailored for modern physiotherapy and rehabilitation clinics. The aesthetic balances medical precision with empathetic recovery care. Visual clarity, calm assurance, and friction-free operational efficiency guide every decision.

### Brand Attributes & Mood
- **Klinik Güven (Clinical Trust):** Grounded, reliable structures, clear audit trails, legible typography, and strict data presentation.
- **Canlandırıcı Şifa (Restorative Vitality):** Infusions of mint and soft teal invoke movement, active recovery, physical therapy success, and wellness.
- **Sakin Verimlilik (Calm Productivity):** Noise-reduced dashboards engineered to reduce fatigue for clinicians, physiotherapists, and clinic managers balancing heavy patient queues.

### Design Movement & Influence
The system employs **Modern Clinical Minimalism** combined with **Soft Layered Elevation**. It eschews sterile hospital coldness in favor of breathable whitespace, gentle organic roundness (`rounded-xl` to `rounded-2xl`), subtle slate surface borders, and clear chromatic feedback cues for treatment states and patient flows.

## Colors

The palette leverages a hierarchy of deep clinical ultramarine, vibrant procedural blues, and restorative therapeutic teals anchored on slate-tinted canvas backdrops.

### Primary Palette (Medical Authority & Navigation)
- **Primary 900 (`#172554`):** Primary headings, critical data, key active icons.
- **Primary 800 (`#1E40AF` - Brand Base):** Main actions, header states, sidebar active states, and branded focal points.
- **Primary 500 (`#3B82F6`):** Secondary interactive triggers, links, active tab underlines.
- **Primary 50 (`#EFF6FF`):** Soft primary card fills, active menu background selections.

### Secondary Palette (Rehabilitation & Clinical Progress)
- **Teal 700 (`#0F766E`):** Medical progress markers, active therapeutic plans, recovery highlights.
- **Teal 600 (`#0D9488` - Accent Base):** Primary positive actions, session starts, successful exercise confirmations.
- **Teal 500 (`#14B8A6`):** Secondary accents, session timelines, chart plots.
- **Teal 100 (`#CCFBF1`):** Badges indicating progress, physiotherapy completed states, restorative chips.

### Functional & Status Spectrum (Klinik Durumları)
- **Tamamlandı (Success):** Emerald (`#059669` fill, `#ECFDF5` surface, `#10B981` border).
- **Beklemede (Warning / Scheduled):** Amber (`#D97706` fill, `#FFFBEB` surface, `#F59E0B` border).
- **Seans Başladı / Aktif (Active Pulse):** Teal/Cyan (`#0D9488` fill, `#F0FDFA` surface, `#14B8A6` border).
- **İptal Edildi / Kritik (Destructive):** Crimson/Rose (`#E11D48` fill, `#FFF1F2` surface, `#FB7185` border).
- **Değerlendirme Bekliyor (Evaluation):** Indigo (`#4F46E5` fill, `#EEF2FF` surface, `#818CF8` border).

### Neutral & Surface Hierarchy
- **Canvas / App Background (`#F8FAFC`):** Deep soft slate; prevents eye strain during shifts under clinical fluorescent lighting.
- **Card Surface (`#FFFFFF`):** Pure clinical white for elevation contrast.
- **Subtle Surface (`#F1F5F9`):** Input containers, inactive cards, table headers.
- **Borders & Dividers (`#E2E8F0`):** Hairline structure with 1px boundaries.
- **Text Muted (`#64748B`):** Metadata, subtext, patient protocols.
- **Text Strong (`#0F172A`):** Core diagnostic data, patient names, numerical readings.

## Typography

**Plus Jakarta Sans** provides rounded yet disciplined geometries that convey both modern software polish and humane medical attention.

### Font Implementation Guidelines
- **Turkish Diacritics Support:** Fully native rendering for character sets (`ç, ğ, ı, İ, ö, ş, ü`).
- **Tabular Figures:** For measurements (ROM - Hareket Açıklığı, VAS Ağrı Ölçeği skoru, seans süreleri, seans ücretleri), enable `font-variant-numeric: tabular-nums` to guarantee strict vertical column alignment across medical tables.
- **Hierarchy Rules:** 
  - Section titles (`Panel`, `Randevular`, `Hasta Dosyası`) use `headline-md` or `headline-lg` with tracking tightened to `-0.015em`.
  - Clinical labels and badge texts employ `label-sm` and `label-md` with slight uppercase transforms or heightened medium/semi-bold weight for instantaneous triage scanning.

## Layout & Spacing

The layout model is anchored on an **8pt Base Grid Rhythm** using a multi-pane responsive workspace architecture to manage dense medical multi-tenancy.

### Spatial Breakpoints & Structure
- **Desktop Layout (≥1280px):**
  - **Left Rail (Persistent Sidebar):** `17.5rem` (`280px`). Hosts tenant/clinic switcher, primary module navigation (`Panel`, `Hastalar`, `Randevular`, `Terapistler`, `Tedavi Planı`, `Paketler`, `Raporlar`).
  - **Top Clinical Bar:** `4.25rem` (`68px`). Houses branch selection, active session counters, global patient search (`Hasta veya TC No ara...`), and practitioner profile.
  - **Main Work Surface:** Dynamic fluid grid using 12 columns with `1.5rem` gutters and `2rem` outer page padding.
- **Tablet Layout (768px – 1279px):**
  - Sidebar collapses to an iconified mini-rail (`5rem` / `80px`).
  - Tables convert to scrollable horizontal structures or stacked summary cards for treatment exercises.
- **Mobile Handheld (<768px):**
  - Bottom navigation bar containing 4 primary triggers (`Panel`, `Randevu`, `Hastalar`, `Menü`).
  - Modal sheets replace nested multi-column flyouts.

### Density Tiers
- **Clinical Dense:** `0.5rem` – `0.75rem` padding inside tabular grids, scheduling timeline slots, and exercise set repetitions.
- **Comfort Workspace:** `1.25rem` – `1.5rem` padding inside patient case histories, SOAP (Subjektif, Objektif, Değerlendirme, Plan) assessment documentation cards, and intake forms.

## Elevation & Depth

To preserve clinical focus and reduce visual noise, this system discards aggressive, dark drop shadows. Instead, it utilizes **layered ambient light, tinted boundary lines, and pure white planes**.

### Depth Layers
1. **Z0 (Canvas Base):** Slate tinted ground (`#F8FAFC`). Recessed, non-clickable context.
2. **Z1 (Cards, Worksheets & Tables):** Surface `#FFFFFF` with a 1px border of `#E2E8F0` and an ultra-diffused floor shadow: `0 1px 3px rgba(15, 23, 42, 0.04), 0 4px 12px -2px rgba(15, 23, 42, 0.03)`.
3. **Z2 (Dropdowns, Patient Hover Peek, Active Filters):** Elevated surface `#FFFFFF`, 1px border `#CBD5E1`, elevated shadow: `0 10px 25px -5px rgba(30, 64, 175, 0.08), 0 8px 10px -6px rgba(15, 23, 42, 0.04)`.
4. **Z3 (Modals, Seans Başlat Dialogs, Anatomy Mapping Overlays):** Surface `#FFFFFF`, shadow: `0 20px 35px -8px rgba(15, 23, 42, 0.16), 0 1px 3px rgba(15, 23, 42, 0.06)`. Backdropped by a soft frosted slate overlay (`rgba(15, 23, 42, 0.35)` with `backdrop-filter: blur(4px)`).

### Clinic Status Ambient Glows
Active treatment sessions feature a soft outer glow rather than a harsh border:
- **Aktif Seans:** Box-shadow `0 0 0 3px rgba(20, 184, 166, 0.20)`.

## Shapes

The design uses **Rounded Level 2** to soften technical and clinical interaction points without feeling childish or imprecise.

### Token Shape Application
- **Default Core Controls (`0.5rem` / `rounded-md` equivalent):** Form inputs, dropdown triggers, table row action buttons, date pickers.
- **Containers & Surfaces (`1rem` / `rounded-lg` equivalent):** Patient medical record modules, agenda session blocks, invoice blocks.
- **Featured Hero Cards & Modals (`1.5rem` / `rounded-xl` to `rounded-2xl` equivalent):** Clinic overview cards, anatomy body chart selectors, multi-step intake dialogs.
- **Pills (`9999px` / `rounded-full`):** Medical badges, operational tags, treatment step indicators, therapist availability avatars.

## Components

### 1. Primary, Secondary & Clinical Action Buttons
- **Primary ("Yeni Randevu", "Tedavi Planı Oluştur"):** `#1E40AF` background, crisp white text, `0.5rem` corner radius, `0.625rem 1.25rem` padding. Subtle hover to `#1D4ED8` with `0 2px 8px rgba(30, 64, 175, 0.25)`.
- **Procedural / Clinical ("Seansı Başlat"):** Brand teal `#0D9488` background, white text, smooth transition to `#0F766E` on hover.
- **Secondary / Ghost ("İptal", "Geri Dön"):** `#FFFFFF` background, `1px solid #E2E8F0`, `#334155` label text. Hover sets background to `#F8FAFC` and border to `#CBD5E1`.

> **Implementation note (2026-09-08):** the literal Teal 600 `#0D9488` + white-text pairing above fails WCAG AA text contrast (3.74:1 light / 2.49:1 dark — verified by calculation, not just Primary but every teal shade with white text fails in dark mode). Deviation approved by the client: the **clinical dolu buton zemini** (filled button/active-nav fill role) uses **Teal 700 `#0F766E`** in light mode (5.47:1) and **Teal 500 `#14B8A6` with dark `#0F172A` text** in dark mode (7.17:1) instead of white. Teal 600 `#0D9488` is kept as the **accent** role (progress bars, active-session ring, icon tint, chart plot — anything that doesn't carry text), matching this section's own "accent base" framing.

### 2. Status Chips & Medical Badges (Durum Rozetleri)
Constructed with pill radii (`rounded-full`), `0.25rem 0.75rem` spacing, bold `label-sm` typography, and an optional leading 6px pulsing dot:
- **Tamamlandı:** Background `#ECFDF5`, text `#065F46`, border `#A7F3D0`.
- **Beklemede:** Background `#FFFBEB`, text `#92400E`, border `#FDE68A`.
- **Seans Başladı:** Background `#F0FDFA`, text `#0F766E`, border `#99F6E4`, with a live pulsing `#14B8A6` circular status light.
- **Gelmedi (No-show):** Background `#FFF1F2`, text `#9F1239`, border `#FECDD3`.

### 3. Patient Dossier & Tabular Lists (Hasta Listesi & Tablolar)
- **Header:** Background `#F8FAFC`, uppercase `label-xs` text (`#64748B`), bottom border `1px solid #E2E8F0`.
- **Rows:** White background, minimum height `56px` to enable easy touch interaction on medical tablet carts. Hover transitions row to `#F8FAFC`.
- **Columns:** Patient avatar with initials, Full Name (`label-lg`), Protocol Number (tabular, `#64748B`), Assigned Physiotherapist, Treatment Target (e.g., *Lomber Disk Hernisi*), Progress Bar (Teal indicator), Status Chip, and inline action icon buttons.

### 4. Input Fields & Clinical Forms
- **Resting:** `#FFFFFF` background, border `1px solid #CBD5E1`, text `#0F172A`, placeholder `#94A3B8`. Border radius `0.5rem`.
- **Focus:** Outline zero, border `1px solid #3B82F6`, ring `3px solid rgba(59, 130, 246, 0.15)`.
- **Medical Validation State:** Form errors glow with `3px solid rgba(225, 29, 72, 0.12)` with `#E11D48` helper text below.

### 5. Physiotherapy-Specific Cards (Tedavi Planı & Egzersiz Kartları)
- **Exercise / Therapy Card:** Surface `#FFFFFF` with `1rem` radius. Displays thumbnail or 3D diagram marker of movement, exercise title (*Kifoz Düzeltme Egzersizi*), repetition count (*3 Set x 12 Tekrar*), equipment required (*Theraband Mavi*), and a checkbox for clinician sign-off.
- **Pain & Mobility Tracker (VAS Skor Kartı):** Visual discrete horizontal track from 0 (Ağrısız - Green) to 10 (Dayanılmaz Ağrı - Crimson) with tactile clickable step nodes.

### 6. Multi-Tenant Clinic Switcher (Klinik / Şube Değiştirici)
Located in the primary sidebar header:
- Surface container with soft rounded border (`0.5rem`). Displays the active branch name (*Kadıköy Şubesi - Fizyoterapi Bölümü*), tenant license level badge, and a contextual quick switch dropdown menu.