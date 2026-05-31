import type { AboutSection } from "./about.en";

export const networkConfigSectionsEs: AboutSection[] = [
  {
    title: "Halvings de bloques",
    paragraphs: [
      "Cada 1 050 000 bloques la red aplica un halving a la recompensa del bloque y a parámetros económicos relacionados.",
      "Calendario de reducción: 1.er halving −50%, 2.º −40%, 3.º −30%, 4.º −20%, 5.º y siguientes −10% en cada paso (paso mínimo).",
      "Tras cada intervalo la recompensa se multiplica por la parte restante (por ejemplo, el primer halving deja el 50% del valor anterior).",
    ],
  },
  {
    title: "Recompensa por bloque (era actual)",
    paragraphs: [
      "Recompensa total por bloque minado: 10 000 MRS.",
      "9 000 MRS van al minero que produjo el bloque; 1 000 MRS se reparten por igual entre los validadores que votaron por ese bloque.",
    ],
  },
  {
    title: "Emisión y tiempo de bloque",
    paragraphs: [
      "Emisión máxima: 50 mil millones de MRS.",
      "Tiempo medio para minar un bloque: unos 12–15 segundos.",
    ],
  },
  {
    title: "Créditos de minería (coste del hash)",
    paragraphs: [
      "El coste de un crédito de minería (un intento de hash) es actualmente 10 MRS.",
      "Este valor disminuye con los halvings según el mismo calendario progresivo que la recompensa del bloque.",
    ],
  },
  {
    title: "Constantes on-chain",
    paragraphs: [
      "MIN_MINER_STAKE_LOCK_BLOCKS = 10 000 — bloques mínimos desde la creación de MINER_STAKE antes de permitir MINER_UNSTAKE.",
      "MIN_STAKE_DURATION = 250 000 — periodo mínimo de staking para validadores de la red.",
      "REFILL_PERIOD = 100 — cada 100 bloques desde el staking, los créditos no usados expiran y el presupuesto de créditos se repone por completo.",
    ],
  },
];
