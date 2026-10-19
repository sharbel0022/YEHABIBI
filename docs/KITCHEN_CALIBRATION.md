# Kalibrering av kökets kapacitet

Inga nya tider eller kapacitetsvärden är uppmätta i detta uppdrag. Befintliga `kitchen_units`, paketens tillagningstider, personaltillgång, utrustningspooler, transportzoner och kapacitetsreservationer återanvänds. Testdata är syntetiska och får inte överföras som produktionsvärden.

Fyll i [KITCHEN_MEASUREMENTS.csv](KITCHEN_MEASUREMENTS.csv) för representativa körningar: paket/storlek/antal/tillbehör, personal, utrustning och andra samtidiga order. Registrera planerad och faktisk start/färdigtid, separata minuter för förberedelse, tillagning, packning, överlämning och transport per zon. Använd interna prov-id:n och undvik namn, telefon eller privata ordertoken.

Samla både normala och belastade körningar med köksansvarig. För varje paket/antal och jämförbar bemanning redovisas antal mätningar, median, långsammare utfall och avvikelseorsaker. Föreslå konservativ tid med uttrycklig marginal samt kapacitetsenheter som passar verkliga samtidiga begränsningar. Sätt inte kapaciteten efter snabbaste enskilda provet. Separera transport från köksarbete; återanvänd befintliga zoner och buffertar.

| Inställning | Mätt underlag | Rekommendation | Aktiv inställning | Godkännare/datum |
| --- | --- | --- | --- | --- |
| Paketets förberedelse/tillagning | Saknas | Ej fastställd | Läs aktuellt paket i admin | Saknas |
| Extra minuter per antal | Saknas | Ej fastställd | Läs aktuellt paket i admin | Saknas |
| Köksenheter och samtidig kapacitet | Saknas | Ej fastställd | Läs kapacitet i admin | Saknas |
| Packning/utrustning/buffert | Saknas | Ej fastställd | Läs kapacitet i admin | Saknas |
| Transport per zon | Saknas | Ej fastställd | Läs aktuell zon i admin | Saknas |

Köksansvarig väljer och signerar nya värden. Pröva därefter på ett separat urval som inte användes för kalibreringen, inklusive hög belastning, stora antal och reservbemanning. Dokumentera förseningar och korrigera försiktigt. Ändra endast framtida tillgänglighetsberäkning; bekräftade reservationers tidsintervall och frysta kundtider ska bevaras. Kontrollera gamla och nya reservationer tillsammans före aktivering. Ingen maskininlärning eller ny optimerare införs.
