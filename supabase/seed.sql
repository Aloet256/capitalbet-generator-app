-- Seed branches (region + name from the operational list supplied).
-- The trailing numbers in the source list (e.g. "Wankulukuku: 11") were not
-- specified as a particular field in the data model — they most likely
-- represent staff counts, generator size, or a branch code, so they are kept
-- here only in the `code` column as free reference text. Adjust as needed.

insert into branches (name, region, code) values
-- CENTRAL REGION
('Wankulukuku', 'Central Region', '11'),
('Kibiri', 'Central Region', '5'),
('Mutungo', 'Central Region', '0'),
('Kinawa', 'Central Region', '2'),
('Kosovo', 'Central Region', '1'),
('Kasubi', 'Central Region', '6'),
('Nateete', 'Central Region', '10'),
('Nateete Kutano', 'Central Region', '11'),
('Massajja', 'Central Region', '0'),
('Kanaaba', 'Central Region', '4'),
('Katwe', 'Central Region', '14'),
('Kalerwe', 'Central Region', '11'),
('Usafi', 'Central Region', '40'),
('Ovino', 'Central Region', '29'),
('Bujjuko', 'Central Region', null),
('Kyebando', 'Central Region', null),
('Kamukamu', 'Central Region', null),
('HBT Complex', 'Central Region', '5'),
('Kibuye', 'Central Region', '4'),
('Hollywood', 'Central Region', '0'),
('Sekaziga', 'Central Region', '22'),
('Kkungu', 'Central Region', '20'),
('Kireka Biira', 'Central Region', '0'),
('Kisenyi', 'Central Region', '4'),

-- IGANGA REGION
('Mafubira', 'Iganga Region', '9'),
('Naminya', 'Iganga Region', '1'),
('Idudi', 'Iganga Region', '4'),
('Iganga', 'Iganga Region', '12'),
('Iganga 2', 'Iganga Region', '12'),
('Iganga 3', 'Iganga Region', '4'),
('Iganga 4', 'Iganga Region', '0'),
('Bugiri', 'Iganga Region', '2'),

-- NORTHERN REGION
('Odramachaku', 'Northern Region', null),
('Arua Main', 'Northern Region', null),
('Gulu', 'Northern Region', null),
('Bweyale', 'Northern Region', null),

-- BUSIA REGION
('Tira', 'Busia Region', '2'),
('Busia', 'Busia Region', '43'),
('Busia 3', 'Busia Region', '17'),
('Busia Park', 'Busia Region', '23'),
('Masafu', 'Busia Region', null),

-- WESTERN REGION
('Kabale', 'Western Region', '2'),
('Kabale Two', 'Western Region', '5'),
('Ruti', 'Western Region', '2'),
('Rwahi', 'Western Region', '8'),
('Mbarara Kizungu', 'Western Region', '3'),
('Mbarara Main', 'Western Region', '1'),
('Kakooba', 'Western Region', '3'),

-- MBALE REGION
('Kumi Road', 'Mbale Region', null),
('Mooni', 'Mbale Region', null),
('Mbale Main', 'Mbale Region', null),
('Budadiri', 'Mbale Region', null),
('Bugwere Market', 'Mbale Region', null),

-- MUKONO REGION
('Wantoni', 'Mukono Region', '16'),
('Kalagi', 'Mukono Region', '1'),
('Mukono', 'Mukono Region', '2'),
('Nakifuma', 'Mukono Region', '10'),
('Nasuuti', 'Mukono Region', '0'),
('Namuyenje', 'Mukono Region', '4'),
('Namataba', 'Mukono Region', '11'),
('Kasenge', 'Mukono Region', '0'),
('Kasawo', 'Mukono Region', null);

-- Default admin note: create the actual auth user via Supabase Auth
-- with email admin@capitalbet.example and a strong temporary password, then link it here:
--
-- insert into admins (auth_user_id, full_name, email, must_change_password)
-- values ('<auth-user-uuid>', 'Super Admin', 'admin@capitalbet.example', false);
--
-- The frontend maps username "admin" to this email through VITE_ADMIN_USERNAME
-- and VITE_ADMIN_EMAIL.
