import type { AboutSection } from "./about.en";

export const aboutAppSectionsId: AboutSection[] = [
  {
    title: "Penafian",
    paragraphs: [
      "Klien ini dan blockchain Marsa dibuat oleh pengembang independen. Pengembang tidak memiliki akses ke koin Anda, tidak dapat memindahkan dana atas nama Anda, dan tidak mengontrol jaringan — konsensus dan validasi terdesentralisasi di antara peserta.",
      "Anda sendiri yang bertanggung jawab atas kunci, cadangan, dan keputusan Anda. Kerugian koin tidak dapat diganti oleh pengembang atau aplikasi ini.",
    ],
  },
  {
    title: "Tentang Marsa Chain",
    paragraphs: [
      "Marsa Chain Client adalah dompet dan klien node untuk jaringan Marsa. Anda dapat menambang, melihat saldo dan riwayat, mengirim dan menerima transfer, mengelola beberapa alamat, dan mengonfigurasi koneksi ke chain.",
      "Fitur berkembang antar rilis; selalu simpan cadangan untuk apa pun yang tidak bisa Anda rugikan.",
    ],
  },
  {
    title: "Frasa benih 24 kata dan dompet HD",
    paragraphs: [
      "24 kata bahasa Inggris Anda adalah frasa benih BIP39 (mnemonik): melindungi satu rahasia utama di perangkat ini. Dari rahasia itu aplikasi menurunkan benih dompet dan dompet hierarkis (HD) pada jalur tetap. Setiap slot HD memiliki indeks: 0, 1, 2, …",
      "Setelah pengaturan awal Anda biasanya melihat dompet indeks 0. Saat membuat dompet HD lain, aplikasi memakai indeks bebas berikutnya. Frasa benih tidak berubah; hanya penghitung yang maju.",
      "Jika menginstal ulang dan memulihkan frasa 24 kata yang sama, awalnya hanya indeks 0 yang dibuat ulang. Koin di indeks 1, 2, … tetap di chain. Ketuk buat dompet lagi secara berurutan untuk membangun kembali indeks dan alamat yang sama.",
      "Pengaturan → Keluar dari dompet menghapus dompet lokal, cache transaksi, dan frasa tersimpan. Ekspor dulu kunci privat yang diimpor — tidak dibawa oleh 24 kata.",
    ],
  },
  {
    title: "Dompet yang diimpor",
    paragraphs: [
      "Impor dengan kunci privat menambahkan dompet terpisah. Tidak ikut urutan indeks HD dan tidak dibangun ulang hanya dengan frasa 24 kata. Simpan salinan setiap kunci yang masih Anda perlukan.",
    ],
  },
  {
    title: "Kunci privat",
    paragraphs: [
      "Kunci privat adalah kontrol penuh atas satu alamat. Siapa pun yang mengetahuinya dapat memindahkan dana Anda. Jangan bagikan; hindari tangkapan layar atau obrolan tidak tepercaya; simpan cadangan offline jika memungkinkan.",
    ],
  },
];

export const aboutMarsaSectionsId: AboutSection[] = [
  {
    title: "Dalam bahasa sederhana",
    paragraphs: [
      "Marsa Chain adalah jaringan blockchain dengan penambangan berbasis partisipasi (proof-of-work dengan kredit stake). Pengguna menyimpan dompet lokal, terhubung ke node, dan dapat menambang, mengirim MRS, serta memeriksa status chain.",
    ],
  },
];
