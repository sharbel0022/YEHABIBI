"use client";
import { useState } from "react";
import { Mail, Phone, Copy } from "lucide-react";
import {
  buildCateringEmail,
  cateringMailto,
  phoneHref,
  type HospitalityContact,
} from "@yehabibi/shared";

export function ContactActions({
  contact,
  menuName = "Catering",
  venue = false,
}: {
  contact: HospitalityContact;
  menuName?: string;
  venue?: boolean;
}) {
  const [copyState, setCopyState] = useState("");
  const call = phoneHref(contact.phone);
  const email = contact.emailVerified
    ? cateringMailto(contact.email, menuName, buildCateringEmail({ menuName }))
    : null;
  async function copy() {
    try {
      await navigator.clipboard.writeText(contact.email);
      setCopyState("E-postadressen är kopierad.");
    } catch {
      setCopyState(`Markera och kopiera adressen: ${contact.email}`);
    }
  }
  return (
    <div className="contact-actions-wrap">
      <div className="contact-actions">
        {!venue &&
          (email ? (
            <a href={email} className="btn btn-primary">
              <Mail size={17} aria-hidden="true" />
              Mejla oss
            </a>
          ) : (
            <span className="contact-unavailable">
              E-postadress inväntar bekräftelse
            </span>
          ))}
        {call && (
          <a
            href={call}
            className={`btn ${venue ? "btn-primary" : "btn-outline-light"}`}
          >
            <Phone size={17} aria-hidden="true" />
            {venue ? "Ring oss för bokning" : "Ring oss"}
          </a>
        )}
      </div>
      {venue ? (
        <p className="field-hint">
          {contact.phone} · Bokning sker endast per telefon.
        </p>
      ) : (
        <>
          <p className="field-hint">
            Mejla oss öppnar ett utkast i ditt e-postprogram. Du skickar själv
            mejlet. Vi bekräftar upplägget personligen.
          </p>
          {email && (
            <div className="email-copy">
              <a href={`mailto:${contact.email}`}>{contact.email}</a>
              <button type="button" className="text-link" onClick={copy}>
                <Copy size={14} aria-hidden="true" />
                Kopiera adress
              </button>
            </div>
          )}
          <span role="status" className="field-hint">
            {copyState}
          </span>
        </>
      )}
    </div>
  );
}
