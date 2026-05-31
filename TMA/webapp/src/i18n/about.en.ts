export type AboutSection = { title: string; paragraphs: string[] };

export const aboutAppSectionsEn: AboutSection[] = [
  {
    title: "Disclaimer",
    paragraphs: [
      "This client and the Marsa blockchain were built by an independent developer. The developer has no access to your coins, cannot move funds on your behalf, and cannot control the network—consensus and validation are decentralized among participants.",
      "You alone are responsible for your keys, backups, and decisions. Any loss of coins cannot be reimbursed or compensated by the developer or this app.",
    ],
  },
  {
    title: "About Marsa Chain",
    paragraphs: [
      "Marsa Chain Client is a wallet and node companion for the Marsa network. You can mine, follow balances and history, send and receive transfers, manage several addresses, and configure how you connect to the chain.",
      "Features evolve between releases; always keep backups of anything you cannot afford to lose.",
    ],
  },
  {
    title: "24-word seed phrase and HD wallets",
    paragraphs: [
      "Your 24 English words are the BIP39 seed phrase (mnemonic): they protect one master secret on this device. From that secret the app derives the wallet seed and hierarchical (HD) wallets along a fixed path. Each HD slot has an index: 0, 1, 2, … — think of it as an id that grows when you add more HD wallets.",
      "After first setup you usually see wallet index 0. Each time you create another HD wallet (while the seed phrase is already stored), the app uses the next free index and shows a new address. The seed phrase itself does not change; only the counter advances.",
      "If you reinstall and restore with the same 24-word seed phrase, the app initially recreates only index 0 in the list. Coins that lived on index 1, 2, … are still on-chain. Tap Create again, in order, to rebuild those same indexes and addresses.",
      "Settings → Exit from wallet wipes local wallets, transaction cache, and the stored seed before you start fresh or enter an existing phrase. Export any imported private keys first—they are not carried by the 24 words.",
    ],
  },
  {
    title: "Imported wallets",
    paragraphs: [
      "Import by private key adds a standalone wallet. It does not share the HD index sequence and is not rebuilt when you only restore the 24-word seed phrase. Keep a copy of each imported key you still need.",
    ],
  },
  {
    title: "Private keys",
    paragraphs: [
      "A private key is full control of one address. Anyone who learns it can move your funds. Never share it, avoid untrusted screenshots or chat logs, and store backups offline when possible.",
    ],
  },
];

export const aboutMarsaSectionsEn: AboutSection[] = [
  {
    title: "Mining: stake first",
    paragraphs: [
      "Marsa mining is not “free hashing.” Your address must publish an on-chain MINER_STAKE transaction (a dedicated transaction type). That locks stake for a fixed number of blocks and tells the network you intend to participate. Only after the validator sees an active stake will the client receive mining credits and be allowed to request work.",
      "If there is no MINER_STAKE, the wallet cannot mine—there is nothing to “boost” with hardware until that prerequisite is satisfied.",
    ],
  },
  {
    title: "Challenge, commitment, nonce",
    paragraphs: [
      "When you mine, the app talks to a validator node. The node issues a challenge: an unpredictable payload plus metadata (for example a difficulty in bits and an expiry time). The client must respond with a proof-of-work style solution tied to that challenge.",
      "Technically: the client picks a secret nonce, optionally registers a commitment (a hash of the nonce) when requesting the challenge so the node knows you already fixed your randomness, then searches for a nonce such that a cryptographic hash of (challenge material concatenated with the nonce) satisfies the required leading-zero bits pattern. That is standard partial-hash proof-of-work: you grind hashes until one is “small enough.”",
      "If no solution is found before limits kick in, the client can abandon the challenge (a signed abandon message) so the node can free the slot—challenges are tracked per address and the node caps how many unfinished challenges you may hold.",
      "A winning hash is submitted with the nonce and signatures so validators can verify it deterministically against the same challenge they issued.",
    ],
  },
  {
    title: "Why a fast PC or GPU is not a silver bullet",
    paragraphs: [
      "Throughput is bounded by rules on the node: you receive discrete challenges, each spends credits tied to your stake, and only a limited number of unfinished challenges may exist per address. You cannot open thousands of parallel puzzles without the network agreeing.",
      "A faster machine mainly means you test more nonces per second on the current challenge—helpful, but it does not replace stake, signatures, or validator policy. This is closer to “lottery tickets per credit under consensus rules” than to classic global hashrate warfare.",
    ],
  },
  {
    title: "Other technologies in this client",
    paragraphs: [
      "• Wallets: Ed25519 keys; HD derivation follows SLIP-0010 from a BIP39 seed with a fixed path for Marsa.",
      "• Storage: seed is kept encrypted (Keystore-backed container) after onboarding; imported keys are stored with the wallet database on device.",
      "• Network: HTTPS JSON APIs toward validators you configure under Connections; messages for mining and transfers are signed with your local keys.",
    ],
  },
  {
    title: "In plain language",
    paragraphs: [
      "Think of mining as: put collateral on-chain → the network gives you limited puzzle tickets → each ticket is a short race to find a lucky hash → you submit proof. Validators check everything publicly. Buying a bigger hammer helps a little inside each ticket, but the game is structured so the network—not raw hardware alone—stays in charge.",
    ],
  },
];
