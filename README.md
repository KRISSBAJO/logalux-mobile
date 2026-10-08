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
- Where the person is comes from the API's first guess (`GET /v1/locate`, from the device's internet address), and is shown as a guess until they choose a place or press "Use my exact location". Every list is their own country, nearest first; a switch in the place panel browses the other country with a banner. On web, `localStorage.lx_dev_ip = "102.89.23.4"` tries the Lagos guess in development. Exact location on a phone needs `expo-location` (one marked line in `src/lib/ca-place.ts`); until it is added the app says so.
- Payment happens on Stripe's or Paystack's own page, opened in the phone's browser. The app never sees a card.
- Bank details are entered on the provider page (Stripe), or for Nigeria exactly as the web does it. Only help pages open the website.
- Spreadsheet exports are shared as text on a phone; sharing a real file needs `expo-sharing` and `expo-file-system`.
- There are no push notifications yet. They need an Expo account and Apple and Google developer accounts, as do builds for phones and the stores.
