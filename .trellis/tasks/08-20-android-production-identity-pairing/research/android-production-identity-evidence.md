# Android production identity evidence

## 2026-08-20 implementation findings

- Gradle 9.3.1 cannot evaluate React Native 0.85.3's pinned Foojay resolver 0.5.0 because the obsolete `IBM_SEMERU` vendor metadata no longer exists. A tracked pnpm patch updates only that resolver convention to 1.0.0.
- Gradle's React Native included build does not reliably inherit installation paths from generated `android/gradle.properties`; the repository build wrapper must pass `M2Y_JAVA_17_HOME` as a Gradle system property while Gradle itself runs on JDK 21.
- Android SQLite treats `PRAGMA busy_timeout` as a query. `execSQL` fails on current Android with “Queries can be performed using query or rawQuery methods only”; the production helper uses `rawQuery` and closes the cursor.
- Android's `org.json` stringifies an immutable Java `List<Map<...>>` passed to `JSONObject.put`. Registration retry therefore requires constructing nested `JSONArray` and `JSONObject` values explicitly.

## Evidence run

- `:m2y-crypto:testDebugUnitTest`: passed after production identity compilation.
- `:m2y-crypto:compileDebugAndroidTestJavaWithJavac`: passed.
- x86_64 emulator instrumentation:
  - missing record key fails closed and reset removes remaining state;
  - corrupt encrypted identity record fails closed;
  - generation, prepare retry, P-256 signature verification, commit, and manager restart preserve stable identity.

## Primary references

- Gradle Foojay toolchains repository and 1.0 migration notes: <https://github.com/gradle/foojay-toolchains>
- React Native Gradle 9/Foojay 0.5 incompatibility report: <https://github.com/facebook/react-native/issues/55781>
