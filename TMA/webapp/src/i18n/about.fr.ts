import type { AboutSection } from "./about.en";

export const aboutAppSectionsFr: AboutSection[] = [
  {
    title: "Avertissement",
    paragraphs: [
      "Ce client et la blockchain Marsa ont été créés par un développeur indépendant. Le développeur n'a pas accès à vos pièces, ne peut pas déplacer vos fonds en votre nom et ne contrôle pas le réseau — le consensus et la validation sont décentralisés entre les participants.",
      "Vous êtes seul responsable de vos clés, sauvegardes et décisions. Toute perte de pièces ne peut être remboursée ni compensée par le développeur ou cette application.",
    ],
  },
  {
    title: "À propos de Marsa Chain",
    paragraphs: [
      "Marsa Chain Client est un portefeuille et compagnon de nœud pour le réseau Marsa. Vous pouvez miner, suivre soldes et historique, envoyer et recevoir des transferts, gérer plusieurs adresses et configurer votre connexion à la chaîne.",
      "Les fonctionnalités évoluent entre les versions ; conservez toujours des sauvegardes de ce que vous ne pouvez pas vous permettre de perdre.",
    ],
  },
  {
    title: "Phrase de 24 mots et portefeuilles HD",
    paragraphs: [
      "Vos 24 mots en anglais sont la phrase BIP39 (mnémonique) : ils protègent un secret maître sur cet appareil. À partir de ce secret, l'app dérive la graine du portefeuille et des portefeuilles hiérarchiques (HD) selon un chemin fixe. Chaque emplacement HD a un index : 0, 1, 2, … — il augmente lorsque vous ajoutez des portefeuilles HD.",
      "Après la première configuration, vous voyez en général le portefeuille d'index 0. Chaque nouveau portefeuille HD (lorsque la phrase est déjà enregistrée) utilise le prochain index libre. La phrase elle-même ne change pas ; seul le compteur avance.",
      "Si vous réinstallez et restaurez la même phrase de 24 mots, l'app ne recrée d'abord que l'index 0 dans la liste. Les pièces sur les index 1, 2, … restent on-chain. Appuyez à nouveau sur Créer, dans l'ordre, pour retrouver les mêmes index et adresses.",
      "Paramètres → Quitter le portefeuille efface les portefeuilles locaux, le cache des transactions et la phrase stockée. Exportez d'abord les clés privées importées — elles ne sont pas incluses dans les 24 mots.",
    ],
  },
  {
    title: "Portefeuilles importés",
    paragraphs: [
      "L'import par clé privée ajoute un portefeuille autonome. Il ne partage pas la séquence d'index HD et n'est pas recréé si vous restaurez uniquement la phrase de 24 mots. Conservez une copie de chaque clé importée dont vous avez encore besoin.",
    ],
  },
  {
    title: "Clés privées",
    paragraphs: [
      "Une clé privée donne le contrôle total d'une adresse. Quiconque la possède peut déplacer vos fonds. Ne la partagez jamais ; évitez captures d'écran et messageries non fiables ; stockez les sauvegardes hors ligne si possible.",
    ],
  },
];

export const aboutMarsaSectionsFr: AboutSection[] = [
  {
    title: "En langage simple",
    paragraphs: [
      "Marsa Chain est un réseau blockchain avec minage par participation (proof-of-work avec crédits de stake). Les utilisateurs gardent des portefeuilles locaux, se connectent aux nœuds et peuvent miner, envoyer des MRS et consulter l'état de la chaîne.",
    ],
  },
];
