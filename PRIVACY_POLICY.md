# Privacy Policy — RUT Cleaner Chile

**Last updated: April 20, 2026**

## 1. Introduction

RUT Cleaner Chile ("the Add-on", "we", "us") is a Google Sheets editor add-on that validates, normalizes, and deduplicates Chilean RUT (Rol Único Tributario) numbers in bulk. This Privacy Policy explains what data we access, how we use it, and your rights regarding that data.

## 2. Data We Access and Process

The Add-on accesses the following data **only within the currently active Google Spreadsheet**:

| Data type | Purpose | Storage location |
|-----------|---------|------------------|
| Cell values from user-selected columns | Validate and normalize RUT numbers | Processed in memory; results written back to the same spreadsheet |
| Job state (cursor position, row counts, timestamps) | Enable pause/resume of batch processing | Google Apps Script Document Properties (bound to the spreadsheet) |
| User preferences (last used column settings) | Convenience for returning users | Google Apps Script User Properties (per user, per script) |
| User email address | Determine license plan (Free/Trial/Pro) | Compared against Script Properties; never transmitted externally |
| Operational logs (event name, row counts, timestamps) | Diagnose errors and measure performance | Google Cloud Logging (Stackdriver); optionally in a hidden sheet |

### 2.1 Data We Do NOT Collect

- We do **not** collect, store, or transmit personal identification data beyond what is described above.
- We do **not** access spreadsheets other than the one currently open.
- We do **not** use any data for advertising, profiling, or analytics purposes unrelated to the Add-on's operation.
- We do **not** share, sell, or rent user data to any third party.

## 3. OAuth Scopes

The Add-on requests the minimum scopes necessary:

| Scope | Justification |
|-------|---------------|
| `spreadsheets.currentonly` | Read input RUT values and write validation results in the active spreadsheet |
| `script.container.ui` | Display the sidebar panel for user interaction |

We do **not** request broad access to all spreadsheets or any scopes beyond what is strictly required.

## 4. Data Storage and Retention

- **Spreadsheet results**: Remain in the user's spreadsheet under the user's full control. The Add-on does not maintain a separate copy.
- **Job state and preferences**: Stored in Apps Script Properties tied to the specific document and user. These can be cleared at any time using the "Limpiar estado de proceso" menu option.
- **Operational logs**: Retained according to Google Cloud Logging default retention policies (30 days). Optional sheet-based logs can be deleted by removing the hidden `_RUTCLEANER_LOGS` sheet.

## 5. Data Sharing

We do not share any data with third parties. If the optional paid plan (Pro) is activated through a payment provider (e.g., Stripe), the payment provider handles billing data according to their own privacy policy. The Add-on only receives a confirmation of license status; it does not process payment card information.

## 6. Security Measures

1. Minimum OAuth scopes to limit access surface.
2. All processing occurs within Google's Apps Script infrastructure.
3. Administrative API endpoints are protected by secret token authentication.
4. No sensitive data (RUT values, personal information) is included in operational logs.

## 7. Children's Privacy

The Add-on is not directed at individuals under 13 years of age. We do not knowingly collect data from children.

## 8. Your Rights

You have the right to:

- **Access**: View all data the Add-on has stored by inspecting your spreadsheet and Apps Script Properties.
- **Deletion**: Remove all Add-on data by clearing Script/Document Properties and deleting output columns.
- **Revoke access**: Remove the Add-on from your Google account at any time via [Google Account Permissions](https://myaccount.google.com/permissions).

For any data-related requests, contact us at the address below.

## 9. Changes to This Policy

We may update this Privacy Policy from time to time. Changes will be reflected in the "Last updated" date above. Continued use of the Add-on after changes constitutes acceptance.

## 10. Contact

- **Provider**: Nicolas Andres Soto Castro
- **Email**: nicolas.soto.c.99@gmail.com
- **Website**: https://nicsoto.github.io/rut_sheets_addon/
