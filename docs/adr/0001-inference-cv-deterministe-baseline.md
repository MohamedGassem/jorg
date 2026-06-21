# Inférence CV : l'extracteur déterministe est la baseline, le LLM est un upgrade différé

Statut : accepté (2026-06-21)

Le pipeline d'extraction CV (`services/cv/`) produit déjà une `CVStructuredProposal` complète via un
extracteur déterministe (`_deterministic_structured_proposal`), revue champ par champ par le candidat
(`CVExtractionProposal.status = pending_review`). `NoopCVLLMClient` est **intentionnel** : il déclenche
ce fallback déterministe, qui est la baseline de production, pas un système à moitié construit.

On bâtit le modèle L2/L3 (preuves, dossier) sur cette baseline plus la curation candidat. Le tier de
preuves `declared_only`/`inferred` (`source = cv_import`) est peuplé par le déterministe ; le tier
`evidenced` (liaison compétence↔expérience avec rôle/intensité, secteur, réalisations atomiques) vient
de la curation candidat. Un client LLM réel (`extract_profile_json`) reste un upgrade ciblé et différé,
à juger contre la baseline déterministe et à arbitrer côté RGPD (un CV envoyé à un LLM externe est un
traitement de données).
