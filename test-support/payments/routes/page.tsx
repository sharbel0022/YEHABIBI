import { notFound } from 'next/navigation';
import { paymentRuntime } from '@/lib/payments/runtime';
import { TestPaymentProvider } from '@/lib/test-payments/provider';

export const dynamic='force-dynamic';
export const metadata={title:'Isolerad testbetalning',robots:{index:false,follow:false}};
export default async function TestPaymentPage({params}:{params:Promise<{id:string}>}) {
  const {id}=await params;
  let session;
  try { const runtime=paymentRuntime(); await runtime.validate(); session=await (runtime.createProvider() as TestPaymentProvider).inspectSession(id); }
  catch { notFound(); }
  const returnUrl=new URL(session.return_url);
  const returnPath=returnUrl.pathname+returnUrl.search+returnUrl.hash;
  const labels={swish:'Swish',card:'Visa / Mastercard',apple_pay:'Apple Pay',google_pay:'Google Pay'};
  const actions=[['success','Simulera lyckad betalning'],['decline','Simulera nekad betalning'],['cancel','Avbryt betalning'],['expire','Simulera utgången session'],['duplicate','Skicka samma händelse igen']];
  return <main style={{maxWidth:640,margin:'32px auto',padding:24,fontFamily:'system-ui',color:'#242424',background:'#fff',borderRadius:16}}>
    <h1>TESTLÄGE – INGA RIKTIGA BESTÄLLNINGAR</h1>
    <p>Simulerad {labels[session.method]}. Ingen bank eller riktig betalningsleverantör kontaktas.</p>
    <p><strong>{(session.amount_ore/100).toFixed(2)} kr</strong> · Status: {session.status==='completed'?'Betalningen är simulerad och bekräftad':session.status==='expired'?'Sessionen har gått ut (simulerat)':session.last_outcome==='decline'?'Nekad – ett nytt försök är möjligt':session.last_outcome==='cancel'?'Avbruten – ett nytt försök är möjligt':'Väntar på testval'}</p>
    {actions.map(([action,label])=><form key={action} method="post" action={`/__test/payment/${id}/simulate`} style={{margin:'12px 0'}}>
      <input type="hidden" name="action" value={action}/><button type="submit" style={{width:'100%',padding:14,fontSize:16}} disabled={session.status==='completed'&&!['success','duplicate'].includes(action)}>{label}</button>
    </form>)}
    <p>Avbruten, nekad eller utgången testsession flyttar inga pengar. Återförsök använder samma isolerade testlänk.</p>
    <a href={returnPath}>Tillbaka till min privata testorder</a>
  </main>;
}
