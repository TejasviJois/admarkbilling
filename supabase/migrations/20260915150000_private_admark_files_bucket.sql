-- Make admark-files private. App uploads now use signed URLs.
-- Existing public URLs will 403 until refreshed via signed access / re-upload.

update storage.buckets
set public = false
where id = 'admark-files';
