"""Génère les trois templates builtin (docxtpl) à partir des tokens CSS de la refonte.

Source de vérité visuelle : docs/templates/styles/cv.css (refonte claude design).
Le script parse les tokens (couleurs, échelle typo, espacements), compose l'OOXML
directement (approche annexe p. 09 du document de refonte) en y insérant les tags
Jinja/docxtpl consommés par services/documents/docx_engine.py, puis écrit les
fichiers dans backend/static/builtin_templates/.

Usage : uv run python scripts/generate_builtin_templates.py
"""

from __future__ import annotations

import re
import zipfile
from io import BytesIO
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
CSS_PATH = BACKEND_DIR.parent / "docs" / "templates" / "styles" / "cv.css"
OUT_DIR = BACKEND_DIR / "static" / "builtin_templates"

W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
R_NS = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'

PAGE_WIDTH = 10092  # twips utiles (A4 - marges)


def parse_css_tokens(css_text: str) -> dict[str, str]:
    tokens = dict(re.findall(r"--cv-([a-z0-9-]+)\s*:\s*([^;]+);", css_text))
    if not tokens:
        raise ValueError(f"Aucun token --cv-* trouvé dans {CSS_PATH}")
    return {key: value.strip() for key, value in tokens.items()}


def hex_color(value: str) -> str:
    if not value.startswith("#"):
        raise ValueError(f"Couleur attendue en hex, reçu: {value}")
    return value.lstrip("#").upper()


def half_points(value: str) -> int:
    """'9.5pt' -> 19 (OOXML w:sz est en demi-points)."""
    return round(float(value.removesuffix("pt")) * 2)


def mm_twips(value: str) -> int:
    """'3mm' -> 170 (1 mm = 56.693 twips)."""
    return round(float(value.removesuffix("mm")) * 56.6929)


class Theme:
    """Tokens cv.css convertis en unités OOXML."""

    def __init__(self, tokens: dict[str, str]) -> None:
        self.ink = hex_color(tokens["ink"])
        self.body = hex_color(tokens["body"])
        self.meta = hex_color(tokens["meta"])
        self.faint = hex_color(tokens["faint"])
        self.line = hex_color(tokens["line"])
        self.wash = hex_color(tokens["wash"])
        self.accent = hex_color(tokens["accent"])
        self.accent_deep = hex_color(tokens["accent-deep"])
        self.accent_tint = hex_color(tokens["accent-tint"])
        self.fs_name = half_points(tokens["fs-name"])
        self.fs_role = half_points(tokens["fs-role"])
        self.fs_kpi = half_points(tokens["fs-kpi"])
        self.fs_h2 = half_points(tokens["fs-h2"])
        self.fs_body = half_points(tokens["fs-body"])
        self.fs_small = half_points(tokens["fs-small"])
        self.fs_meta = half_points(tokens["fs-meta"])
        # Échelle d'espacements --cv-sp-1..5 en twips (~85/170/283/454/680).
        # Les autres valeurs de spacing() du script sont des ajustements fins
        # de rythme vertical validés visuellement, hors échelle CSS.
        self.sp = {n: mm_twips(tokens[f"sp-{n}"]) for n in range(1, 6)}


# ---------------------------------------------------------------------------
# Briques OOXML
# ---------------------------------------------------------------------------


def esc(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def run(
    text: str,
    *,
    color: str | None = None,
    sz: int | None = None,
    bold: bool = False,
    caps: bool = False,
    letter_spacing: int | None = None,
    border_color: str | None = None,
    shading: str | None = None,
) -> str:
    props = ""
    if bold:
        props += "<w:b/>"
    if caps:
        props += "<w:caps/>"
    if color:
        props += f'<w:color w:val="{color}"/>'
    if letter_spacing is not None:
        props += f'<w:spacing w:val="{letter_spacing}"/>'
    if sz is not None:
        props += f'<w:sz w:val="{sz}"/><w:szCs w:val="{sz}"/>'
    if border_color:
        props += f'<w:bdr w:val="single" w:sz="4" w:space="4" w:color="{border_color}"/>'
    if shading:
        props += f'<w:shd w:val="clear" w:color="auto" w:fill="{shading}"/>'
    rpr = f"<w:rPr>{props}</w:rPr>" if props else ""
    return f'<w:r>{rpr}<w:t xml:space="preserve">{esc(text)}</w:t></w:r>'


def spacing(before: int, after: int, line: int) -> str:
    return f'<w:spacing w:before="{before}" w:after="{after}" w:line="{line}" w:lineRule="auto"/>'


def para(runs_xml: str, ppr: str = "") -> str:
    ppr_xml = f"<w:pPr>{ppr}</w:pPr>" if ppr else ""
    return f"<w:p>{ppr_xml}{runs_xml}</w:p>"


def tag_p(tag: str) -> str:
    """Paragraphe ne contenant qu'un tag docxtpl ({%p ... %}) : retiré au rendu."""
    return para(run(tag), spacing(0, 0, 240))


def spacer(after: int = 160) -> str:
    return para("", spacing(0, after, 100))


def cell(content_xml: str, width: int, tcpr_extra: str = "") -> str:
    return (
        f'<w:tc><w:tcPr><w:tcW w:w="{width}" w:type="dxa"/>{tcpr_extra}'
        f'<w:vAlign w:val="top"/></w:tcPr>{content_xml}</w:tc>'
    )


def bottom_border(color: str, sz: int = 4) -> str:
    return (
        f'<w:tcBorders><w:bottom w:val="single" w:sz="{sz}" w:space="0" w:color="{color}"/>'
        "</w:tcBorders>"
    )


def table(grid_cols: list[int], rows_xml: str, tblpr_extra: str = "") -> str:
    grid = "".join(f'<w:gridCol w:w="{w}"/>' for w in grid_cols)
    return (
        f'<w:tbl><w:tblPr><w:tblW w:w="{PAGE_WIDTH}" w:type="dxa"/>{tblpr_extra}'
        '<w:tblLayout w:type="fixed"/>'
        '<w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="0" w:type="dxa"/>'
        '<w:bottom w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar>'
        f"</w:tblPr><w:tblGrid>{grid}</w:tblGrid>{rows_xml}</w:tbl>"
    )


# ---------------------------------------------------------------------------
# Composants du système de design (cf. annexe p. 09 : mapping CSS -> OOXML)
# ---------------------------------------------------------------------------


def section_heading(theme: Theme, title: str, before: int = 400) -> str:
    """Tête de section : carré accent + capitales espacées + filet bas (.cv-h2)."""
    ppr = (
        "<w:keepNext/><w:keepLines/>"
        f'<w:pBdr><w:bottom w:val="single" w:sz="4" w:space="4" w:color="{theme.line}"/></w:pBdr>'
        + spacing(before, theme.sp[2], 240)
    )
    runs = run("■  ", bold=True, color=theme.accent, sz=14) + run(
        title, bold=True, caps=True, color=theme.ink, letter_spacing=26, sz=theme.fs_h2
    )
    return para(runs, ppr)


def header_block(theme: Theme) -> str:
    """En-tête : nom + titre à gauche, contacts à droite (.cv-head)."""
    name_cell = para(
        run(
            "{{ first_name }} {{ last_name }}",
            bold=True,
            color=theme.ink,
            letter_spacing=-6,
            sz=theme.fs_name,
        ),
        spacing(0, 40, 240),
    ) + para(
        run("{{ title }}", color=theme.accent, sz=theme.fs_role),
        spacing(0, 0, 240),
    )

    def contact_line(condition: str, text: str) -> str:
        line = para(
            run(text, color=theme.meta, sz=theme.fs_small),
            spacing(0, 0, 280) + '<w:jc w:val="right"/>',
        )
        return tag_p(f"{{%p if {condition} %}}") + line + tag_p("{%p endif %}")

    contact_cell = (
        contact_line("email_contact", "{{ email_contact }}")
        + contact_line("phone", "{{ phone }}")
        + contact_line(
            "linkedin_url",
            '{{ linkedin_url | replace("https://", "") | replace("http://", "") }}',
        )
        + "<w:p/>"
    )
    row = f"<w:tr>{cell(name_cell, 7000)}{cell(contact_cell, 3092)}</w:tr>"
    return table([7000, 3092], row)


def band_block(theme: Theme) -> str:
    """Bandeau commercial : disponibilité, TJM, mobilité, expérience (.cv-band)."""
    col = PAGE_WIDTH // 4

    def band_cell(label: str, value_runs: str) -> str:
        content = para(
            run(label, caps=True, color=theme.faint, letter_spacing=18, sz=theme.fs_meta),
            spacing(100, 30, 240),
        ) + para(value_runs, spacing(0, 100, 240))
        return cell(content, col)

    value = lambda text: run(text, bold=True, color=theme.ink, sz=theme.fs_body)  # noqa: E731
    small = lambda text: run(text, color=theme.meta, sz=theme.fs_small)  # noqa: E731

    cells = (
        band_cell(
            "Disponibilité",
            value(
                "{{ availability_label }}"
                "{% if availability_date %} {{ availability_date }}{% endif %}"
            ),
        )
        + band_cell(
            "TJM",
            run("{% if daily_rate %}", sz=theme.fs_body)
            + value("{{ daily_rate }} €")
            + small(" / jour")
            + run("{% else %}", sz=theme.fs_body)
            + value("—")
            + run("{% endif %}", sz=theme.fs_body),
        )
        + band_cell("Mobilité", value("{{ location_preference or location or work_mode_label }}"))
        + band_cell(
            "Expérience",
            value(
                "{% if years_of_experience %}{{ years_of_experience }} ans{% else %}—{% endif %}"
            ),
        )
    )
    borders = (
        f'<w:tblBorders><w:top w:val="single" w:sz="5" w:space="0" w:color="{theme.ink}"/>'
        f'<w:bottom w:val="single" w:sz="4" w:space="0" w:color="{theme.line}"/>'
        '<w:insideH w:val="none" w:sz="0" w:space="0" w:color="auto"/>'
        '<w:insideV w:val="none" w:sz="0" w:space="0" w:color="auto"/></w:tblBorders>'
    )
    return table([col] * 4, f"<w:tr>{cells}</w:tr>", borders)


def pitch_block(theme: Theme) -> str:
    line = para(run("{{ summary }}", color=theme.body, sz=20), spacing(0, 140, 330))
    return tag_p("{%p if summary %}") + line + tag_p("{%p endif %}")


def highlights_block(theme: Theme) -> str:
    """Faits marquants : cartes KPI depuis featured_achievements (.cv-highlights)."""
    card_props = (
        f'<w:tcBorders><w:top w:val="single" w:sz="13" w:space="0" w:color="{theme.accent}"/>'
        "</w:tcBorders>"
        f'<w:shd w:val="clear" w:color="auto" w:fill="{theme.wash}"/>'
        '<w:tcMar><w:top w:w="140" w:type="dxa"/><w:left w:w="140" w:type="dxa"/>'
        '<w:bottom w:w="140" w:type="dxa"/><w:right w:w="140" w:type="dxa"/></w:tcMar>'
    )
    card_content = (
        para(run("{{ h.kpi }}", bold=True, color=theme.ink, sz=theme.fs_kpi), spacing(0, 60, 240))
        + para(run("{{ h.text }}", color=theme.body, sz=theme.fs_small), spacing(0, 80, 270))
        + para(run("→ {{ h.ref }}", color=theme.meta, sz=theme.fs_meta), spacing(0, 0, 240))
    )
    row = (
        "<w:tr>"
        + cell(para(run("{%tc for h in featured_achievements %}")), 60)
        + cell(card_content, 3250, card_props)
        + cell(para(run("{%tc endfor %}")), 60)
        + "</w:tr>"
    )
    spacing_pr = '<w:tblCellSpacing w:w="40" w:type="dxa"/>'
    return (
        tag_p("{%p if featured_achievements %}")
        + section_heading(theme, "Faits marquants")
        + table([60, 3250, 60], row, spacing_pr)
        + tag_p("{%p endif %}")
    )


def featured_skills_block(theme: Theme) -> str:
    """Pastilles des compétences featured, plafonnées à 5 (.skill-feat)."""
    # Espaces insécables (\u00a0) : la pastille ne se coupe jamais en fin de
    # ligne, les retours se font entre pastilles (espaces normaux).
    nbsp = "\u00a0"
    pill_text = (
        f'{nbsp}{nbsp}{{{{ sk.name | replace(" ", "{nbsp}") }}}}'
        f"{{% if sk.self_assessed_level %}}{nbsp}\u00b7{nbsp}"
        f'{{{{ sk.self_assessed_level | replace(" ", "{nbsp}") }}}}'
        f"{{% endif %}}{nbsp}{nbsp}"
    )
    pill = run(
        pill_text,
        bold=True,
        color=theme.accent_deep,
        sz=theme.fs_body,
        border_color=theme.accent_tint,
        shading=theme.accent_tint,
    )
    runs = (
        run("{% for sk in skills_featured[:5] %}", sz=theme.fs_body)
        + pill
        + run("     ", sz=theme.fs_body)
        + run("{% endfor %}", sz=theme.fs_body)
    )
    line = para(runs, spacing(60, 180, 420))
    return tag_p("{%p if skills_featured %}") + line + tag_p("{%p endif %}")


def skill_groups_block(theme: Theme) -> str:
    """Groupes par catégorie : label + valeurs en ligne (.skill-group)."""
    label_cell = cell(
        para(
            run("{{ g.label }}", caps=True, color=theme.faint, letter_spacing=14, sz=theme.fs_meta),
            spacing(45, 45, 240),
        ),
        1900,
    )
    values_cell = cell(
        para(run("{{ g.names }}", color=theme.body, sz=theme.fs_small), spacing(45, 45, 300)),
        8192,
    )
    loop_open = cell(para(run("{%tr for g in skill_groups %}")), 1900) + cell("<w:p/>", 8192)
    loop_close = cell(para(run("{%tr endfor %}")), 1900) + cell("<w:p/>", 8192)
    rows = (
        f"<w:tr>{loop_open}</w:tr><w:tr>{label_cell}{values_cell}</w:tr><w:tr>{loop_close}</w:tr>"
    )
    return tag_p("{%p if skill_groups %}") + table([1900, 8192], rows) + tag_p("{%p endif %}")


def experience_block(theme: Theme, stack_label: str = "Stack", include_context: bool = True) -> str:
    """Une expérience : titre + période, contexte, stack méta, réalisations (.cv-xp)."""
    head = para(
        run("{{ exp.role }}", bold=True, color=theme.ink, sz=22)
        + run(
            "{% if exp.client_name %}  —  {{ exp.client_name }}{% endif %}", color=theme.body, sz=22
        )
        + "<w:r><w:tab/></w:r>"
        + run("{{ exp.start_date }} — {{ exp.end_date }}", color=theme.meta, sz=theme.fs_small),
        "<w:keepNext/><w:keepLines/>"
        f'<w:tabs><w:tab w:val="right" w:pos="{PAGE_WIDTH}"/></w:tabs>'
        + spacing(theme.sp[3], 60, 250),
    )

    def meta_line(condition: str, text: str) -> str:
        line = para(
            run(text, color=theme.meta, sz=theme.fs_small),
            "<w:keepNext/><w:keepLines/>" + spacing(0, 50, 280),
        )
        return tag_p(f"{{%p if {condition} %}}") + line + tag_p("{%p endif %}")

    stack = (
        tag_p("{%p if exp.skills %}")
        + para(
            run(f"{stack_label} — ", bold=True, color=theme.meta, sz=theme.fs_meta)
            + run(
                '{{ exp.skills | map(attribute="name") | join(" · ") }}',
                color=theme.faint,
                letter_spacing=4,
                sz=theme.fs_meta,
            ),
            "<w:keepNext/><w:keepLines/>" + spacing(0, 100, 240),
        )
        + tag_p("{%p endif %}")
    )

    featured_ach = para(
        run("{{ a.description }}", color=theme.body, sz=theme.fs_body)
        + run("{% if a.impact %}", sz=theme.fs_body)
        + run(" — ", color=theme.body, sz=theme.fs_body)
        + run("{{ a.impact }}", bold=True, color=theme.accent_deep, sz=theme.fs_body)
        + run("{% endif %}", sz=theme.fs_body),
        f'<w:pBdr><w:left w:val="single" w:sz="13" w:space="10" w:color="{theme.accent}"/></w:pBdr>'
        f'<w:shd w:val="clear" w:color="auto" w:fill="{theme.accent_tint}"/>'
        + spacing(70, 100, 280)
        + '<w:ind w:left="300" w:right="120"/>',
    )
    standard_ach = para(
        run("–   ", color=theme.faint, sz=theme.fs_body)  # noqa: RUF001 (tiret typographique)
        + run("{{ a.description }}", color=theme.body, sz=theme.fs_body)
        + run("{% if a.impact %}", sz=theme.fs_body)
        + run(" — ", color=theme.body, sz=theme.fs_body)
        + run("{{ a.impact }}", bold=True, color=theme.ink, sz=theme.fs_body)
        + run("{% endif %}", sz=theme.fs_body),
        spacing(0, 80, 280) + '<w:ind w:left="280" w:hanging="280"/>',
    )

    context_lines = ""
    if include_context:
        context_lines = meta_line("exp.context", "{{ exp.context }}") + meta_line(
            "exp.description", "{{ exp.description }}"
        )

    return (
        tag_p("{%p for exp in experiences %}")
        + head
        + context_lines
        + stack
        + tag_p('{%p for a in exp.achievement_items if a.featured == "true" %}')
        + featured_ach
        + tag_p("{%p endfor %}")
        + tag_p('{%p for a in exp.achievement_items if a.featured != "true" %}')
        + standard_ach
        + tag_p("{%p endfor %}")
        + tag_p("{%p endfor %}")
    )


def education_certifications_block(theme: Theme) -> str:
    """Formation et certifications côte à côte (.cv-cols-2)."""

    def mini_entries(loop_tag: str, title_text: str, sub_text: str) -> str:
        return (
            tag_p(loop_tag)
            + para(
                run(title_text, bold=True, color=theme.ink, sz=theme.fs_small), spacing(0, 20, 300)
            )
            + para(run(sub_text, color=theme.meta, sz=theme.fs_small), spacing(0, 100, 300))
            + tag_p("{%p endfor %}")
            + "<w:p/>"
        )

    formation_cell = section_heading(theme, "Formation", before=60) + mini_entries(
        "{%p for edu in educations %}",
        "{{ edu.degree }}{% if edu.field_of_study %}, {{ edu.field_of_study }}{% endif %}",
        "{{ edu.school }}{% if edu.period %} · {{ edu.period }}{% endif %}",
    )
    certification_cell = section_heading(theme, "Certifications", before=60) + mini_entries(
        "{%p for cert in certifications %}",
        "{{ cert.name }}",
        "{{ cert.issuer }}{% if cert.issue_date %} · {{ cert.issue_date }}{% endif %}",
    )
    row = (
        "<w:tr>"
        + cell(formation_cell, 4901)
        + cell("<w:p/>", 290)
        + cell(certification_cell, 4901)
        + "</w:tr>"
    )
    return table([4901, 290, 4901], row)


def languages_block(theme: Theme) -> str:
    line = para(
        run("{% for l in languages %}", sz=theme.fs_small)
        + run("{{ l.name }}", bold=True, color=theme.ink, sz=theme.fs_small)
        + run(
            " — {{ l.level_label }}{% if not loop.last %}      {% endif %}",
            color=theme.body,
            sz=theme.fs_small,
        )
        + run("{% endfor %}", sz=theme.fs_small),
        spacing(0, 40, 320),
    )
    return (
        tag_p("{%p if languages %}")
        + section_heading(theme, "Langues")
        + line
        + tag_p("{%p endif %}")
    )


def table_header_row(theme: Theme, columns: list[tuple[str, int]]) -> str:
    cells = ""
    for label, width in columns:
        cells += cell(
            para(
                run(label, caps=True, color=theme.faint, letter_spacing=14, sz=theme.fs_meta),
                spacing(20, 30, 240),
            ),
            width,
            bottom_border(theme.ink, sz=5),
        )
    return f"<w:tr>{cells}</w:tr>"


def skill_matrix_block(theme: Theme) -> str:
    """Matrice de niveaux (variante technique) : featured en tête, fond teinté."""
    columns = [("Compétence", 3000), ("Catégorie", 3592), ("Niveau", 3500)]
    line_border = bottom_border(theme.line)
    shading = f'<w:shd w:val="clear" w:color="auto" w:fill="{theme.accent_tint}"/>'
    feat_first = (
        f'<w:tcBorders><w:left w:val="single" w:sz="13" w:space="0" w:color="{theme.accent}"/>'
        f'<w:bottom w:val="single" w:sz="4" w:space="0" w:color="{theme.line}"/></w:tcBorders>'
        + shading
    )

    def data_row(name_props: str, other_props: str, name_color: str, name_bold: bool) -> str:
        pad = '<w:ind w:left="60"/>'
        return (
            "<w:tr>"
            + cell(
                para(
                    run("{{ sk.name }}", bold=name_bold, color=name_color, sz=theme.fs_small),
                    spacing(50, 65, 240) + pad,
                ),
                3000,
                name_props,
            )
            + cell(
                para(
                    run("{{ sk.kind_label }}", color=theme.body, sz=theme.fs_small),
                    spacing(50, 65, 240),
                ),
                3592,
                other_props,
            )
            + cell(
                para(
                    run("{{ sk.self_assessed_level }}", color=theme.body, sz=theme.fs_small),
                    spacing(50, 65, 240),
                ),
                3500,
                other_props,
            )
            + "</w:tr>"
        )

    def tag_row(tag: str) -> str:
        return (
            "<w:tr>"
            + cell(para(run(tag)), 3000)
            + cell("<w:p/>", 3592)
            + cell("<w:p/>", 3500)
            + "</w:tr>"
        )

    rows = (
        table_header_row(theme, columns)
        + tag_row("{%tr for sk in skills_featured %}")
        + data_row(feat_first, line_border + shading, theme.accent_deep, True)
        + tag_row("{%tr endfor %}")
        + tag_row('{%tr for sk in skills if sk.featured != "true" %}')
        + data_row(line_border, line_border, theme.ink, False)
        + tag_row("{%tr endfor %}")
    )
    return table([3000, 3592, 3500], rows)


def synoptic_block(theme: Theme) -> str:
    """Synoptique des missions (variante technique)."""
    columns = [("Client", 2500), ("Rôle", 2800), ("Période", 2000), ("Stack", 2792)]
    line_border = bottom_border(theme.line)

    def text_cell(text: str, width: int, *, bold: bool = False, color: str | None = None) -> str:
        return cell(
            para(
                run(text, bold=bold, color=color or theme.body, sz=theme.fs_small),
                spacing(50, 65, 240),
            ),
            width,
            line_border,
        )

    def tag_row(tag: str) -> str:
        cells = cell(para(run(tag)), 2500)
        for width in (2800, 2000, 2792):
            cells += cell("<w:p/>", width)
        return f"<w:tr>{cells}</w:tr>"

    data_row = (
        "<w:tr>"
        + text_cell("{{ exp.client_name }}", 2500, bold=True, color=theme.ink)
        + text_cell("{{ exp.role }}", 2800)
        + text_cell("{{ exp.start_date }} — {{ exp.end_date }}", 2000)
        + text_cell('{{ exp.skills | map(attribute="name") | join(" · ") }}', 2792)
        + "</w:tr>"
    )
    rows = (
        table_header_row(theme, columns)
        + tag_row("{%tr for exp in experiences %}")
        + data_row
        + tag_row("{%tr endfor %}")
    )
    return table([2500, 2800, 2000, 2792], rows)


# ---------------------------------------------------------------------------
# Assemblage des variantes
# ---------------------------------------------------------------------------


def document_xml(body_xml: str) -> str:
    sect = (
        '<w:sectPr><w:footerReference w:type="default" r:id="rId2"/>'
        '<w:pgSz w:w="11906" w:h="16838"/>'
        '<w:pgMar w:top="794" w:right="907" w:bottom="850" w:left="907"'
        ' w:header="567" w:footer="400" w:gutter="0"/></w:sectPr>'
    )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f"<w:document {W_NS} {R_NS}><w:body>{body_xml}{sect}</w:body></w:document>"
    )


def footer_xml(theme: Theme, doc_label: str) -> str:
    field = lambda instr: (  # noqa: E731
        f'<w:fldSimple w:instr=" {instr} "><w:r><w:rPr><w:color w:val="{theme.faint}"/>'
        '<w:sz w:val="13"/><w:szCs w:val="13"/></w:rPr><w:t>1</w:t></w:r></w:fldSimple>'
    )
    left = run(
        "{{ first_name }} {{ last_name }}{% if title %} — {{ title }}{% endif %}",
        color=theme.faint,
        letter_spacing=10,
        sz=13,
    )
    right = run(f"{doc_label} · ", color=theme.faint, letter_spacing=10, sz=13)
    sep = run("/", color=theme.faint, sz=13)
    ppr = (
        f'<w:pBdr><w:top w:val="single" w:sz="4" w:space="4" w:color="{theme.line}"/></w:pBdr>'
        f'<w:tabs><w:tab w:val="right" w:pos="{PAGE_WIDTH}"/></w:tabs>' + spacing(60, 0, 240)
    )
    paragraph = (
        f"<w:p><w:pPr>{ppr}</w:pPr>{left}<w:r><w:tab/></w:r>{right}"
        f"{field('PAGE')}{sep}{field('NUMPAGES')}</w:p>"
    )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f"<w:ftr {W_NS} {R_NS}>{paragraph}</w:ftr>"
    )


def styles_xml(theme: Theme) -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f"<w:styles {W_NS}><w:docDefaults><w:rPrDefault><w:rPr>"
        '<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>'
        f'<w:color w:val="{theme.body}"/><w:sz w:val="{theme.fs_body}"/>'
        f'<w:szCs w:val="{theme.fs_body}"/><w:lang w:val="fr-FR"/></w:rPr></w:rPrDefault>'
        '<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="300" w:lineRule="auto"/></w:pPr>'
        "</w:pPrDefault></w:docDefaults>"
        '<w:style w:type="paragraph" w:default="1" w:styleId="Normal">'
        '<w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>'
    )


def build_package(document: str, footer: str, styles: str) -> bytes:
    content_types = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels"'
        ' ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/word/document.xml" ContentType="application/'
        'vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        '<Override PartName="/word/styles.xml"'
        ' ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
        '<Override PartName="/word/footer1.xml"'
        ' ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>'
        "</Types>"
    )
    root_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1"'
        ' Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"'
        ' Target="word/document.xml"/></Relationships>'
    )
    document_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1"'
        ' Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles"'
        ' Target="styles.xml"/>'
        '<Relationship Id="rId2"'
        ' Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer"'
        ' Target="footer1.xml"/></Relationships>'
    )
    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", content_types)
        archive.writestr("_rels/.rels", root_rels)
        archive.writestr("word/_rels/document.xml.rels", document_rels)
        archive.writestr("word/document.xml", document)
        archive.writestr("word/styles.xml", styles)
        archive.writestr("word/footer1.xml", footer)
    return buffer.getvalue()


def build_profil_premium(theme: Theme) -> bytes:
    body = (
        header_block(theme)
        + spacer(180)
        + band_block(theme)
        + spacer()
        + pitch_block(theme)
        + highlights_block(theme)
        + section_heading(theme, "Compétences")
        + featured_skills_block(theme)
        + skill_groups_block(theme)
        + section_heading(theme, "Expériences")
        + experience_block(theme)
        + spacer()
        + education_certifications_block(theme)
        + languages_block(theme)
    )
    return build_package(
        document_xml(body), footer_xml(theme, "Dossier de compétences"), styles_xml(theme)
    )


def build_compact_esn(theme: Theme) -> bytes:
    # Variante compacte : pas de ligne contexte ni description pour tenir sur une page.
    compact = experience_block(theme, include_context=False)
    body = (
        header_block(theme)
        + spacer(180)
        + band_block(theme)
        + spacer()
        + pitch_block(theme)
        + section_heading(theme, "Compétences")
        + featured_skills_block(theme)
        + skill_groups_block(theme)
        + section_heading(theme, "Expériences")
        + compact
        + spacer()
        + education_certifications_block(theme)
        + languages_block(theme)
    )
    return build_package(
        document_xml(body), footer_xml(theme, "Dossier de compétences"), styles_xml(theme)
    )


def build_dossier_technique(theme: Theme) -> bytes:
    body = (
        header_block(theme)
        + spacer(180)
        + band_block(theme)
        + spacer()
        + pitch_block(theme)
        + section_heading(theme, "Compétences")
        + skill_matrix_block(theme)
        + section_heading(theme, "Synoptique des missions")
        + synoptic_block(theme)
        + section_heading(theme, "Expériences")
        + experience_block(theme, stack_label="Environnement")
        + spacer()
        + education_certifications_block(theme)
        + languages_block(theme)
    )
    return build_package(
        document_xml(body), footer_xml(theme, "Dossier technique"), styles_xml(theme)
    )


def main() -> None:
    theme = Theme(parse_css_tokens(CSS_PATH.read_text(encoding="utf-8")))
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    builders = {
        "profil_premium.docx": build_profil_premium,
        "compact_esn.docx": build_compact_esn,
        "dossier_technique.docx": build_dossier_technique,
    }
    for filename, builder in builders.items():
        path = OUT_DIR / filename
        path.write_bytes(builder(theme))
        print(f"OK {path.relative_to(BACKEND_DIR)}")


if __name__ == "__main__":
    main()
