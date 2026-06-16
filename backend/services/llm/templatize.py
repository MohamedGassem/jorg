# backend/services/llm/templatize.py
"""LLM call producing a templatize operation plan for an uploaded docx."""

from __future__ import annotations

import json
from typing import Any

from services.documents.templatize_ops import TemplatizePlan
from services.llm.client import LLMRefusalError, parse_structured

_SYNTAX_GUIDE = """\
Syntaxe docxtpl disponible :
- Champs scalaires : {{first_name}}, {{last_name}}, {{title}}, etc. (liste fournie plus bas).
- Boucle sur paragraphes : une operation wrap_paragraphs_loop insere
  {%p for <var> in <collection> %} avant le bloc et {%p endfor %} apres.
- Boucle sur lignes de tableau : une operation wrap_table_rows_loop insere une ligne dediee
  {%tr for <var> in <collection> %} avant et {%tr endfor %} apres.
- Collections et variables de boucle : experiences (var exp : exp.client_name, exp.role,
  exp.start_date, exp.end_date, exp.description, exp.context, exp.achievements_summary),
  skills (var sk : sk.name, sk.kind_label, sk.self_assessed_level), educations (var edu :
  edu.school, edu.degree, edu.field_of_study, edu.start_date, edu.end_date), certifications
  (var cert : cert.name, cert.issuer, cert.issue_date), languages (var lang : lang.name,
  lang.level_label).
"""

_INSTRUCTIONS = """\
Tu templatises le modele de dossier Word d'un cabinet de recrutement. Le document contient
un candidat FICTIF d'exemple. Produis un plan d'operations qui :
1. Remplace chaque valeur du candidat fictif par le placeholder correspondant (replace_text).
   Ne remplace JAMAIS les libelles fixes du document (titres de sections, etiquettes comme
   "Nom :", "Experiences") : uniquement les valeurs d'exemple.
2. Detecte les blocs repetes (plusieurs experiences, formations, etc.) : le PREMIER bloc
   devient le gabarit (templatise ses valeurs puis entoure-le d'une boucle), les blocs
   suivants sont supprimes via delete_block.
3. Signale via flag_residual tout texte fictif residuel que tu ne peux pas mapper
   (accroche redigee, mention specifique au candidat d'exemple), sans le modifier.
Les index de paragraphes/tableaux/lignes/cellules sont ceux de la structure fournie.
N'invente aucun placeholder hors de la liste des champs connus.
"""


def build_prompt(
    structure: dict[str, Any], known_keys: list[str], render_errors: str | None
) -> str:
    parts = [
        _INSTRUCTIONS,
        _SYNTAX_GUIDE,
        "Champs scalaires connus : " + ", ".join(sorted(known_keys)),
        "Structure du document (index python-docx) :",
        json.dumps(structure, ensure_ascii=False, indent=1),
    ]
    if render_errors:
        parts.append(
            "IMPORTANT - la tentative precedente a produit un document qui ne rend pas. "
            f"Erreur du moteur : {render_errors}. Corrige le plan en consequence."
        )
    return "\n\n".join(parts)


class TemplatizeLLMError(Exception):
    """Raised when the LLM call fails or refuses."""


async def request_plan(
    client: Any,
    *,
    model: str,
    structure: dict[str, Any],
    known_keys: list[str],
    render_errors: str | None,
) -> TemplatizePlan:
    prompt = build_prompt(structure, known_keys, render_errors)
    try:
        return await parse_structured(
            client, model=model, prompt=prompt, output_format=TemplatizePlan
        )
    except LLMRefusalError as exc:
        raise TemplatizeLLMError(str(exc)) from exc
