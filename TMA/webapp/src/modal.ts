let modalEscHandler: ((e: KeyboardEvent) => void) | null = null;

export function removeTmaModal(): void {
  document.getElementById("tma-modal-root")?.remove();
  if (modalEscHandler) {
    document.removeEventListener("keydown", modalEscHandler);
    modalEscHandler = null;
  }
}

export function attachModalEscape(): void {
  if (modalEscHandler) {
    document.removeEventListener("keydown", modalEscHandler);
    modalEscHandler = null;
  }
  modalEscHandler = (e: KeyboardEvent) => {
    if (e.key === "Escape") removeTmaModal();
  };
  document.addEventListener("keydown", modalEscHandler);
}
