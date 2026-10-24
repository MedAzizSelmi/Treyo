-- Professional experience as entries, and skills to suggest on the CV screen.
--
-- experience_entries (students, trainers)
--   Since October 2026 the onboarding CV screens build experience one entry
--   at a time — organisation, position, from, to — or fill it from Affinda's
--   work history, instead of asking for a paragraph. The entries are JSON
--   (ExperienceEntries); professional_experience keeps a readable text made
--   from them, so everything that shows that text keeps working. Nullable:
--   older profiles have only the text, and still show it.
--
-- skill_options, group 'general'
--   The CV screen's skills box now suggests skills as one types ("c" shows
--   Communication, Creativity, C#, C++). Suggestions come from the
--   administrators' Skills list only. These 40 are skills a CV lists but
--   that are not something to develop under an onboarding field, so they go
--   in a 'general' group the onboarding never offers; administrators add to
--   it on the dashboard. Fixed ids: safe to re-run, and ON CONFLICT keeps
--   anything an administrator changed.
--
-- Run after 2026-10-25_skill_options.sql, which creates skill_options.
-- In development ddl-auto=update will already have added the columns.
-- Safe to re-run.

BEGIN;

ALTER TABLE students ADD COLUMN IF NOT EXISTS experience_entries TEXT;
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS experience_entries TEXT;

INSERT INTO skill_options (skill_id, field, name, name_fr, name_ar, name_es, is_active, sort_order, created_at) VALUES
    ('SKL_GEN_01', 'general', 'Communication', 'Communication', 'التواصل', 'Comunicación', TRUE, 1, now()),
    ('SKL_GEN_02', 'general', 'Creativity', 'Créativité', 'الإبداع', 'Creatividad', TRUE, 2, now()),
    ('SKL_GEN_03', 'general', 'Teamwork', 'Travail d''équipe', 'العمل الجماعي', 'Trabajo en equipo', TRUE, 3, now()),
    ('SKL_GEN_04', 'general', 'Problem Solving', 'Résolution de problèmes', 'حل المشكلات', 'Resolución de problemas', TRUE, 4, now()),
    ('SKL_GEN_05', 'general', 'Critical Thinking', 'Esprit critique', 'التفكير النقدي', 'Pensamiento crítico', TRUE, 5, now()),
    ('SKL_GEN_06', 'general', 'Time Management', 'Gestion du temps', 'إدارة الوقت', 'Gestión del tiempo', TRUE, 6, now()),
    ('SKL_GEN_07', 'general', 'Public Speaking', 'Prise de parole en public', 'التحدث أمام الجمهور', 'Hablar en público', TRUE, 7, now()),
    ('SKL_GEN_08', 'general', 'Negotiation', 'Négociation', 'التفاوض', 'Negociación', TRUE, 8, now()),
    ('SKL_GEN_09', 'general', 'Adaptability', 'Adaptabilité', 'القدرة على التكيف', 'Adaptabilidad', TRUE, 9, now()),
    ('SKL_GEN_10', 'general', 'Customer Service', 'Service client', 'خدمة العملاء', 'Atención al cliente', TRUE, 10, now()),
    ('SKL_GEN_11', 'general', 'Attention to Detail', 'Sens du détail', 'الاهتمام بالتفاصيل', 'Atención al detalle', TRUE, 11, now()),
    ('SKL_GEN_12', 'general', 'Decision Making', 'Prise de décision', 'اتخاذ القرار', 'Toma de decisiones', TRUE, 12, now()),
    ('SKL_GEN_13', 'general', 'Conflict Resolution', 'Gestion des conflits', 'حل النزاعات', 'Resolución de conflictos', TRUE, 13, now()),
    ('SKL_GEN_14', 'general', 'Emotional Intelligence', 'Intelligence émotionnelle', 'الذكاء العاطفي', 'Inteligencia emocional', TRUE, 14, now()),
    ('SKL_GEN_15', 'general', 'Presentation Skills', 'Présentation orale', 'مهارات العرض', 'Presentaciones', TRUE, 15, now()),
    ('SKL_GEN_16', 'general', 'Writing', 'Rédaction', 'الكتابة', 'Redacción', TRUE, 16, now()),
    ('SKL_GEN_17', 'general', 'Research', 'Recherche', 'البحث', 'Investigación', TRUE, 17, now()),
    ('SKL_GEN_18', 'general', 'Organisation', 'Organisation', 'التنظيم', 'Organización', TRUE, 18, now()),
    ('SKL_GEN_19', 'general', 'Teaching', 'Enseignement', 'التدريس', 'Enseñanza', TRUE, 19, now()),
    ('SKL_GEN_20', 'general', 'Coaching', 'Coaching', 'التوجيه', 'Coaching', TRUE, 20, now()),
    ('SKL_GEN_21', 'general', 'Microsoft Office', NULL, NULL, NULL, TRUE, 21, now()),
    ('SKL_GEN_22', 'general', 'Microsoft Excel', NULL, NULL, NULL, TRUE, 22, now()),
    ('SKL_GEN_23', 'general', 'Microsoft Word', NULL, NULL, NULL, TRUE, 23, now()),
    ('SKL_GEN_24', 'general', 'Microsoft PowerPoint', NULL, NULL, NULL, TRUE, 24, now()),
    ('SKL_GEN_25', 'general', 'Google Workspace', NULL, NULL, NULL, TRUE, 25, now()),
    ('SKL_GEN_26', 'general', 'Data Analysis', 'Analyse de données', 'تحليل البيانات', 'Análisis de datos', TRUE, 26, now()),
    ('SKL_GEN_27', 'general', 'Power BI', NULL, NULL, NULL, TRUE, 27, now()),
    ('SKL_GEN_28', 'general', 'SQL', NULL, NULL, NULL, TRUE, 28, now()),
    ('SKL_GEN_29', 'general', 'C', NULL, NULL, NULL, TRUE, 29, now()),
    ('SKL_GEN_30', 'general', 'C#', NULL, NULL, NULL, TRUE, 30, now()),
    ('SKL_GEN_31', 'general', 'Git', NULL, NULL, NULL, TRUE, 31, now()),
    ('SKL_GEN_32', 'general', 'Docker', NULL, NULL, NULL, TRUE, 32, now()),
    ('SKL_GEN_33', 'general', 'Linux', NULL, NULL, NULL, TRUE, 33, now()),
    ('SKL_GEN_34', 'general', 'Cloud Computing', 'Cloud computing', 'الحوسبة السحابية', 'Computación en la nube', TRUE, 34, now()),
    ('SKL_GEN_35', 'general', 'Machine Learning', 'Apprentissage automatique', 'تعلّم الآلة', 'Aprendizaje automático', TRUE, 35, now()),
    ('SKL_GEN_36', 'general', 'Cybersecurity', 'Cybersécurité', 'الأمن السيبراني', 'Ciberseguridad', TRUE, 36, now()),
    ('SKL_GEN_37', 'general', 'Networking', 'Réseaux informatiques', 'الشبكات', 'Redes informáticas', TRUE, 37, now()),
    ('SKL_GEN_38', 'general', 'CRM', NULL, NULL, NULL, TRUE, 38, now()),
    ('SKL_GEN_39', 'general', 'Supply Chain', 'Chaîne d''approvisionnement', 'سلسلة الإمداد', 'Cadena de suministro', TRUE, 39, now()),
    ('SKL_GEN_40', 'general', 'Quality Management', 'Gestion de la qualité', 'إدارة الجودة', 'Gestión de la calidad', TRUE, 40, now())
ON CONFLICT (skill_id) DO NOTHING;

COMMIT;
