-- Extend the existing content catalog with the owner's plock-menu choices.
-- Existing dish IDs (including hidden or edited records) are never replaced.
do $$
declare
  source_catalog jsonb;
  next_dishes jsonb;
  proposal jsonb;
  preview_mode boolean;
begin
  select catalog into source_catalog from public.hospitality_content where id = 1 for update;
  if source_catalog is null then return; end if;
  preview_mode := source_catalog->>'preview' = 'true';
  next_dishes := source_catalog->'dishes';

  -- Correct only untouched preview seed records; preserve every owner edit.
  if preview_mode then
    select jsonb_agg(
      case
        when dish = '{"id":"meze-5","name":"Fatoush","category":"Kalla meze","approved":false,"published":true}'::jsonb
          or dish = '{"id":"meze-10","name":"Tabbouleh","category":"Vegetariska alternativ","approved":false,"published":true}'::jsonb
        then jsonb_set(dish, '{category}', '"Sallader"'::jsonb)
        else dish
      end order by position
    ) into next_dishes from jsonb_array_elements(next_dishes) with ordinality as items(dish, position);
    next_dishes := coalesce(next_dishes, '[]'::jsonb);
  end if;

  for proposal in select value from jsonb_array_elements('[
    {"id":"meze-11","name":"Falafel","category":"Varma meze"},
    {"id":"grill-3","name":"Kycklingspett","category":"Grillrätter"},
    {"id":"grill-4","name":"Nötspett","category":"Grillrätter"},
    {"id":"grill-5","name":"Lammspett","category":"Grillrätter"},
    {"id":"side-1","name":"Libabröd","category":"Tillbehör"},
    {"id":"side-2","name":"Ris","category":"Tillbehör"},
    {"id":"side-3","name":"Såser","category":"Tillbehör"},
    {"id":"dessert-1","name":"Baklava","category":"Desserter"}
  ]'::jsonb) loop
    if not exists (select 1 from jsonb_array_elements(next_dishes) as item where item->>'id' = proposal->>'id') then
      -- Keep a full owner catalog within its existing 100-dish constraint.
      if jsonb_array_length(next_dishes) >= 100 then
        raise notice 'Plock-menu choices skipped: the owner catalog has reached its 100-dish limit.';
        exit;
      end if;
      next_dishes := next_dishes || jsonb_build_array(proposal || jsonb_build_object('approved', false, 'published', preview_mode));
    end if;
  end loop;

  if next_dishes is distinct from source_catalog->'dishes' then
    update public.hospitality_content
      set catalog = jsonb_set(source_catalog, '{dishes}', next_dishes), revision = revision + 1, updated_at = now()
      where id = 1;
  end if;
end $$;
