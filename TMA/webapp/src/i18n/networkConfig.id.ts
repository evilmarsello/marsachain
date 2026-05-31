import type { AboutSection } from "./about.en";

export const networkConfigSectionsId: AboutSection[] = [
  {
    title: "Halving blok",
    paragraphs: [
      "Setiap 1.050.000 blok jaringan menerapkan halving pada hadiah blok dan parameter ekonomi terkait.",
      "Jadwal pengurangan: halving ke-1 −50%, ke-2 −40%, ke-3 −30%, ke-4 −20%, ke-5 dan seterusnya −10% per langkah (langkah minimum).",
      "Setelah setiap interval hadiah dikalikan bagian yang tersisa (misalnya halving pertama menyisakan 50% dari nilai sebelumnya).",
    ],
  },
  {
    title: "Hadiah blok (era saat ini)",
    paragraphs: [
      "Total hadiah per blok yang ditambang: 10.000 MRS.",
      "9.000 MRS untuk penambang yang memproduksi blok; 1.000 MRS dibagi rata di antara validator yang memilih blok tersebut.",
    ],
  },
  {
    title: "Pasokan dan waktu blok",
    paragraphs: [
      "Pasokan maksimum: 50 miliar MRS.",
      "Rata-rata waktu menambang satu blok: sekitar 12–15 detik.",
    ],
  },
  {
    title: "Kredit penambangan (biaya hash)",
    paragraphs: [
      "Biaya satu kredit penambangan (satu percobaan hash) saat ini 10 MRS.",
      "Nilai ini menurun mengikuti halving dengan jadwal progresif yang sama seperti hadiah blok.",
    ],
  },
  {
    title: "Konstanta on-chain",
    paragraphs: [
      "MIN_MINER_STAKE_LOCK_BLOCKS = 10.000 — blok minimum sejak pembuatan MINER_STAKE sebelum MINER_UNSTAKE diizinkan.",
      "MIN_STAKE_DURATION = 250.000 — periode staking minimum untuk validator jaringan.",
      "REFILL_PERIOD = 100 — setiap 100 blok sejak staking, kredit yang tidak terpakai kedaluwarsa dan anggaran kredit diisi penuh kembali.",
    ],
  },
];
