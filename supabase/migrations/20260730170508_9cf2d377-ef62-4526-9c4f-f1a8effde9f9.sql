update public.courses set state='FL', country='USA' where id='7140392e-d6a4-4bf2-aadb-cc2f0dfc0c80';
update public.courses set state='AB', country='CAN', city='Lethbridge' where id='6bc953f8-dd34-4747-9836-bc15e5d4e93f';
update public.courses set state='BC', country='CAN', city='North Cowichan' where id='4ac8a92a-457d-4f1a-9fb9-b9e267003809';
update public.courses set state='BC', country='CAN', city='District of North Vancouver' where id='8dadbae2-5bde-4379-ab27-9bc5e6b6f52c';
update public.courses set state='QC', country='CAN', city='Longueuil' where id='4a38dd65-3ba6-407b-823d-5e19d9998c48';
update public.courses set state='MB', country='CAN', city='Winnipeg' where id='463b44ec-64f6-480e-bfc1-d4acb7e8a12d';
update public.courses set state='ON', country='CAN', city='North Bay' where id='aa64b375-f932-4a71-bf91-04fca8bad58d';
update public.courses set state='BC', country='CAN', city='Bowen Island' where id='69f0ee10-0b5a-43d4-86b8-f63011f96816';
update public.courses set state='QC', country='CAN', city='L''Assomption' where id='d984095c-4d79-436d-837c-c8cf4d7dd657';
update public.courses set state='SK', country='CAN' where id='45380c5d-d29f-4c9c-804b-827a97932ad7';
update public.courses set state='BC', country='CAN', city='Saturna Island' where id='7469c968-377a-4404-b21f-14a2152962e0';
update public.courses set state='ON', country='CAN', city='Kenora' where id='01a3ee46-b439-49c9-85b3-9c379f0a74de';
update public.courses set state='ON', country='CAN', city='Toronto' where id='2b892eef-d921-4487-b7ed-ebd03ee57dc3';
update public.courses set state='BC', country='CAN', city='Kelowna' where id='8e48d4ca-851a-4e3a-b3af-ce46e3cb721d';
update public.courses set state='MA', country='USA', city='Nantucket' where id='935ac6b6-6cb3-4f91-a477-ed2ce4b8cfa0';
update public.courses set state='BC', country='CAN', city='Kelowna' where id='c1f2c0b6-a9a9-4efe-8de1-96488f3e26e6';
update public.courses set state='BC', country='CAN', city='Burnaby' where id='9c5c7a66-4d2d-48e5-8fea-40098ee17d0f';
update public.courses set state='ON', country='CAN', city='Oakville' where id='9cf611e7-fe27-42c7-8e88-9c478577b9dc';
update public.courses set state='QC', country='CAN', city='Rigaud' where id='9d590a0a-290f-435e-9b00-d530e355927b';
update public.courses set state='ON', country='CAN', city='Mississippi Mills' where id='0b879302-881e-4a08-9af6-c0b827024360';
update public.courses set state='BC', country='CAN', city='Comox' where id='ac2cc3b8-5d2e-4552-bbba-fd8491329f99';
update public.courses set state='BC', country='CAN', city='Vancouver' where id='e34400f9-785d-45b4-85a8-033d91d7b0b8';
update public.courses set state='MA', country='USA', city='Edgartown' where id='9e9b3560-066c-4b20-83a2-ac45ff070d2c';
update public.courses set state='BC', country='CAN', city='Nanaimo' where id='98a52a03-f4e2-4974-b1a6-ba18f6e7883f';
update public.courses set state='BC', country='CAN', city='Penticton' where id='d817f33e-4dd3-4115-a4e3-0d3fa3f26ee5';
update public.courses set state='BC', country='CAN', city='Nanaimo' where id='ba233777-8b7f-45eb-885b-d9b8f2daaf22';
update public.courses set state='WA', country='USA', city='Anacortes' where id='871a3f73-6375-44ee-be4c-6144439509c5';
update public.courses set state='ON', country='CAN', city='London' where id='ec7ce09f-a716-449d-a30c-2c8c321b012c';
update public.courses set state='BC', country='CAN', city='Salt Spring Island' where id='fee31908-40ab-4124-972b-9e5b75ba4556';
update public.courses set state='BC', country='CAN', city='Langley' where id='55b54d7b-50df-45b0-932c-7e3c86b01e09';
update public.courses set state='BC', country='CAN', city='Coquitlam' where id='47e63358-511f-4ffa-ba28-862c41cf6b8c';
update public.courses set state='BC', country='CAN', city='Salt Spring Island' where id='b2c3df02-336f-44a0-a412-0df640e49e39';
update public.courses set state='ON', country='CAN', city='Tecumseh' where id='15968cfa-8a07-4195-831c-67378b524adb';
update public.courses set state='SK', country='CAN', city='Maple Creek' where id='ddf7b8da-92b0-4198-895d-43f3cd65b20c';
update public.courses set state='ON', country='CAN', city='Toronto' where id='ce95522f-ab4d-4631-b271-0c73c6169906';
update public.courses set state='NB', country='CAN', city='Fredericton' where id='f0c3fb88-53d8-484c-95cd-a9c7a1882060';

update public.courses
   set latitude = null, longitude = null
 where id = 'd13005fc-9b70-4921-bbda-dd85a70f8996'
   and round(latitude::numeric, 3) = 39.828;

update public.courses c
   set city = coalesce(c.city, m.city),
       state = coalesce(c.state, m.state),
       postal_code = coalesce(c.postal_code, m.postal_code),
       latitude = coalesce(c.latitude, m.latitude),
       longitude = coalesce(c.longitude, m.longitude)
  from public.courses m
 where c.state is null
   and c.id <> m.id
   and m.state is not null
   and m.latitude is not null
   and public.normalize_course_name(m.name) = public.normalize_course_name(c.name)
   and not exists (
     select 1 from public.courses d
      where d.id <> c.id
        and lower(d.name) = lower(c.name)
        and lower(coalesce(d.city, '')) = lower(coalesce(m.city, ''))
        and lower(coalesce(d.state, '')) = lower(coalesce(m.state, ''))
   );