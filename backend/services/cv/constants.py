from __future__ import annotations

import re

from services.text_utils import normalize_text as _normalise

MAX_CV_BYTES = 5 * 1024 * 1024
MIN_USABLE_TEXT_CHARS = 180
_MIN_SKILL_LEN = 3
_MAX_NGRAM_WORDS = 5
_MAX_SKILL_SUGGESTIONS = 60

ExtractionMethod = str


_EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}")
_PHONE_RE = re.compile(r"(?:(?:\+|00)\d{1,3}[\s.\-]?)?(?:\(?\d{1,4}\)?[\s.\-]?){2,5}\d{2,4}")
_LINKEDIN_RE = re.compile(
    r"(?:https?://)?(?:[a-z]{2,3}\.)?linkedin\.com/in/[A-Za-z0-9_%\-]+/?",
    re.IGNORECASE,
)
_DATE_RE = re.compile(
    r"\b(?:19|20)\d{2}\b|\b\d{1,2}[/-]\d{4}\b|\b(?:janvier|février|mars|avril|mai|juin|"
    r"juillet|août|septembre|octobre|novembre|décembre|january|february|march|april|may|"
    r"june|july|august|september|october|november|december)\s+(?:19|20)\d{2}\b",
    re.IGNORECASE,
)
_SECTION_KEYWORDS = {
    "experience": (
        "expérience",
        "experiences",
        "experience",
        "work experience",
        "employment",
        "experience professionnelle",
        "experiences professionnelles",
    ),
    "education": (
        "formation",
        "formations",
        "education",
        "éducation",
        "diplômes",
        "diplomes",
    ),
    "skills": ("compétences", "competences", "skills", "technologies", "outils"),
    "languages": ("langues", "langages", "languages"),
    "certifications": ("certifications", "certification"),
    "interests": (
        "centres d'intérêt",
        "centres d\u2019intérêt",
        "loisirs",
        "hobbies",
        "interests",
    ),
}
_SECTION_KEYWORDS_NORMALIZED: dict[str, frozenset[str]] = {
    section: frozenset(_normalise(k) for k in keywords)
    for section, keywords in _SECTION_KEYWORDS.items()
}
_GENERIC_SKILL_PREFIXES = {
    "applications deploiement",
    "applications et deploiement",
    "centres d interet",
    "competences",
    "langages",
    "languages",
    "langues",
    "outils",
    "technologies",
}
_HUMAN_LANGUAGES = {
    "anglais": "Anglais",
    "english": "Anglais",
    "espagnol": "Espagnol",
    "spanish": "Espagnol",
    "francais": "Français",
    "french": "Français",
    "allemand": "Allemand",
    "german": "Allemand",
    "italien": "Italien",
    "italian": "Italien",
    "portugais": "Portugais",
    "portuguese": "Portugais",
}
_PROGRAMMING_LANGUAGE_NAMES = {
    "bash",
    "c",
    "c plus plus",
    "c sharp",
    "c++",
    "c#",
    "go",
    "java",
    "javascript",
    "kotlin",
    "php",
    "python",
    "r",
    "ruby",
    "rust",
    "scala",
    "sql",
    "typescript",
}
_MONTHS = {
    "jan": "01",
    "janv": "01",
    "janvier": "01",
    "january": "01",
    "feb": "02",
    "fev": "02",
    "fevr": "02",
    "fevrier": "02",
    "february": "02",
    "mar": "03",
    "mars": "03",
    "march": "03",
    "apr": "04",
    "avr": "04",
    "avril": "04",
    "april": "04",
    "mai": "05",
    "may": "05",
    "jun": "06",
    "juin": "06",
    "june": "06",
    "jul": "07",
    "juil": "07",
    "juillet": "07",
    "july": "07",
    "aug": "08",
    "aout": "08",
    "august": "08",
    "sep": "09",
    "sept": "09",
    "septembre": "09",
    "september": "09",
    "oct": "10",
    "octobre": "10",
    "october": "10",
    "nov": "11",
    "novembre": "11",
    "november": "11",
    "dec": "12",
    "decembre": "12",
    "december": "12",
}
_DATE_RANGE_RE = re.compile(
    r"(?P<start>(?:[^\W\d_]+\.?\s+)?(?:19|20)\d{2})\s*[-\u2013\u2014]\s*"
    r"(?P<end>actuel|present|présent|aujourd[‘’]?hui|(?:[^\W\d_]+\.?\s+)?(?:19|20)\d{2})",  # noqa: RUF001
    re.IGNORECASE,
)
_KNOWN_LOCATION_TOKENS: frozenset[str] = frozenset(
    {
        "lyon fr",
        "aix en provence",
        "amiens",
        "angers",
        "annecy",
        "besancon",
        "bordeaux",
        "bourgoin jailleu",
        "bourgoin jallieu",
        "brest",
        "caen",
        "clermont ferrand",
        "decines",
        "dijon",
        "firminy",
        "grenoble",
        "le creusot",
        "le havre",
        "le mans",
        "lille",
        "limoges",
        "lyon",
        "marseille",
        "metz",
        "montpellier",
        "mulhouse",
        "nancy",
        "nanterre",
        "nantes",
        "nice",
        "orleans",
        "paris",
        "perpignan",
        "reims",
        "remote",
        "rennes",
        "rouen",
        "saint etienne",
        "sarreguemines",
        "strasbourg",
        "teletravail",
        "toulon",
        "toulouse",
        "tournus",
        "tours",
        "villeurbanne",
    }
)
# "City 69" / "City (69)" style suffixes and bare department numbers.
_LOCATION_WITH_DEPT_RE = re.compile(r"^[^\W\d_][\w’’ .\-]*?\s*\(?\d{2,3}\)?$")  # noqa: RUF001
_CONTRACT_TYPE_WORDS = (
    "cdi",
    "cdd",
    "stage",
    "alternance",
    "apprentissage",
    "freelance",
    "free lance",
    "interim",
)
# Matches "en CDI", "en alternance et CDD", trailing or inline, on normalized text.
_CONTRACT_PHRASE_RE = re.compile(
    r"\b(?:en\s+)?(?P<contract>"
    r"(?:cdi|cdd|stage|alternance|apprentissage|freelance|free lance|interim)"
    r"(?:\s+et\s+(?:cdi|cdd|stage|alternance|apprentissage|freelance|free lance|interim))*)\b"
)
# Words that mark a header segment as a role/title rather than a company name.
_ROLE_HINT_WORDS = frozenset(
    {
        "alternant",
        "analyste",
        "animateur",
        "animatrice",
        "architecte",
        "assistant",
        "assistante",
        "chargee",
        "charge",
        "chef",
        "consultant",
        "consultante",
        "developpeur",
        "developpeuse",
        "data",
        "directeur",
        "directrice",
        "engineer",
        "enseignant",
        "enseignante",
        "ingenieur",
        "ingenieure",
        "intervenant",
        "intervenante",
        "lead",
        "manager",
        "psychomotricien",
        "psychomotricienne",
        "responsable",
        "scientist",
        "stagiaire",
        "technicien",
        "technicienne",
    }
)
_BULLET_CHARS = "•‣▪·◦●○∙*-\u2013\u2014"
# A bullet is a leading glyph (optionally followed by space) or a lone "o"
# sub-bullet that must be followed by whitespace, to avoid matching words.
_BULLET_PREFIX_RE = re.compile(rf"^\s*(?:[{re.escape(_BULLET_CHARS)}]+\s*|o\s+)")


def _extension(filename: str) -> str:
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
