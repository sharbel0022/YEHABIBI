"use client";
import { useState, type FormEvent } from "react";
import { Mail } from "lucide-react";
import {
  buildCateringEmail,
  cateringMailto,
  type CateringEmailFields,
  type HospitalityCatalog,
} from "@yehabibi/shared";

export function CateringInquiry({
  catalog,
  selectedMenu = "plockmeny",
}: {
  catalog: HospitalityCatalog;
  selectedMenu?: string;
}) {
  const [menuId, setMenuId] = useState(selectedMenu);
  const [selectedDishes, setSelectedDishes] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState("");
  const menu =
    catalog.menus.find((item) => item.id === menuId) || catalog.menus[0];
  const canEmail =
    catalog.contact.emailVerified &&
    !!cateringMailto(catalog.contact.email, "Catering");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const fields: CateringEmailFields = {
      name: String(form.get("name")),
      phone: String(form.get("phone")),
      email: String(form.get("email")),
      people: Number(form.get("people")),
      date: String(form.get("date")),
      time: String(form.get("time")),
      fulfillment: String(form.get("fulfillment")),
      menuName: menu?.name || "Plockmeny",
      extraDishes: selectedDishes,
      allergies: String(form.get("allergies")),
      message: String(form.get("message")),
    };
    setDraft(buildCateringEmail(fields));
    setMessage(
      "Ditt mejlutkast är förberett. Öppna det i ditt e-postprogram och skicka själv mejlet. Ingen förfrågan har skickats från webbplatsen.",
    );
  }
  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(draft);
      setMessage(
        "Förfrågan har kopierats. Klistra in den i ett mejl och skicka till cateringadressen.",
      );
    } catch {
      setMessage("Markera och kopiera förfrågan i textrutan nedan.");
    }
  }
  const draftHref =
    canEmail && draft
      ? cateringMailto(catalog.contact.email, menu?.name || "Catering", draft)
      : null;
  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  if (!menu)
    return (
      <p>
        Inga menyer är publicerade just nu. Ring oss så hjälper vi dig med din
        catering.
      </p>
    );
  return (
    <form
      className="inquiry-form"
      onSubmit={submit}
      onChange={() => {
        if (draft) {
          setDraft("");
          setMessage("Uppgifterna har ändrats. Förbered ett nytt mejlutkast.");
        }
      }}
    >
      <div className="form-grid">
        <label>
          Namn
          <input name="name" autoComplete="name" required maxLength={120} />
        </label>
        <label>
          Telefonnummer
          <input
            name="phone"
            type="tel"
            autoComplete="tel"
            required
            maxLength={40}
          />
        </label>
        <label>
          E-postadress
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
          />
        </label>
        <label>
          Antal personer
          <input
            name="people"
            type="number"
            inputMode="numeric"
            min="1"
            max="10000"
            required
          />
        </label>
        <label>
          Datum
          <input name="date" type="date" min={today} required />
        </label>
        <label>
          Önskad tid
          <input name="time" type="time" required />
        </label>
        <label>
          Hämtning eller leverans
          <select name="fulfillment">
            <option>Hämtning</option>
            <option>
              Leverans – adress och möjlighet bekräftas personligen
            </option>
          </select>
        </label>
        <label>
          Vald meny
          <select
            name="menu"
            value={menuId}
            onChange={(event) => setMenuId(event.target.value)}
          >
            {catalog.menus.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <fieldset className="dish-choices">
        <legend>
          {menu?.pricePerPerson === null
            ? "Välj rätter till din plockmeny"
            : "Önskemål om extra rätter"}
        </legend>
        <p className="field-hint">
          Pris enligt offert. Utbud, mängder och allergener bekräftas
          personligen.
        </p>
        {[...new Set(catalog.dishes.map((dish) => dish.category))].map(
          (category) => (
            <div key={category}>
              <h3>{category}</h3>
              <div className="dish-choice-grid">
                {catalog.dishes
                  .filter((dish) => dish.category === category)
                  .map((dish) => (
                    <label key={dish.id}>
                      <input
                        type="checkbox"
                        checked={selectedDishes.includes(dish.name)}
                        onChange={(event) =>
                          setSelectedDishes((current) =>
                            event.target.checked
                              ? [...current, dish.name]
                              : current.filter((name) => name !== dish.name),
                          )
                        }
                      />
                      {dish.name}
                    </label>
                  ))}
              </div>
            </div>
          ),
        )}
      </fieldset>
      <label>
        Allergier och specialönskemål
        <textarea
          name="allergies"
          rows={3}
          maxLength={2000}
          placeholder="Beskriv vad vi behöver ta hänsyn till."
        />
      </label>
      <label>
        Övrigt meddelande
        <textarea
          name="message"
          rows={3}
          maxLength={3000}
          placeholder="Tillfälle, eventuell leveransadress och andra önskemål."
        />
      </label>
      <p className="field-hint" id="inquiry-help">
        Dina uppgifter förbereder ett mejl. Webbplatsen skickar och sparar ingen
        förfrågan. Du behöver själv skicka mejlet från ditt e-postprogram.
        Upplägg och pris bekräftas sedan personligen.
      </p>
      <button
        className="btn btn-primary"
        type="submit"
        disabled={!canEmail}
        aria-describedby="inquiry-help"
      >
        <Mail size={17} aria-hidden="true" />
        Skicka cateringförfrågan
      </button>
      {!canEmail && (
        <p className="field-hint">
          Cateringadressen behöver bekräftas. Kontakta oss per telefon.
        </p>
      )}
      <div role="status" aria-live="polite">
        {message && <p className="draft-status">{message}</p>}
      </div>
      {draft && (
        <div className="prepared-email">
          <h3>Din förfrågan</h3>
          <p>Till: {catalog.contact.email}</p>
          <textarea
            aria-label="Förberedd cateringförfrågan"
            readOnly
            rows={12}
            value={draft}
          />
          <div className="contact-actions">
            {draftHref && (
              <a href={draftHref} className="btn btn-primary">
                Öppna mejlutkast
              </a>
            )}
            <button
              type="button"
              className="btn btn-outline-light"
              onClick={copyDraft}
            >
              Kopiera förfrågan
            </button>
          </div>
          <p className="field-hint">
            Om utkastet blir för långt för din e-postapp kan du kopiera texten
            och mejla den till {catalog.contact.email}.
          </p>
        </div>
      )}
    </form>
  );
}
