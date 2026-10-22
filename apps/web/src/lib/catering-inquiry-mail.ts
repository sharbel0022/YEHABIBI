import 'server-only';
import type { HospitalityCatalog } from '@yehabibi/shared';
import { inquiryMailSettingsReady, inquiryRecipientReady, sendCateringInquiryWithTransport, type CateringInquiryInput } from '@/lib/catering-inquiry';

const settings=()=>({enabled:process.env.NOTIFICATIONS_ENABLED === 'true',apiKey:process.env.RESEND_API_KEY || '',from:process.env.EMAIL_FROM || ''});
export function inquiryEmailReady(catalog?: HospitalityCatalog): boolean {
  return inquiryMailSettingsReady(settings()) && (!catalog || inquiryRecipientReady(catalog));
}

/** Acceptance by Resend is not proof of delivery to the inbox. No PII or credentials are logged. */
export async function sendCateringInquiry(input: CateringInquiryInput, catalog: HospitalityCatalog): Promise<{ok:true;reference:string}|{ok:false;unavailable?:boolean}> {
  return sendCateringInquiryWithTransport(input,catalog,settings());
}
