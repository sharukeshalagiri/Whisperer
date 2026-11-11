/** The Electron objects needed to verify an IPC caller without importing Electron. */
export interface IpcSenderEvent {
  sender: object;
  senderFrame: object;
}

/** The narrow web-contents identity used for main-frame authorization. */
export interface OwnedWebContents {
  mainFrame: object;
}

/** Confines IPC handlers to the main frame of application windows created by this runtime. */
export class SenderGuard {
  /** Creates a guard which queries the current owned window contents for every check. */
  constructor(private readonly ownedContents: () => Iterable<OwnedWebContents>) {}

  /** Returns whether an event came from the main frame of an owned application window. */
  allows(event: IpcSenderEvent): boolean {
    for (const contents of this.ownedContents()) {
      if (contents === event.sender && contents.mainFrame === event.senderFrame) {
        return true;
      }
    }
    return false;
  }
}
