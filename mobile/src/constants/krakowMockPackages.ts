/**
 * Kraków QA mock APKs (built from C:\Users\dan1\MockApps\KrakowMocks\dist).
 *
 * Production-ID mocks reuse real applicationIds so DriveMind routes them like Uber/Bolt.
 * Alternate Guessxx mock IDs are matched via `isMockOrTestPackage()` in Kotlin + TS.
 *
 * | APK file           | applicationId (typical)     | Variant    |
 * |--------------------|-----------------------------|------------|
 * | UberDriverMock.apk | com.ubercab.driver          | uberdriver |
 * | BoltDriverMock.apk | com.bolt.driver / ee.mtakso | boltdriver |
 * | BoltFoodMock.apk   | com.bolt.delivery           | boltfood   |
 * | *Mock*.apk         | com.guessxx.mock.*          | dev QA     |
 */
export const KRAKOW_MOCK_PACKAGES = {
  uber: 'com.ubercab.driver',
  bolt: 'com.bolt.driver',
  boltMtakso: 'ee.mtakso.driver',
  boltFood: 'com.bolt.delivery',
} as const

export const KRAKOW_MOCK_PACKAGE_LIST = Object.values(KRAKOW_MOCK_PACKAGES)

/** Example PL notification bodies from KrakowMocks/src/i18n/translations.ts */
export const KRAKOW_MOCK_NOTIFICATION_SAMPLES = {
  uber: 'Nowe żądanie: UberX (35,15 zł). Do klienta 3.2 km (10 min).',
  bolt: 'Nowa przejazdka: 42,80 zł. Podjazd: 0.8 km.',
  boltFood: 'Nowe zamówienie: 21,50 PLN. Restauracja: Galeria Krakowska. Dostawa: 4.2 km.',
} as const
