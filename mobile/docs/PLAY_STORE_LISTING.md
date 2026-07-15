# Google Play Store listing — AccessibilityService + Background Location disclosure

DriveMind was rejected twice for the same class of issue: the **long description**
did not document use of restricted/sensitive APIs — first **AccessibilityService**,
then **ACCESS_BACKGROUND_LOCATION**. The in-app prominent disclosures for both are
already implemented in code; Play requires the **same transparency on the public
store listing**, not just at runtime.

Use the text below in **Play Console → Grow → Store presence → Main store listing**
(Polish is the primary locale for *DriveMind: Asystent kierowcy*).

Also complete:
- **App content → Sensitive app permissions → Accessibility API** (declare not for
  users with disabilities, attach demo video).
- **App content → Sensitive app permissions → Location → Background location** —
  declare the use case ("automatic trip tracking, route profit calculation, and
  smart widget updates while the app is closed or in the background") and attach a
  screen recording of the in-app disclosure screen followed by the system
  "Allow all the time" dialog.

See the checklist at the end for the full resubmission flow.

---

## Short description (PL) — max 80 characters

Optional refresh; long description is the required fix.

```
Asystent kierowcy: rentowność zleceń. Używa Usługi Dostępności (tylko odczyt).
```

---

## Long description (PL) — paste into Play Console

```
DriveMind: Asystent kierowcy pomaga kierowcom i kurierom oceniać opłacalność zleceń w czasie rzeczywistym — cena, dystans, czas i koszty trasy — bez przełączania między aplikacjami. Aplikacja pokazuje wynik rentowności na ekranie głównym oraz w pływającym widżecie podczas pracy w aplikacjach partnerskich.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OŚWIADCZENIE: USŁUGA DOSTĘPNOŚCI (ACCESSIBILITYSERVICE API)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DriveMind NIE jest aplikacją wsparcia dla osób z niepełnosprawnościami i nie używa flagi isAccessibilityTool.

Aplikacja korzysta z systemowej Usługi Dostępności Android (AccessibilityService API / API Usługi Dostępności) wyłącznie w następujący sposób:

• Odczyt widocznych na ekranie szczegółów aktywnego zlecenia z aplikacji kierowcy/kuriera działających na pierwszym planie: cena, dystans, adres odbioru i adres dostawy.
• Obsługiwane aplikacje: Uber Driver, Bolt Driver, Glovo Courier, Wolt Courier (oraz powiązane aplikacje dostawcze z listy w konfiguracji usługi).
• Odczytane dane są używane natychmiast do obliczenia rentowności trasy i wyświetlenia wyniku w DriveMind oraz w nakładce (overlay) — aby użytkownik mógł podjąć decyzję bez ręcznego przepisywania danych.

Czego DriveMind NIE robi (zgodnie z zasadami Google Play dla Accessibility API):
• Nie wykonuje dotknięć, gestów ani żadnych automatycznych akcji w innych aplikacjach (tryb wyłącznie do odczytu).
• Nie zmienia ustawień użytkownika bez jego wiedzy i nie blokuje odinstalowania aplikacji.
• Nie omija wbudowanych kontroli prywatności Androida.
• Nie nagrywa audio połączeń zdalnych.
• Nie służy do reklam, profilowania ani sprzedaży danych ekranu stronom trzecim.

Ujawnienie w aplikacji (prominent disclosure):
Przed pierwszym skierowaniem do ustawień systemowych użytkownik widzi w aplikacji pełny ekran ujawnienia Usługi Dostępności (co jest odczytywane, po co, gdzie przetwarzane dane). Usługa jest włączana wyłącznie ręcznie przez użytkownika w Ustawieniach Androida i może być w każdej chwili wyłączona.

Przetwarzanie danych:
Dane zleceń odczytane przez Usługę Dostępności są przetwarzane lokalnie na urządzeniu w celu obliczenia rentowności. Do chmury przekazywane są wyłącznie minimalne dane konta, status subprypcji i preferencje nawigacji (Firebase, Google Maps Platform) — zgodnie z Polityką prywatności.

Polityka prywatności: https://telegra.ph/Privacy-Policy-for-DriveMind-04-25
Regulamin: https://telegra.ph/DriveMind--App-Audit--Terms-of-Service-06-08

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OŚWIADCZENIE: LOKALIZACJA W TLE (ACCESS_BACKGROUND_LOCATION)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DriveMind zbiera dane o lokalizacji w tle, aby umożliwić automatyczne śledzenie trasy zlecenia, obliczanie rentowności trasy w czasie rzeczywistym oraz aktualizacje interaktywnego widżetu, nawet gdy aplikacja jest zamknięta lub nieużywana.

• Lokalizacja w tle jest używana WYŁĄCZNIE podczas aktywnej zmiany/trasy (po ręcznym uruchomieniu śledzenia przez kierowcę/kuriera) — nie jest zbierana stale w tle poza aktywną pracą.
• Dane trasy służą do wyliczenia dystansu, czasu i rentowności zlecenia oraz do aktualizacji widżetu na ekranie głównym; nie są sprzedawane ani wykorzystywane do reklam.
• Przed wyświetleniem systemowego okna "Zawsze zezwalaj" użytkownik widzi w aplikacji pełnoekranowe ujawnienie z dokładnym opisem celu i może odmówić (funkcje wymagające lokalizacji w tle zostają wtedy wyłączone, resztę aplikacji można używać normalnie).
• Lokalizację w tle można wyłączyć w każdej chwili w Ustawieniach Androida (Aplikacje → DriveMind → Uprawnienia → Lokalizacja).

Polityka prywatności: https://telegra.ph/Privacy-Policy-for-DriveMind-04-25

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Inne uprawnienia (skrót):
• Dostęp do powiadomień — odczyt szczegółów zlecenia z powiadomień kierowcy (uzupełnienie odczytu ekranu).
• Nakładka nad innymi aplikacjami — wyświetlanie widżetu rentowności podczas przeglądania ofert.
• Lokalizacja (pierwszoplanowa i w tle) — nawigacja, szacowanie trasy i automatyczne śledzenie zlecenia podczas aktywnej zmiany (szczegóły powyżej).

DriveMind jest narzędziem produktywności dla aktywnych kierowców i kurierów, a nie aplikacją ułatwień dostępu w rozumieniu systemowym.
```

---

## Long description (EN) — optional second locale

```
DriveMind: Driver Assistant helps couriers and drivers evaluate order profitability in real time — fare, distance, time, and route costs — without switching apps. Results appear on the home screen and in a floating widget while you work in partner driver apps.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DISCLOSURE: ACCESSIBILITYSERVICE API
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DriveMind is NOT an accessibility app for people with disabilities and does not use the isAccessibilityTool flag.

The app uses the Android Accessibility Service API solely to:

• Read visible on-screen details of the active order from supported courier/driver apps in the foreground: price, distance, pickup address, and delivery address.
• Supported apps include Uber Driver, Bolt Driver, Glovo Courier, and Wolt Courier (and related delivery apps listed in the service configuration).
• Read data is used immediately to calculate route profitability and show the result in DriveMind and in the overlay widget.

What DriveMind does NOT do (per Google Play Accessibility API policy):
• No taps, gestures, or automated actions in other apps (read-only).
• Does not change user settings without consent or prevent uninstallation.
• Does not bypass Android privacy controls.
• Does not record remote call audio.
• Screen data is not sold or used for ads.

In-app prominent disclosure:
Before the user is sent to system settings, DriveMind shows a full disclosure screen explaining what is read, why, and how data is processed. The service is enabled only manually by the user in Android Settings and can be disabled at any time.

Data processing:
Order data read via the Accessibility Service is processed locally on the device for profitability calculation. Only minimal account data, subscription status, and navigation preferences are sent to the cloud (Firebase, Google Maps Platform) per our Privacy Policy.

Privacy Policy: https://telegra.ph/Privacy-Policy-for-DriveMind-04-25
Terms of Service: https://telegra.ph/DriveMind--App-Audit--Terms-of-Service-06-08

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DISCLOSURE: BACKGROUND LOCATION (ACCESS_BACKGROUND_LOCATION)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DriveMind collects background location data to enable automatic trip tracking, route profit calculation, and smart widget updates even when the app is closed or not in use.

• Background location is used ONLY during an active shift/trip (started manually by the driver/courier) — it is not collected continuously outside active work.
• Route data is used to calculate distance, time, and order profitability, and to update the home-screen widget; it is never sold or used for advertising.
• Before the system "Allow all the time" dialog appears, the user sees a full-screen in-app disclosure explaining exactly why background location is needed, and can decline (features requiring background location are then disabled; the rest of the app remains usable).
• Background location can be revoked at any time in Android Settings (Apps → DriveMind → Permissions → Location).

Privacy Policy: https://telegra.ph/Privacy-Policy-for-DriveMind-04-25
```

---

## Resubmission checklist

1. **Main store listing (PL)** — replace **Long description** with the Polish block above (now includes both the AccessibilityService AND Background Location disclosures).
2. **App content → Accessibility API** — declare **not** primarily for users with disabilities; paste the same purpose/data-use summary.
3. **App content → Sensitive app permissions → Location** — declare `ACCESS_BACKGROUND_LOCATION` usage with the exact wording used in the in-app modal ("DriveMind collects background location data to enable automatic trip tracking, route profit calculation, and smart widget updates even when the app is closed or not in use."). Answer "yes" that a prominent in-app disclosure is shown before the permission request.
4. **Demo video(s)** — upload screen recordings showing:
   - onboarding / prominent disclosure modal (`disclosure_modal_*` strings),
   - **Accessibility**: opening the in-app AccessibilityService disclosure → tapping Continue → Android Accessibility settings → enabling the service → opening a driver app and seeing the profitability overlay.
   - **Background location**: opening the in-app Background Location disclosure modal → tapping Accept → the system "Allow all the time" dialog appearing.
   Attach the video URL(s) in the respective sensitive-permission declarations (required on each submission).
5. **Privacy policy** — ensure https://telegra.ph/Privacy-Policy-for-DriveMind-04-25 explicitly mentions (a) Accessibility Service read-only screen parsing and (b) background location collection/purpose/retention; update the Telegraph page if either is missing.
6. **Publishing overview** — this round also ships a new binary (crash fix + edge-to-edge/large-screen/bitmap fixes + both disclosure flows), so upload the new AAB (`versionCode 57` / `1.0.57`) together with the listing changes — do not submit listing-only.

Both disclosures (Accessibility + Background Location) are already implemented and verified in-app (see `AccessibilityServiceDisclosureModal.tsx` / `BackgroundLocationDisclosureModal.tsx`); this listing update brings the public description in line with what the app actually discloses at runtime, per Google Play policy — https://telegra.ph/Privacy-Policy-for-DriveMind-04-25 should match too.
