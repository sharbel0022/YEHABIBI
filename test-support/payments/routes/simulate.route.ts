import { paymentRuntime } from '@/lib/payments/runtime';
import { TestPaymentProvider, type SimulationAction } from '@/lib/test-payments/provider';
import { checkOrigin } from '@/lib/auth';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
  try {
    if (!checkOrigin(request)) return new Response('Otillåtet ursprung',{status:403});
    const instance=paymentRuntime();await instance.validate();
    const {id}=await params, json=request.headers.get('content-type')?.includes('application/json');
    const input=json?await request.json():Object.fromEntries(await request.formData());
    const session=await (instance.createProvider() as TestPaymentProvider).simulate(id,input.action as SimulationAction);
    if (json) return Response.json({test_mode:true,status:session.status,last_outcome:session.last_outcome},{headers:{'Cache-Control':'no-store'}});
    return new Response(null,{status:303,headers:{Location:`/__test/payment/${id}`,'Cache-Control':'no-store'}});
  } catch { return Response.json({error:'Testbetalningen kunde inte verifieras. Kontrollera testmiljön och försök igen.'},{status:400}); }
}
