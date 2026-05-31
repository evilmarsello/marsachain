import type { AboutSection } from "./about.en";

export const networkConfigSectionsDe: AboutSection[] = [
  {
    title: "Block-Halvings",
    paragraphs: [
      "Alle 1.050.000 Blöcke wendet das Netzwerk ein Halving auf die Blockbelohnung und verwandte ökonomische Parameter an.",
      "Reduktionsplan: 1. Halving −50 %, 2. −40 %, 3. −30 %, 4. −20 %, 5. und folgende jeweils −10 % (Mindestschritt).",
      "Nach jedem Intervall wird die Belohnung mit dem verbleibenden Anteil multipliziert (z. B. behält das erste Halving 50 % des vorherigen Werts).",
    ],
  },
  {
    title: "Blockbelohnung (aktuelle Ära)",
    paragraphs: [
      "Gesamtbelohnung pro gemintem Block: 10.000 MRS.",
      "9.000 MRS gehen an den Miner, der den Block erzeugt hat; 1.000 MRS werden gleichmäßig unter Validatoren verteilt, die für diesen Block gestimmt haben.",
    ],
  },
  {
    title: "Emission und Blockzeit",
    paragraphs: [
      "Maximale Emission: 50 Milliarden MRS.",
      "Durchschnittliche Zeit zum Minen eines Blocks: etwa 12–15 Sekunden.",
    ],
  },
  {
    title: "Mining-Credits (Hash-Kosten)",
    paragraphs: [
      "Die Kosten eines Mining-Credits (ein Hash-Versuch) betragen derzeit 10 MRS.",
      "Dieser Wert sinkt mit Halvings nach dem gleichen progressiven Plan wie die Blockbelohnung.",
    ],
  },
  {
    title: "On-Chain-Konstanten",
    paragraphs: [
      "MIN_MINER_STAKE_LOCK_BLOCKS = 10.000 — Mindestblöcke seit Erstellung von MINER_STAKE, bevor MINER_UNSTAKE erlaubt ist.",
      "MIN_STAKE_DURATION = 250.000 — Mindestdauer des Stakings für Netzwerk-Validatoren.",
      "REFILL_PERIOD = 100 — alle 100 Blöcke seit dem Staking verfallen ungenutzte Credits und das Credit-Budget wird vollständig aufgefüllt.",
    ],
  },
];
