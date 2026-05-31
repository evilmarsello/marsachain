import type { AboutSection } from "./about.en";

export const networkConfigSectionsFr: AboutSection[] = [
  {
    title: "Halvings de blocs",
    paragraphs: [
      "Tous les 1 050 000 blocs, le réseau applique un halving à la récompense de bloc et aux paramètres économiques associés.",
      "Calendrier de réduction : 1er halving −50 %, 2e −40 %, 3e −30 %, 4e −20 %, 5e et suivants −10 % à chaque étape (pas minimum).",
      "Après chaque intervalle, la récompense est multipliée par la part restante (par ex. le premier halving conserve 50 % de la valeur précédente).",
    ],
  },
  {
    title: "Récompense de bloc (ère actuelle)",
    paragraphs: [
      "Récompense totale par bloc miné : 10 000 MRS.",
      "9 000 MRS vont au mineur qui a produit le bloc ; 1 000 MRS sont partagés à parts égales entre les validateurs qui ont voté pour ce bloc.",
    ],
  },
  {
    title: "Émission et temps de bloc",
    paragraphs: [
      "Émission maximale : 50 milliards de MRS.",
      "Temps moyen pour miner un bloc : environ 12–15 secondes.",
    ],
  },
  {
    title: "Crédits de minage (coût du hash)",
    paragraphs: [
      "Le coût d'un crédit de minage (une tentative de hash) est actuellement de 10 MRS.",
      "Cette valeur diminue avec les halvings selon le même calendrier progressif que la récompense de bloc.",
    ],
  },
  {
    title: "Constantes on-chain",
    paragraphs: [
      "MIN_MINER_STAKE_LOCK_BLOCKS = 10 000 — nombre minimum de blocs depuis la création de MINER_STAKE avant d'autoriser MINER_UNSTAKE.",
      "MIN_STAKE_DURATION = 250 000 — durée minimale de staking pour les validateurs du réseau.",
      "REFILL_PERIOD = 100 — tous les 100 blocs depuis le staking, les crédits non utilisés expirent et le budget de crédits est entièrement rechargé.",
    ],
  },
];
