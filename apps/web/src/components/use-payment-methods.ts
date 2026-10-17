'use client';

import { useEffect, useState } from 'react';
import { onlinePaymentMethods, type Catalog } from '@yehabibi/shared';

type WalletWindow = Window & {
  ApplePaySession?: { canMakePayments: () => boolean };
  google?: { payments?: { api?: { PaymentsClient: new (options: { environment: 'PRODUCTION' }) => {
    isReadyToPay: (request: unknown) => Promise<{ result: boolean; paymentMethodPresent?: boolean }>;
  } } } };
};

let googlePayScript: Promise<void> | null = null;
function loadGooglePay() {
  if ((window as WalletWindow).google?.payments?.api?.PaymentsClient) return Promise.resolve();
  if (googlePayScript) return googlePayScript;
  googlePayScript = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://pay.google.com/gp/p/js/pay.js';
    script.async = true;
    script.referrerPolicy = 'no-referrer';
    script.onload = () => resolve();
    script.onerror = () => { script.remove(); googlePayScript = null; reject(new Error('Google Pay kunde inte kontrolleras.')); };
    document.head.appendChild(script);
  });
  return googlePayScript;
}

/** Visa plånboken först när webbläsarens officiella API har bekräftat stöd. */
export function usePaymentMethods(methods: Catalog['payment_methods']) {
  const [wallets, setWallets] = useState({ applePay: false, googlePay: false });
  const enabled = methods.join(',');
  useEffect(() => {
    let active = true;
    const browser = window as WalletWindow;
    let applePay = false;
    try { applePay = enabled.includes('apple_pay') && browser.ApplePaySession?.canMakePayments() === true; } catch { /* Inte kompatibel. */ }
    setWallets({ applePay, googlePay: false });
    // Googles officiella kontroll laddas endast när backend har aktiverat metoden.
    if (enabled.includes('google_pay')) {
      void loadGooglePay().then(async () => {
        const Client = browser.google?.payments?.api?.PaymentsClient;
        if (!active || !Client) return;
        const result = await new Client({ environment: 'PRODUCTION' }).isReadyToPay({
          apiVersion: 2, apiVersionMinor: 0, existingPaymentMethodRequired: true,
          allowedPaymentMethods: [{ type: 'CARD', parameters: { allowedAuthMethods: ['PAN_ONLY', 'CRYPTOGRAM_3DS'],
            allowedCardNetworks: ['VISA', 'MASTERCARD'] } }],
        });
        if (active) setWallets({ applePay, googlePay: result.result === true && result.paymentMethodPresent === true });
      }).catch(() => { /* Behåll Google Pay dolt vid osäkert stöd. */ });
    }
    return () => { active = false; };
  }, [enabled]);
  return onlinePaymentMethods(methods, wallets);
}
