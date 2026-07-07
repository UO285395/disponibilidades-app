# Estructura del proyecto

## Raiz

```text
disponibilidad-app/
|-- CALENDAR_DESIGN_OPTIONS.md
|-- description.md
|-- documentation.md
|-- prompt
|-- smoke-test.ps1
|-- backend/
|   |-- database.py
|   |-- Dockerfile
|   |-- main.py
|   |-- models.py
|   |-- railway.toml
|   `-- requirements.txt
`-- frontend/
    |-- capacitor.config.json
    |-- eslint.config.js
    |-- index.html
    |-- package.json
    |-- README.md
    |-- setup_frontend.cjs
    |-- Staticfile
    |-- vite.config.js
    |-- android/
    |   |-- build.gradle
    |   |-- capacitor.settings.gradle
    |   |-- gradle.properties
    |   |-- gradlew
    |   |-- gradlew.bat
    |   |-- local.properties
    |   |-- settings.gradle
    |   |-- variables.gradle
    |   |-- app/
    |   |   |-- build.gradle
    |   |   |-- capacitor.build.gradle
    |   |   |-- google-services.json
    |   |   |-- proguard-rules.pro
    |   |   |-- build/
    |   |   |-- src/
    |   `-- gradle/
    |       `-- wrapper/
    |           `-- gradle-wrapper.properties
    |-- public/
    `-- src/
        |-- App.css
        |-- App.jsx
        |-- index.css
        |-- main.jsx
        |-- api/
        |   |-- adminApi.js
        |   `-- api.js
        |-- assets/
        |-- components/
        |   |-- AdminAvailabilities.jsx
        |   |-- AdminAvailabilitiesCalendar.jsx
        |   |-- AdminCensus.jsx
        |   |-- AdminDomainPolicies.jsx
        |   |-- AdminEvents.jsx
        |   |-- AdminNotifications.jsx
        |   |-- AdminSpaces.jsx
        |   |-- AdminSurveys.jsx
        |   |-- AdminUsers.jsx
        |   |-- ChangePasswordModal.jsx
        |   |-- EventsSection.jsx
        |   |-- MobileWeekCalendar.jsx
        |   |-- SpaceReservations.jsx
        |   `-- WeekCalendar.jsx
        `-- pages/
            |-- AdminDashboard.jsx
            |-- AdminEventResponses.jsx
            |-- CensusForm.jsx
            |-- Dashboard.jsx
            |-- Login.jsx
            |-- Register.jsx
            `-- SurveyForm.jsx
```

## Notas

- Esta estructura omite carpetas temporales o de cache como `.git`, `.venv`, `__pycache__`, `node_modules` y artefactos de build extensos.
- Si quieres, puedo generar una segunda version automatica y completa (sin omisiones) usando un script para que quede 1:1 con el sistema de archivos actual.
