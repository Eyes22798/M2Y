# Application shell

This layer owns root providers, bootstrap, and app lifecycle wiring. It must not initialize databases, cryptography, or sync work simply because the app rendered.

It is deliberately named `bootstrap` instead of `app`: Expo Router treats `src/app/` as a route root when it exists, which would shadow this project's root-level `app/` directory.
