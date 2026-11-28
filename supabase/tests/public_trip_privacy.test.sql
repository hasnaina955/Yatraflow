-- ============================================================================
-- PRIVACY CONTRACT TEST (#1015): public rows never expose home address,
-- home coordinates, day-0 start anchors, unapproved fields, or free stop notes.
-- ============================================================================
-- Runs on the isolated database seeded by tests/paid-access-matrix-db.test.ts
-- after 20261128a_public_trip_privacy.sql. Every probe is a DO-block assertion;
-- a clean run ends with one PASS row.
-- ============================================================================

do $$
declare
  v_trip_id constant uuid := '2611b000-0000-4000-8000-000000001015';
  v_owner   constant uuid := '2611a000-0000-4000-8000-000000000001';
  v_buyer   constant uuid := '2611a000-0000-4000-8000-000000000005';
  v_out     constant uuid := '2611a000-0000-4000-8000-000000000008';
  v_pub_priced constant text := 'pub_1015_priced';
  v_pub_free   constant text := 'pub_1015_free';
  v_order_id   constant uuid := '2611c000-0000-4000-8000-000000001015';
  v_row jsonb;
begin
  delete from public.entitlements where pub_id in (v_pub_priced, v_pub_free);
  delete from public.purchase_orders where id = v_order_id;
  delete from public.published_itineraries where id in (v_pub_priced, v_pub_free);
  delete from public.trip_members where trip_id = v_trip_id;
  delete from public.trips where id = v_trip_id;

  insert into public.trips (
    id, owner_id, name, start_location, start_location_coords,
    destinations, visibility, invite_code, expenses, fixed_commitments, days
  ) values (
    v_trip_id, v_owner, 'Bengaluru to Coorg',
    '42 MG Road, Indiranagar, Bengaluru, Karnataka, 560038, India',
    '{"lat":12.971601,"lng":77.594601}'::jsonb,
    '["Madikeri, Karnataka"]'::jsonb,
    'public', 'CODE-1015',
    '[{"id":"e1","amount":900,"label":"PRIVATE_EXPENSE_1015"}]'::jsonb,
    '[{"id":"fc1","title":"Check-in","type":"hotel-checkin","dayIndex":0,"time":"14:00","notes":"PRIVATE_FC_1015","reference":"REF_1015"}]'::jsonb,
    '[
      {
        "id": "day-0",
        "index": 0,
        "title": "Start day",
        "extraDaySecret": "DAY_SECRET_1015",
        "stops": [
          {
            "id": "auto-start",
            "title": "42 MG Road, Indiranagar, Bengaluru, Karnataka, 560038, India",
            "locationName": "42 MG Road, Indiranagar, Bengaluru, Karnataka, 560038, India",
            "category": "travel",
            "lat": 12.971601,
            "lng": 77.594601,
            "auto": true,
            "status": "confirmed",
            "orderInDay": 1
          },
          {
            "id": "stop-free",
            "title": "Stop One",
            "locationName": "Madikeri Fort",
            "category": "sightseeing",
            "lat": 12.4244,
            "lng": 75.7382,
            "description": "Public summary",
            "notes": "FREE_NOTE_SECRET_1015",
            "extraStopSecret": "STOP_SECRET_1015",
            "status": "confirmed",
            "orderInDay": 2
          }
        ]
      },
      {
        "id": "day-1",
        "index": 1,
        "title": "Paid day",
        "stops": [
          {
            "id": "stop-paid",
            "title": "Abbey Falls",
            "locationName": "Madikeri",
            "category": "nature",
            "lat": 12.4584,
            "lng": 75.7166,
            "notes": "BUYER_NOTE_1015",
            "extraStopSecret": "PAID_STOP_SECRET_1015",
            "status": "confirmed",
            "orderInDay": 1
          }
        ]
      }
    ]'::jsonb
  );

  insert into public.trip_members (trip_id, user_id, role)
  values (v_trip_id, v_owner, 'owner');

  insert into public.published_itineraries (id, trip_id, creator_id, premium_price_inr, free_day_indexes) values
    (v_pub_priced, v_trip_id, v_owner, 299, '[0]'::jsonb),
    (v_pub_free,   v_trip_id, v_owner, null, '[0]'::jsonb);

  insert into public.purchase_orders (id, user_id, pub_id, razorpay_order_id, amount_inr, status, price_snapshot_inr)
  values (v_order_id, v_buyer, v_pub_priced, 'order_1015_paid', 299, 'paid', 299);

  insert into public.entitlements (pub_id, user_id, order_id, amount_paid_inr)
  values (v_pub_priced, v_buyer, v_order_id, 299);

  -- 1. Anon outsider on priced guide: coarsened town, no coords, no day-0 auto anchor,
  --    no free-day stop notes, no unknown day/stop fields.
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
  select to_jsonb(r) into v_row from public.get_public_trip(v_pub_priced) r;
  execute 'reset role';

  if (v_row ->> 'start_location') is distinct from 'Bengaluru, Karnataka' then
    raise exception 'expected coarsened start_location for anon, got %', v_row ->> 'start_location';
  end if;
  if v_row -> 'start_location_coords' <> 'null'::jsonb then
    raise exception 'start_location_coords leaked to anon';
  end if;
  if v_row::text like '%42 MG Road%' or v_row::text like '%560038%' or v_row::text like '%12.971601%' then
    raise exception 'home address or coordinates leaked to anon: %', v_row;
  end if;
  if v_row::text like '%FREE_NOTE_SECRET_1015%' or v_row::text like '%DAY_SECRET_1015%' or v_row::text like '%STOP_SECRET_1015%' then
    raise exception 'private free-day notes or unknown fields leaked to anon: %', v_row -> 'days';
  end if;
  if jsonb_array_length(v_row -> 'days' -> 0 -> 'stops') <> 1 then
    raise exception 'expected day-0 start anchor omitted for anon, got %', v_row -> 'days' -> 0 -> 'stops';
  end if;

  -- 2. Signed-in outsider on FREE guide: same coarsening, no notes, no expenses.
  perform set_config('request.jwt.claim.sub', v_out::text, true);
  execute 'set local role authenticated';
  select to_jsonb(r) into v_row from public.get_public_trip(v_pub_free) r;
  execute 'reset role';

  if (v_row ->> 'start_location') is distinct from 'Bengaluru, Karnataka'
     or v_row -> 'start_location_coords' <> 'null'::jsonb then
    raise exception 'free guide leaked start_location/coords to outsider';
  end if;
  if v_row::text like '%FREE_NOTE_SECRET_1015%' or v_row::text like '%BUYER_NOTE_1015%' or v_row::text like '%STOP_SECRET_1015%' then
    raise exception 'free guide leaked stop notes or unknown fields to outsider';
  end if;

  -- 3. Buyer on priced guide: still gets coarsened start and no home coords/anchor,
  --    gets paid stop notes via allow-list, never gets unknown fields or crew notes on commitments.
  perform set_config('request.jwt.claim.sub', v_buyer::text, true);
  execute 'set local role authenticated';
  select to_jsonb(r) into v_row from public.get_public_trip(v_pub_priced) r;
  execute 'reset role';

  if (v_row ->> 'start_location') is distinct from 'Bengaluru, Karnataka'
     or v_row -> 'start_location_coords' <> 'null'::jsonb then
    raise exception 'buyer received raw home start_location or coords';
  end if;
  if v_row::text like '%42 MG Road%' or v_row::text like '%12.971601%' then
    raise exception 'buyer received day-0 home anchor';
  end if;
  if v_row::text like '%PAID_STOP_SECRET_1015%' or v_row::text like '%DAY_SECRET_1015%' then
    raise exception 'buyer received unknown day/stop fields';
  end if;
  if (v_row -> 'days' -> 1 -> 'stops' -> 0 ->> 'notes') is distinct from 'BUYER_NOTE_1015' then
    raise exception 'buyer lost paid stop notes: %', v_row -> 'days' -> 1 -> 'stops' -> 0;
  end if;

  -- 4. Owner keeps raw home start, coords, expenses and unknown fields.
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  execute 'set local role authenticated';
  select to_jsonb(r) into v_row from public.get_public_trip(v_pub_priced) r;
  execute 'reset role';

  if (v_row ->> 'start_location') is distinct from '42 MG Road, Indiranagar, Bengaluru, Karnataka, 560038, India'
     or (v_row -> 'start_location_coords' ->> 'lat') is distinct from '12.971601' then
    raise exception 'owner lost own start_location or coords';
  end if;

  delete from public.entitlements where pub_id in (v_pub_priced, v_pub_free);
  delete from public.purchase_orders where id = v_order_id;
  delete from public.published_itineraries where id in (v_pub_priced, v_pub_free);
  delete from public.trip_members where trip_id = v_trip_id;
  delete from public.trips where id = v_trip_id;
end $$;

select 'PASS: #1015 public trip privacy contract holds for anon, outsider, buyer and owner' as result;
