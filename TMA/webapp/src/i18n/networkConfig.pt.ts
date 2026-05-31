import type { AboutSection } from "./about.en";

export const networkConfigSectionsPt: AboutSection[] = [
  {
    title: "Halvings de bloco",
    paragraphs: [
      "A cada 1.050.000 blocos a rede aplica um halving à recompensa do bloco e parâmetros econômicos relacionados.",
      "Cronograma de redução: 1.º halving −50%, 2.º −40%, 3.º −30%, 4.º −20%, 5.º e seguintes −10% em cada etapa (etapa mínima).",
      "Após cada intervalo a recompensa é multiplicada pela fração restante (por exemplo, o primeiro halving mantém 50% do valor anterior).",
    ],
  },
  {
    title: "Recompensa por bloco (era atual)",
    paragraphs: [
      "Recompensa total por bloco minerado: 10.000 MRS.",
      "9.000 MRS vão para o minerador que produziu o bloco; 1.000 MRS são repartidos igualmente entre os validadores que votaram naquele bloco.",
    ],
  },
  {
    title: "Emissão e tempo de bloco",
    paragraphs: [
      "Emissão máxima: 50 bilhões de MRS.",
      "Tempo médio para minerar um bloco: cerca de 12–15 segundos.",
    ],
  },
  {
    title: "Créditos de mineração (custo do hash)",
    paragraphs: [
      "O custo de um crédito de mineração (uma tentativa de hash) é atualmente 10 MRS.",
      "Esse valor diminui com os halvings segundo o mesmo cronograma progressivo da recompensa do bloco.",
    ],
  },
  {
    title: "Constantes on-chain",
    paragraphs: [
      "MIN_MINER_STAKE_LOCK_BLOCKS = 10.000 — blocos mínimos desde a criação de MINER_STAKE antes de permitir MINER_UNSTAKE.",
      "MIN_STAKE_DURATION = 250.000 — período mínimo de staking para validadores da rede.",
      "REFILL_PERIOD = 100 — a cada 100 blocos desde o staking, créditos não usados expiram e o orçamento de créditos é reposto por completo.",
    ],
  },
];
