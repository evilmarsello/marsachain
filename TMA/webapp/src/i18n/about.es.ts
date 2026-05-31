import type { AboutSection } from "./about.en";

export const aboutAppSectionsEs: AboutSection[] = [
  {
    title: "Descargo de responsabilidad",
    paragraphs: [
      "Este cliente y la blockchain Marsa fueron creados por un desarrollador independiente. El desarrollador no tiene acceso a sus monedas, no puede mover fondos en su nombre ni controlar la red: el consenso y la validación están descentralizados entre los participantes.",
      "Usted es el único responsable de sus claves, copias de seguridad y decisiones. Cualquier pérdida de monedas no puede ser reembolsada por el desarrollador ni por esta aplicación.",
    ],
  },
  {
    title: "Acerca de Marsa Chain",
    paragraphs: [
      "Marsa Chain Client es una cartera y cliente de nodo para la red Marsa. Puede minar, ver saldos e historial, enviar y recibir transferencias, gestionar varias direcciones y configurar la conexión a la cadena.",
      "Las funciones evolucionan entre versiones; conserve siempre copias de seguridad de lo que no pueda permitirse perder.",
    ],
  },
  {
    title: "Frase semilla de 24 palabras y carteras HD",
    paragraphs: [
      "Sus 24 palabras en inglés son la frase semilla BIP39 (mnemónica): protegen un secreto maestro en el dispositivo. A partir de ella la app deriva la semilla de cartera y carteras jerárquicas (HD) por una ruta fija. Cada ranura HD tiene un índice: 0, 1, 2, …",
      "Tras la configuración inicial suele verse la cartera con índice 0. Al crear otra cartera HD se usa el siguiente índice libre. La frase no cambia; solo el contador.",
      "Si reinstala la app y restaura la misma frase de 24 palabras, al principio solo aparece el índice 0. Las monedas en índices 1, 2, … siguen en la red. Pulse «Nueva cartera» de nuevo en orden para recuperar los mismos índices.",
      "Ajustes → Salir de la cartera borra carteras locales, caché de transacciones y la frase guardada. Exporte primero las claves privadas importadas: no se restauran con las 24 palabras.",
    ],
  },
  {
    title: "Carteras importadas",
    paragraphs: [
      "Importar por clave privada añade una cartera separada. No forma parte de la secuencia HD y no se restaura solo con las 24 palabras. Guarde una copia de cada clave que necesite.",
    ],
  },
  {
    title: "Claves privadas",
    paragraphs: [
      "La clave privada es control total sobre la dirección. Quien la conozca puede transferir fondos. No la comparta; evite capturas y mensajería; guarde copias offline.",
    ],
  },
];

export const aboutMarsaSectionsEs: AboutSection[] = [
  {
    title: "En lenguaje sencillo",
    paragraphs: [
      "Marsa Chain es una red blockchain con minería por participación (proof-of-work con créditos de stake). Los usuarios mantienen carteras locales, se conectan a nodos y pueden minar, enviar MRS y consultar el estado de la cadena.",
    ],
  },
];
