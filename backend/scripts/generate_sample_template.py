#!/usr/bin/env python3
"""One-shot script to generate backend/static/sample_template.docx."""
from pathlib import Path
from docx import Document
from docx.shared import Pt


def main() -> None:
    doc = Document()

    doc.add_heading("Dossier de compétences — {{NOM}} {{PRENOM}}", level=1)

    doc.add_heading("Informations générales", level=2)
    table = doc.add_table(rows=4, cols=2)
    table.style = "Table Grid"
    rows = table.rows
    rows[0].cells[0].text = "Titre"
    rows[0].cells[1].text = "{{TITRE}}"
    rows[1].cells[0].text = "Localisation"
    rows[1].cells[1].text = "{{LOCALISATION}}"
    rows[2].cells[0].text = "TJM"
    rows[2].cells[1].text = "{{TJM}} €/j"
    rows[3].cells[0].text = "Disponibilité"
    rows[3].cells[1].text = "{{DISPONIBILITE}}"

    doc.add_heading("Résumé", level=2)
    doc.add_paragraph("{{RESUME}}")

    doc.add_heading("Expériences professionnelles", level=2)
    doc.add_paragraph("{{#EXPERIENCES}}")
    p = doc.add_paragraph()
    run = p.add_run("{{EXP_CLIENT}} — {{EXP_ROLE}}")
    run.bold = True
    doc.add_paragraph("Période : {{EXP_DEBUT}} – {{EXP_FIN}}")
    doc.add_paragraph("Description : {{EXP_DESCRIPTION}}")
    doc.add_paragraph("Technologies : {{EXP_TECHNOLOGIES}}")
    doc.add_paragraph("{{/EXPERIENCES}}")

    doc.add_heading("Compétences", level=2)
    doc.add_paragraph("{{#COMPETENCES}}")
    doc.add_paragraph("• {{COMP_NOM}} ({{COMP_CATEGORIE}})")
    doc.add_paragraph("{{/COMPETENCES}}")

    doc.add_heading("Formations", level=2)
    doc.add_paragraph("{{#FORMATIONS}}")
    doc.add_paragraph("{{FORMATION_ECOLE}} — {{FORMATION_DIPLOME}} ({{FORMATION_DEBUT}}–{{FORMATION_FIN}})")
    doc.add_paragraph("{{/FORMATIONS}}")

    out = Path(__file__).parent.parent / "static" / "sample_template.docx"
    out.parent.mkdir(parents=True, exist_ok=True)
    doc.save(str(out))
    print(f"Generated: {out}")


if __name__ == "__main__":
    main()
