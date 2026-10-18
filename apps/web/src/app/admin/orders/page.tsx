import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { adminDb } from '@/lib/supabase';
import { statusLabels, paymentStatusLabels } from '@/lib/domain';
import { AdminLogin } from '@/components/admin/AdminLogin';
import { AdminNav } from '@/components/admin/AdminNav';
import { AdminOrders } from '@/components/admin/AdminOrders';
import { KitchenOperations } from '@/components/admin/KitchenOperations';
import type { CateringOrder } from '@/types/domain';
export const dynamic='force-dynamic';
const views=[['all','Alla'],['new','Nya'],['due','Ska förberedas'],['preparing','Under tillagning'],['ready','Klara / på väg'],['future','Kommande dagar'],['completed','Avslutade'],['problem','Problem / avvikelser']];
type Filters={search?:string;status?:string;payment?:string;order_type?:string;page?:string;view?:string};
export default async function OrderAdmin({searchParams}:{searchParams:Promise<Filters>}) {
  if(!await requireAdmin())return <AdminLogin/>;
  const params=await searchParams;
  const page=Math.max(1,Math.min(100000,Math.floor(Number(params.page))||1));
  const search=(params.search||'').replace(/[^\p{L}\p{N}@+\- .]/gu,'').slice(0,100);
  const status=params.status&&Object.hasOwn(statusLabels,params.status)?params.status:'';
  const payment=params.payment&&Object.hasOwn(paymentStatusLabels,params.payment)?params.payment:'';
  const orderType=params.order_type==='direct'||params.order_type==='catering'?params.order_type:'';
  const view=views.some(([id])=>id===params.view)?params.view!:'all';
  const now=new Date(),today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  let query=adminDb().from('orders').select('*,order_items(dish_id,item_id,menu_id,title,quantity,unit_label,unit_price_ore,total_ore)',{count:'exact'});
  if(view==='new')query=query.or('status.in.(new,reviewing,changes_requested),and(status.eq.approved,acknowledged_at.is.null)');
  if(view==='due')query=query.eq('status','approved').lte('event_date',today).or(`preparation_starts_at.is.null,preparation_starts_at.lte.${now.toISOString()}`);
  if(view==='preparing')query=query.eq('status','preparing');
  if(view==='ready')query=query.in('status',['ready','dispatched']);
  if(view==='future')query=query.gt('event_date',today).not('status','in','(completed,cancelled,rejected)');
  if(view==='completed')query=query.in('status',['completed','cancelled','rejected']);
  if(view==='problem')query=query.or('payment_review_required.eq.true,payment_refund_status.eq.needs_review,capacity_status.eq.review,kitchen_issue.not.is.null');
  if(status)query=query.eq('status',status);if(payment)query=query.eq('payment_status',payment);if(orderType)query=query.eq('order_type',orderType);
  if(search)query=query.or(['code','full_name','email','phone','menu_title'].map(field=>`${field}.ilike.%${search}%`).join(','));
  query=query.order(view==='future'||view==='due'?'event_date':'created_at',{ascending:view==='future'||view==='due'}).range((page-1)*100,page*100-1);
  const {data,count,error}=await query;
  const link=(changes:Record<string,string>)=>`/admin/orders?${new URLSearchParams({search,status,payment,order_type:orderType,view,page:String(page),...changes})}`;
  return <section className="shell admin-wrap"><h1>Beställningar</h1><AdminNav/><KitchenOperations/>
    <nav className="kitchen-views" aria-label="Köksvyer">{views.map(([id,label])=><Link key={id} href={link({view:id,page:'1'})} aria-current={view===id?'page':undefined}>{label}</Link>)}</nav>
    {error?<p className="form-error" role="alert">Beställningarna kunde inte läsas. Kontrollera migrationerna och försök igen.</p>:<AdminOrders key={`${page}-${search}-${status}-${payment}-${orderType}-${view}`} initialOrders={(data||[]) as CateringOrder[]} totalCount={count||0} filters={{search,status,payment,order_type:orderType,view}}/>}
    <div className="form-actions">{page>1&&<Link className="btn" href={link({page:String(page-1)})}>← Föregående</Link>}<span className="admin-note">Sida {page} av {Math.max(1,Math.ceil((count||0)/100))}</span>{page*100<(count||0)&&<Link className="btn" href={link({page:String(page+1)})}>Nästa →</Link>}</div>
  </section>;
}
