# Plockmeny och e-postförfrågan

Plockmenyn använder samma publika cateringkatalog som webb och mobil. De 18 rättbilderna kommer oförändrade från ägarens Word-underlag; ursprung och SHA256 finns i `apps/web/public/images/plock/sources.json`. Bilderna är illustrationer. De tidigare menybilderna och hemsidans bilder bevaras.

Kunden väljer kategori, önskat antal och Lägg till. Bilden öppnar en större rättdialog. Sammanfattningen visar valda rätter, bilder och antal; både en hel meny och uttryckliga extra rätter kan väljas. Rätternas antal är önskemål, inte en fastställd portions- eller prisberäkning. Plockmenyn visar Pris enligt offert.

`useCateringSelection` delar urvalet mellan galleriet, plockmenyns detaljsida och formuläret. URL:en använder upprepade `meny`, `ratt` och parallella `antal`; äldre rättlänkar betyder ett önskat antal. Endast aktuella publika ID och heltal 1–999 accepteras. Webbläsarens lokala utkast lagrar bara meny-ID och rätt-ID/antal. Personuppgifter sparas varken där eller i URL:en.

Formuläret kräver namn, e-post, antal personer och datum. Telefon och övriga önskemål är valfria. Förbered mejlutkast skapar text med alla val och antal. Öppna i e-postappen öppnar ett `mailto`-utkast till katalogens verifierade adress; kunden skickar själv mejlet. Kopiering finns som alternativ. Ändrade kontaktuppgifter eller matval rensar det gamla utkastet. Webbplatsen skickar ingen servermejl eller bokningsbekräftelse.

Den nya datamigrationen lägger till saknade rättförslag och bevarar ägarredigerade poster. Förslag är bara publicerade när katalogen står i förhandsvisningsläge. Den ändrar inga tidigare ordertabeller, aktiverar ingen beställnings- eller betalningsintegration och skriver inte om historiska migrationer.
