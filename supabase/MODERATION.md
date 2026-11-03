# Reviewing reported photos

Users can report a sighting photo or a profile photo from the app. When **2
different people whose accounts are at least a week old** report the same
photo, it is hidden straight away and waits for you here. Reports from newer
accounts are saved and listed below, but never hide anything on their own.
Set up by `2026-11-02_photo_reports.sql` and
`2026-11-02_photo_reports_hardening.sql`.

Apple expects reports to be acted on promptly, so check this every few days
(at least weekly).

Run these in the **production** SQL editor.

## 1. What's waiting

```sql
-- Hidden photos waiting for review, with why people reported them.
select h.photo_url, h.kind, h.report_count, h.hidden_at,
       array_agg(r.reason) as reasons
from public.hidden_photos h
join public.photo_reports r on r.photo_url = h.photo_url
where h.review = 'pending'
group by h.photo_url, h.kind, h.report_count, h.hidden_at
order by h.hidden_at;

-- Photos with one report so far (still showing in the app).
select photo_url, kind, reason, created_at
from public.photo_reports r
where not exists (select 1 from public.hidden_photos h where h.photo_url = r.photo_url)
order by created_at desc;
```

Open each `photo_url` in a browser to look at it.

## 2. Decide

**It was fine: put it back.** It will never be auto-hidden again.

```sql
select public.restore_hidden_photo('<photo_url>');
```

**It should go: delete the file.** The photo is already gone from the app.
To delete the file itself, open Storage in the dashboard, go to the bucket in the
URL (`sighting-photos` or `avatars`) and delete the file at the path after
`/public/<bucket>/`. Then record the decision:

```sql
update public.hidden_photos
set review = 'removed', reviewed_at = now()
where photo_url = '<photo_url>';
```

**A photo with one report that clearly breaks the rules:** you don't have to
wait for a second report. Hide it now:

```sql
-- Sighting photo
insert into public.hidden_photos (photo_url, kind, sighting_id, owner_id, report_count)
select photo_url, kind, sighting_id, owner_id, 1
from public.photo_reports where photo_url = '<photo_url>' limit 1;
update public.sightings set photo_url = null where photo_url = '<photo_url>';
-- Profile photo: replace the last line with
-- update public.profiles set avatar_url = null where avatar_url = '<photo_url>';
```

Then delete the file as above.

## Repeat offenders

```sql
-- People whose photos keep getting hidden.
select owner_id, count(*) as hidden
from public.hidden_photos
where review in ('pending', 'removed') and owner_id is not null
group by owner_id
order by hidden desc;
```
