# Festlokaler och telefonkontakt

Översikten har fyra klickbara inspirationskort med egna sidor på `/festlokal/festlokal-1` till `festlokal-4`. Svart/guld, huvudmeny och sidfot följer den befintliga hemsidan. Bokningslänkar är enbart `tel:` till katalogens telefonnummer; en verklig publicerad lokal använder sitt eget telefonnummer.

De fem PNG-referenserna är kopierade byte för byte. `VenuePhoto` visar bara fotoregionerna genom SVG-viewBox och explicit clipPath, så referensernas inbakade text och navigation inte visas i bildgalleriet. SHA256, koordinater och medieprovenance finns i `public/images/venues/sources.json`.

Varje inspirationssida har tre bilder som kan förstoras och bläddras med knappar eller piltangenter. Escape stänger dialogen och fokus går tillbaka till bilden. De fyra ljudlösa MP4-filerna är 12 sekunder långa H264-bildspel med faststart, framställda av fotoregionerna. De är märkta Bildspel både i videobilden och gränssnittet och har riktiga native kontroller. De är inte filmade visningar av verkliga lokaler.

Inspirationsexemplen visas endast när den offentliga katalogens `preview` är true, och detaljsidorna är noindex. De hämtar inga privata lokalutkast. De ursprungliga privata sluggarna `lokal-1..4` förblir otillgängliga. Verkligt publicerade lokaler prioriteras, behåller egna bilder, faktauppgifter och telefonnummer, och visas även efter att preview stängts av. Venue-schemat, API-filtreringen och databasens publiceringskontroller är oförändrade.
