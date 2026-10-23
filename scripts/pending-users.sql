SELECT p.user_id, p.name, u.email, p.role
FROM profiles AS p
JOIN auth.users AS u ON u.id = p.user_id
WHERE p.role = 'pending'
ORDER BY p.name, u.email;
