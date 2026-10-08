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

Business side (`/business/*` tabs, other screens under `/m/*`):

- Today, with the day's bookings and each step of a visit (check in, start, finish)
- Calendar by day, week and staff, with blocked time
- New booking for a call or a walk-in
- Checkout: services, products, tips, discounts, promo codes, points, pay links
- Clients, with history and notes
- Inbox: messages and problem reports
- Money, services, hours and policies, calendar sync, sharing the booking link
- Sign-up and the setup checklist, including verification documents

## How it is put together

- `src/app/` holds the routes. Files in `client/` and `business/` are tabs; everything else opens above the tabs.
- `src/lib/session.tsx` keeps the two sign-ins (client and business) in the phone's secure storage.
- `src/lib/api.ts` is the one place that calls the API. `src/lib/theme.ts` holds colours and fonts.
- `src/components/ui.tsx` is the shared kit. Files with a two-letter prefix (`ca-`, `cb-`, `cc-`, `ma-`, `mb-`, `mc-`) belong to one group of screens.
- `design/` holds the designs the screens were built from.

## Things to know

- Sign-in is by email and password. The designs show a texted code; texts are switched off in this product for now.
- Payment happens on Stripe's or Paystack's own page, opened in the phone's browser. The app never sees a card.
- Some business tools open on the website: profile and photos, staff, inventory, marketing, reports, payouts.
- There are no push notifications yet. They need an Expo account and Apple and Google developer accounts, as do builds for phones and the stores.
