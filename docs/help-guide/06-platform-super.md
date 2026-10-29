# Platform (super user only)

## Tenants

**Tenants** lists organizations on the platform. **Add tenant** creates one. Use the ⋮ menu in the first column to **Edit** a tenant (name, slug, internal domains) or **Switch to** it and load its data. Changing the slug also changes the tenant’s email capture address (slug@in.…). Super users pick the active tenant from the top bar tenant dropdown when they have more than one.

### Modules

**Modules** are optional parts of the app, switched on per tenant with the checkboxes in **Add tenant** or **Edit**. The **Modules** column lists what each tenant has. When a module is off, its menu items, role options, Settings sections and pages are hidden for that tenant (admins included), and its public pages stop working. Turning a module off keeps its data. The modules are **Bookings** (Bookings, booking types, public booking pages and Google Calendar; new tenants start with it on) and **Care** (Intake, Care profiles and public Care links; see the Care topic). A tenant with Care on starts with an empty Intake form and Care profile.

## Guide setup

**Guide setup** configures **JD**, the in-app Back Office guide:

1. Choose **Provider** (Anthropic, OpenAI, or Gemini)
2. Enter exact **Model** ID (e.g. `claude-sonnet-4-5`)
3. Paste **API key** (required first time; leave blank on later saves to keep existing key)
4. **Save & test connection**

After configuration, all back-office users see **JD** at the bottom-left of the screen.
