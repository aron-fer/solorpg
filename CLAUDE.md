# Hinweise für Claude

## Nur App-Code in diesem Repo

Dieses Repo ist öffentlich und enthält nur die App selbst. Tabellen, Karteien
(z. B. Bestiarium), Charakterbögen und andere Spieldaten gehören nach
`aron-fer/solo-procedures` unter `app/`, nicht hierher.

## Import-Format dokumentiert im privaten Repo

Das JSON-Import-Format (Tabellen, Karteien, Charaktere) ist in
`aron-fer/solo-procedures` unter `app/FORMAT.md` dokumentiert. Dort liegen auch
die Import-Dateien des Nutzers (`app/tabellen/`, `app/karteien/`, `app/charaktere/`).

Ändert sich in dieser App etwas, das das Import-Format betrifft, muss
`app/FORMAT.md` im selben Zug angepasst werden. Das betrifft vor allem:

- `parseJSONImport` / `normalizeImportedEntry` in `js/util.js`
- `runImport` in `js/oracle.js`
- Platzhalter in Tabellentexten (`resolveInlineRefs` in `js/oracle.js`)
- Feldtypen (`FIELD_TYPES`, `defaultValueForType` in `js/util.js`)
- Felder für Kurzansicht und Statblock (`tier`, `quick`, `sb`, `sbAbbr`, `sbCols`)
- Bestiarium-Erkennung (`js/bestiary.js`)
- Gelände-Tabellennamen (`js/terrain.js`)

Ist `solo-procedures` nicht in der Sitzung eingebunden, den Nutzer darauf
hinweisen, statt die Doku stillschweigend veralten zu lassen. Liegen dort
Import-Dateien, die durch die Änderung nicht mehr passen, ebenfalls Bescheid geben.
