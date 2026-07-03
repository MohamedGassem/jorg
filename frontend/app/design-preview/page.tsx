// Design preview — internal styleguide for the "Mon profil" refonte (tranche 0).
// notFound() in production so it never ships to users; kept in the tree as the
// living specimen the palette + typography decisions are validated against.
// Fully self-contained: no global token or shared component is touched here.
import type { Metadata } from "next";
import { Newsreader } from "next/font/google";
import { notFound } from "next/navigation";
import styles from "./page.module.css";

// Display face loaded locally to this route only. Tranche 1 moves it to the
// root layout once the direction is approved.
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["500", "600"],
  style: ["normal"],
});

export const metadata: Metadata = {
  title: "Design preview — Mon profil",
  robots: { index: false, follow: false },
};

/* Home-made proof seal (glyphe maison; lucide is reserved for utilitarian
   actions). A scalloped disc reads as a wax seal / stamp of evidence. */
function Seal({ filled = false }: { filled?: boolean }) {
  const cx = 8;
  const cy = 8;
  const teeth = 12;
  const outer = 7.4;
  const inner = 6.2;
  const points: string[] = [];
  for (let i = 0; i < teeth * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / teeth) * i - Math.PI / 2;
    points.push(
      `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`,
    );
  }
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={filled ? styles.sealFilled : styles.seal}
    >
      <polygon
        points={points.join(" ")}
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path
        d="M5.4 8.1 7.1 9.8 10.6 6.2"
        fill="none"
        stroke={filled ? "var(--dp-lavender)" : "currentColor"}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* The applied artifact, rendered once per theme. Only the scope class flips;
   every color re-derives from the --dp-* tokens defined in the CSS module. */
function ProfilePanel({ night = false }: { night?: boolean }) {
  return (
    <article className={`${styles.scope} ${night ? styles.night : ""}`}>
      <div className={styles.panelTag}>
        {night ? "Dark re-dérivé" : "Light canonique"}
      </div>

      {/* Couverture "Mon profil" */}
      <header className={styles.cover}>
        <div className={styles.overline}>Mon profil</div>
        <h3 className={styles.coverName}>Lucas Merad</h3>
        <div className={styles.coverTitle}>
          Tech Lead Data · Ingénierie BI &amp; streaming
        </div>
        <div className={styles.coverMeta}>
          <span>
            <b>Disponible</b> sous 4 sem.
          </span>
          <span>
            TJM <b>620&nbsp;€</b>
          </span>
          <span>Île-de-France</span>
          <span>9 ans</span>
        </div>
        <p className={styles.coverSummary}>
          Je construis des plateformes de données temps réel et je remets
          d&apos;aplomb les socles BI hérités. Sur mes trois dernières missions,
          j&apos;ai divisé des latences par quatre et coupé des coûts
          d&apos;infra sans casser la production.
        </p>
        <div className={styles.coverActions}>
          <button type="button" className={styles.btnPrimary}>
            Générer un dossier
          </button>
          <button type="button" className={styles.btnGhost}>
            Mode lecture
          </button>
        </div>
      </header>

      {/* Timeline d'expérience */}
      <section>
        <div className={styles.blockHead}>
          <span className={styles.blockLabel}>Parcours</span>
          <span className={styles.blockAction}>Afficher 5</span>
        </div>
        <div className={styles.timeline}>
          <div className={styles.exp}>
            <div className={styles.expHead}>
              <div>
                <div className={styles.expClient}>SNCF Connect</div>
                <div className={styles.expRole}>Tech Lead Data</div>
              </div>
              <div className={styles.expDates}>2022 — présent</div>
            </div>
            <ul className={styles.achievements}>
              <li>
                Refonte du pipeline temps réel (Kafka, Flink) :{" "}
                <span className={styles.impact}>latence P95 ÷ 4</span> sur
                12&nbsp;M d&apos;événements par jour.
              </li>
              <li>
                Encadrement de{" "}
                <span className={styles.impact}>5 data engineers</span> et mise
                en place du contrat de données inter-équipes.
              </li>
            </ul>
          </div>

          <div className={styles.exp}>
            <div className={styles.expHead}>
              <div>
                <div className={styles.expClient}>Société Générale</div>
                <div className={styles.expRole}>Ingénieur BI senior</div>
              </div>
              <div className={styles.expDates}>2019 — 2022</div>
            </div>
            <ul className={styles.achievements}>
              <li>
                Migration de 40 rapports Cognos vers dbt + Looker,{" "}
                <span className={styles.impact}>coût d&apos;infra −35 %</span>.
              </li>
            </ul>
          </div>

          {/* Expériences anciennes condensées (garde-fou gros profils) */}
          <div className={styles.condensedGroup}>
            <div className={styles.condensed}>
              <span className={styles.condensedYears}>2017—19</span>
              <span className={styles.condensedText}>
                <strong>Orange</strong> Consultant BI
              </span>
            </div>
            <div className={styles.condensed}>
              <span className={styles.condensedYears}>2015—17</span>
              <span className={styles.condensedText}>
                <strong>Decathlon</strong> Data Analyst
              </span>
            </div>
          </div>
          <div className={styles.expandAll}>+ Tout déplier</div>
        </div>
      </section>

      {/* Compétences — les trois états de chip */}
      <section className={styles.skills}>
        <div className={styles.blockHead} style={{ padding: 0 }}>
          <span className={styles.blockLabel}>Compétences</span>
        </div>
        <div className={styles.chipRow}>
          <span className={`${styles.chip} ${styles.chipFeatured}`}>
            <Seal filled />
            Apache Kafka
            <span className={styles.chipCount}>×4</span>
          </span>
          <span className={`${styles.chip} ${styles.chipProven}`}>
            <Seal />
            Python
            <span className={styles.chipCount}>×6</span>
          </span>
          <span className={`${styles.chip} ${styles.chipProven}`}>
            <Seal />
            dbt
            <span className={styles.chipCount}>×3</span>
          </span>
          <span className={`${styles.chip} ${styles.chipInferred}`}>
            Apache Flink
            <span className={styles.pastille}>à confirmer</span>
          </span>
          <span className={`${styles.chip} ${styles.chipDeclared}`}>
            Terraform
          </span>
          <span className={`${styles.chip} ${styles.chipDeclared}`}>
            Looker
          </span>
        </div>

        <div className={styles.chipLegend}>
          <span>
            <b>Prouvée</b> — sceau + compteur mono (réalisations et missions
            liées). La mise en avant porte le sceau plein.
          </span>
          <span>
            <b>Inférée</b> — pastille ocre « à confirmer », visible du
            consultant uniquement.
          </span>
          <span>
            <b>Déclarée</b> — contour pointillé, sans sceau.
          </span>
        </div>

        <div className={styles.declaredFold}>
          + 32 autres compétences déclarées
        </div>
      </section>
    </article>
  );
}

export default function DesignPreviewPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return (
    <main className={`${styles.page} ${newsreader.variable}`}>
      <div className={styles.masthead}>
        <div className={styles.kicker}>
          Styleguide interne · Refonte « Mon profil »
        </div>
        <h1 className={styles.mastTitle}>
          Le profil se lit comme le dossier qu&apos;on enverra.
        </h1>
        <p className={styles.mastLede}>
          Specimen de la direction « Dossier relié » : nouvelle encre violette,
          neutres violacés, Newsreader en display, et le sceau de preuve qui
          rend visible ce qui est prouvé. Rien n&apos;est branché aux tokens
          globaux tant que cet écran n&apos;est pas validé.
        </p>
        <div className={styles.mastNote}>
          Route dev-only · notFound() en production
        </div>
      </div>

      <div className={styles.stack}>
        {/* Palette */}
        <section>
          <div className={styles.sectionLabel}>Palette</div>
          <div className={styles.paletteRow}>
            <div>
              <h3>Light — canonique</h3>
              <div className={styles.swatchGrid}>
                {[
                  ["Encre violette", "#4A3AA8"],
                  ["Encre", "#232029"],
                  ["Papier", "#F6F4EF"],
                  ["Lavande papier", "#EDEAF8"],
                  ["Vert preuve", "#2E6B4F"],
                  ["Ocre signal", "#96682A"],
                ].map(([name, hex]) => (
                  <div key={hex} className={styles.swatch}>
                    <div
                      className={styles.swatchChip}
                      style={{ background: hex }}
                    />
                    <div className={styles.swatchMeta}>
                      <div className={styles.swatchName}>{name}</div>
                      <div className={styles.swatchHex}>{hex}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3>Dark — re-dérivé</h3>
              <div className={styles.swatchGrid}>
                {[
                  ["Encre violette", "#A99CF3"],
                  ["Encre", "#F1EDF4"],
                  ["Papier", "#16141B"],
                  ["Lavande papier", "#262036"],
                  ["Vert preuve", "#74B697"],
                  ["Ocre signal", "#CDA264"],
                ].map(([name, hex]) => (
                  <div key={hex} className={styles.swatch}>
                    <div
                      className={styles.swatchChip}
                      style={{ background: hex }}
                    />
                    <div className={styles.swatchMeta}>
                      <div className={styles.swatchName}>{name}</div>
                      <div className={styles.swatchHex}>{hex}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Typographie */}
        <section>
          <div className={styles.sectionLabel}>
            Typographie — serif / sans / mono
          </div>
          <div className={styles.typeSpecimen}>
            <div className={styles.typeCol}>
              <h3>Newsreader — le consultant</h3>
              <div className={styles.typeSerif}>
                <div className="l1">Lucas Merad</div>
                <div className="l2">Tech Lead Data</div>
                <div className="l3">SNCF Connect · Société Générale</div>
              </div>
              <p className={styles.typeRule}>
                Noms, intitulés de poste, clients et titres de section. Poids
                500 / 600, jamais sous 18&nbsp;px, jamais sur un élément
                interactif.
              </p>
            </div>
            <div className={styles.typeCol}>
              <h3>Plex Sans / Mono — l&apos;outil &amp; le registre</h3>
              <p className={styles.typeSans}>
                IBM Plex Sans porte le corps de texte, les actions et les
                libellés produit. C&apos;est la voix de l&apos;application.
              </p>
              <div className={styles.typeMono}>
                DISPO 4 SEM · TJM 620 € · 2022—PRÉSENT · ×4 PREUVES
              </div>
              <p className={styles.typeRule}>
                <b>Serif</b> = ce qui appartient au consultant. <b>Sans</b> = ce
                qui appartient à l&apos;outil. <b>Mono</b> = ce qui appartient
                au registre (dates, TJM, compteurs, overlines).
              </p>
            </div>
          </div>
        </section>

        {/* L'artefact appliqué, light + dark */}
        <section>
          <div className={styles.sectionLabel}>
            Couverture, parcours &amp; sceau de preuve
          </div>
          <div className={styles.panels}>
            <ProfilePanel />
            <ProfilePanel night />
          </div>
        </section>

        {/* Écran recruteur — la palette est globale */}
        <section>
          <div className={styles.sectionLabel}>
            Écran recruteur — registre (même palette)
          </div>
          <div className={styles.panels}>
            <div className={styles.scope}>
              <div className={styles.panelTag}>Registre · Light</div>
              <RecruiterRegistre />
            </div>
            <div className={`${styles.scope} ${styles.night}`}>
              <div className={styles.panelTag}>Registre · Dark</div>
              <RecruiterRegistre />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function RecruiterRegistre() {
  return (
    <div
      className={styles.recruiter}
      style={{ border: "none", borderRadius: 0 }}
    >
      <div className={styles.tableWrap}>
        <table className={styles.regTable}>
          <thead>
            <tr>
              <th>Candidat</th>
              <th>Poste</th>
              <th>Dispo</th>
              <th>Preuve clé</th>
              <th>Accès</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <span className={styles.regName}>Lucas Merad</span>
              </td>
              <td>Tech Lead Data</td>
              <td>
                <span className={styles.regDates}>4 sem.</span>
              </td>
              <td>
                <span className={`${styles.chip} ${styles.chipProven}`}>
                  <Seal />
                  Kafka
                  <span className={styles.chipCount}>×4</span>
                </span>
              </td>
              <td>
                <span className={styles.statusPill}>
                  <span className={styles.dot} />
                  Actif
                </span>
              </td>
            </tr>
            <tr>
              <td>
                <span className={styles.regName}>Naïma Belhadj</span>
              </td>
              <td>Data Analyst</td>
              <td>
                <span className={styles.regDates}>Immédiate</span>
              </td>
              <td>
                <span className={`${styles.chip} ${styles.chipDeclared}`}>
                  Power BI
                </span>
              </td>
              <td>
                <span className={styles.statusPill}>
                  <span className={styles.dot} />
                  Actif
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
