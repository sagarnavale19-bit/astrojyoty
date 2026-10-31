# Jyotish Seva

The deployed site serves `public/` and uses Netlify Functions, Netlify Identity, Netlify Database (Postgres), and Netlify Blobs for private receipts and payment QR images. Database migrations apply automatically during deployment.

## First owner login

1. Open Customer Login and create an account using **umesh_jotkar@rediffmail.com**. Choose your own password and supply your name and phone number.
2. Confirm the email using the link in your inbox.
3. Click the site brand five times, or press **Alt+Shift+O**, to open Owner Login. Sign in with that email and your password.
4. Publish available dates and slots. Set your UPI details, service prices, and business contact information in the owner dashboard.

The server grants owner access only to the confirmed owner email. Passwords are managed by Netlify Identity. Customers must confirm their email and sign in to create bookings or access their records. The account screen includes email-based password recovery.

## Synchronization

Profiles, up to six family members per account, bookings, report titles/notes, availability, prices, and public settings persist in Postgres. Writes are immediate; active pages refresh from the server every 15 seconds. Server checks isolate each customer's records. Version checks reject conflicting changes rather than silently overwriting them, and a database constraint prevents duplicate reservations for a slot. Failed writes show an error and reload the saved state so changes can be re-entered.

Payment proofs are private files served through an authenticated endpoint. The owner verifies manual payments. Payment gateway integration is deferred. Report sharing currently syncs report titles and notes; it does not upload or email report documents.

Old browser-only demo records are not imported because their account ownership cannot be verified. The application clears its legacy browser records and plaintext demo credentials when the new account interface loads.

## Development checks

Run `npm ci`, `npm test`, and `npm run check`. Use `netlify dev --port 8889` for platform-aware local development. Deployment handles database provisioning and migrations; do not apply migrations manually.
