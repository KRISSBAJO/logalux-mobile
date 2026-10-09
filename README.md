# LogaLuxe mobile

One app for both sides: people who book, and the businesses they book with. Built with Expo
(SDK 57, React Native 0.86, Expo Router). It talks to the same API as the web apps.

## Run it

```bash
npm install
npm run web        # in a browser, at http://localhost:8097
npx expo start     # on a phone with Expo Go, or in a simulator
```

Copy `.env.example` to `.env` and set the two addresses. On a phone, `localhost` means the phone,
so point `EXPO_PUBLIC_API_URL` at the computer's network address or at the deployed API. The API
must also allow the address the app is served from (`CORS_ORIGIN` in `logaluxe-be/.env`); that
only matters in a browser.

Check the types with `npx tsc --noEmit`.

## What is in it

Client side (`/client/*` tabs, other screens under `/c/*`):

- Home, search with filters, and a business page with services, team, reviews and details
- Booking: choose a person and a time, join a waitlist, answer the business's questions, book
  for someone else, promo codes, pay the deposit, repeat a visit
- Bookings: upcoming and past, reschedule, cancel, add to calendar, tip, review, report a problem
- Inbox and chat with a business
- Account: details and password, saved businesses and products, wallet and store credit

Business side (`/business/*` tabs, other screens under `/m/*`). Every tool a business has on the web is in the app:

- Today, with the day's bookings and each step of a visit (check in, start, finish)
- Calendar by day, week and staff, with blocked time; new booking for a call or a walk-in
- Checkout: services, products, tips, discounts, promo codes, points, pay links
- Clients with history and notes, the waitlist, and the inbox (messages and problem reports)
- Profile and portfolio: what clients read, logo, photos from the phone, reviews and replies, QR code and website button
- Staff and chairs: the team, each person's services, hours, breaks, time off, pay, chair rental, rooms, sign-ins and roles, and the week's roster
- Inventory: products, stock changes and counts, suppliers, purchase orders; online orders step by step; returns
- Marketing: campaigns, automatic messages, promo codes, loyalty points, and the new clients LogaLuxe brought with what each cost
- Money: balance, payout account, monthly statements, plan and billing, reports with charts
- Services, packages, memberships, pricing rules, questions at booking, hours and policies
- Settings: business details, locations, tax, booking page rules, notifications, two-step sign-in, calendar sync
- Sign-up and the setup checklist, including verification documents

## How it is put together

- `src/app/` holds the routes. Files in `client/` and `business/` are tabs; everything else opens above the tabs.
- `src/lib/session.tsx` keeps the two sign-ins (client and business) in the phone's secure storage.
- `src/lib/api.ts` is the one place that calls the API. `src/lib/theme.ts` holds colours and fonts.
- `src/components/ui.tsx` is the shared kit. Files with a two-letter prefix (`ca-` to `cc-` for the client side, `ma-` to `mi-` for the business side) belong to one group of screens.
- `design/` holds the designs the screens were built from.

## Things to know

- Sign-in is by email and password, and by a texted code once an admin switches that on in the console (Features). Texts, WhatsApp, the Apple Pay and Google Pay note and saved cards appear in the app only while switched on; the app reads `GET /v1/features` on every screen focus.
- A new person sees a welcome screen once, then the client home; a business person signs in from it.
- Where the person is comes from the API's first guess (`GET /v1/locate`, from the device's internet address), and is shown as a guess until they choose a place or press "Use my exact location". Every list is their own country, nearest first; a switch in the place panel browses the other country with a banner. On web, `localStorage.lx_dev_ip = "102.89.23.4"` tries the Lagos guess in development. Native foreground location uses SDK-compatible `expo-location`, only after Use my exact location. Denial, disabled services and a 12-second timeout keep manual place selection available. Rebuild the native app after adding the permission plugin; no background location is requested.
- Payment happens on Stripe's or Paystack's own page, opened in the phone's browser. The app never sees a card.
- Bank details are entered on the provider page (Stripe), or for Nigeria exactly as the web does it. Only help pages open the website.
- Spreadsheet exports are shared as text on a phone; sharing a real file needs `expo-sharing` and `expo-file-system`.
- There are no push notifications yet. They need an Expo account and Apple and Google developer accounts, as do builds for phones and the stores.

### Customer mobile safety and account controls

- Account changes remount private screens. Resource loads hide old-account/old-route data and ignore stale responses. Network requests time out after 25 seconds, including response-body reads. A customer 401 clears the matching session only.
- Bookings use server pagination (12 per page); owned detail and review screens fetch by ID, including visits older than the first history page. Elapsed active visits say Awaiting business update.
- Account offers native order history, payment links and shipment progress, privacy export, signed-in devices and account deletion with explicit confirmation. The API enforces ownership and deletion blockers. Shop browsing/checkout opens on the website through a two-minute, single-use account handoff. The browser explicitly confirms the app account; long-lived native tokens never enter URLs. Signing out the source session invalidates unused links.
- Phone-only accounts can add an email in Details, save it, then set a password. Existing-password changes still require the current password.
- Booking request IDs are saved in encrypted device storage before sending. Retrying after a disconnect reuses the same account-scoped ID. The API uniquely stores that ID with the booking and rejects changed payloads; it replays the original booking instead of making another.
- `npm run test:customer-safety` exercises old-account response isolation, route changes, failure/retry state, sign-out, request timeout and body-read disconnections. Backend security tests exercise older owned booking details, privacy controls and foreign-account rejection in disposable databases.
- Native location prompts, share sheet, payment return and accessibility still need checks on real iOS/Android devices. An Android JavaScript export is not an installed-device test.

Verification (2026-10-08): TypeScript and lint for the changed customer screens/shared session loader pass. Android JavaScript/Hermes export succeeds. Disposable-database security regressions pass, including old-booking detail ownership. The full-app lint sweep is clean, with the checks enabled. New authenticated order/privacy layouts and native OS interactions need a signed-in real-device acceptance pass before launch. Production seeded records were not edited by these tests.


### Completion checks (2026-10-08)

- Full Expo lint and mobile/web TypeScript checks; customer safety and signed-in screen regression tests.
- `node scripts/tests/customer-screens.cjs`: orders pagination/filter/failure/retry, privacy export, device revocation, deletion confirmation and guest gates.
- Disposable-database tests cover booking replay ownership, single-use/expired/revoked browser handoffs and separate USD/NGN credit balances. No seeded records are changed.
- Account overview, wallet and checkout keep dollar and naira balances separate; the browsing country selects the primary display. Actual bookings and purchases retain the seller's currency. Referral awards remain explicitly USD.
- Android and iOS JavaScript/Hermes bundles export. No physical device was attached (`adb devices` empty). Native permission prompts, installed-app payment returns, sharing and screen-reader behaviour remain real-device acceptance checks.
