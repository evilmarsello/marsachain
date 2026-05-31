import type { AboutSection } from "./about.en";

export const aboutAppSectionsDe: AboutSection[] = [
  {
    title: "Haftungsausschluss",
    paragraphs: [
      "Dieser Client und die Marsa-Blockchain wurden von einem unabhängigen Entwickler erstellt. Der Entwickler hat keinen Zugriff auf Ihre Coins, kann keine Mittel in Ihrem Namen bewegen und kontrolliert das Netzwerk nicht — Konsens und Validierung sind unter den Teilnehmern dezentral.",
      "Sie allein sind für Ihre Schlüssel, Backups und Entscheidungen verantwortlich. Jeder Verlust von Coins kann weder vom Entwickler noch von dieser App erstattet oder kompensiert werden.",
    ],
  },
  {
    title: "Über Marsa Chain",
    paragraphs: [
      "Marsa Chain Client ist ein Wallet und Knoten-Begleiter für das Marsa-Netzwerk. Sie können minen, Salden und Verlauf verfolgen, Überweisungen senden und empfangen, mehrere Adressen verwalten und die Verbindung zur Chain konfigurieren.",
      "Funktionen entwickeln sich zwischen Releases weiter; sichern Sie immer alles, was Sie sich nicht leisten können zu verlieren.",
    ],
  },
  {
    title: "24-Wort-Seed-Phrase und HD-Wallets",
    paragraphs: [
      "Ihre 24 englischen Wörter sind die BIP39-Seed-Phrase (Mnemonic): Sie schützen ein Master-Geheimnis auf diesem Gerät. Daraus leitet die App die Wallet-Seed und hierarchische (HD) Wallets über einen festen Pfad ab. Jeder HD-Slot hat einen Index: 0, 1, 2, … — er wächst, wenn Sie weitere HD-Wallets hinzufügen.",
      "Nach der Ersteinrichtung sehen Sie meist Wallet-Index 0. Bei jedem weiteren HD-Wallet (wenn die Phrase bereits gespeichert ist) nutzt die App den nächsten freien Index. Die Phrase selbst ändert sich nicht; nur der Zähler steigt.",
      "Bei Neuinstallation und Wiederherstellung derselben 24 Wörter erstellt die App zunächst nur Index 0 in der Liste. Coins auf Index 1, 2, … bleiben on-chain. Tippen Sie erneut auf Neu erstellen, der Reihe nach, um dieselben Indexe und Adressen wiederherzustellen.",
      "Einstellungen → Wallet verlassen löscht lokale Wallets, Transaktions-Cache und die gespeicherte Phrase. Exportieren Sie zuerst importierte private Schlüssel — sie gehören nicht zu den 24 Wörtern.",
    ],
  },
  {
    title: "Importierte Wallets",
    paragraphs: [
      "Import per privatem Schlüssel fügt ein eigenständiges Wallet hinzu. Es teilt nicht die HD-Indexfolge und wird nicht wiederhergestellt, wenn Sie nur die 24-Wort-Phrase wiederherstellen. Bewahren Sie jede benötigte importierte Schlüsselkopie auf.",
    ],
  },
  {
    title: "Private Schlüssel",
    paragraphs: [
      "Ein privater Schlüssel ist volle Kontrolle über eine Adresse. Wer ihn kennt, kann Ihre Mittel bewegen. Teilen Sie ihn nie; vermeiden Sie Screenshots und Chat-Logs; speichern Sie Backups nach Möglichkeit offline.",
    ],
  },
];

export const aboutMarsaSectionsDe: AboutSection[] = [
  {
    title: "In einfachen Worten",
    paragraphs: [
      "Marsa Chain ist ein Blockchain-Netzwerk mit stake-basiertem Mining (Proof-of-Work mit Stake-Credits). Nutzer halten lokale Wallets, verbinden sich mit Knoten und können minen, MRS senden und den Chain-Status abfragen.",
    ],
  },
];
