import type { AboutSection } from "./about.en";

export const aboutAppSectionsPt: AboutSection[] = [
  {
    title: "Aviso legal",
    paragraphs: [
      "Este cliente e a blockchain Marsa foram criados por um desenvolvedor independente. O desenvolvedor não tem acesso às suas moedas, não pode mover fundos em seu nome nem controlar a rede — o consenso e a validação são descentralizados entre os participantes.",
      "Você é o único responsável por suas chaves, backups e decisões. Qualquer perda de moedas não pode ser reembolsada pelo desenvolvedor nem por este aplicativo.",
    ],
  },
  {
    title: "Sobre a Marsa Chain",
    paragraphs: [
      "O Marsa Chain Client é uma carteira e cliente de nó para a rede Marsa. Você pode minerar, acompanhar saldos e histórico, enviar e receber transferências, gerenciar vários endereços e configurar a conexão com a cadeia.",
      "Os recursos evoluem entre versões; mantenha sempre backups do que não pode perder.",
    ],
  },
  {
    title: "Frase semente de 24 palavras e carteiras HD",
    paragraphs: [
      "Suas 24 palavras em inglês são a frase semente BIP39 (mnemônica): protegem um segredo mestre no dispositivo. A partir dela o app deriva a semente da carteira e carteiras hierárquicas (HD) por um caminho fixo. Cada slot HD tem um índice: 0, 1, 2, …",
      "Após a configuração inicial você costuma ver a carteira com índice 0. Ao criar outra carteira HD usa-se o próximo índice livre. A frase não muda; só o contador.",
      "Se reinstalar o app e restaurar a mesma frase de 24 palavras, no início só aparece o índice 0. Moedas nos índices 1, 2, … continuam na rede. Toque em «Nova carteira» de novo em ordem para recuperar os mesmos índices.",
      "Configurações → Sair da carteira apaga carteiras locais, cache de transações e a frase salva. Exporte primeiro as chaves privadas importadas — elas não são restauradas pelas 24 palavras.",
    ],
  },
  {
    title: "Carteiras importadas",
    paragraphs: [
      "Importar por chave privada adiciona uma carteira separada. Não faz parte da sequência HD e não é restaurada só com as 24 palavras. Guarde uma cópia de cada chave que precisar.",
    ],
  },
  {
    title: "Chaves privadas",
    paragraphs: [
      "A chave privada é controle total sobre o endereço. Quem a souber pode transferir fundos. Não compartilhe; evite capturas de tela e mensagens; guarde cópias offline.",
    ],
  },
];

export const aboutMarsaSectionsPt: AboutSection[] = [
  {
    title: "Em linguagem simples",
    paragraphs: [
      "A Marsa Chain é uma rede blockchain com mineração por participação (proof-of-work com créditos de stake). Os usuários mantêm carteiras locais, conectam-se a nós e podem minerar, enviar MRS e consultar o estado da cadeia.",
    ],
  },
];
