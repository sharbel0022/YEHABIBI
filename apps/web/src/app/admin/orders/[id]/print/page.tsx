import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { adminDb } from '@/lib/supabase';
import { formatSek,formatScheduledTime,statusLabels,paymentStatusLabels } from '@/lib/domain';
import { AdminLogin } from '@/components/admin/AdminLogin';
import { PrintOrderButton } from '@/components/admin/PrintOrderButton';
import type { CateringOrder } from '@/types/domain';
import '@/components/admin/admin.css';
export const dynamic='force-dynamic';
export default async function PrintOrder({params}:{params:Promise<{id:string}>}) {
  if(!await requireAdmin())return <AdminLogin/>;
  const {id}=await params;if(!/^[0-9a-f-]{36}$/i.test(id))notFound();
  const {data,error}=await adminDb().from('orders').select('*,order_items(dish_id,item_id,menu_id,title,quantity,unit_label,unit_price_ore,total_ore)').eq('id',id).maybeSingle();
  if(error)return <p className="form-error">Ordern kunde inte läsas. Försök igen.</p>;
  if(!data)notFound();const order=data as CateringOrder;
  const lines=order.order_items?.length?order.order_items:order.items_snapshot?.map(line=>({...line,total_ore:line.line_total_ore}));
  return <article className="kitchen-print"><PrintOrderButton/><p>YEI HABIBI · CATERING & FEST · KÖKSORDER</p><h1>#{order.code}</h1>
    <p><strong>{order.full_name}</strong><br/>{order.phone}<br/>{order.fulfillment==='pickup'?'Hämtning':`Leverans: ${order.address}, ${order.postal_code} ${order.city}`}</p>
    <p><strong>Kundtid:</strong> {formatScheduledTime(order.scheduled_at)||`${order.event_date} kl ${order.event_time}`}<br/><strong>Börja förbereda:</strong> {formatScheduledTime(order.preparation_starts_at)||'Kontrollera kökets planering'}<br/>{statusLabels[order.status]} · {paymentStatusLabels[order.payment_status]}</p>
    <table><thead><tr><th>Antal</th><th>Mat</th><th>Enhet</th></tr></thead><tbody>{lines?.map((line,index)=><tr key={index}><td>{line.quantity}</td><td>{line.title}</td><td>{line.unit_label||'st'}</td></tr>)}</tbody></table>
    <p><strong>Totalt:</strong> {formatSek(order.total_ore)} · {order.guests} portioner/personer</p>
    {order.notes&&<p><strong>Kundens önskemål / märkning:</strong><br/>{order.notes}</p>}
    {order.kitchen_note&&<p><strong>Intern köksanteckning:</strong><br/>{order.kitchen_note}</p>}
    <h2>Packkontroll</h2><ul className="packing-list">{['Rätt antal paket','Rätt tillbehör','Såser och bröd','Allergen- och specialmärkning','Rätt ordernummer'].map(label=><li key={label}>☐ {label}</li>)}</ul>
    <p>Kontrollerad av: _____________________ Tid: __________</p><p className="no-print admin-note">Innehåller kunduppgifter. Förvara och kassera enligt företagets rutiner. Markera packkontrollen i admin före utlämning.</p>
  </article>;
}
