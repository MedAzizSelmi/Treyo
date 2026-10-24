-- The skills learners choose to develop at onboarding, moved from the app
-- into the database so administrators can add to them (SkillOptionService).
--
-- Until October 2026 the list was written into treyo-mobile's onboarding
-- step 2, so a field such as IT could not gain a skill without a new
-- release of the app. These are exactly the 67 skills it listed, under
-- the same field keys, so nothing a learner already chose disappears.
-- name stays the English name the app sent and learners' profiles store
-- (students.specific_interests); name_fr / name_ar / name_es are only how the
-- app shows it, and are NULL where the name is the same in every language.
--
-- Seeded here rather than at startup, so a skill an administrator deletes
-- does not come back on the next restart. Fixed ids make the seed safe to
-- re-run: ON CONFLICT leaves existing rows, and their edits, alone.
--
-- In development ddl-auto=update will already have created the table, empty;
-- run this file to fill it. Safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS skill_options (
    skill_id   VARCHAR(50)  PRIMARY KEY,
    field      VARCHAR(30),
    name       VARCHAR(100),
    name_fr    VARCHAR(100),
    name_ar    VARCHAR(100),
    name_es    VARCHAR(100),
    is_active  BOOLEAN,
    sort_order INTEGER,
    created_at TIMESTAMP    NOT NULL,
    updated_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_skill_options_field ON skill_options (field);

INSERT INTO skill_options (skill_id, field, name, name_fr, name_ar, name_es, is_active, sort_order, created_at) VALUES
    ('SKL_INFO_01', 'informatique', 'React', NULL, NULL, NULL, TRUE, 1, now()),
    ('SKL_INFO_02', 'informatique', 'Java', NULL, NULL, NULL, TRUE, 2, now()),
    ('SKL_INFO_03', 'informatique', 'Python', NULL, NULL, NULL, TRUE, 3, now()),
    ('SKL_INFO_04', 'informatique', 'JavaScript', NULL, NULL, NULL, TRUE, 4, now()),
    ('SKL_INFO_05', 'informatique', 'Node.js', NULL, NULL, NULL, TRUE, 5, now()),
    ('SKL_INFO_06', 'informatique', 'Angular', NULL, NULL, NULL, TRUE, 6, now()),
    ('SKL_INFO_07', 'informatique', 'Vue.js', NULL, NULL, NULL, TRUE, 7, now()),
    ('SKL_INFO_08', 'informatique', 'TypeScript', NULL, NULL, NULL, TRUE, 8, now()),
    ('SKL_INFO_09', 'informatique', 'PHP', NULL, NULL, NULL, TRUE, 9, now()),
    ('SKL_INFO_10', 'informatique', 'C++', NULL, NULL, NULL, TRUE, 10, now()),
    ('SKL_INFO_11', 'informatique', 'Mobile Development', 'Développement mobile', 'تطوير تطبيقات الهاتف', 'Desarrollo móvil', TRUE, 11, now()),
    ('SKL_INFO_12', 'informatique', 'Web Development', 'Développement web', 'تطوير الويب', 'Desarrollo web', TRUE, 12, now()),
    ('SKL_ELEC_01', 'electronique', 'Arduino', NULL, NULL, NULL, TRUE, 1, now()),
    ('SKL_ELEC_02', 'electronique', 'Raspberry Pi', NULL, NULL, NULL, TRUE, 2, now()),
    ('SKL_ELEC_03', 'electronique', 'IoT', 'IoT (Internet des objets)', 'إنترنت الأشياء', 'IoT (Internet de las cosas)', TRUE, 3, now()),
    ('SKL_ELEC_04', 'electronique', 'Microcontrollers', 'Microcontrôleurs', 'المتحكمات الدقيقة', 'Microcontroladores', TRUE, 4, now()),
    ('SKL_ELEC_05', 'electronique', 'Circuit Design', 'Conception de circuits', 'تصميم الدوائر', 'Diseño de circuitos', TRUE, 5, now()),
    ('SKL_ELEC_06', 'electronique', 'Embedded Systems', 'Systèmes embarqués', 'الأنظمة المدمجة', 'Sistemas embebidos', TRUE, 6, now()),
    ('SKL_ELEC_07', 'electronique', 'Robotics', 'Robotique', 'الروبوتات', 'Robótica', TRUE, 7, now()),
    ('SKL_ELEC_08', 'electronique', 'PCB Design', 'Conception de PCB', 'تصميم الدوائر المطبوعة', 'Diseño de PCB', TRUE, 8, now()),
    ('SKL_MKTG_01', 'marketing', 'Digital Marketing', 'Marketing digital', 'التسويق الرقمي', 'Marketing digital', TRUE, 1, now()),
    ('SKL_MKTG_02', 'marketing', 'SEO', 'SEO (référencement)', 'تحسين محركات البحث', 'SEO (posicionamiento)', TRUE, 2, now()),
    ('SKL_MKTG_03', 'marketing', 'Social Media', 'Réseaux sociaux', 'وسائل التواصل الاجتماعي', 'Redes sociales', TRUE, 3, now()),
    ('SKL_MKTG_04', 'marketing', 'Content Marketing', 'Marketing de contenu', 'تسويق المحتوى', 'Marketing de contenidos', TRUE, 4, now()),
    ('SKL_MKTG_05', 'marketing', 'Email Marketing', 'E-mailing', 'التسويق عبر البريد الإلكتروني', 'Email marketing', TRUE, 5, now()),
    ('SKL_MKTG_06', 'marketing', 'Analytics', 'Analyse d''audience', 'التحليلات', 'Analítica', TRUE, 6, now()),
    ('SKL_MKTG_07', 'marketing', 'Advertising', 'Publicité', 'الإعلان', 'Publicidad', TRUE, 7, now()),
    ('SKL_MKTG_08', 'marketing', 'Brand Management', 'Gestion de marque', 'إدارة العلامة التجارية', 'Gestión de marca', TRUE, 8, now()),
    ('SKL_DSGN_01', 'design', 'UI/UX', NULL, NULL, NULL, TRUE, 1, now()),
    ('SKL_DSGN_02', 'design', 'Graphic Design', 'Design graphique', 'التصميم الجرافيكي', 'Diseño gráfico', TRUE, 2, now()),
    ('SKL_DSGN_03', 'design', 'Web Design', 'Webdesign', 'تصميم المواقع', 'Diseño web', TRUE, 3, now()),
    ('SKL_DSGN_04', 'design', 'Adobe Photoshop', NULL, NULL, NULL, TRUE, 4, now()),
    ('SKL_DSGN_05', 'design', 'Figma', NULL, NULL, NULL, TRUE, 5, now()),
    ('SKL_DSGN_06', 'design', 'Illustration', 'Illustration', 'الرسم التوضيحي', 'Ilustración', TRUE, 6, now()),
    ('SKL_DSGN_07', 'design', '3D Design', 'Design 3D', 'التصميم ثلاثي الأبعاد', 'Diseño 3D', TRUE, 7, now()),
    ('SKL_DSGN_08', 'design', 'Motion Graphics', 'Motion design', 'الرسوم المتحركة', 'Motion graphics', TRUE, 8, now()),
    ('SKL_BUSI_01', 'business', 'Entrepreneurship', 'Entrepreneuriat', 'ريادة الأعمال', 'Emprendimiento', TRUE, 1, now()),
    ('SKL_BUSI_02', 'business', 'Management', 'Management', 'الإدارة', 'Gestión', TRUE, 2, now()),
    ('SKL_BUSI_03', 'business', 'Leadership', 'Leadership', 'القيادة', 'Liderazgo', TRUE, 3, now()),
    ('SKL_BUSI_04', 'business', 'Strategy', 'Stratégie', 'الاستراتيجية', 'Estrategia', TRUE, 4, now()),
    ('SKL_BUSI_05', 'business', 'Finance', 'Finance', 'المالية', 'Finanzas', TRUE, 5, now()),
    ('SKL_BUSI_06', 'business', 'Sales', 'Vente', 'المبيعات', 'Ventas', TRUE, 6, now()),
    ('SKL_BUSI_07', 'business', 'Project Management', 'Gestion de projet', 'إدارة المشاريع', 'Gestión de proyectos', TRUE, 7, now()),
    ('SKL_BUSI_08', 'business', 'HR', 'Ressources humaines', 'الموارد البشرية', 'Recursos humanos', TRUE, 8, now()),
    ('SKL_LANG_01', 'langues', 'English', 'Anglais', 'الإنجليزية', 'Inglés', TRUE, 1, now()),
    ('SKL_LANG_02', 'langues', 'French', 'Français', 'الفرنسية', 'Francés', TRUE, 2, now()),
    ('SKL_LANG_03', 'langues', 'Spanish', 'Espagnol', 'الإسبانية', 'Español', TRUE, 3, now()),
    ('SKL_LANG_04', 'langues', 'German', 'Allemand', 'الألمانية', 'Alemán', TRUE, 4, now()),
    ('SKL_LANG_05', 'langues', 'Arabic', 'Arabe', 'العربية', 'Árabe', TRUE, 5, now()),
    ('SKL_LANG_06', 'langues', 'Chinese', 'Chinois', 'الصينية', 'Chino', TRUE, 6, now()),
    ('SKL_LANG_07', 'langues', 'Italian', 'Italien', 'الإيطالية', 'Italiano', TRUE, 7, now()),
    ('SKL_LANG_08', 'langues', 'Japanese', 'Japonais', 'اليابانية', 'Japonés', TRUE, 8, now()),
    ('SKL_SANT_01', 'sante', 'Nutrition', 'Nutrition', 'التغذية', 'Nutrición', TRUE, 1, now()),
    ('SKL_SANT_02', 'sante', 'Fitness', 'Fitness', 'اللياقة البدنية', 'Fitness', TRUE, 2, now()),
    ('SKL_SANT_03', 'sante', 'Mental Health', 'Santé mentale', 'الصحة النفسية', 'Salud mental', TRUE, 3, now()),
    ('SKL_SANT_04', 'sante', 'First Aid', 'Premiers secours', 'الإسعافات الأولية', 'Primeros auxilios', TRUE, 4, now()),
    ('SKL_SANT_05', 'sante', 'Yoga', 'Yoga', 'اليوغا', 'Yoga', TRUE, 5, now()),
    ('SKL_SANT_06', 'sante', 'Physiotherapy', 'Kinésithérapie', 'العلاج الطبيعي', 'Fisioterapia', TRUE, 6, now()),
    ('SKL_SANT_07', 'sante', 'Medical Terminology', 'Terminologie médicale', 'المصطلحات الطبية', 'Terminología médica', TRUE, 7, now()),
    ('SKL_FINA_01', 'finance', 'Investing', 'Investissement', 'الاستثمار', 'Inversión', TRUE, 1, now()),
    ('SKL_FINA_02', 'finance', 'Accounting', 'Comptabilité', 'المحاسبة', 'Contabilidad', TRUE, 2, now()),
    ('SKL_FINA_03', 'finance', 'Trading', 'Trading', 'التداول', 'Trading', TRUE, 3, now()),
    ('SKL_FINA_04', 'finance', 'Personal Finance', 'Finances personnelles', 'المالية الشخصية', 'Finanzas personales', TRUE, 4, now()),
    ('SKL_FINA_05', 'finance', 'Banking', 'Banque', 'الخدمات المصرفية', 'Banca', TRUE, 5, now()),
    ('SKL_FINA_06', 'finance', 'Insurance', 'Assurance', 'التأمين', 'Seguros', TRUE, 6, now()),
    ('SKL_FINA_07', 'finance', 'Cryptocurrency', 'Cryptomonnaies', 'العملات المشفرة', 'Criptomonedas', TRUE, 7, now()),
    ('SKL_FINA_08', 'finance', 'Financial Planning', 'Planification financière', 'التخطيط المالي', 'Planificación financiera', TRUE, 8, now())
ON CONFLICT (skill_id) DO NOTHING;

COMMIT;
