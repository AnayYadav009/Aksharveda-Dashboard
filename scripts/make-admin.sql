-- Replace the email below, then run this in the Supabase SQL Editor.
INSERT INTO profiles (user_id, name, role)
SELECT id, COALESCE(NULLIF(raw_user_meta_data->>'name',''), split_part(email,'@',1)), 'management'
FROM auth.users WHERE email = 'CHANGE_ME@example.com'
ON CONFLICT (user_id) DO UPDATE SET role = 'management';
